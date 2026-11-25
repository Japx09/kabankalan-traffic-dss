import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { samplePolylineAt } from '@/gis/roadGraphBuilder';
import type {
  ArcInterval,
  BusStagingBay,
  Crosswalk,
  RoadNetworkGraph,
  SamplePoint,
  Vec2,
} from '@/gis/types';

export interface KeptInterval {
  readonly sStart: number;
  readonly sEnd: number;
}

const MIN_INTERVAL_LENGTH = 0.15;

/**
 * Returns the complement of `cutouts` on `[0, totalLength]`,
 * merging overlapping cutouts so ribbon builders cleanly skip
 * driveways, terminal gates, and side-street junctions.
 */
export function subtractIntervals(
  totalLength: number,
  cutouts: readonly ArcInterval[] | undefined,
): KeptInterval[] {
  if (totalLength <= MIN_INTERVAL_LENGTH) return [];
  if (!cutouts || cutouts.length === 0) {
    return [{ sStart: 0, sEnd: totalLength }];
  }

  const clamped = cutouts
    .map((c) => ({
      sStart: Math.max(0, Math.min(totalLength, c.sStart)),
      sEnd: Math.max(0, Math.min(totalLength, c.sEnd)),
    }))
    .filter((c) => c.sEnd - c.sStart > 0.05)
    .sort((a, b) => a.sStart - b.sStart);

  if (clamped.length === 0) {
    return [{ sStart: 0, sEnd: totalLength }];
  }

  const merged: Array<{ sStart: number; sEnd: number }> = [clamped[0]];
  for (let i = 1; i < clamped.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = clamped[i];
    if (curr.sStart <= prev.sEnd + 0.05) {
      prev.sEnd = Math.max(prev.sEnd, curr.sEnd);
    } else {
      merged.push({ ...curr });
    }
  }

  const kept: KeptInterval[] = [];
  let cursor = 0;
  for (const cut of merged) {
    if (cut.sStart - cursor >= MIN_INTERVAL_LENGTH) {
      kept.push({ sStart: cursor, sEnd: cut.sStart });
    }
    cursor = Math.max(cursor, cut.sEnd);
  }
  if (totalLength - cursor >= MIN_INTERVAL_LENGTH) {
    kept.push({ sStart: cursor, sEnd: totalLength });
  }
  return kept;
}

/**
 * Extracts polyline sample points restricted to `[sStart, sEnd]`,
 * inserting interpolated boundary samples at exact interval endpoints.
 */
export function extractSamplesInInterval(
  samples: readonly SamplePoint[],
  sStart: number,
  sEnd: number,
): SamplePoint[] {
  if (samples.length < 2 || sEnd - sStart < 0.05) return [];
  const out: SamplePoint[] = [samplePolylineAt(samples, sStart)];
  for (let i = 0; i < samples.length; i++) {
    const pt = samples[i];
    if (pt.s > sStart + 0.05 && pt.s < sEnd - 0.05) {
      out.push(pt);
    }
  }
  out.push(samplePolylineAt(samples, sEnd));
  return out;
}

/**
 * Creates an empty valid BufferGeometry (position/normal/uv) for safe merging/rendering.
 */
export function createEmptyGeometry(): THREE.BufferGeometry {
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
  geom.setAttribute('normal', new THREE.Float32BufferAttribute([], 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute([], 2));
  return geom;
}

/**
 * Safely merges multiple geometries into a single non-indexed BufferGeometry
 * with consistent position, normal, and uv attributes, disposing intermediate buffers.
 */
export function mergeSafeGeometries(
  geometries: THREE.BufferGeometry[],
): THREE.BufferGeometry {
  const valid: THREE.BufferGeometry[] = [];
  for (const g of geometries) {
    const pos = g.getAttribute('position');
    if (!pos || pos.count === 0) {
      g.dispose();
      continue;
    }
    const normalized = g.index ? g.toNonIndexed() : g;
    if (normalized !== g) g.dispose();

    if (!normalized.getAttribute('normal')) {
      normalized.computeVertexNormals();
    }
    if (!normalized.getAttribute('uv')) {
      const count = normalized.getAttribute('position').count;
      normalized.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(count * 2), 2));
    }
    // Strip extra attributes if any so mergeGeometries never fails attribute mismatch
    for (const key of Object.keys(normalized.attributes)) {
      if (key !== 'position' && key !== 'normal' && key !== 'uv') {
        normalized.deleteAttribute(key);
      }
    }
    valid.push(normalized);
  }

  if (valid.length === 0) return createEmptyGeometry();
  if (valid.length === 1) return valid[0];

  const merged = mergeGeometries(valid, false);
  for (const g of valid) g.dispose();
  if (!merged) return createEmptyGeometry();
  merged.computeBoundingSphere();
  merged.computeBoundingBox();
  return merged;
}

/**
 * Builds a flat upward-facing ribbon BufferGeometry along `samples` between
 * `leftOffset` and `rightOffset` (positive = LEFT normal `(nx, nz)`, negative = RIGHT normal),
 * automatically skipping cutout intervals when `intervalsToKeep` is provided.
 */
export function buildRibbonGeometry(
  samples: readonly SamplePoint[],
  leftOffset: number,
  rightOffset: number,
  y: number,
  intervalsToKeep?: readonly KeptInterval[],
): THREE.BufferGeometry {
  if (samples.length < 2) return createEmptyGeometry();
  const totalLength = samples[samples.length - 1].s;
  const intervals = intervalsToKeep ?? [{ sStart: 0, sEnd: totalLength }];
  if (intervals.length === 0) return createEmptyGeometry();

  const minOff = Math.min(leftOffset, rightOffset);
  const maxOff = Math.max(leftOffset, rightOffset);
  if (maxOff - minOff < 1e-4) return createEmptyGeometry();

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];

  for (const interval of intervals) {
    const pts = extractSamplesInInterval(samples, interval.sStart, interval.sEnd);
    if (pts.length < 2) continue;

    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i];
      const p1 = pts[i + 1];

      const r0x = p0.x + p0.nx * minOff;
      const r0z = p0.z + p0.nz * minOff;
      const l0x = p0.x + p0.nx * maxOff;
      const l0z = p0.z + p0.nz * maxOff;

      const r1x = p1.x + p1.nx * minOff;
      const r1z = p1.z + p1.nz * minOff;
      const l1x = p1.x + p1.nx * maxOff;
      const l1z = p1.z + p1.nz * maxOff;

      const v0 = p0.s * 0.25;
      const v1 = p1.s * 0.25;
      const uR = minOff * 0.25;
      const uL = maxOff * 0.25;

      // Triangle 1: (R0, R1, L1) -> (T) x (T + N) = +Up
      positions.push(r0x, y, r0z, r1x, y, r1z, l1x, y, l1z);
      normals.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
      uvs.push(uR, v0, uR, v1, uL, v1);

      // Triangle 2: (R0, L1, L0) -> +Up
      positions.push(r0x, y, r0z, l1x, y, l1z, l0x, y, l0z);
      normals.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
      uvs.push(uR, v0, uL, v1, uL, v0);
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geom.computeBoundingSphere();
  return geom;
}

/**
 * Builds a solid 3D extruded ribbon (top cap + vertical left/right curbs + vertical end caps)
 * for raised concrete sidewalks and segmented highway center medians.
 * Every face is strictly outward-wound.
 */
export function buildExtrudedRibbonGeometry(
  samples: readonly SamplePoint[],
  leftOffset: number,
  rightOffset: number,
  yBottom: number,
  yTop: number,
  intervalsToKeep?: readonly KeptInterval[],
): THREE.BufferGeometry {
  if (samples.length < 2) return createEmptyGeometry();
  const totalLength = samples[samples.length - 1].s;
  const intervals = intervalsToKeep ?? [{ sStart: 0, sEnd: totalLength }];
  if (intervals.length === 0) return createEmptyGeometry();

  const minOff = Math.min(leftOffset, rightOffset);
  const maxOff = Math.max(leftOffset, rightOffset);
  if (maxOff - minOff < 1e-4) return createEmptyGeometry();

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];

  const pushTri = (
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number,
    nx: number, ny: number, nz: number,
    ua: number, va: number, ub: number, vb: number, uc: number, vc: number,
  ) => {
    positions.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    normals.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
    uvs.push(ua, va, ub, vb, uc, vc);
  };

  for (const interval of intervals) {
    const pts = extractSamplesInInterval(samples, interval.sStart, interval.sEnd);
    if (pts.length < 2) continue;

    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i];
      const p1 = pts[i + 1];

      const r0x = p0.x + p0.nx * minOff;
      const r0z = p0.z + p0.nz * minOff;
      const l0x = p0.x + p0.nx * maxOff;
      const l0z = p0.z + p0.nz * maxOff;

      const r1x = p1.x + p1.nx * minOff;
      const r1z = p1.z + p1.nz * minOff;
      const l1x = p1.x + p1.nx * maxOff;
      const l1z = p1.z + p1.nz * maxOff;

      const v0 = p0.s * 0.25;
      const v1 = p1.s * 0.25;
      const uR = minOff * 0.25;
      const uL = maxOff * 0.25;

      // Top face (+Y)
      pushTri(r0x, yTop, r0z, r1x, yTop, r1z, l1x, yTop, l1z, 0, 1, 0, uR, v0, uR, v1, uL, v1);
      pushTri(r0x, yTop, r0z, l1x, yTop, l1z, l0x, yTop, l0z, 0, 1, 0, uR, v0, uL, v1, uL, v0);

      // Right vertical curb wall (-N outward)
      const rnx = -0.5 * (p0.nx + p1.nx);
      const rnz = -0.5 * (p0.nz + p1.nz);
      pushTri(r0x, yBottom, r0z, r1x, yBottom, r1z, r1x, yTop, r1z, rnx, 0, rnz, v0, 0, v1, 0, v1, 1);
      pushTri(r0x, yBottom, r0z, r1x, yTop, r1z, r0x, yTop, r0z, rnx, 0, rnz, v0, 0, v1, 1, v0, 1);

      // Left vertical curb wall (+N outward)
      const lnx = 0.5 * (p0.nx + p1.nx);
      const lnz = 0.5 * (p0.nz + p1.nz);
      pushTri(l0x, yBottom, l0z, l0x, yTop, l0z, l1x, yTop, l1z, lnx, 0, lnz, v0, 0, v0, 1, v1, 1);
      pushTri(l0x, yBottom, l0z, l1x, yTop, l1z, l1x, yBottom, l1z, lnx, 0, lnz, v0, 0, v1, 1, v1, 0);
    }

    // Start cap (-T outward)
    const ps = pts[0];
    const srX = ps.x + ps.nx * minOff;
    const srZ = ps.z + ps.nz * minOff;
    const slX = ps.x + ps.nx * maxOff;
    const slZ = ps.z + ps.nz * maxOff;
    pushTri(srX, yBottom, srZ, srX, yTop, srZ, slX, yTop, slZ, -ps.tx, 0, -ps.tz, 0, 0, 0, 1, 1, 1);
    pushTri(srX, yBottom, srZ, slX, yTop, slZ, slX, yBottom, slZ, -ps.tx, 0, -ps.tz, 0, 0, 1, 1, 1, 0);

    // End cap (+T outward)
    const pe = pts[pts.length - 1];
    const erX = pe.x + pe.nx * minOff;
    const erZ = pe.z + pe.nz * minOff;
    const elX = pe.x + pe.nx * maxOff;
    const elZ = pe.z + pe.nz * maxOff;
    pushTri(erX, yBottom, erZ, elX, yBottom, elZ, elX, yTop, elZ, pe.tx, 0, pe.tz, 0, 0, 1, 0, 1, 1);
    pushTri(erX, yBottom, erZ, elX, yTop, elZ, erX, yTop, erZ, pe.tx, 0, pe.tz, 0, 0, 1, 1, 0, 1);
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geom.computeBoundingSphere();
  return geom;
}

/**
 * Builds high-visibility yellow safety end-nose caps at median island breaks.
 */
export function buildMedianNoseCapsGeometry(
  samples: readonly SamplePoint[],
  halfWidth: number,
  yBottom: number,
  yTop: number,
  intervals: readonly KeptInterval[],
): THREE.BufferGeometry {
  if (samples.length < 2 || intervals.length === 0) return createEmptyGeometry();
  const totalLen = samples[samples.length - 1].s;
  const noseLen = 1.15;
  const noseIntervals: KeptInterval[] = [];

  for (const iv of intervals) {
    if (iv.sStart > 0.5) {
      noseIntervals.push({ sStart: iv.sStart, sEnd: Math.min(iv.sEnd, iv.sStart + noseLen) });
    }
    if (iv.sEnd < totalLen - 0.5) {
      noseIntervals.push({ sStart: Math.max(iv.sStart, iv.sEnd - noseLen), sEnd: iv.sEnd });
    }
  }
  if (noseIntervals.length === 0) return createEmptyGeometry();
  return buildExtrudedRibbonGeometry(
    samples,
    -(halfWidth + 0.03),
    halfWidth + 0.03,
    yBottom,
    yTop + 0.012,
    noseIntervals,
  );
}

/**
 * Builds a flat upward-facing polygon BufferGeometry at elevation `y` in XZ space.
 */
export function buildPolygonGeometry(
  polygon: readonly Vec2[],
  y: number,
): THREE.BufferGeometry {
  if (polygon.length < 3) return createEmptyGeometry();
  const shape = new THREE.Shape();
  shape.moveTo(polygon[0].x, -polygon[0].z);
  for (let i = 1; i < polygon.length; i++) {
    shape.lineTo(polygon[i].x, -polygon[i].z);
  }
  shape.closePath();

  const geom = new THREE.ShapeGeometry(shape);
  geom.rotateX(-Math.PI / 2);
  geom.translate(0, y, 0);

  // Normalize UVs to meters so concrete/asphalt tiling stays uniform
  const pos = geom.getAttribute('position');
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = pos.getX(i) * 0.1;
    uv[i * 2 + 1] = pos.getZ(i) * 0.1;
  }
  geom.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geom.computeBoundingSphere();
  return geom;
}

/**
 * Extrudes an arbitrary 2D XZ footprint vertically from `yBase` to `yBase + height`.
 */
export function buildExtrudedPolygon(
  polygon: readonly Vec2[],
  height: number,
  yBase = 0,
): THREE.BufferGeometry {
  if (polygon.length < 3 || height <= 0) return createEmptyGeometry();
  const shape = new THREE.Shape();
  shape.moveTo(polygon[0].x, -polygon[0].z);
  for (let i = 1; i < polygon.length; i++) {
    shape.lineTo(polygon[i].x, -polygon[i].z);
  }
  shape.closePath();

  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: false,
    curveSegments: 1,
  });
  geom.rotateX(-Math.PI / 2);
  geom.translate(0, yBase, 0);
  geom.computeVertexNormals();
  geom.computeBoundingSphere();
  return geom;
}

/**
 * Builds crisp DPWH dashed pavement markings (white lane dividers or yellow centerlines).
 */
export function buildDashedLineGeometry(
  samples: readonly SamplePoint[],
  lateralOffset: number,
  dashLen: number,
  gapLen: number,
  lineWidth: number,
  y: number,
  cutouts?: readonly ArcInterval[],
): THREE.BufferGeometry {
  if (samples.length < 2) return createEmptyGeometry();
  const totalLen = samples[samples.length - 1].s;
  const kept = subtractIntervals(totalLen, cutouts);
  const stride = dashLen + gapLen;
  const dashIntervals: KeptInterval[] = [];

  for (const iv of kept) {
    let s = iv.sStart + 0.4;
    while (s + 0.5 < iv.sEnd - 0.3) {
      const end = Math.min(s + dashLen, iv.sEnd - 0.3);
      if (end - s >= 0.4) {
        dashIntervals.push({ sStart: s, sEnd: end });
      }
      s += stride;
    }
  }

  if (dashIntervals.length === 0) return createEmptyGeometry();
  return buildRibbonGeometry(
    samples,
    lateralOffset - lineWidth * 0.5,
    lateralOffset + lineWidth * 0.5,
    y,
    dashIntervals,
  );
}

/**
 * Builds solid longitudinal pavement edge lines skipping cutout intervals.
 */
export function buildSolidLineGeometry(
  samples: readonly SamplePoint[],
  lateralOffset: number,
  lineWidth: number,
  y: number,
  cutouts?: readonly ArcInterval[],
): THREE.BufferGeometry {
  if (samples.length < 2) return createEmptyGeometry();
  const totalLen = samples[samples.length - 1].s;
  const kept = subtractIntervals(totalLen, cutouts);
  return buildRibbonGeometry(
    samples,
    lateralOffset - lineWidth * 0.5,
    lateralOffset + lineWidth * 0.5,
    y,
    kept,
  );
}

/**
 * Helper: pushes an upward-facing oriented quad centered at `(cx, y, cz)` with
 * local forward axis `(fx, fz)` (length `len`) and local right/side axis `(rx, rz)` (width `wid`).
 */
function pushOrientedQuad(
  positions: number[],
  normals: number[],
  uvs: number[],
  cx: number,
  cz: number,
  fx: number,
  fz: number,
  rx: number,
  rz: number,
  halfLen: number,
  halfWid: number,
  y: number,
): void {
  // Ensure (F x R) has +Y or flip R so winding is always upward
  const crossY = fz * rx - fx * rz;
  const sx = crossY >= 0 ? rx : -rx;
  const sz = crossY >= 0 ? rz : -rz;

  const p0x = cx - fx * halfLen - sx * halfWid;
  const p0z = cz - fz * halfLen - sz * halfWid;
  const p1x = cx + fx * halfLen - sx * halfWid;
  const p1z = cz + fz * halfLen - sz * halfWid;
  const p2x = cx + fx * halfLen + sx * halfWid;
  const p2z = cz + fz * halfLen + sz * halfWid;
  const p3x = cx - fx * halfLen + sx * halfWid;
  const p3z = cz - fz * halfLen + sz * halfWid;

  // (p1 - p0) = +F, (p3 - p0) = +S -> (p1 - p0) x (p2 - p0) = F x (F + S) = F x S = +Y
  positions.push(p0x, y, p0z, p1x, y, p1z, p2x, y, p2z);
  normals.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
  uvs.push(0, 0, 1, 0, 1, 1);

  positions.push(p0x, y, p0z, p2x, y, p2z, p3x, y, p3z);
  normals.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
  uvs.push(0, 0, 1, 1, 0, 1);
}

/**
 * Builds DPWH curb-to-curb zebra crosswalk stripes and approach stop bars
 * across all crosswalks in the corridor.
 */
export function buildCrosswalkStripesGeometry(
  crosswalks: readonly Crosswalk[],
  graph: RoadNetworkGraph,
  y: number,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];

  for (const cw of crosswalks) {
    const stripeWidth = 0.52;
    const pitch = 1.04;
    const usableLen = Math.max(2, cw.length - 1.1);
    const count = Math.floor(usableLen / pitch);
    const startOffset = -((count - 1) * pitch) * 0.5;

    for (let i = 0; i < count; i++) {
      const dist = startOffset + i * pitch;
      const sx = cw.center.x + cw.normal.x * dist;
      const sz = cw.center.z + cw.normal.z * dist;
      pushOrientedQuad(
        positions,
        normals,
        uvs,
        sx,
        sz,
        cw.tangent.x,
        cw.tangent.z,
        cw.normal.x,
        cw.normal.z,
        cw.width * 0.5,
        stripeWidth * 0.5,
        y,
      );
    }

    // Crisp white transverse stop bars on each approaching lane
    for (const ref of cw.affectedLanes) {
      const lane = graph.laneById[ref.laneId];
      if (!lane || lane.samples.length < 2) continue;
      const pt = samplePolylineAt(lane.samples, ref.stopBarS);
      pushOrientedQuad(
        positions,
        normals,
        uvs,
        pt.x,
        pt.z,
        pt.tx,
        pt.tz,
        pt.nx,
        pt.nz,
        0.24,
        lane.width * 0.44,
        y,
      );
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geom.computeBoundingSphere();
  return geom;
}

/**
 * Builds crisp painted bus staging bay outlines inside Ceres Terminal yard.
 */
export function buildStagingBaysGeometry(
  bays: readonly BusStagingBay[],
  y: number,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const lineW = 0.16;

  for (const bay of bays) {
    const fx = Math.sin(bay.heading);
    const fz = Math.cos(bay.heading);
    const rx = fz;
    const rz = -fx;
    const halfL = bay.length * 0.5;
    const halfW = bay.width * 0.5;

    // Left & right longitudinal stall lines
    for (const side of [-1, 1]) {
      pushOrientedQuad(
        positions,
        normals,
        uvs,
        bay.center.x + rx * side * halfW,
        bay.center.z + rz * side * halfW,
        fx,
        fz,
        rx,
        rz,
        halfL,
        lineW * 0.5,
        y,
      );
    }
    // Front wheel-stop bar
    pushOrientedQuad(
      positions,
      normals,
      uvs,
      bay.center.x + fx * (halfL - 0.8),
      bay.center.z + fz * (halfL - 0.8),
      fx,
      fz,
      rx,
      rz,
      0.16,
      halfW - 0.15,
      y,
    );
    // Rear entry tick
    pushOrientedQuad(
      positions,
      normals,
      uvs,
      bay.center.x - fx * halfL,
      bay.center.z - fz * halfL,
      fx,
      fz,
      rx,
      rz,
      lineW * 0.5,
      halfW,
      y,
    );
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geom.computeBoundingSphere();
  return geom;
}

/**
 * Builds loading zone pavement markings (striped curb bays) for curbside/alighting PUV zones.
 */
export function buildLoadingZonesGeometry(
  graph: RoadNetworkGraph,
  kinds: readonly ('curbside' | 'alighting' | 'boarding' | 'staging')[],
  y: number,
): THREE.BufferGeometry {
  const geoms: THREE.BufferGeometry[] = [];
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];

  for (const lane of graph.lanes) {
    if (!lane.loadingZones || lane.loadingZones.length === 0) continue;
    for (const lz of lane.loadingZones) {
      if (!kinds.includes(lz.kind)) continue;
      const halfW = lane.width * 0.45;
      const iv: KeptInterval[] = [{ sStart: lz.sStart, sEnd: lz.sEnd }];
      // Outer painted border lines along both edges of the bay
      geoms.push(buildRibbonGeometry(lane.samples, -halfW, -halfW + 0.16, y, iv));
      geoms.push(buildRibbonGeometry(lane.samples, halfW - 0.16, halfW, y, iv));

      // Diagonal bay hatches every 2.2m
      for (let s = lz.sStart + 0.9; s < lz.sEnd - 0.6; s += 2.2) {
        const pt = samplePolylineAt(lane.samples, s);
        const angle = pt.heading + Math.PI * 0.25;
        const fx = Math.sin(angle);
        const fz = Math.cos(angle);
        pushOrientedQuad(
          positions,
          normals,
          uvs,
          pt.x,
          pt.z,
          fx,
          fz,
          fz,
          -fx,
          halfW * 0.85,
          0.1,
          y,
        );
      }
    }
  }

  if (positions.length > 0) {
    const hatchGeom = new THREE.BufferGeometry();
    hatchGeom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    hatchGeom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    hatchGeom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geoms.push(hatchGeom);
  }

  return mergeSafeGeometries(geoms);
}

/**
 * Generates a lightweight repeatable procedural asphalt texture (256x256)
 * for subtle realistic pavement grain without external image assets.
 */
export function createAsphaltTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#39404a';
  ctx.fillRect(0, 0, size, size);

  // Deterministic pseudo-random mineral grain
  let seed = 1337;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  for (let i = 0; i < 6500; i++) {
    const x = Math.floor(rand() * size);
    const y = Math.floor(rand() * size);
    const v = Math.floor(46 + rand() * 34);
    ctx.fillStyle = `rgb(${v},${v + 3},${v + 8})`;
    ctx.fillRect(x, y, 2, 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/**
 * Generates a subtle Cities: Skylines stylized daylight grass & urban ground texture.
 */
export function createTerrainTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#5c7c4e';
  ctx.fillRect(0, 0, size, size);

  let seed = 4207;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  // Soft tonal turf blotches
  for (let i = 0; i < 160; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 8 + rand() * 24;
    const shade = rand() > 0.5 ? 'rgba(108, 142, 86, 0.14)' : 'rgba(66, 94, 58, 0.14)';
    ctx.fillStyle = shade;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(22, 22);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Generates a crisp high-contrast overhead gate signage texture for Ceres Gate 1 & Gate 2.
 */
export function createGateSignTexture(
  title: string,
  subtitle: string,
  accentHex: string,
): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 192;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Classic Ceres yellow/green overhead signage board
  ctx.fillStyle = '#f5b800';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Top & bottom dark forest green border trim
  ctx.fillStyle = '#14532d';
  ctx.fillRect(0, 0, canvas.width, 22);
  ctx.fillRect(0, canvas.height - 22, canvas.width, 22);

  // Side accent badge stripe
  ctx.fillStyle = accentHex;
  ctx.fillRect(0, 22, 42, canvas.height - 44);
  ctx.fillRect(canvas.width - 42, 22, 42, canvas.height - 44);

  ctx.fillStyle = '#0f172a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '900 54px system-ui, -apple-system, sans-serif';
  ctx.fillText(title, canvas.width / 2, 76);

  ctx.fillStyle = '#14532d';
  ctx.font = '800 34px system-ui, -apple-system, sans-serif';
  ctx.fillText(subtitle, canvas.width / 2, 134);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
