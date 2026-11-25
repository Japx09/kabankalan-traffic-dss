import {
  BUILDING_SPECS,
  CORRIDOR_BEARING_DEG,
  CROSSWALK_SPECS,
  GATE_STRUCTURE_SPECS,
  LANE_SPECS,
  NATIONAL_STREETLIGHT_S,
  PERIMETER_WALL_SPECS,
  ROAD_SEGMENT_SPECS,
  STAGING_BAY_SPECS,
  TERMINAL_YARD_PADS,
  TREE_SPECS,
  nationalRoadS,
  sdToWorld,
  vecHeading,
} from './data/ceresCorridorData';
import { CERES_ORIGIN, getEsriSatelliteTileBounds } from './projection';
import type {
  ArcInterval,
  ConflictZone,
  Crosswalk,
  CrosswalkLaneRef,
  LaneEdge,
  RoadNetworkGraph,
  RoadSegment,
  SamplePoint,
  StreetlightPlacement,
  Vec2,
} from './types';

function dist2(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.z - a.z);
}

/**
 * Uniformly resamples a 2D polyline at `stepMeters` intervals while always
 * preserving exact start (`s = 0`) and end (`s = length`) coordinates.
 */
export function resamplePolyline(
  points: readonly Vec2[],
  stepMeters = 1.0
): { readonly samples: readonly SamplePoint[]; readonly length: number } {
  if (points.length < 2) {
    throw new Error('Polyline requires at least 2 points');
  }

  const cumLen: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    cumLen.push(cumLen[i - 1] + dist2(points[i - 1], points[i]));
  }
  const totalLength = cumLen[cumLen.length - 1];
  if (totalLength < 1e-6) {
    throw new Error('Polyline has zero length');
  }

  const rawPts: Array<{ s: number; x: number; z: number }> = [];
  const count = Math.max(2, Math.ceil(totalLength / stepMeters));
  let segIdx = 0;

  for (let i = 0; i <= count; i++) {
    const s = i === count ? totalLength : (totalLength * i) / count;
    while (segIdx < cumLen.length - 2 && cumLen[segIdx + 1] < s) {
      segIdx++;
    }
    const segStart = cumLen[segIdx];
    const segLen = Math.max(1e-9, cumLen[segIdx + 1] - segStart);
    const t = Math.min(1, Math.max(0, (s - segStart) / segLen));
    const p0 = points[segIdx];
    const p1 = points[segIdx + 1];
    rawPts.push({
      s,
      x: p0.x + (p1.x - p0.x) * t,
      z: p0.z + (p1.z - p0.z) * t,
    });
  }

  const tangents: Array<{ tx: number; tz: number; heading: number }> = rawPts.map((_, i) => {
    const prev = rawPts[Math.max(0, i - 1)];
    const next = rawPts[Math.min(rawPts.length - 1, i + 1)];
    const dx = next.x - prev.x;
    const dz = next.z - prev.z;
    const len = Math.hypot(dx, dz) || 1;
    const tx = dx / len;
    const tz = dz / len;
    return { tx, tz, heading: vecHeading(tx, tz) };
  });

  const samples: SamplePoint[] = rawPts.map((pt, i) => {
    const { tx, tz, heading } = tangents[i];
    const prevIdx = Math.max(0, i - 1);
    const nextIdx = Math.min(rawPts.length - 1, i + 1);
    let dH = tangents[nextIdx].heading - tangents[prevIdx].heading;
    while (dH > Math.PI) dH -= Math.PI * 2;
    while (dH < -Math.PI) dH += Math.PI * 2;
    const ds = Math.max(1e-4, rawPts[nextIdx].s - rawPts[prevIdx].s);
    const curvature = Math.max(-0.5, Math.min(0.5, dH / ds));
    return {
      s: pt.s,
      x: pt.x,
      z: pt.z,
      tx,
      tz,
      nx: tz, // Up x T = (tz, -tx) -> LEFT normal
      nz: -tx,
      heading,
      curvature,
    };
  });

  return { samples, length: totalLength };
}

/**
 * Evaluates a `SamplePoint` at any continuous arc length `s` along a `LaneEdge` or `RoadSegment`.
 */
export function samplePolylineAt(samples: readonly SamplePoint[], s: number): SamplePoint {
  if (samples.length === 0) {
    throw new Error('Cannot sample empty SamplePoint array');
  }
  if (s <= 0 || samples.length === 1) return samples[0];
  const last = samples[samples.length - 1];
  if (s >= last.s) return last;

  // Binary search for bracketing segment
  let lo = 0;
  let hi = samples.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].s <= s) lo = mid;
    else hi = mid;
  }

  const a = samples[lo];
  const b = samples[hi];
  const span = Math.max(1e-9, b.s - a.s);
  const t = (s - a.s) / span;
  const txRaw = a.tx + (b.tx - a.tx) * t;
  const tzRaw = a.tz + (b.tz - a.tz) * t;
  const tLen = Math.hypot(txRaw, tzRaw) || 1;
  const tx = txRaw / tLen;
  const tz = tzRaw / tLen;

  return {
    s,
    x: a.x + (b.x - a.x) * t,
    z: a.z + (b.z - a.z) * t,
    tx,
    tz,
    nx: tz,
    nz: -tx,
    heading: vecHeading(tx, tz),
    curvature: a.curvature + (b.curvature - a.curvature) * t,
  };
}

/** Exact 2D segment-segment intersection helper; returns parametric `(u, v) in [0,1]` if intersecting. */
function segmentIntersection(
  a0: Vec2,
  a1: Vec2,
  b0: Vec2,
  b1: Vec2
): { u: number; v: number; pt: Vec2 } | null {
  const dax = a1.x - a0.x;
  const daz = a1.z - a0.z;
  const dbx = b1.x - b0.x;
  const dbz = b1.z - b0.z;
  const denom = dax * dbz - daz * dbx;
  if (Math.abs(denom) < 1e-8) return null;
  const qpx = b0.x - a0.x;
  const qpz = b0.z - a0.z;
  const u = (qpx * dbz - qpz * dbx) / denom;
  const v = (qpx * daz - qpz * dax) / denom;
  if (u >= 0 && u <= 1 && v >= 0 && v <= 1) {
    return {
      u,
      v,
      pt: { x: a0.x + u * dax, z: a0.z + u * daz },
    };
  }
  return null;
}

/**
 * Automatically derives all geometric crossing & merge conflict zones directly
 * from the actual `LaneEdge` polylines (never hardcoded route IDs).
 */
function computeConflictZones(lanes: readonly LaneEdge[]): readonly ConflictZone[] {
  const zones: ConflictZone[] = [];
  const PROXIMITY_THRESHOLD = 2.25; // meters between lane centerlines
  const BODY_PAD = 2.6; // longitudinal half-pad for vehicle overlap clearance
  const STOP_BAR_BUFFER = 3.5;

  for (let i = 0; i < lanes.length; i++) {
    const a = lanes[i];
    const aStart = a.samples[0];
    const aEnd = a.samples[a.samples.length - 1];

    for (let j = i + 1; j < lanes.length; j++) {
      const b = lanes[j];

      // Skip direct sequential handoff links (parent -> child)
      if (a.nextLaneIds.includes(b.id) || b.nextLaneIds.includes(a.id)) continue;

      const bStart = b.samples[0];
      const bEnd = b.samples[b.samples.length - 1];

      // Check shared downstream merge node FIRST (also catches parallel internal loops re-merging!)
      const sharedNext = a.nextLaneIds.some((nid) => b.nextLaneIds.includes(nid));
      if (sharedNext && dist2(aEnd, bEnd) < 1.5) {
        const mergeLenA = Math.min(a.length, 7.0);
        const mergeLenB = Math.min(b.length, 7.0);
        const sStartA = Math.max(0, a.length - mergeLenA);
        const sStartB = Math.max(0, b.length - mergeLenB);
        zones.push({
          id: `cz_merge_${a.id}__${b.id}`,
          kind: 'merge',
          center: {
            x: Number(((aEnd.x + bEnd.x) * 0.5).toFixed(3)),
            z: Number(((aEnd.z + bEnd.z) * 0.5).toFixed(3)),
          },
          radius: 4.5,
          participants: [
            {
              laneId: a.id,
              sStart: Number(sStartA.toFixed(2)),
              sEnd: Number(a.length.toFixed(2)),
              stopBarS: Number(Math.max(0, sStartA - STOP_BAR_BUFFER).toFixed(2)),
              priority: a.priority,
            },
            {
              laneId: b.id,
              sStart: Number(sStartB.toFixed(2)),
              sEnd: Number(b.length.toFixed(2)),
              stopBarS: Number(Math.max(0, sStartB - STOP_BAR_BUFFER).toFixed(2)),
              priority: b.priority,
            },
          ],
        });
        continue;
      }

      // Skip diverging lanes that share the same upstream start node
      if (dist2(aStart, bStart) < 1.0) continue;

      // Check geometric intersection or sub-threshold proximity between samples
      let minSa = Infinity;
      let maxSa = -Infinity;
      let minSb = Infinity;
      let maxSb = -Infinity;
      let sumX = 0;
      let sumZ = 0;
      let hitCount = 0;

      for (let ai = 0; ai < a.samples.length; ai++) {
        const pa = a.samples[ai];
        for (let bi = 0; bi < b.samples.length; bi++) {
          const pb = b.samples[bi];
          const d = dist2(pa, pb);
          if (d <= PROXIMITY_THRESHOLD) {
            minSa = Math.min(minSa, pa.s);
            maxSa = Math.max(maxSa, pa.s);
            minSb = Math.min(minSb, pb.s);
            maxSb = Math.max(maxSb, pb.s);
            sumX += (pa.x + pb.x) * 0.5;
            sumZ += (pa.z + pb.z) * 0.5;
            hitCount++;
          }
        }
      }

      if (hitCount === 0) continue;

      // Ignore trivial end-to-end node touches at non-merging boundaries
      const touchesOnlyBoundary =
        (maxSa < 0.8 && minSb > b.length - 0.8) ||
        (minSa > a.length - 0.8 && maxSb < 0.8);
      if (touchesOnlyBoundary) continue;

      const sStartA = Math.max(0, minSa - BODY_PAD);
      const sEndA = Math.min(a.length, maxSa + BODY_PAD);
      const sStartB = Math.max(0, minSb - BODY_PAD);
      const sEndB = Math.min(b.length, maxSb + BODY_PAD);
      const cx = sumX / hitCount;
      const cz = sumZ / hitCount;

      const spanRadius = Math.max(
        3.2,
        Math.min(7.5, Math.max(maxSa - minSa, maxSb - minSb) * 0.5 + 2.2)
      );

      zones.push({
        id: `cz_cross_${a.id}__${b.id}`,
        kind: 'crossing',
        center: { x: Number(cx.toFixed(3)), z: Number(cz.toFixed(3)) },
        radius: Number(spanRadius.toFixed(2)),
        participants: [
          {
            laneId: a.id,
            sStart: Number(sStartA.toFixed(2)),
            sEnd: Number(sEndA.toFixed(2)),
            stopBarS: Number(Math.max(0, sStartA - STOP_BAR_BUFFER).toFixed(2)),
            priority: a.priority,
          },
          {
            laneId: b.id,
            sStart: Number(sStartB.toFixed(2)),
            sEnd: Number(sEndB.toFixed(2)),
            stopBarS: Number(Math.max(0, sStartB - STOP_BAR_BUFFER).toFixed(2)),
            priority: b.priority,
          },
        ],
      });
    }
  }

  return zones;
}

/** Builds crosswalk objects and automatically links every intersecting lane + stop bar. */
function buildCrosswalks(
  roadSegments: readonly RoadSegment[],
  lanes: readonly LaneEdge[]
): readonly Crosswalk[] {
  const roadById = new Map(roadSegments.map((r) => [r.id, r]));

  return CROSSWALK_SPECS.map((spec) => {
    const road = roadById.get(spec.roadId);
    if (!road) throw new Error(`Unknown roadId for crosswalk ${spec.id}: ${spec.roadId}`);

    const roadS = nationalRoadS(spec.s);
    const sp = samplePolylineAt(road.samples, roadS);
    const halfW = road.carriagewayWidth * 0.5;
    const curbStart: Vec2 = {
      x: Number((sp.x - sp.nx * halfW).toFixed(3)),
      z: Number((sp.z - sp.nz * halfW).toFixed(3)),
    };
    const curbEnd: Vec2 = {
      x: Number((sp.x + sp.nx * halfW).toFixed(3)),
      z: Number((sp.z + sp.nz * halfW).toFixed(3)),
    };

    const affectedLanes: CrosswalkLaneRef[] = [];
    for (const lane of lanes) {
      if (lane.roadId !== spec.roadId) continue;
      for (let i = 0; i < lane.samples.length - 1; i++) {
        const hit = segmentIntersection(lane.samples[i], lane.samples[i + 1], curbStart, curbEnd);
        if (hit) {
          const sCenter =
            lane.samples[i].s + hit.u * (lane.samples[i + 1].s - lane.samples[i].s);
          affectedLanes.push({
            laneId: lane.id,
            sCenter: Number(sCenter.toFixed(2)),
            stopBarS: Number(Math.max(0, sCenter - spec.width * 0.5 - 2.0).toFixed(2)),
          });
          break;
        }
      }
    }

    return {
      id: spec.id,
      roadId: spec.roadId,
      label: spec.label,
      roadS,
      center: { x: Number(sp.x.toFixed(3)), z: Number(sp.z.toFixed(3)) },
      tangent: { x: Number(sp.tx.toFixed(4)), z: Number(sp.tz.toFixed(4)) },
      normal: { x: Number(sp.nx.toFixed(4)), z: Number(sp.nz.toFixed(4)) },
      width: spec.width,
      curbStart,
      curbEnd,
      length: road.carriagewayWidth,
      affectedLanes,
      signalizedInScenario2: spec.signalizedInScenario2,
    };
  });
}

function isInsideAnyInterval(s: number, intervals: readonly ArcInterval[], margin = 1.2): boolean {
  return intervals.some((iv) => s >= iv.sStart - margin && s <= iv.sEnd + margin);
}

/** Places streetlights cleanly on sidewalks, skipping every driveway and junction cutout. */
function buildStreetlights(roadSegments: readonly RoadSegment[]): readonly StreetlightPlacement[] {
  const lights: StreetlightPlacement[] = [];
  const natRoad = roadSegments.find((r) => r.id === 'national_rd');
  if (natRoad) {
    const curbOffset = natRoad.carriagewayWidth * 0.5 + 0.85;
    for (const sSigned of NATIONAL_STREETLIGHT_S) {
      const roadS = nationalRoadS(sSigned);
      const sp = samplePolylineAt(natRoad.samples, roadS);

      // NE (left) sidewalk
      if (!isInsideAnyInterval(roadS, natRoad.sidewalkLeftCutouts, 2.5)) {
        lights.push({
          id: `sl_nat_ne_${sSigned}`,
          roadId: 'national_rd',
          position: sdToWorld(sSigned, curbOffset),
          heading: vecHeading(-sp.nx, -sp.nz),
          armDirection: { x: Number((-sp.nx).toFixed(4)), z: Number((-sp.nz).toFixed(4)) },
          height: 8.5,
        });
      }

      // SW (right) sidewalk
      if (!isInsideAnyInterval(roadS, natRoad.sidewalkRightCutouts, 2.5)) {
        lights.push({
          id: `sl_nat_sw_${sSigned}`,
          roadId: 'national_rd',
          position: sdToWorld(sSigned, -curbOffset),
          heading: vecHeading(sp.nx, sp.nz),
          armDirection: { x: Number(sp.nx.toFixed(4)), z: Number(sp.nz.toFixed(4)) },
          height: 8.5,
        });
      }
    }
  }

  // Side-street lights on Pedro Zayco Sr. St. & Perimeter Access Rd (skipping junction mouths)
  for (const sideId of ['pedro_zayco_st', 'repollo_st', 'ceres_perimeter_rd'] as const) {
    const road = roadSegments.find((r) => r.id === sideId);
    if (!road) continue;
    const curbOffset = road.carriagewayWidth * 0.5 + 0.7;
    for (let s = 26; s < road.length - 12; s += 36) {
      if (isInsideAnyInterval(s, road.sidewalkLeftCutouts, 2.0)) continue;
      const sp = samplePolylineAt(road.samples, s);
      lights.push({
        id: `sl_${sideId}_${s}`,
        roadId: sideId,
        position: {
          x: Number((sp.x + sp.nx * curbOffset).toFixed(3)),
          z: Number((sp.z + sp.nz * curbOffset).toFixed(3)),
        },
        heading: vecHeading(-sp.nx, -sp.nz),
        armDirection: { x: Number((-sp.nx).toFixed(4)), z: Number((-sp.nz).toFixed(4)) },
        height: 7.2,
      });
    }
  }

  return lights;
}

/**
 * Single Source of Truth builder for the Kabankalan City Ceres Bus Terminal Corridor.
 * Consumed by BOTH `src/sim/` (traffic physics) and `src/scene3d/` (procedural 3D world).
 */
export function buildCeresRoadGraph(): RoadNetworkGraph {
  const roadSegments: RoadSegment[] = ROAD_SEGMENT_SPECS.map((spec) => {
    const { samples, length } = resamplePolyline(spec.points, 1.5);
    return {
      ...spec,
      samples,
      length,
    };
  });

  // Build prevLaneIds reverse index from nextLaneIds
  const prevMap = new Map<string, string[]>();
  for (const spec of LANE_SPECS) {
    prevMap.set(spec.id, []);
  }
  for (const spec of LANE_SPECS) {
    for (const nextId of spec.nextLaneIds) {
      const list = prevMap.get(nextId);
      if (!list) {
        throw new Error(`Lane "${spec.id}" references unknown nextLaneId "${nextId}"`);
      }
      list.push(spec.id);
    }
  }

  const lanes: LaneEdge[] = LANE_SPECS.map((spec) => {
    const step = spec.isConnector || spec.isTerminalInternal ? 0.8 : 1.25;
    const { samples, length } = resamplePolyline(spec.points, step);
    return {
      ...spec,
      samples,
      length,
      prevLaneIds: prevMap.get(spec.id) ?? [],
    };
  });

  const laneById: Record<string, LaneEdge> = {};
  for (const lane of lanes) {
    laneById[lane.id] = lane;
  }

  const conflictZones = computeConflictZones(lanes);
  const crosswalks = buildCrosswalks(roadSegments, lanes);
  const streetlights = buildStreetlights(roadSegments);
  const satelliteCoverage = getEsriSatelliteTileBounds(170, 18, CERES_ORIGIN);

  // Compute exact metric bounding box covering all roads and buildings
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const road of roadSegments) {
    for (const p of road.points) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z);
      maxZ = Math.max(maxZ, p.z);
    }
  }
  for (const b of BUILDING_SPECS) {
    for (const p of b.footprint) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z);
      maxZ = Math.max(maxZ, p.z);
    }
  }

  return {
    origin: CERES_ORIGIN,
    corridorBearingDeg: CORRIDOR_BEARING_DEG,
    corridorBounds: {
      minX: Number(minX.toFixed(2)),
      maxX: Number(maxX.toFixed(2)),
      minZ: Number(minZ.toFixed(2)),
      maxZ: Number(maxZ.toFixed(2)),
      centerX: Number(((minX + maxX) * 0.5).toFixed(2)),
      centerZ: Number(((minZ + maxZ) * 0.5).toFixed(2)),
      width: Number((maxX - minX).toFixed(2)),
      depth: Number((maxZ - minZ).toFixed(2)),
    },
    satelliteCoverage,
    roadSegments,
    lanes,
    laneById,
    conflictZones,
    crosswalks,
    buildings: BUILDING_SPECS,
    yardPads: TERMINAL_YARD_PADS,
    perimeterWalls: PERIMETER_WALL_SPECS,
    stagingBays: STAGING_BAY_SPECS,
    gateStructures: GATE_STRUCTURE_SPECS,
    trees: TREE_SPECS,
    streetlights,
  };
}
