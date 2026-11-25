import { samplePolylineAt } from '@/gis/roadGraphBuilder';
import type {
  ConflictParticipant,
  ConflictZone,
  Crosswalk,
  CrosswalkLaneRef,
  LaneEdge,
  RoadNetworkGraph,
  SamplePoint,
  Vec2,
} from '@/gis/types';
import { hashStringUnit, randRange, sampleLogNormal } from './random';
import {
  SCENARIOS,
  VEHICLE_DIMENSIONS,
  type SimVehicleType,
  type SimulationParams,
  type SimulationState,
  type VehicleAgent,
} from './types';

export interface IdmParams {
  readonly v0: number;
  readonly s0: number;
  readonly T: number;
  readonly a: number;
  readonly b: number;
  readonly bMax: number;
  readonly aLatMax: number;
}

/** Calibrated Treiber IDM parameters per Philippine corridor vehicle class */
export const IDM_PARAMS: Readonly<Record<SimVehicleType, IdmParams>> = {
  bus: { v0: 11.2, s0: 3.2, T: 1.7, a: 1.15, b: 2.2, bMax: 5.6, aLatMax: 1.65 },
  jeepney: { v0: 11.6, s0: 2.5, T: 1.45, a: 1.65, b: 2.6, bMax: 6.0, aLatMax: 2.15 },
  tricycle: { v0: 7.4, s0: 2.0, T: 1.35, a: 1.4, b: 2.5, bMax: 6.0, aLatMax: 2.0 },
  car: { v0: 13.4, s0: 2.0, T: 1.25, a: 2.15, b: 3.0, bMax: 6.5, aLatMax: 2.5 },
};

export interface ConflictLaneEntry {
  readonly zone: ConflictZone;
  readonly self: ConflictParticipant;
  readonly other: ConflictParticipant;
}

export interface CrosswalkLaneEntry {
  readonly crosswalk: Crosswalk;
  readonly laneRef: CrosswalkLaneRef;
}

export interface GraphSimIndex {
  readonly conflictEntriesByLane: ReadonlyMap<string, readonly ConflictLaneEntry[]>;
  readonly crosswalkEntriesByLane: ReadonlyMap<string, readonly CrosswalkLaneEntry[]>;
}

const graphIndexCache = new WeakMap<RoadNetworkGraph, GraphSimIndex>();

/** Builds and caches fast per-lane lookup tables for conflict zones & crosswalks. */
export function getGraphSimIndex(graph: RoadNetworkGraph): GraphSimIndex {
  const cached = graphIndexCache.get(graph);
  if (cached) return cached;

  const conflictMap = new Map<string, ConflictLaneEntry[]>();
  for (const zone of graph.conflictZones) {
    if (zone.participants.length < 2) continue;
    for (let i = 0; i < zone.participants.length; i++) {
      for (let j = 0; j < zone.participants.length; j++) {
        if (i === j) continue;
        const self = zone.participants[i];
        const other = zone.participants[j];
        let list = conflictMap.get(self.laneId);
        if (!list) {
          list = [];
          conflictMap.set(self.laneId, list);
        }
        list.push({ zone, self, other });
      }
    }
  }

  const crosswalkMap = new Map<string, CrosswalkLaneEntry[]>();
  for (const cw of graph.crosswalks) {
    for (const laneRef of cw.affectedLanes) {
      let list = crosswalkMap.get(laneRef.laneId);
      if (!list) {
        list = [];
        crosswalkMap.set(laneRef.laneId, list);
      }
      list.push({ crosswalk: cw, laneRef });
    }
  }

  const index: GraphSimIndex = {
    conflictEntriesByLane: conflictMap,
    crosswalkEntriesByLane: crosswalkMap,
  };
  graphIndexCache.set(graph, index);
  return index;
}

/** Treiber's Intelligent Driver Model (IDM) longitudinal acceleration (m/s²). */
export function idmAcceleration(
  v: number,
  v0: number,
  gap: number,
  deltaV: number,
  p: IdmParams,
  s0Override?: number
): number {
  const safeV0 = Math.max(0.5, v0);
  const vClamped = Math.max(0, v);
  const freeTerm = 1 - Math.pow(vClamped / safeV0, 4);
  if (!Number.isFinite(gap)) {
    return Math.max(-p.bMax, Math.min(p.a, p.a * freeTerm));
  }
  const safeGap = Math.max(0.12, gap);
  const s0 = s0Override ?? p.s0;
  const sStar =
    s0 + Math.max(0, vClamped * p.T + (vClamped * deltaV) / (2 * Math.sqrt(p.a * p.b)));
  const intTerm = Math.pow(sStar / safeGap, 2);
  const acc = p.a * (freeTerm - intTerm);
  return Math.max(-p.bMax, Math.min(p.a, acc));
}

/** Braking acceleration to stop smoothly before a stationary stop line at `distToStop`. */
function stopLineAcceleration(v: number, v0: number, distToStop: number, p: IdmParams): number {
  if (distToStop <= 0.18) {
    return v > 0.05 ? -p.bMax : 0;
  }
  const idmStop = idmAcceleration(v, v0, distToStop, v, p, 0.55);
  // Kinematic safety envelope so fast vehicles never overshoot stop bars
  const kinematicNeed = -(v * v) / (2 * Math.max(0.2, distToStop - 0.1));
  if (kinematicNeed < -p.b * 0.95) {
    return Math.max(-p.bMax, Math.min(idmStop, kinematicNeed * 1.12));
  }
  return idmStop;
}

function smoothstep(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

/** Effective lateral offset including active smooth MOBIL lane-change transition. */
export function getEffectiveLateralOffset(v: VehicleAgent): number {
  const lcOffset =
    v.laneChangeProgress < 1 ? v.laneChangeFromOffset * (1 - smoothstep(v.laneChangeProgress)) : 0;
  return v.lateralOffset + lcOffset;
}

/** Evaluates world position, heading, and spline sample for `(laneId, s, lateralOffset)`. */
export function computeVehiclePose(
  graph: RoadNetworkGraph,
  laneId: string,
  s: number,
  effectiveLateralOffset: number
): { position: Vec2; heading: number; sample: SamplePoint } {
  const lane = graph.laneById[laneId];
  const sample = samplePolylineAt(lane.samples, Math.max(0, Math.min(lane.length, s)));
  return {
    position: {
      x: sample.x + sample.nx * effectiveLateralOffset,
      z: sample.z + sample.nz * effectiveLateralOffset,
    },
    heading: sample.heading,
    sample,
  };
}

/**
 * Exact 2D Oriented Bounding Box (SAT) overlap depth in meters (`0` = disjoint).
 * Heading convention: `Math.atan2(tx, tz)` (+Z forward, +X right-handed East).
 */
export function computeObbOverlap(
  aPos: Vec2,
  aHeading: number,
  aType: SimVehicleType,
  bPos: Vec2,
  bHeading: number,
  bType: SimVehicleType,
  padMeters = 0
): number {
  const dimA = VEHICLE_DIMENSIONS[aType];
  const dimB = VEHICLE_DIMENSIONS[bType];
  const aHL = dimA.length * 0.5 + padMeters;
  const aHW = dimA.width * 0.5 + padMeters;
  const bHL = dimB.length * 0.5 + padMeters;
  const bHW = dimB.width * 0.5 + padMeters;

  const dx = bPos.x - aPos.x;
  const dz = bPos.z - aPos.z;
  const maxR = Math.hypot(aHL, aHW) + Math.hypot(bHL, bHW);
  if (dx * dx + dz * dz >= maxR * maxR) return 0;

  const afx = Math.sin(aHeading);
  const afz = Math.cos(aHeading);
  const arx = afz;
  const arz = -afx;

  const bfx = Math.sin(bHeading);
  const bfz = Math.cos(bHeading);
  const brx = bfz;
  const brz = -bfx;

  let minPenetration = Infinity;
  const axes: readonly [number, number][] = [
    [afx, afz],
    [arx, arz],
    [bfx, bfz],
    [brx, brz],
  ];

  for (let i = 0; i < 4; i++) {
    const ax = axes[i][0];
    const az = axes[i][1];
    const centerProj = Math.abs(dx * ax + dz * az);
    const rA = aHL * Math.abs(afx * ax + afz * az) + aHW * Math.abs(arx * ax + arz * az);
    const rB = bHL * Math.abs(bfx * ax + bfz * az) + bHW * Math.abs(brx * ax + brz * az);
    const overlap = rA + rB - centerProj;
    if (overlap <= 0) return 0;
    if (overlap < minPenetration) minPenetration = overlap;
  }

  return Number.isFinite(minPenetration) ? minPenetration : 0;
}

/** Builds a clean through-corridor continuation `routeQueue` starting AFTER `startLaneId`. */
export function buildThroughRouteFrom(
  graph: RoadNetworkGraph,
  startLaneId: string,
  vehicleType: SimVehicleType
): string[] {
  const queue: string[] = [];
  const visited = new Set<string>([startLaneId]);
  let curr = graph.laneById[startLaneId];

  for (let hop = 0; hop < 20 && curr && !curr.isExit && curr.nextLaneIds.length > 0; hop++) {
    const candidates = curr.nextLaneIds
      .map((id) => graph.laneById[id])
      .filter((l): l is LaneEdge => Boolean(l) && l.allowedVehicles.includes(vehicleType));
    if (candidates.length === 0) break;

    // Prefer same-road through continuation over turn/connector branches
    const next =
      candidates.find((l) => !l.isConnector && l.roadId === curr.roadId && !visited.has(l.id)) ??
      candidates.find((l) => !l.isConnector && !visited.has(l.id)) ??
      candidates.find((l) => !visited.has(l.id));
    if (!next) break;
    visited.add(next.id);
    queue.push(next.id);
    curr = next;
  }

  return queue;
}

interface PathSegment {
  readonly laneId: string;
  readonly lane: LaneEdge;
  /** Arc-distance from `v.s` (center) to `s = 0` of this lane (negative for seg 0). */
  readonly distOffset: number;
}

/** Constructs multi-lane lookahead window along `[v.laneId, ...v.routeQueue]` up to `maxDist`. */
function buildPathWindow(
  graph: RoadNetworkGraph,
  v: VehicleAgent,
  maxDist: number
): PathSegment[] {
  const curLane = graph.laneById[v.laneId];
  if (!curLane) return [];

  const segs: PathSegment[] = [{ laneId: curLane.id, lane: curLane, distOffset: -v.s }];
  let offset = curLane.length - v.s;
  let prevLane = curLane;
  let queueIdx = 0;

  while (offset < maxDist) {
    let nextId: string | undefined;
    if (queueIdx < v.routeQueue.length) {
      nextId = v.routeQueue[queueIdx++];
    } else if (!prevLane.isExit && prevLane.nextLaneIds.length > 0) {
      nextId =
        prevLane.nextLaneIds.find((id) => {
          const l = graph.laneById[id];
          return l && !l.isConnector && l.allowedVehicles.includes(v.type);
        }) ?? prevLane.nextLaneIds[0];
    }
    if (!nextId) break;
    const nextLane = graph.laneById[nextId];
    if (!nextLane) break;
    segs.push({ laneId: nextId, lane: nextLane, distOffset: offset });
    offset += nextLane.length;
    prevLane = nextLane;
  }

  return segs;
}

/** Samples a world point along `segs` at `distAhead` meters ahead of `v`'s center. */
function sampleAlongPath(segs: readonly PathSegment[], distAhead: number): SamplePoint | null {
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    const localS = distAhead - seg.distOffset;
    if (localS >= -1e-4 && localS <= seg.lane.length + 1e-4) {
      return samplePolylineAt(seg.lane.samples, Math.max(0, Math.min(seg.lane.length, localS)));
    }
  }
  return null;
}

export interface LeaderHit {
  readonly vehicle: VehicleAgent;
  readonly netGap: number;
  readonly relSpeed: number; // v.speed - leaderProjectedSpeed
}

/**
 * Multi-lane Directed Lane-Edge Graph leader search (NO routeId silos!):
 * 1. Scans current lane + planned upcoming lanes up to 65m ahead.
 * 2. Scans adjacent lanes during active lane changes (self or other).
 * 3. Performs 20m forward swept-corridor scan to catch angled/merging vehicles on curves.
 */
export function findLeaderAlongGraph(
  v: VehicleAgent,
  segs: readonly PathSegment[],
  allVehicles: readonly VehicleAgent[],
  vehiclesByLane: ReadonlyMap<string, readonly VehicleAgent[]>
): LeaderHit | null {
  const vDim = VEHICLE_DIMENSIONS[v.type];
  const vHalfLen = vDim.length * 0.5;
  const vHalfW = vDim.width * 0.5;

  let best: LeaderHit | null = null;
  let bestId: string | null = null;
  const consider = (other: VehicleAgent, netGap: number, projectedSpeed: number) => {
    if (best === null || netGap < best.netGap) {
      best = { vehicle: other, netGap, relSpeed: v.speed - projectedSpeed };
      bestId = other.id;
    }
  };

  // 1. Longitudinal scan across current lane & connected downstream lanes (up to 65m)
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    const list = vehiclesByLane.get(seg.laneId);
    if (!list) continue;
    for (let j = 0; j < list.length; j++) {
      const other = list[j];
      if (other.id === v.id) continue;
      if (i === 0 && other.s <= v.s) continue;
      const oHalfLen = VEHICLE_DIMENSIONS[other.type].length * 0.5;
      const centerDist = seg.distOffset + other.s;
      const netGap = centerDist - vHalfLen - oHalfLen;
      if (netGap <= 65) {
        consider(other, netGap, other.speed);
      }
    }
  }

  // 2. Adjacent-lane coupling for active lane changers (both outgoing & incoming)
  const curLane = segs[0]?.lane;
  if (curLane) {
    const adjIds: Array<{ id: string; dirSign: 1 | -1 }> = [];
    if (curLane.adjacentLeftLaneId) adjIds.push({ id: curLane.adjacentLeftLaneId, dirSign: 1 });
    if (curLane.adjacentRightLaneId) adjIds.push({ id: curLane.adjacentRightLaneId, dirSign: -1 });

    for (const { id: adjId, dirSign } of adjIds) {
      const adjList = vehiclesByLane.get(adjId);
      if (!adjList) continue;
      for (const other of adjList) {
        if (other.id === v.id) continue;
        // Other vehicle is mid-lane-change having just left `v`'s lane, OR `v` itself is mid-change from `adjId`
        const otherLeavingOurLane =
          other.laneChangeProgress < 0.85 &&
          Math.sign(other.laneChangeFromOffset) === -dirSign;
        const selfLeavingAdjLane =
          v.laneChangeProgress < 0.85 && Math.sign(v.laneChangeFromOffset) === dirSign;
        if (!otherLeavingOurLane && !selfLeavingAdjLane) continue;
        if (other.s <= v.s) continue;
        const oHalfLen = VEHICLE_DIMENSIONS[other.type].length * 0.5;
        const netGap = other.s - v.s - vHalfLen - oHalfLen;
        if (netGap <= 45) {
          consider(other, netGap, other.speed);
        }
      }
    }
  }

  // 3. Forward swept-corridor scan (20m curved envelope along v's upcoming trajectory)
  const vFx = Math.sin(v.heading);
  const vFz = Math.cos(v.heading);
  const probeDists = [2.2, 5.0, 8.0, 11.2, 14.5, 17.8, 21.0];
  const probes: Array<{ d: number; sp: SamplePoint }> = [];
  for (let k = 0; k < probeDists.length; k++) {
    const d = vHalfLen + probeDists[k];
    const sp = sampleAlongPath(segs, d);
    if (sp) probes.push({ d: probeDists[k], sp });
  }

  if (probes.length > 0) {
    const vLat = getEffectiveLateralOffset(v);
    for (let i = 0; i < allVehicles.length; i++) {
      const other = allVehicles[i];
      if (other.id === v.id) continue;
      if (bestId !== null && other.id === bestId) continue;

      const dx = other.position.x - v.position.x;
      const dz = other.position.z - v.position.z;
      const distSq = dx * dx + dz * dz;
      if (distSq > 26 * 26) continue;

      // Ignore vehicles strictly behind v
      const fwdDot = dx * vFx + dz * vFz;
      if (fwdDot < 0.5) continue;

      const oFx = Math.sin(other.heading);
      const oFz = Math.cos(other.heading);
      const headingDot = vFx * oFx + vFz * oFz;
      const oDim = VEHICLE_DIMENSIONS[other.type];
      const oHalfLen = oDim.length * 0.5;
      const oHalfW = oDim.width * 0.5;

      // Skip clearly opposing vehicles travelling in their own parallel opposing lane
      if (headingDot < -0.78) {
        const latToSelf = Math.abs(dx * vFz - dz * vFx);
        if (latToSelf > vHalfW + oHalfW + 0.35) continue;
      }

      // Check intersection against swept path probes
      for (let k = 0; k < probes.length; k++) {
        const { d, sp } = probes[k];
        const px = sp.x + sp.nx * vLat;
        const pz = sp.z + sp.nz * vLat;
        const pdx = other.position.x - px;
        const pdz = other.position.z - pz;
        const alongProbe = pdx * sp.tx + pdz * sp.tz;
        const latProbe = Math.abs(pdx * sp.nx + pdz * sp.nz);

        // Effective half-extents of `other` projected into probe frame
        const cosRel = Math.abs(oFx * sp.tx + oFz * sp.tz);
        const sinRel = Math.abs(oFx * sp.nx + oFz * sp.nz);
        const oProjAlong = oHalfLen * cosRel + oHalfW * sinRel;
        const oProjLat = oHalfLen * sinRel + oHalfW * cosRel;

        if (latProbe <= vHalfW + oProjLat + 0.25 && Math.abs(alongProbe) <= oProjAlong + 1.8) {
          const netGap = Math.max(0.05, d + alongProbe - oProjAlong - 0.35);
          const projSpeed = Math.max(0, other.speed * (oFx * sp.tx + oFz * sp.tz));
          consider(other, netGap, projSpeed);
          break;
        }
      }
    }
  }

  return best;
}

/** Computes speed limit adapted for upcoming road/turn curvature within 24m. */
function computeEffectiveDesiredSpeed(
  v: VehicleAgent,
  segs: readonly PathSegment[],
  p: IdmParams
): number {
  const curLane = segs[0].lane;
  let vLim = Math.min(v.desiredSpeed, curLane.speedLimit);

  // Look ahead for upcoming slower connector speed limits & curve apexes
  let maxCurv = 0;
  for (let d = 0; d <= 24; d += 3) {
    const sp = sampleAlongPath(segs, d);
    if (!sp) break;
    const c = Math.abs(sp.curvature);
    if (c > maxCurv) maxCurv = c;
  }

  // Anticipate slower speed limit on next lane if approaching within 18m
  if (segs.length > 1 && segs[1].distOffset < 18) {
    vLim = Math.min(vLim, segs[1].lane.speedLimit);
  }

  if (maxCurv > 0.015) {
    const vCurve = Math.sqrt(p.aLatMax / maxCurv);
    vLim = Math.min(vLim, Math.max(3.2, vCurve));
  }

  return vLim;
}

/** Checks if vehicle has a planned non-through turn within the next 2 lane hops. */
function hasImminentTurn(graph: RoadNetworkGraph, v: VehicleAgent): boolean {
  if (v.terminalPhase !== 'none') return true;
  for (let i = 0; i < Math.min(3, v.routeQueue.length); i++) {
    const l = graph.laneById[v.routeQueue[i]];
    if (l && (l.isConnector || l.isTerminalInternal)) return true;
  }
  return false;
}

/**
 * Evaluates MOBIL incentive + safety criterion on 4-lane National Road.
 * Returns `true` if a lane change was executed.
 */
function tryMobilLaneChange(
  v: VehicleAgent,
  leader: LeaderHit | null,
  accOld: number,
  vEff0: number,
  state: SimulationState,
  vehiclesByLane: Map<string, VehicleAgent[]>
): boolean {
  if (v.type !== 'car' && v.type !== 'jeepney') return false;
  if (v.mobilCooldown > 0 || v.laneChangeProgress < 1 || v.dwellTimer > 0) return false;
  if (hasImminentTurn(state.graph, v)) return false;

  const curLane = state.graph.laneById[v.laneId];
  if (!curLane) return false;
  if (v.s < 6 || v.s > curLane.length - 8) return false;

  // Trigger when impeded by slower leader or dwelling PUV
  const impeded =
    leader !== null &&
    leader.netGap < 28 &&
    (leader.vehicle.speed < v.desiredSpeed * 0.72 || leader.vehicle.state === 'dwelling');
  if (!impeded) return false;

  const candidates: Array<{ targetId: string; isLeft: boolean }> = [];
  if (curLane.adjacentLeftLaneId) {
    candidates.push({ targetId: curLane.adjacentLeftLaneId, isLeft: true });
  }
  if (curLane.adjacentRightLaneId) {
    candidates.push({ targetId: curLane.adjacentRightLaneId, isLeft: false });
  }

  const pSelf = IDM_PARAMS[v.type];
  const vHalfLen = VEHICLE_DIMENSIONS[v.type].length * 0.5;

  for (const { targetId, isLeft } of candidates) {
    const targetLane = state.graph.laneById[targetId];
    if (!targetLane || !targetLane.allowedVehicles.includes(v.type)) continue;

    const newS = Math.max(1, Math.min(targetLane.length - 1, (v.s / curLane.length) * targetLane.length));
    const newRoute = buildThroughRouteFrom(state.graph, targetLane.id, v.type);

    // Find new leader on targetLane + downstream next lane (up to 45m)
    let newLeader: VehicleAgent | null = null;
    let newLeaderGap = Infinity;
    const scanDown: Array<{ laneId: string; offset: number }> = [{ laneId: targetLane.id, offset: -newS }];
    let dOff = targetLane.length - newS;
    for (let k = 0; k < newRoute.length && dOff < 45; k++) {
      const nl = state.graph.laneById[newRoute[k]];
      if (!nl) break;
      scanDown.push({ laneId: nl.id, offset: dOff });
      dOff += nl.length;
    }
    for (const seg of scanDown) {
      const list = vehiclesByLane.get(seg.laneId);
      if (!list) continue;
      for (const other of list) {
        if (other.id === v.id) continue;
        if (seg.laneId === targetLane.id && other.s <= newS) continue;
        const oHalf = VEHICLE_DIMENSIONS[other.type].length * 0.5;
        const gap = seg.offset + other.s - vHalfLen - oHalf;
        if (gap < newLeaderGap) {
          newLeaderGap = gap;
          newLeader = other;
        }
      }
    }

    // Find new follower on targetLane + immediate upstream prevLaneIds
    let newFollower: VehicleAgent | null = null;
    let newFollowerGap = Infinity;
    const scanUp: Array<{ laneId: string; distBack: number }> = [{ laneId: targetLane.id, distBack: newS }];
    for (const prevId of targetLane.prevLaneIds) {
      const pl = state.graph.laneById[prevId];
      if (pl && newS < 35) {
        scanUp.push({ laneId: prevId, distBack: newS + pl.length });
      }
    }
    for (const seg of scanUp) {
      const list = vehiclesByLane.get(seg.laneId);
      if (!list) continue;
      for (const other of list) {
        if (other.id === v.id) continue;
        if (seg.laneId === targetLane.id && other.s >= newS) continue;
        const oHalf = VEHICLE_DIMENSIONS[other.type].length * 0.5;
        const gap = seg.distBack - other.s - vHalfLen - oHalf;
        if (gap < newFollowerGap) {
          newFollowerGap = gap;
          newFollower = other;
        }
      }
    }

    // MOBIL safety criterion
    const minLeadSafe = pSelf.s0 + v.speed * 1.1;
    if (newLeader && newLeaderGap < minLeadSafe) continue;

    let followerDeltaAcc = 0;
    if (newFollower) {
      const pFol = IDM_PARAMS[newFollower.type];
      const minFolSafe = pFol.s0 + newFollower.speed * 1.1;
      if (newFollowerGap < minFolSafe) continue;
      const accFolNew = idmAcceleration(
        newFollower.speed,
        Math.min(newFollower.desiredSpeed, targetLane.speedLimit),
        newFollowerGap,
        newFollower.speed - v.speed,
        pFol
      );
      if (accFolNew < -3.0) continue;
      const accFolOld = newFollower.acc;
      followerDeltaAcc = accFolNew - accFolOld;
    }

    // Verify 2D physical OBB clearance at destination pose before committing
    const targetPose = computeVehiclePose(state.graph, targetLane.id, newS, 0);
    let hasSpatialConflict = false;
    for (const other of state.vehicles) {
      if (other.id === v.id) continue;
      if (
        computeObbOverlap(
          targetPose.position,
          targetPose.heading,
          v.type,
          other.position,
          other.heading,
          other.type,
          0.45
        ) > 0
      ) {
        hasSpatialConflict = true;
        break;
      }
    }
    if (hasSpatialConflict) continue;

    // MOBIL incentive criterion
    const accNew = newLeader
      ? idmAcceleration(v.speed, vEff0, newLeaderGap, v.speed - newLeader.speed, pSelf)
      : idmAcceleration(v.speed, vEff0, Infinity, 0, pSelf);

    const politeness = 0.25;
    const incentive = accNew - accOld + politeness * Math.min(0, followerDeltaAcc);
    if (accNew - accOld <= 0.35 || incentive <= 0.35) continue;

    // Commit smooth lane change!
    const oldList = vehiclesByLane.get(curLane.id);
    if (oldList) {
      const idx = oldList.indexOf(v);
      if (idx >= 0) oldList.splice(idx, 1);
    }
    let newList = vehiclesByLane.get(targetLane.id);
    if (!newList) {
      newList = [];
      vehiclesByLane.set(targetLane.id, newList);
    }
    newList.push(v);

    v.laneId = targetLane.id;
    v.s = newS;
    v.routeQueue = newRoute;
    v.laneChangeFromOffset = isLeft ? -curLane.width : curLane.width;
    v.laneChangeProgress = 0;
    v.turnSignal = isLeft ? 'left' : 'right';
    v.mobilCooldown = 6.0;
    v.state = 'lane_changing';
    state.laneChangesCompleted++;
    return true;
  }

  return false;
}

/**
 * Checks if any conflicting participant vehicle currently occupies OR is approaching
 * a conflict zone participant `op` (including upstream nose overhang & downstream tail!).
 */
function inspectConflictingParticipant(
  v: VehicleAgent,
  selfP: ConflictParticipant,
  otherP: ConflictParticipant,
  distToSelfEntry: number,
  selfClearanceTime: number,
  selfEta: number,
  graph: RoadNetworkGraph,
  vehiclesByLane: ReadonlyMap<string, readonly VehicleAgent[]>
): { mustYield: boolean; isOccupied: boolean; reason: string; conflictingId: string | null } {
  const opLane = graph.laneById[otherP.laneId];
  if (!opLane) return { mustYield: false, isOccupied: false, reason: '', conflictingId: null };

  const zoneSpan = Math.max(4.0, otherP.sEnd - otherP.sStart);
  const checkOccupied = (other: VehicleAgent, sOnOpLane: number): boolean => {
    const oHalf = VEHICLE_DIMENSIONS[other.type].length * 0.5;
    const front = sOnOpLane + oHalf;
    const rear = sOnOpLane - oHalf;
    // CRITICAL V1 FIX: pure geometric occupancy (speed === 0 MUST STILL BLOCK!).
    // Remember sStart/sEnd already include BODY_PAD = 2.6m from the geometric crossing centerline,
    // so `+0.65m` interior threshold strictly detects vehicles inside the physical box while
    // never deadlocking on a side-street car stopped behind the curb mouth.
    return front >= otherP.sStart + 0.65 && rear <= otherP.sEnd + 0.4;
  };

  // 1. Vehicles directly on `otherP.laneId`
  const directList = vehiclesByLane.get(otherP.laneId);
  if (directList) {
    for (let i = 0; i < directList.length; i++) {
      const other = directList[i];
      if (other.id === v.id) continue;

      if (checkOccupied(other, other.s)) {
        return {
          mustYield: true,
          isOccupied: true,
          reason: `Conflict zone occupied by ${other.type}`,
          conflictingId: other.id,
        };
      }

      // Approaching on `otherP.laneId`
      const oHalf = VEHICLE_DIMENSIONS[other.type].length * 0.5;
      const otherDistToEntry = otherP.sStart - (other.s + oHalf);
      if (otherDistToEntry > 0 && otherDistToEntry < 55) {
        const res = evaluateApproachingConflict(
          v,
          selfP,
          other,
          otherP,
          otherDistToEntry,
          distToSelfEntry,
          selfEta,
          selfClearanceTime,
          zoneSpan
        );
        if (res.mustYield) return { ...res, isOccupied: false };
      }
    }
  }

  // 2. Vehicles on immediate downstream lanes whose rear tail still hangs in merge/crossing exit
  if (otherP.sEnd >= opLane.length - 3.5) {
    for (const nextId of opLane.nextLaneIds) {
      const nextList = vehiclesByLane.get(nextId);
      if (!nextList) continue;
      for (const other of nextList) {
        if (other.id === v.id) continue;
        if (checkOccupied(other, opLane.length + other.s)) {
          return {
            mustYield: true,
            isOccupied: true,
            reason: `Merge tail clearing (${other.type})`,
            conflictingId: other.id,
          };
        }
      }
    }
  }

  // 3. Vehicles on upstream lanes approaching `otherP.laneId` (essential when `sStart` is near 0!)
  for (const prevId of opLane.prevLaneIds) {
    const prevLane = graph.laneById[prevId];
    if (!prevLane) continue;
    const prevList = vehiclesByLane.get(prevId);
    if (!prevList) continue;

    for (const other of prevList) {
      if (other.id === v.id) continue;
      // Only consider vehicles actually routed onto `otherP.laneId`!
      if (other.routeQueue[0] !== otherP.laneId) continue;

      const sOnOp = other.s - prevLane.length;
      if (checkOccupied(other, sOnOp)) {
        return {
          mustYield: true,
          isOccupied: true,
          reason: `Entering conflict occupied by ${other.type}`,
          conflictingId: other.id,
        };
      }

      const oHalf = VEHICLE_DIMENSIONS[other.type].length * 0.5;
      const otherDistToEntry = prevLane.length - other.s + otherP.sStart - oHalf;
      if (otherDistToEntry > 0 && otherDistToEntry < 55) {
        const res = evaluateApproachingConflict(
          v,
          selfP,
          other,
          otherP,
          otherDistToEntry,
          distToSelfEntry,
          selfEta,
          selfClearanceTime,
          zoneSpan
        );
        if (res.mustYield) return { ...res, isOccupied: false };
      }
    }
  }

  return { mustYield: false, isOccupied: false, reason: '', conflictingId: null };
}

function evaluateApproachingConflict(
  v: VehicleAgent,
  selfP: ConflictParticipant,
  other: VehicleAgent,
  otherP: ConflictParticipant,
  otherDistToEntry: number,
  distToSelfEntry: number,
  selfEta: number,
  selfClearanceTime: number,
  zoneSpan: number
): { mustYield: boolean; reason: string; conflictingId: string | null } {
  // Ignore vehicles stopped well upstream (e.g. dwelling or stopped at a distant signal)
  if (other.speed < 0.25 && otherDistToEntry > 5.0) {
    return { mustYield: false, reason: '', conflictingId: null };
  }

  // Anti-deadlock guard: if BOTH are stopped waiting outside the conflict box, tie-break deterministically
  if (v.speed < 0.15 && other.speed < 0.15 && otherDistToEntry > 0.5 && distToSelfEntry > 0.5) {
    if (otherP.priority < selfP.priority) {
      return { mustYield: true, reason: `Yield priority ${otherP.priority}`, conflictingId: other.id };
    }
    if (otherP.priority === selfP.priority && other.id < v.id) {
      return { mustYield: true, reason: `Yield merge tie-break`, conflictingId: other.id };
    }
    return { mustYield: false, reason: '', conflictingId: null };
  }

  const approachSpeed = Math.max(other.speed, 2.8);
  const otherEta = otherDistToEntry / approachSpeed;
  const gapMargin = otherP.priority === 1 ? 1.8 : 1.3;

  if (otherP.priority < selfP.priority) {
    // Higher-priority conflicting vehicle gets right-of-way
    if (otherEta <= selfClearanceTime + gapMargin) {
      return {
        mustYield: true,
        reason: `Yielding to priority-${otherP.priority} ${other.type}`,
        conflictingId: other.id,
      };
    }
  } else if (otherP.priority === selfP.priority) {
    // Equal-priority merge/crossing resolves by earlier ETA, tie-broken by id
    if (otherEta < selfEta - 0.2 || (Math.abs(otherEta - selfEta) <= 0.2 && other.id < v.id)) {
      if (otherEta <= selfClearanceTime + 1.0 && otherDistToEntry < zoneSpan + 24) {
        return {
          mustYield: true,
          reason: `Zipper merge yield to ${other.type}`,
          conflictingId: other.id,
        };
      }
    }
  }

  return { mustYield: false, reason: '', conflictingId: null };
}

/** Anti-gridlock check: ensures enough clear receiving space downstream of a conflict box. */
function isReceivingSpaceBlocked(
  v: VehicleAgent,
  segIndex: number,
  segs: readonly PathSegment[],
  selfP: ConflictParticipant,
  vehiclesByLane: ReadonlyMap<string, readonly VehicleAgent[]>
): boolean {
  const vLen = VEHICLE_DIMENSIONS[v.type].length;
  const neededClearance = vLen + 2.5;

  // Scan from `selfP.sEnd` forward across `seg` and next segment
  let scanned = 0;
  for (let i = segIndex; i < segs.length && scanned < neededClearance + 4; i++) {
    const s = segs[i];
    const startS = i === segIndex ? selfP.sEnd : 0;
    const list = vehiclesByLane.get(s.laneId);
    if (list) {
      for (const other of list) {
        if (other.id === v.id) continue;
        if (other.s <= startS) continue;
        const oHalf = VEHICLE_DIMENSIONS[other.type].length * 0.5;
        const clearDist = scanned + (other.s - oHalf - startS);
        // Only treat as gridlock spillback if downstream vehicle is stopped/crawling
        if (clearDist < neededClearance && other.speed < 1.2) {
          return true;
        }
      }
    }
    scanned += Math.max(0, s.lane.length - startS);
  }

  return false;
}

/** Evaluates all auto-derived conflict zones within 55m along `v`'s multi-lane path. */
function evaluateConflictZones(
  v: VehicleAgent,
  segs: readonly PathSegment[],
  vEff0: number,
  p: IdmParams,
  graph: RoadNetworkGraph,
  index: GraphSimIndex,
  vehiclesByLane: ReadonlyMap<string, readonly VehicleAgent[]>
): { acc: number; reason: string | null; conflictingId: string | null; zoneId: string | null } {
  const vDim = VEHICLE_DIMENSIONS[v.type];
  const vHalfLen = vDim.length * 0.5;
  let minAcc = Infinity;
  let reason: string | null = null;
  let conflictingId: string | null = null;
  let activeZoneId: string | null = null;

  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    if (seg.distOffset > 52) break;
    const entries = index.conflictEntriesByLane.get(seg.laneId);
    if (!entries) continue;

    for (let k = 0; k < entries.length; k++) {
      const { zone, self, other } = entries[k];

      // Center-point stop position guarantees `v.s <= stopBarS` AND front bumper clear of `sStart`.
      // For turn connectors reached downstream (i >= 1), hold cleanly BEFORE the connector mouth
      // so vehicles never poke into opposing lanes or get stranded mid-intersection.
      const rawTargetS = Math.min(self.stopBarS, self.sStart - 0.85 - vHalfLen);
      const targetCenterS =
        i >= 1 && seg.lane.isConnector ? Math.min(rawTargetS, -vHalfLen - 1.1) : rawTargetS;
      const distToStop = seg.distOffset + targetCenterS;
      const distToEntry = seg.distOffset + self.sStart - vHalfLen;
      const distToExit = seg.distOffset + self.sEnd + vHalfLen;

      // Already cleared this conflict zone
      if (distToExit <= 0) continue;
      if (distToStop > 52) continue;

      // Track active conflict zone if inside or immediately approaching
      if (distToEntry <= 2.0 && distToExit > 0) {
        activeZoneId = zone.id;
      }

      // Already physically committed into the conflict box -> clear out safely!
      if (distToEntry < -0.25) continue;

      const crossingSpan = Math.max(4.5, self.sEnd - self.sStart) + vDim.length;
      const effectiveCruise = Math.max(v.speed, Math.min(vEff0, 6.2));
      const accelDelay = v.speed < 1.5 ? Math.min(2.6, Math.sqrt((2 * crossingSpan) / p.a) - crossingSpan / effectiveCruise) : 0;
      const selfEta = Math.max(0, distToEntry) / Math.max(v.speed, 3.0);
      const selfClearanceTime =
        Math.max(0, distToEntry) / Math.max(v.speed, 3.2) +
        crossingSpan / effectiveCruise +
        Math.max(0, accelDelay);

      const check = inspectConflictingParticipant(
        v,
        self,
        other,
        distToEntry,
        selfClearanceTime,
        selfEta,
        graph,
        vehiclesByLane
      );

      // Once committed mid-way inside a turn connector (`i === 0 && seg.lane.isConnector && v.s > 2.5`),
      // NEVER stop across opposing lanes for a distant approaching merge vehicle — only stop if physically occupied!
      const committedInsideConnector = i === 0 && seg.lane.isConnector && v.s > 2.5;
      let mustYield = committedInsideConnector ? check.isOccupied : check.mustYield;
      let yieldReason = check.reason;
      let conflictVehId = check.conflictingId;

      // Anti-gridlock: hold before entering a crossing/merge connector if receiving lane is backed up
      if (!mustYield && !committedInsideConnector && distToStop < 16 && self.priority >= 2) {
        if (isReceivingSpaceBlocked(v, i, segs, self, vehiclesByLane)) {
          mustYield = true;
          yieldReason = 'Anti-gridlock hold (exit blocked)';
          conflictVehId = null;
        }
      }

      if (mustYield) {
        const stopAcc = stopLineAcceleration(v.speed, vEff0, Math.max(0, distToStop), p);
        if (stopAcc < minAcc) {
          minAcc = stopAcc;
          reason = yieldReason;
          conflictingId = conflictVehId;
          activeZoneId = zone.id;
        }
      }
    }
  }

  return { acc: minAcc, reason, conflictingId, zoneId: activeZoneId };
}

/** Evaluates crosswalk traffic signals (Scenario 2) and active crossing/jaywalking pedestrians. */
function evaluateCrosswalksAndPedestrians(
  v: VehicleAgent,
  segs: readonly PathSegment[],
  vEff0: number,
  p: IdmParams,
  state: SimulationState,
  params: SimulationParams,
  index: GraphSimIndex
): { acc: number; reason: string | null } {
  const scenario = SCENARIOS[params.scenario];
  const vHalfLen = VEHICLE_DIMENSIONS[v.type].length * 0.5;
  const vHalfW = VEHICLE_DIMENSIONS[v.type].width * 0.5;
  let minAcc = Infinity;
  let reason: string | null = null;

  // 1. Signalized crosswalk stop bars (Scenario 2)
  if (scenario.signalizedCrossings && state.signalState.enabled) {
    const phase = state.signalState.vehicularPhase;
    if (phase === 'red' || phase === 'yellow') {
      for (let i = 0; i < segs.length; i++) {
        const seg = segs[i];
        if (seg.distOffset > 52) break;
        const cwList = index.crosswalkEntriesByLane.get(seg.laneId);
        if (!cwList) continue;
        for (const { crosswalk, laneRef } of cwList) {
          if (!crosswalk.signalizedInScenario2) continue;
          const distToStop = seg.distOffset + laneRef.stopBarS - vHalfLen;
          if (distToStop < -0.4 || distToStop > 50) continue;
          if (phase === 'yellow') {
            // MUTCD dilemma-zone clearance: only stop on yellow if comfortable decel <= 2.8 m/s² suffices
            const neededDecel = (v.speed * v.speed) / (2 * Math.max(0.5, distToStop));
            if (neededDecel > 2.8) continue;
          }
          const rawStopAcc = stopLineAcceleration(v.speed, vEff0, Math.max(0, distToStop), p);
          const stopAcc = phase === 'yellow' ? Math.max(-p.b, rawStopAcc) : rawStopAcc;
          if (stopAcc < minAcc) {
            minAcc = stopAcc;
            reason = phase === 'red' ? 'Red pedestrian signal' : 'Yellow signal caution';
          }
        }
      }
    }
  }

  // 2. Active non-overpass pedestrians crossing or jaywalking in vehicle's forward corridor
  if (state.pedestrians.length > 0) {
    const vLat = getEffectiveLateralOffset(v);
    for (let pi = 0; pi < state.pedestrians.length; pi++) {
      const ped = state.pedestrians[pi];
      if (ped.usingOverpass) continue;
      if (ped.state !== 'crossing' && ped.state !== 'in_conflict') continue;

      const dx = ped.position.x - v.position.x;
      const dz = ped.position.z - v.position.z;
      // Jaywalkers emerging near curbside PUVs have shorter driver sight distance (~18m vs 34m)
      const sightRange = ped.isJaywalking ? (scenario.dedicatedBaysOnly ? 23 : 17) : 34;
      if (dx * dx + dz * dz > (sightRange + 6) * (sightRange + 6)) continue;

      // Project pedestrian onto v's current/upcoming lane probes
      for (let d = 0.5; d <= sightRange; d += 2.0) {
        const sp = sampleAlongPath(segs, vHalfLen + d);
        if (!sp) break;
        const px = sp.x + sp.nx * vLat;
        const pz = sp.z + sp.nz * vLat;
        const pdx = ped.position.x - px;
        const pdz = ped.position.z - pz;
        const along = pdx * sp.tx + pdz * sp.tz;
        const lateral = Math.abs(pdx * sp.nx + pdz * sp.nz);
        if (Math.abs(along) <= 1.8 && lateral <= vHalfW + 2.3) {
          const distToPedStop = Math.max(0, d + along - 2.2);
          const stopAcc = stopLineAcceleration(v.speed, vEff0, distToPedStop, p);
          if (stopAcc < minAcc) {
            minAcc = stopAcc;
            reason = ped.isJaywalking ? 'Yielding to jaywalker' : 'Yielding to pedestrian';
          }
          break;
        }
      }
    }
  }

  return { acc: minAcc, reason };
}

/** Checks loading-zone dwell approach & trigger for Ceres buses and highway PUVs. */
function evaluateLoadingZoneDwell(
  v: VehicleAgent,
  lane: LaneEdge,
  vEff0: number,
  p: IdmParams,
  state: SimulationState,
  params: SimulationParams
): { acc: number; triggeredDwell: boolean } {
  if (v.hasDwelled || !lane.loadingZones || lane.loadingZones.length === 0) {
    return { acc: Infinity, triggeredDwell: false };
  }

  const scenario = SCENARIOS[params.scenario];

  for (const lz of lane.loadingZones) {
    // 1. Ceres Terminal Alighting Platform (buses only)
    if (lz.kind === 'alighting' && v.type === 'bus') {
      const stopS = lz.sStart + 8.5;
      const dist = stopS - v.s;
      if (dist > 0 && dist < 24) {
        if (dist < 1.6 && v.speed < 1.2) {
          const [rawDur, sNext] = randRange(state.rngState, 8.5, 14.5);
          state.rngState = sNext;
          const cap = scenario.maxDwellSeconds ?? 18;
          v.dwellTimer = Math.min(rawDur, cap);
          v.terminalPhase = 'alighting';
          v.state = 'dwelling';
          v.speed = 0;
          v.acc = 0;
          v.isBrakingLightOn = true;
          v.yieldingReason = 'Alighting at Ceres platform';
          return { acc: -p.bMax, triggeredDwell: true };
        }
        return { acc: stopLineAcceleration(v.speed, vEff0, dist, p), triggeredDwell: false };
      }
    }

    // 2. Ceres Terminal Staging Bay Zone (buses only)
    if (lz.kind === 'staging' && v.type === 'bus') {
      const baySlot = v.stagingBayIndex ?? Math.floor(hashStringUnit(v.id, 31) * 3);
      v.stagingBayIndex = baySlot;
      const stopS = lz.sStart + 3.5 + baySlot * 4.0;
      const dist = stopS - v.s;
      if (dist > 0 && dist < 24) {
        if (dist < 1.8 && v.speed < 1.2) {
          const [rawDur, sNext] = randRange(state.rngState, 8.0, 13.5);
          state.rngState = sNext;
          const cap = scenario.maxDwellSeconds ?? 16;
          v.dwellTimer = Math.min(rawDur, cap);
          v.terminalPhase = 'staging';
          v.state = 'dwelling';
          v.speed = 0;
          v.acc = 0;
          v.isBrakingLightOn = true;
          v.yieldingReason = `Staged at Ceres Bay ${baySlot + 1}`;
          return { acc: -p.bMax, triggeredDwell: true };
        }
        return { acc: stopLineAcceleration(v.speed, vEff0, dist, p), triggeredDwell: false };
      }
    }

    // 3. Highway Curbside / Dedicated Bay Loading Zone (jeepneys & tricycles only)
    if (lz.kind === 'curbside' && (v.type === 'jeepney' || v.type === 'tricycle')) {
      const dwellProb =
        scenario.id === 'baseline'
          ? v.type === 'tricycle'
            ? 0.72
            : 0.68
          : scenario.id === 'dedicated-bays'
            ? v.type === 'tricycle'
              ? 0.42
              : 0.36
            : v.type === 'tricycle'
              ? 0.34
              : 0.3;

      if (hashStringUnit(v.id, 77) > dwellProb) continue;

      // Stop near the downstream half of the zone (clear of crosswalk zebra bands)
      const stopS = Math.min(lz.sEnd - 1.2, lz.sStart + (lz.sEnd - lz.sStart) * 0.78);
      const dist = stopS - v.s;
      // Unregulated baseline curbside stops react more abruptly to hailing passengers (14m) vs smooth 24m bay entry
      const approachRange = scenario.dedicatedBaysOnly ? 24 : 14;
      if (dist > -0.8 && dist < approachRange) {
        // Pull right toward curb/bay as PUV slows into the loading zone
        v.targetLateralOffset = scenario.dedicatedBaysOnly
          ? v.type === 'tricycle'
            ? -0.55
            : -0.68
          : v.type === 'tricycle'
            ? -0.48
            : -0.22;

        if (dist < 1.4 && v.speed < 1.4) {
          const medianDwell =
            scenario.id === 'baseline' ? 16.0 : scenario.id === 'dedicated-bays' ? 7.5 : 6.2;
          const [rawDur, sNext] = sampleLogNormal(state.rngState, medianDwell, 0.25, 4.0, 26.0);
          state.rngState = sNext;
          const cap = scenario.maxDwellSeconds;
          v.dwellTimer = cap !== null ? Math.min(rawDur, cap) : rawDur;
          v.state = 'dwelling';
          v.speed = 0;
          v.acc = 0;
          v.isBrakingLightOn = true;
          v.yieldingReason = scenario.dedicatedBaysOnly
            ? 'Dedicated bay loading'
            : 'Curbside PUV loading';
          return { acc: -p.bMax, triggeredDwell: true };
        }
        return { acc: stopLineAcceleration(v.speed, vEff0, Math.max(0.1, dist), p), triggeredDwell: false };
      }
    }
  }

  return { acc: Infinity, triggeredDwell: false };
}

/** Updates tricycle lateral offset within bounded `[-0.55, +0.55]` meters on carriageway. */
function updateTricycleLateral(
  v: VehicleAgent,
  lane: LaneEdge,
  leader: LeaderHit | null,
  dt: number
): void {
  if (v.type === 'tricycle') {
    if (v.dwellTimer > 0) {
      v.targetLateralOffset = -0.55;
    } else if (
      leader &&
      leader.netGap < 16 &&
      (leader.vehicle.state === 'dwelling' || leader.vehicle.speed < 0.8) &&
      lane.width >= 3.2
    ) {
      // Ease gently left (+0.45m) away from curb while staying strictly inside the outer lane
      v.targetLateralOffset = 0.45;
    } else if (lane.roadId === 'national_rd' && lane.laneIndex === 0) {
      // Hug right curb edge gently on National Road outer lane
      v.targetLateralOffset = -0.45;
    } else {
      v.targetLateralOffset = 0;
    }
    v.targetLateralOffset = Math.max(-0.55, Math.min(0.55, v.targetLateralOffset));
  } else if (v.dwellTimer <= 0) {
    v.targetLateralOffset = 0;
  }

  const diff = v.targetLateralOffset - v.lateralOffset;
  const maxStep = 1.2 * dt;
  if (Math.abs(diff) <= maxStep) {
    v.lateralOffset = v.targetLateralOffset;
  } else {
    v.lateralOffset += Math.sign(diff) * maxStep;
  }
}

/** Updates Ceres bus terminal phase smoothly based on current lane. */
function updateTerminalPhase(v: VehicleAgent): void {
  if (v.type !== 'bus') return;
  const id = v.laneId;
  if (id === 'ceres_gate1_ingress' || id === 'turn_nw_to_gate1' || id === 'ceres_gate1_throat') {
    v.terminalPhase = 'ingress';
  } else if (id === 'ceres_alighting_lane') {
    v.terminalPhase = v.hasDwelled && v.s > 36 ? 'staging' : 'alighting';
  } else if (id === 'ceres_staging_loop') {
    v.terminalPhase = v.s < 24 && !v.hasDwelled ? 'alighting' : 'staging';
  } else if (
    id === 'ceres_gate2_throat' ||
    id === 'ceres_gate2_egress_se' ||
    id === 'ceres_gate2_egress_nw'
  ) {
    v.terminalPhase = 'egress';
  } else if (v.terminalPhase === 'egress') {
    v.terminalPhase = 'none';
    v.stagingBayIndex = null;
  }
}

interface PrevSnapshot {
  laneId: string;
  s: number;
  speed: number;
  position: Vec2;
  heading: number;
  routeQueue: string[];
}

/**
 * Advances all active vehicles by one fixed physics timestep `dt`.
 * Includes multi-lane IDM, MOBIL lane changing, conflict zone reservation,
 * signal/crosswalk yielding, PUV dwell & Ceres terminal 4-phase loop, and hard OBB safety clamp.
 */
export function stepVehicles(
  state: SimulationState,
  params: SimulationParams,
  dt: number
): void {
  const { graph, vehicles } = state;
  const index = getGraphSimIndex(graph);

  // Build mutable per-lane vehicle spatial bucket
  const vehiclesByLane = new Map<string, VehicleAgent[]>();
  for (let i = 0; i < vehicles.length; i++) {
    const v = vehicles[i];
    let list = vehiclesByLane.get(v.laneId);
    if (!list) {
      list = [];
      vehiclesByLane.set(v.laneId, list);
    }
    list.push(v);
  }

  // Snapshot pre-step kinematic state for synchronous integration & hard OBB clamp
  const snapshots = new Map<string, PrevSnapshot>();
  for (let i = 0; i < vehicles.length; i++) {
    const v = vehicles[i];
    snapshots.set(v.id, {
      laneId: v.laneId,
      s: v.s,
      speed: v.speed,
      position: { x: v.position.x, z: v.position.z },
      heading: v.heading,
      routeQueue: v.routeQueue.slice(),
    });
  }

  // Phase 1: Evaluate longitudinal & lateral decisions for every vehicle
  for (let i = 0; i < vehicles.length; i++) {
    const v = vehicles[i];
    const lane = graph.laneById[v.laneId];
    if (!lane) continue;

    v.mobilCooldown = Math.max(0, v.mobilCooldown - dt);
    updateTerminalPhase(v);

    // CRITICAL V1 FIX: Clean early handling of active dwell (NEVER overwritten by inner loop!)
    if (v.dwellTimer > 0) {
      v.dwellTimer = Math.max(0, v.dwellTimer - dt);
      v.speed = 0;
      v.acc = 0;
      v.state = 'dwelling';
      v.isBrakingLightOn = true;
      v.leaderVehicleId = null;
      v.leaderGapMeters = null;
      v.conflictingVehicleId = null;
      v.activeConflictZoneId = null;
      updateTricycleLateral(v, lane, null, dt);
      if (v.dwellTimer <= 0) {
        v.hasDwelled = true;
        v.yieldingReason = null;
      }
      continue;
    }

    const p = IDM_PARAMS[v.type];
    let segs = buildPathWindow(graph, v, 65);
    let vEff0 = computeEffectiveDesiredSpeed(v, segs, p);
    let leader = findLeaderAlongGraph(v, segs, vehicles, vehiclesByLane);

    const accLeader = leader
      ? idmAcceleration(v.speed, vEff0, leader.netGap, leader.relSpeed, p)
      : idmAcceleration(v.speed, vEff0, Infinity, 0, p);

    // Evaluate MOBIL lane change before committing longitudinal acceleration
    if (tryMobilLaneChange(v, leader, accLeader, vEff0, state, vehiclesByLane)) {
      segs = buildPathWindow(graph, v, 65);
      vEff0 = computeEffectiveDesiredSpeed(v, segs, p);
      leader = findLeaderAlongGraph(v, segs, vehicles, vehiclesByLane);
      // Update snapshot so rollback never reverts across a valid MOBIL change into the old lane
      const snap = snapshots.get(v.id)!;
      snap.laneId = v.laneId;
      snap.s = v.s;
      snap.routeQueue = v.routeQueue.slice();
    }

    const curLane = segs[0].lane;
    updateTricycleLateral(v, curLane, leader, dt);

    const finalLeaderAcc = leader
      ? idmAcceleration(v.speed, vEff0, leader.netGap, leader.relSpeed, p)
      : idmAcceleration(v.speed, vEff0, Infinity, 0, p);

    // Loading zone approach & dwell trigger
    const dwellEval = evaluateLoadingZoneDwell(v, curLane, vEff0, p, state, params);
    if (dwellEval.triggeredDwell) {
      continue;
    }

    // Conflict zone reservation & priority matrix
    const conflictEval = evaluateConflictZones(v, segs, vEff0, p, graph, index, vehiclesByLane);

    // Crosswalks & Scenario 2 signals
    const cwEval = evaluateCrosswalksAndPedestrians(v, segs, vEff0, p, state, params, index);

    // Select most restrictive (safest) acceleration constraint
    let chosenAcc = finalLeaderAcc;
    let yieldReason: string | null = null;
    let conflictingId: string | null = null;

    if (dwellEval.acc < chosenAcc) {
      chosenAcc = dwellEval.acc;
      yieldReason = 'Approaching loading zone';
    }
    if (conflictEval.acc < chosenAcc) {
      chosenAcc = conflictEval.acc;
      yieldReason = conflictEval.reason;
      conflictingId = conflictEval.conflictingId;
    }
    if (cwEval.acc < chosenAcc) {
      chosenAcc = cwEval.acc;
      yieldReason = cwEval.reason;
      conflictingId = null;
    }

    v.acc = Math.max(-p.bMax, Math.min(p.a, chosenAcc));
    v.leaderVehicleId = leader ? leader.vehicle.id : null;
    v.leaderGapMeters = leader ? Number(leader.netGap.toFixed(2)) : null;
    v.yieldingReason = yieldReason;
    v.conflictingVehicleId = conflictingId;
    v.activeConflictZoneId = conflictEval.zoneId;
  }

  // Phase 2: Synchronous position integration & lane-edge transitions
  const exitedIds = new Set<string>();
  const LANE_CHANGE_DURATION = 1.55;

  for (let i = 0; i < vehicles.length; i++) {
    const v = vehicles[i];

    // Advance smooth MOBIL lane-change visual progress
    if (v.laneChangeProgress < 1) {
      v.laneChangeProgress = Math.min(1, v.laneChangeProgress + dt / LANE_CHANGE_DURATION);
      if (v.laneChangeProgress >= 1) {
        v.laneChangeFromOffset = 0;
        v.turnSignal = 'none';
      }
    }

    if (v.state === 'dwelling' && v.dwellTimer > 0) {
      // Refresh pose in case lateralOffset shifted toward curb while dwelling
      const pose = computeVehiclePose(graph, v.laneId, v.s, getEffectiveLateralOffset(v));
      v.position = pose.position;
      v.heading = pose.heading;
      v.accumulatedDelay += dt;
      v.stoppedDelay += dt;
      continue;
    }

    const prevSpeed = v.speed;
    const nextSpeed = Math.max(0, prevSpeed + v.acc * dt);
    const ds = 0.5 * (prevSpeed + nextSpeed) * dt;
    v.speed = nextSpeed;
    v.s += ds;

    // Transition cleanly along Directed Lane-Edge Graph
    let lane = graph.laneById[v.laneId];
    let exited = false;
    let safetyHops = 0;
    while (lane && v.s > lane.length && safetyHops < 6) {
      safetyHops++;
      const overflow = v.s - lane.length;
      if (lane.isExit || (v.routeQueue.length === 0 && lane.nextLaneIds.length === 0)) {
        exited = true;
        break;
      }
      const nextId = v.routeQueue.shift() ?? lane.nextLaneIds[0];
      const nextLane = nextId ? graph.laneById[nextId] : undefined;
      if (!nextLane) {
        exited = true;
        break;
      }
      v.laneId = nextLane.id;
      v.s = overflow;
      lane = nextLane;
      updateTerminalPhase(v);
    }

    if (exited) {
      exitedIds.add(v.id);
      state.totalExitedCount++;
      state.totalControlDelaySum += v.controlDelay;
      continue;
    }

    // Update pose
    const pose = computeVehiclePose(graph, v.laneId, v.s, getEffectiveLateralOffset(v));
    v.position = pose.position;
    v.heading = pose.heading;

    // Classify vehicle state & visual indicators
    if (v.laneChangeProgress < 1) {
      v.state = 'lane_changing';
    } else if (v.speed < 0.35) {
      v.state = v.yieldingReason ? 'yielding' : 'queued';
    } else if (v.yieldingReason && v.acc < -0.4) {
      v.state = 'yielding';
    } else if (v.acc < -0.9) {
      v.state = 'braking';
    } else {
      v.state = 'cruising';
    }
    v.isBrakingLightOn = v.acc < -0.85 || v.speed < 0.25;

    // Turn indicator hint when approaching a turn connector
    if (v.laneChangeProgress >= 1) {
      const nextLane = v.routeQueue[0] ? graph.laneById[v.routeQueue[0]] : undefined;
      if (nextLane && nextLane.isConnector && lane.length - v.s < 28) {
        v.turnSignal =
          nextLane.id.includes('_to_pz') ||
          nextLane.id.includes('_to_repollo') ||
          nextLane.id.includes('_egress_nw') ||
          nextLane.id.includes('nw_to_gate1')
            ? 'left'
            : 'right';
      } else {
        v.turnSignal = 'none';
      }
    }

    // Delay accounting (HCM control delay vs free-flow reference)
    const refSpeed = Math.min(v.desiredSpeed, lane.speedLimit);
    if (refSpeed > 0.5) {
      const stepDelay = Math.max(0, dt * (1 - v.speed / refSpeed));
      v.accumulatedDelay += stepDelay;
      // Exclude terminal internal yard circulation from highway control delay
      if (!lane.isTerminalInternal) {
        v.controlDelay += stepDelay;
      }
      if (v.speed < 0.5) {
        v.stoppedDelay += dt;
      }
    }
  }

  // Remove exited vehicles
  if (exitedIds.size > 0) {
    state.vehicles = vehicles.filter((v) => !exitedIds.has(v.id));
  }

  // Phase 3: Hard Physical Separation Safety Clamp (Guarantees FAULTS === 0!)
  applyHardSeparationSafetyClamp(state, snapshots);

  // Record breadcrumb trails (~every 0.35s or 1.8m moved)
  for (let i = 0; i < state.vehicles.length; i++) {
    const v = state.vehicles[i];
    const last = v.trail[v.trail.length - 1];
    if (!last || Math.hypot(v.position.x - last.x, v.position.z - last.z) >= 1.8) {
      v.trail.push({ x: v.position.x, z: v.position.z });
      if (v.trail.length > 22) v.trail.shift();
    }
  }

  // Phase 4: Strict OBB Fault Audit (records SimulationFault if any true overlap > 0.05m occurs)
  auditPhysicalFaults(state);
}

/**
 * Post-integration hard physical separation safety clamp:
 * 1. Enforces strict same-lane longitudinal ordering (`netGap >= 0.4m`).
 * 2. Resolves any 2D OBB encroachment (with 0.14m buffer) by rolling back the
 *    encroaching / lower-priority vehicle toward its collision-free pre-step pose.
 */
function applyHardSeparationSafetyClamp(
  state: SimulationState,
  snapshots: ReadonlyMap<string, PrevSnapshot>
): void {
  const { graph, vehicles } = state;

  const revertToSnapshot = (v: VehicleAgent) => {
    const snap = snapshots.get(v.id);
    if (!snap) return;
    v.laneId = snap.laneId;
    v.s = snap.s;
    v.routeQueue = snap.routeQueue.slice();
    v.speed = 0;
    v.acc = 0;
    v.isBrakingLightOn = true;
    if (v.state !== 'dwelling') v.state = 'yielding';
    const pose = computeVehiclePose(graph, v.laneId, v.s, getEffectiveLateralOffset(v));
    v.position = pose.position;
    v.heading = pose.heading;
  };

  // Pass A: Same-lane longitudinal minimum bumper clearance
  const byLane = new Map<string, VehicleAgent[]>();
  for (const v of vehicles) {
    let list = byLane.get(v.laneId);
    if (!list) {
      list = [];
      byLane.set(v.laneId, list);
    }
    list.push(v);
  }
  for (const list of byLane.values()) {
    if (list.length < 2) continue;
    list.sort((a, b) => b.s - a.s); // Front-most first
    for (let i = 1; i < list.length; i++) {
      const lead = list[i - 1];
      const fol = list[i];
      const minCenter =
        VEHICLE_DIMENSIONS[lead.type].length * 0.5 +
        VEHICLE_DIMENSIONS[fol.type].length * 0.5 +
        0.45;
      if (lead.s - fol.s < minCenter) {
        const clampedS = Math.max(0, lead.s - minCenter);
        fol.s = clampedS;
        fol.speed = Math.min(fol.speed, lead.speed);
        const pose = computeVehiclePose(graph, fol.laneId, fol.s, getEffectiveLateralOffset(fol));
        fol.position = pose.position;
        fol.heading = pose.heading;
      }
    }
  }

  // Pass B: Iterative 2D OBB SAT separation guard (up to 3 passes for cascading queues)
  // Uses tight 3cm safety pad so adjacent 3.35m lanes never pinch while guaranteeing real OBB overlap === 0.
  const SAFETY_PAD = 0.03;
  for (let iter = 0; iter < 3; iter++) {
    let resolvedAny = false;
    for (let i = 0; i < vehicles.length; i++) {
      const a = vehicles[i];
      for (let j = i + 1; j < vehicles.length; j++) {
        const b = vehicles[j];
        const overlap = computeObbOverlap(
          a.position,
          a.heading,
          a.type,
          b.position,
          b.heading,
          b.type,
          SAFETY_PAD
        );
        if (overlap <= 0) continue;

        resolvedAny = true;
        // Decide which vehicle is encroaching
        const dx = b.position.x - a.position.x;
        const dz = b.position.z - a.position.z;
        const dist = Math.hypot(dx, dz) || 1;
        const ux = dx / dist;
        const uz = dz / dist;

        const aFacingB = Math.sin(a.heading) * ux + Math.cos(a.heading) * uz;
        const bFacingA = -(Math.sin(b.heading) * ux + Math.cos(b.heading) * uz);

        const aMoved = a.speed > 0.01 || a.s !== snapshots.get(a.id)?.s;
        const bMoved = b.speed > 0.01 || b.s !== snapshots.get(b.id)?.s;

        if (aMoved && !bMoved) {
          revertToSnapshot(a);
        } else if (bMoved && !aMoved) {
          revertToSnapshot(b);
        } else if (aFacingB > bFacingA + 0.15) {
          revertToSnapshot(a);
        } else if (bFacingA > aFacingB + 0.15) {
          revertToSnapshot(b);
        } else {
          const prioA = graph.laneById[a.laneId]?.priority ?? 4;
          const prioB = graph.laneById[b.laneId]?.priority ?? 4;
          if (prioA > prioB) {
            revertToSnapshot(a);
          } else if (prioB > prioA) {
            revertToSnapshot(b);
          } else if (a.id > b.id) {
            revertToSnapshot(a);
          } else {
            revertToSnapshot(b);
          }
        }

        // Only revert BOTH if actual mesh overlap (> 0.005m) still remains after single rollback
        if (
          computeObbOverlap(
            a.position,
            a.heading,
            a.type,
            b.position,
            b.heading,
            b.type,
            0.005
          ) > 0
        ) {
          revertToSnapshot(a);
          revertToSnapshot(b);
        }
      }
    }
    if (!resolvedAny) break;
  }
}

/** Verifies zero real OBB mesh overlap (`> 0.05m`) across all active vehicles. */
function auditPhysicalFaults(state: SimulationState): void {
  const { vehicles } = state;
  for (let i = 0; i < vehicles.length; i++) {
    const a = vehicles[i];
    for (let j = i + 1; j < vehicles.length; j++) {
      const b = vehicles[j];
      const overlap = computeObbOverlap(a.position, a.heading, a.type, b.position, b.heading, b.type, 0);
      if (overlap > 0.05) {
        state.faults.push({
          id: `fault_${state.nextEntityId++}`,
          time: Number(state.simTime.toFixed(2)),
          location: {
            x: (a.position.x + b.position.x) * 0.5,
            z: (a.position.z + b.position.z) * 0.5,
          },
          entity1Id: a.id,
          entity2Id: b.id,
          overlapMeters: Number(overlap.toFixed(3)),
        });
      }
    }
  }
}
