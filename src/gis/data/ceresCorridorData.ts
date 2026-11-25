import type {
  ArcInterval,
  BuildingCategory,
  LanePriority,
  LoadingZone,
  RoadClass,
  RoofStyle,
  Vec2,
  VehicleClass,
} from '../types';

/**
 * Calibrated National Road (Justice Y. Perez Ave / Negros South Rd) corridor frame
 * verified against live OpenStreetMap way/839126804 and ESRI World Imagery z=18 tiles.
 *
 * - Origin (0, 0) = CERES_ORIGIN (9.99786°N, 122.81195°E) inside Ceres Bus Terminal.
 * - Highway centerline sits D0 = +26.2m along NE normal from CERES_ORIGIN.
 * - SE-bound tangent bearing = 139.7° (compass, 0°=N, 90°=E).
 */
export const CORRIDOR_BEARING_DEG = 139.7;
export const HIGHWAY_OFFSET_NE = 26.2;

/** Unit vector pointing SE along National Road (toward Ilog / Guanzon). */
export const T_SE: Vec2 = { x: 0.6463, z: 0.7631 };

/** Unit vector pointing NE perpendicular to National Road (LEFT of SE-bound). */
export const N_NE: Vec2 = { x: 0.7631, z: -0.6463 };

/** National Road arc-length range in signed s (m) around Ceres Terminal center. */
export const NATIONAL_S_MIN = -165;
export const NATIONAL_S_MAX = 185;
export const NATIONAL_LENGTH = NATIONAL_S_MAX - NATIONAL_S_MIN; // 350m

/**
 * Converts National Road corridor coordinates `(s, dNE)` to Three.js world `(x, z)` meters:
 * - `s`: distance along National Road SE-bound (`-165` NW to `+185` SE, `0` opposite Ceres origin)
 * - `dNE`: signed lateral offset perpendicular to highway centerline (`+` = NE side, `-` = SW side)
 */
export function sdToWorld(s: number, dNE: number): Vec2 {
  const lateral = HIGHWAY_OFFSET_NE + dNE;
  return {
    x: Number((s * T_SE.x + lateral * N_NE.x).toFixed(3)),
    z: Number((s * T_SE.z + lateral * N_NE.z).toFixed(3)),
  };
}

/** Converts National Road signed `s` to arc length `[0..350]` from NW start. */
export function nationalRoadS(s: number): number {
  return s - NATIONAL_S_MIN;
}

/** Heading in radians (`Math.atan2(tx, tz)`) for a direction vector `(dx, dz)`. */
export function vecHeading(dx: number, dz: number): number {
  return Math.atan2(dx, dz);
}

/** Evaluates a cubic Bezier curve in corridor `(s, dNE)` space and projects to world `Vec2[]`. */
function sampleBezierSD(
  p0: readonly [number, number],
  p1: readonly [number, number],
  p2: readonly [number, number],
  p3: readonly [number, number],
  steps = 16
): Vec2[] {
  const pts: Vec2[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    const s =
      u * u * u * p0[0] +
      3 * u * u * t * p1[0] +
      3 * u * t * t * p2[0] +
      t * t * t * p3[0];
    const d =
      u * u * u * p0[1] +
      3 * u * u * t * p1[1] +
      3 * u * t * t * p2[1] +
      t * t * t * p3[1];
    pts.push(sdToWorld(s, d));
  }
  return pts;
}

/** Samples a circular arc in `(s, dNE)` space from startAngle to endAngle. */
function sampleArcSD(
  centerS: number,
  centerD: number,
  radius: number,
  startRad: number,
  endRad: number,
  steps = 12
): Vec2[] {
  const pts: Vec2[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = startRad + ((endRad - startRad) * i) / steps;
    pts.push(sdToWorld(centerS + Math.cos(a) * radius, centerD + Math.sin(a) * radius));
  }
  return pts;
}

/** Builds a rectangle polygon in `(s, dNE)` coordinates aligned with National Road. */
function rectSD(sMin: number, sMax: number, dMin: number, dMax: number): {
  footprint: Vec2[];
  center: Vec2;
  width: number;
  depth: number;
  heading: number;
} {
  return {
    footprint: [
      sdToWorld(sMin, dMin),
      sdToWorld(sMax, dMin),
      sdToWorld(sMax, dMax),
      sdToWorld(sMin, dMax),
    ],
    center: sdToWorld((sMin + sMax) * 0.5, (dMin + dMax) * 0.5),
    width: sMax - sMin,
    depth: dMax - dMin,
    heading: vecHeading(T_SE.x, T_SE.z),
  };
}

/** Builds a rectangle aligned with an arbitrary local tangent vector `(ux, uz)`. */
function rectAligned(
  center: Vec2,
  ux: number,
  uz: number,
  width: number,
  depth: number
): {
  footprint: Vec2[];
  center: Vec2;
  width: number;
  depth: number;
  heading: number;
} {
  // Left normal of u: (uz, -ux)
  const lx = uz;
  const lz = -ux;
  const hw = width * 0.5;
  const hd = depth * 0.5;
  const pt = (along: number, across: number): Vec2 => ({
    x: Number((center.x + along * ux + across * lx).toFixed(3)),
    z: Number((center.z + along * uz + across * lz).toFixed(3)),
  });
  return {
    footprint: [pt(-hw, -hd), pt(hw, -hd), pt(hw, hd), pt(-hw, hd)],
    center,
    width,
    depth,
    heading: vecHeading(ux, uz),
  };
}

// ---------------------------------------------------------------------------
// Key Junction Anchors (verified 1:1 against OSM + ESRI z=18 satellite)
// ---------------------------------------------------------------------------
export const JUNCTION_S = {
  pedroZayco: -63.4,
  perimeterRd: -26.6,
  ceresGate2: -11.5,
  ceresGate1: 32.0,
  repollo: 151.5,
} as const;

// National Road 4-lane cross section: 14.0m carriageway = 0.6m median + 4 x 3.35m lanes
export const NATIONAL_CARRIAGEWAY_WIDTH = 14.0;
export const NATIONAL_MEDIAN_WIDTH = 0.6;
export const NATIONAL_LANE_WIDTH = 3.35;
export const D_SE_INNER = -1.975; // -(0.3 + 3.35/2)
export const D_SE_OUTER = -5.325; // -(0.3 + 3.35 + 3.35/2)
export const D_NW_INNER = 1.975;
export const D_NW_OUTER = 5.325;

// Side-street Repollo unit direction in (s, dNE) from OSM way/180539689
const REPOLLO_DIR_S = -0.633;
const REPOLLO_DIR_D = 0.774;

function repolloSD(t: number, lateralRight = 0): readonly [number, number] {
  // Right normal of (dirS, dirD) in (s, dNE) plane: (dirD, -dirS)
  return [
    JUNCTION_S.repollo + t * REPOLLO_DIR_S + lateralRight * REPOLLO_DIR_D,
    t * REPOLLO_DIR_D - lateralRight * REPOLLO_DIR_S,
  ];
}

// ---------------------------------------------------------------------------
// 1. Road Segment Centerline Specs (Single Source for 3D Asphalt/Curb/Median)
// ---------------------------------------------------------------------------
export interface RoadSegmentSpec {
  readonly id: string;
  readonly name: string;
  readonly roadClass: RoadClass;
  readonly points: readonly Vec2[];
  readonly carriagewayWidth: number;
  readonly medianWidth: number;
  readonly medianBreaks: readonly ArcInterval[];
  readonly sidewalkWidthLeft: number;
  readonly sidewalkWidthRight: number;
  readonly sidewalkLeftCutouts: readonly ArcInterval[];
  readonly sidewalkRightCutouts: readonly ArcInterval[];
  readonly hasCenterDashedLine: boolean;
  readonly laneDividerOffsets: readonly number[];
}

// Pedro Zayco Sr. St. centerline points in (s, dNE): straight NE for 82m then smooth clockwise curve
const PEDRO_ZAYCO_CL_SD: readonly (readonly [number, number])[] = [
  [JUNCTION_S.pedroZayco, 6.0],
  [JUNCTION_S.pedroZayco, 25.0],
  [JUNCTION_S.pedroZayco, 55.0],
  [JUNCTION_S.pedroZayco, 82.0],
  [JUNCTION_S.pedroZayco + 3.2, 98.0],
  [JUNCTION_S.pedroZayco + 11.5, 112.0],
  [JUNCTION_S.pedroZayco + 24.0, 123.5],
  [JUNCTION_S.pedroZayco + 39.0, 132.0],
];

// Repollo St. centerline points in (s, dNE) matching OSM way/180539689
const REPOLLO_CL_SD: readonly (readonly [number, number])[] = [
  repolloSD(7.8), // dNE ≈ 6.0 (seamless blend into NE highway edge)
  repolloSD(28.0),
  repolloSD(60.0),
  repolloSD(95.0),
  repolloSD(126.0),
];

// Curved Perimeter Access Road (OSM way/180539677) wrapping behind Ceres Terminal
const PERIMETER_CL_SD: readonly (readonly [number, number])[] = [
  [JUNCTION_S.perimeterRd, -6.0],
  [JUNCTION_S.perimeterRd, -35.0],
  [JUNCTION_S.perimeterRd, -72.0],
  [-26.0, -98.0],
  [-21.5, -114.0],
  [-11.0, -126.5],
  [6.0, -132.0],
  [28.0, -131.0],
  [52.0, -124.0],
  [74.0, -108.0],
];

export const ROAD_SEGMENT_SPECS: readonly RoadSegmentSpec[] = [
  {
    id: 'national_rd',
    name: 'National Road (Justice Y. Perez Ave / Negros South Rd)',
    roadClass: 'arterial',
    points: [
      sdToWorld(NATIONAL_S_MIN, 0),
      sdToWorld(-63.4, 0),
      sdToWorld(0, 0),
      sdToWorld(151.5, 0),
      sdToWorld(NATIONAL_S_MAX, 0),
    ],
    carriagewayWidth: NATIONAL_CARRIAGEWAY_WIDTH,
    medianWidth: NATIONAL_MEDIAN_WIDTH,
    medianBreaks: [
      { sStart: nationalRoadS(-73.0), sEnd: nationalRoadS(-53.5), reason: 'pedro_zayco_junction' },
      { sStart: nationalRoadS(-22.0), sEnd: nationalRoadS(-1.0), reason: 'ceres_gate2_egress' },
      { sStart: nationalRoadS(23.0), sEnd: nationalRoadS(41.0), reason: 'ceres_gate1_ingress' },
      { sStart: nationalRoadS(142.0), sEnd: nationalRoadS(161.5), reason: 'repollo_junction' },
    ],
    sidewalkWidthLeft: 2.2,
    sidewalkWidthRight: 2.2,
    sidewalkLeftCutouts: [
      { sStart: nationalRoadS(-70.4), sEnd: nationalRoadS(-56.4), reason: 'pedro_zayco_st' },
      { sStart: nationalRoadS(144.0), sEnd: nationalRoadS(159.5), reason: 'repollo_st' },
    ],
    sidewalkRightCutouts: [
      { sStart: nationalRoadS(-32.0), sEnd: nationalRoadS(-21.2), reason: 'ceres_perimeter_rd' },
      { sStart: nationalRoadS(-18.0), sEnd: nationalRoadS(-5.0), reason: 'ceres_gate2_egress' },
      { sStart: nationalRoadS(25.5), sEnd: nationalRoadS(38.5), reason: 'ceres_gate1_ingress' },
    ],
    hasCenterDashedLine: false,
    laneDividerOffsets: [-3.65, 3.65],
  },
  {
    id: 'pedro_zayco_st',
    name: 'Pedro Zayco Sr. Street',
    roadClass: 'collector',
    points: PEDRO_ZAYCO_CL_SD.map(([s, d]) => sdToWorld(s, d)),
    carriagewayWidth: 6.4,
    medianWidth: 0,
    medianBreaks: [],
    sidewalkWidthLeft: 1.6,
    sidewalkWidthRight: 1.6,
    sidewalkLeftCutouts: [{ sStart: 0, sEnd: 4.5, reason: 'national_rd_junction' }],
    sidewalkRightCutouts: [{ sStart: 0, sEnd: 4.5, reason: 'national_rd_junction' }],
    hasCenterDashedLine: true,
    laneDividerOffsets: [],
  },
  {
    id: 'repollo_st',
    name: 'Repollo Street',
    roadClass: 'local',
    points: REPOLLO_CL_SD.map(([s, d]) => sdToWorld(s, d)),
    carriagewayWidth: 6.0,
    medianWidth: 0,
    medianBreaks: [],
    sidewalkWidthLeft: 1.5,
    sidewalkWidthRight: 1.5,
    sidewalkLeftCutouts: [{ sStart: 0, sEnd: 7.5, reason: 'national_rd_junction' }],
    sidewalkRightCutouts: [{ sStart: 0, sEnd: 7.5, reason: 'national_rd_junction' }],
    hasCenterDashedLine: true,
    laneDividerOffsets: [],
  },
  {
    id: 'ceres_perimeter_rd',
    name: 'Ceres Terminal Perimeter Access Road',
    roadClass: 'perimeter',
    points: PERIMETER_CL_SD.map(([s, d]) => sdToWorld(s, d)),
    carriagewayWidth: 6.0,
    medianWidth: 0,
    medianBreaks: [],
    sidewalkWidthLeft: 1.3,
    sidewalkWidthRight: 1.3,
    sidewalkLeftCutouts: [{ sStart: 0, sEnd: 5.0, reason: 'national_rd_junction' }],
    sidewalkRightCutouts: [{ sStart: 0, sEnd: 5.0, reason: 'national_rd_junction' }],
    hasCenterDashedLine: true,
    laneDividerOffsets: [],
  },
  {
    id: 'ceres_gate1_driveway',
    name: 'Ceres Terminal Gate 1 (SE Ingress)',
    roadClass: 'driveway',
    points: [sdToWorld(JUNCTION_S.ceresGate1, -6.0), sdToWorld(JUNCTION_S.ceresGate1, -30.0)],
    carriagewayWidth: 8.6,
    medianWidth: 0,
    medianBreaks: [],
    sidewalkWidthLeft: 0,
    sidewalkWidthRight: 0,
    sidewalkLeftCutouts: [],
    sidewalkRightCutouts: [],
    hasCenterDashedLine: false,
    laneDividerOffsets: [],
  },
  {
    id: 'ceres_gate2_driveway',
    name: 'Ceres Terminal Gate 2 (NW Egress)',
    roadClass: 'driveway',
    points: [sdToWorld(JUNCTION_S.ceresGate2, -30.0), sdToWorld(JUNCTION_S.ceresGate2, -6.0)],
    carriagewayWidth: 8.6,
    medianWidth: 0,
    medianBreaks: [],
    sidewalkWidthLeft: 0,
    sidewalkWidthRight: 0,
    sidewalkLeftCutouts: [],
    sidewalkRightCutouts: [],
    hasCenterDashedLine: false,
    laneDividerOffsets: [],
  },
];

// ---------------------------------------------------------------------------
// 2. Directed Lane-Edge Graph Specifications (Zero Discontinuity!)
// ---------------------------------------------------------------------------
export interface LaneSpec {
  readonly id: string;
  readonly roadId: string;
  readonly name: string;
  readonly direction: 'NW' | 'SE' | 'NE' | 'SW' | 'INBOUND' | 'OUTBOUND' | 'INTERNAL';
  readonly laneIndex: number;
  readonly width: number;
  readonly speedLimit: number;
  readonly priority: LanePriority;
  readonly points: readonly Vec2[];
  readonly nextLaneIds: readonly string[];
  readonly adjacentLeftLaneId?: string;
  readonly adjacentRightLaneId?: string;
  readonly allowedVehicles: readonly VehicleClass[];
  readonly isTerminalInternal?: boolean;
  readonly loadingZones?: readonly LoadingZone[];
  readonly isEntry?: boolean;
  readonly isExit?: boolean;
  readonly isConnector?: boolean;
}

const ALL_VEHICLES: readonly VehicleClass[] = [
  'bus',
  'jeepney',
  'tricycle',
  'car',
  'truck',
  'motorcycle',
];
const INNER_FAST_VEHICLES: readonly VehicleClass[] = ['bus', 'jeepney', 'car', 'truck', 'motorcycle'];
const SIDE_STREET_VEHICLES: readonly VehicleClass[] = ['jeepney', 'tricycle', 'car', 'motorcycle'];
const BUS_ONLY: readonly VehicleClass[] = ['bus'];

/** Offsets a polyline in `(s, dNE)` by a signed right-hand offset (meters). */
function offsetPolylineSD(
  pts: readonly (readonly [number, number])[],
  rightOffset: number
): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < pts.length; i++) {
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(pts.length - 1, i + 1)];
    const ds = next[0] - prev[0];
    const dd = next[1] - prev[1];
    const len = Math.hypot(ds, dd) || 1;
    // In (s, dNE) plane (s = SE, d = NE), right of forward vector (ds, dd) is (dd, -ds)/len
    const rs = dd / len;
    const rd = -ds / len;
    out.push(sdToWorld(pts[i][0] + rs * rightOffset, pts[i][1] + rd * rightOffset));
  }
  return out;
}

// Side-street base centerlines starting cleanly outside National Rd sidewalk (dNE = ±9.5m)
const PZ_LANE_CL_SD: readonly (readonly [number, number])[] = [
  [JUNCTION_S.pedroZayco, 10.0],
  [JUNCTION_S.pedroZayco, 32.0],
  [JUNCTION_S.pedroZayco, 60.0],
  [JUNCTION_S.pedroZayco, 82.0],
  [JUNCTION_S.pedroZayco + 3.2, 98.0],
  [JUNCTION_S.pedroZayco + 11.5, 112.0],
  [JUNCTION_S.pedroZayco + 24.0, 123.5],
  [JUNCTION_S.pedroZayco + 39.0, 132.0],
];

const REPOLLO_LANE_CL_SD: readonly (readonly [number, number])[] = [
  repolloSD(13.0), // dNE = 10.06m
  repolloSD(35.0),
  repolloSD(65.0),
  repolloSD(95.0),
  repolloSD(126.0),
];

const PERIM_LANE_CL_SD: readonly (readonly [number, number])[] = [
  [JUNCTION_S.perimeterRd, -10.0],
  [JUNCTION_S.perimeterRd, -35.0],
  [JUNCTION_S.perimeterRd, -72.0],
  [-26.0, -98.0],
  [-21.5, -114.0],
  [-11.0, -126.5],
  [6.0, -132.0],
  [28.0, -131.0],
  [52.0, -124.0],
  [74.0, -108.0],
];

// Compute exact side-street lane endpoints for zero-gap turn connectors
const pzNbPts = offsetPolylineSD(PZ_LANE_CL_SD, 1.6); // Heading NE, right is +s (+1.6)
const pzSbPts = offsetPolylineSD([...PZ_LANE_CL_SD].reverse(), 1.6); // Heading SW, right is -s (-1.6)
const repNbPts = offsetPolylineSD(REPOLLO_LANE_CL_SD, 1.5);
const repSbPts = offsetPolylineSD([...REPOLLO_LANE_CL_SD].reverse(), 1.5);
const perimSwPts = offsetPolylineSD(PERIM_LANE_CL_SD, 1.5); // Heading SW, right is -s (-1.5)
const perimNePts = offsetPolylineSD([...PERIM_LANE_CL_SD].reverse(), 1.5); // Heading NE, right is +s (+1.5)

// Internal Ceres Terminal smooth polylines
const CERES_ALIGHTING_PTS: Vec2[] = [
  sdToWorld(JUNCTION_S.ceresGate1, -26.0),
  ...sampleArcSD(JUNCTION_S.ceresGate1 - 12.5, -26.0, 12.5, 0, -Math.PI * 0.5, 10).slice(1),
  sdToWorld(10.0, -38.5),
  sdToWorld(1.5, -38.5),
  ...sampleArcSD(1.5, -25.5, 13.0, -Math.PI * 0.5, -Math.PI, 10).slice(1),
  sdToWorld(JUNCTION_S.ceresGate2, -25.0),
];

const CERES_STAGING_PTS: Vec2[] = [
  sdToWorld(JUNCTION_S.ceresGate1, -26.0),
  sdToWorld(JUNCTION_S.ceresGate1, -44.0),
  ...sampleArcSD(JUNCTION_S.ceresGate1 - 14.0, -44.0, 14.0, 0, -Math.PI * 0.5, 10).slice(1),
  sdToWorld(10.0, -58.0),
  sdToWorld(2.5, -58.0),
  ...sampleArcSD(2.5, -44.0, 14.0, -Math.PI * 0.5, -Math.PI, 10).slice(1),
  sdToWorld(JUNCTION_S.ceresGate2, -25.0),
];

const NAT_SPEED = 13.9; // 50 km/h urban arterial
const SIDE_SPEED = 8.3; // 30 km/h local street
const TURN_SPEED = 5.5; // 20 km/h turning connector
const TERMINAL_SPEED = 3.8; // 14 km/h inside Ceres compound

function straightNationalLane(
  id: string,
  name: string,
  direction: 'SE' | 'NW',
  laneIndex: 0 | 1,
  sA: number,
  sB: number,
  nextLaneIds: readonly string[],
  opts?: {
    adjacentLeftLaneId?: string;
    adjacentRightLaneId?: string;
    isEntry?: boolean;
    isExit?: boolean;
    loadingZones?: readonly LoadingZone[];
  }
): LaneSpec {
  const d =
    direction === 'SE'
      ? laneIndex === 0
        ? D_SE_OUTER
        : D_SE_INNER
      : laneIndex === 0
        ? D_NW_OUTER
        : D_NW_INNER;
  return {
    id,
    roadId: 'national_rd',
    name,
    direction,
    laneIndex,
    width: NATIONAL_LANE_WIDTH,
    speedLimit: NAT_SPEED,
    priority: 1,
    points: [sdToWorld(sA, d), sdToWorld(sB, d)],
    nextLaneIds,
    adjacentLeftLaneId: opts?.adjacentLeftLaneId,
    adjacentRightLaneId: opts?.adjacentRightLaneId,
    allowedVehicles: laneIndex === 0 ? ALL_VEHICLES : INNER_FAST_VEHICLES,
    isEntry: opts?.isEntry,
    isExit: opts?.isExit,
    loadingZones: opts?.loadingZones,
  };
}

export const LANE_SPECS: readonly LaneSpec[] = [
  // =========================================================================
  // A. NATIONAL ROAD — SE-BOUND (Toward Ilog / Guanzon, SW half of highway)
  // =========================================================================
  straightNationalLane('nat_se_0_s1', 'National Rd SE Outer (NW Approach)', 'SE', 0, -165, -76, ['nat_se_0_pz'], {
    adjacentLeftLaneId: 'nat_se_1_s1',
    isEntry: true,
  }),
  straightNationalLane('nat_se_1_s1', 'National Rd SE Inner (NW Approach)', 'SE', 1, -165, -76, ['nat_se_1_pz', 'turn_se_to_pz'], {
    adjacentRightLaneId: 'nat_se_0_s1',
    isEntry: true,
  }),

  straightNationalLane('nat_se_0_pz', 'National Rd SE Outer (Pedro Zayco Box)', 'SE', 0, -76, -51, ['nat_se_0_s2']),
  straightNationalLane('nat_se_1_pz', 'National Rd SE Inner (Pedro Zayco Box)', 'SE', 1, -76, -51, ['nat_se_1_s2']),

  straightNationalLane('nat_se_0_s2', 'National Rd SE Outer (Mid-Block NW)', 'SE', 0, -51, -37, ['nat_se_0_perim', 'turn_se_to_perim'], {
    adjacentLeftLaneId: 'nat_se_1_s2',
  }),
  straightNationalLane('nat_se_1_s2', 'National Rd SE Inner (Mid-Block NW)', 'SE', 1, -51, -37, ['nat_se_1_perim'], {
    adjacentRightLaneId: 'nat_se_0_s2',
  }),

  straightNationalLane('nat_se_0_perim', 'National Rd SE Outer (Perimeter Junction)', 'SE', 0, -37, -18, ['nat_se_0_g2']),
  straightNationalLane('nat_se_1_perim', 'National Rd SE Inner (Perimeter Junction)', 'SE', 1, -37, -18, ['nat_se_1_g2']),

  straightNationalLane('nat_se_0_g2', 'National Rd SE Outer (Gate 2 Box)', 'SE', 0, -18, 4, ['nat_se_0_s3']),
  straightNationalLane('nat_se_1_g2', 'National Rd SE Inner (Gate 2 Box)', 'SE', 1, -18, 4, ['nat_se_1_s3']),

  straightNationalLane('nat_se_0_s3', 'National Rd SE Outer (Ceres Frontage)', 'SE', 0, 4, 18, ['nat_se_0_g1', 'ceres_gate1_ingress'], {
    adjacentLeftLaneId: 'nat_se_1_s3',
    loadingZones: [
      { id: 'curb_ceres_se_frontage', sStart: 2.0, sEnd: 12.0, side: 'right', kind: 'curbside' },
    ],
  }),
  straightNationalLane('nat_se_1_s3', 'National Rd SE Inner (Ceres Frontage)', 'SE', 1, 4, 18, ['nat_se_1_g1'], {
    adjacentRightLaneId: 'nat_se_0_s3',
  }),

  straightNationalLane('nat_se_0_g1', 'National Rd SE Outer (Gate 1 Box)', 'SE', 0, 18, 44, ['nat_se_0_s4']),
  straightNationalLane('nat_se_1_g1', 'National Rd SE Inner (Gate 1 Box)', 'SE', 1, 18, 44, ['nat_se_1_s4']),

  straightNationalLane('nat_se_0_s4', 'National Rd SE Outer (Duremdes-Modern Glass)', 'SE', 0, 44, 138, ['nat_se_0_rep'], {
    adjacentLeftLaneId: 'nat_se_1_s4',
    loadingZones: [
      { id: 'curb_duremdes_se', sStart: 12.0, sEnd: 26.0, side: 'right', kind: 'curbside' },
    ],
  }),
  straightNationalLane('nat_se_1_s4', 'National Rd SE Inner (Duremdes-Modern Glass)', 'SE', 1, 44, 138, ['nat_se_1_rep', 'turn_se_to_repollo'], {
    adjacentRightLaneId: 'nat_se_0_s4',
  }),

  straightNationalLane('nat_se_0_rep', 'National Rd SE Outer (Repollo Box)', 'SE', 0, 138, 165, ['nat_se_0_s5']),
  straightNationalLane('nat_se_1_rep', 'National Rd SE Inner (Repollo Box)', 'SE', 1, 138, 165, ['nat_se_1_s5']),

  straightNationalLane('nat_se_0_s5', 'National Rd SE Outer (SE Exit)', 'SE', 0, 165, 185, [], {
    adjacentLeftLaneId: 'nat_se_1_s5',
    isExit: true,
  }),
  straightNationalLane('nat_se_1_s5', 'National Rd SE Inner (SE Exit)', 'SE', 1, 165, 185, [], {
    adjacentRightLaneId: 'nat_se_0_s5',
    isExit: true,
  }),

  // =========================================================================
  // B. NATIONAL ROAD — NW-BOUND (Toward Bacolod / CityMall, NE half)
  // =========================================================================
  straightNationalLane('nat_nw_0_s1', 'National Rd NW Outer (SE Approach)', 'NW', 0, 185, 165, ['nat_nw_0_rep', 'turn_nw_to_repollo'], {
    adjacentLeftLaneId: 'nat_nw_1_s1',
    isEntry: true,
  }),
  straightNationalLane('nat_nw_1_s1', 'National Rd NW Inner (SE Approach)', 'NW', 1, 185, 165, ['nat_nw_1_rep'], {
    adjacentRightLaneId: 'nat_nw_0_s1',
    isEntry: true,
  }),

  straightNationalLane('nat_nw_0_rep', 'National Rd NW Outer (Repollo Box)', 'NW', 0, 165, 138, ['nat_nw_0_s2']),
  straightNationalLane('nat_nw_1_rep', 'National Rd NW Inner (Repollo Box)', 'NW', 1, 165, 138, ['nat_nw_1_s2']),

  straightNationalLane('nat_nw_0_s2', 'National Rd NW Outer (Commercial Strip)', 'NW', 0, 138, 44, ['nat_nw_0_g1'], {
    adjacentLeftLaneId: 'nat_nw_1_s2',
    loadingZones: [
      { id: 'curb_kz_motorparts_nw', sStart: 70.0, sEnd: 84.0, side: 'right', kind: 'curbside' },
    ],
  }),
  straightNationalLane('nat_nw_1_s2', 'National Rd NW Inner (Commercial Strip)', 'NW', 1, 138, 44, ['nat_nw_1_g1', 'turn_nw_to_gate1'], {
    adjacentRightLaneId: 'nat_nw_0_s2',
  }),

  straightNationalLane('nat_nw_0_g1', 'National Rd NW Outer (Gate 1 Box)', 'NW', 0, 44, 18, ['nat_nw_0_s3']),
  straightNationalLane('nat_nw_1_g1', 'National Rd NW Inner (Gate 1 Box)', 'NW', 1, 44, 18, ['nat_nw_1_s3']),

  straightNationalLane('nat_nw_0_s3', 'National Rd NW Outer (Simonne-MS Glass)', 'NW', 0, 18, 4, ['nat_nw_0_g2'], {
    adjacentLeftLaneId: 'nat_nw_1_s3',
    loadingZones: [
      { id: 'curb_simonnes_nw', sStart: 2.0, sEnd: 12.0, side: 'right', kind: 'curbside' },
    ],
  }),
  straightNationalLane('nat_nw_1_s3', 'National Rd NW Inner (Simonne-MS Glass)', 'NW', 1, 18, 4, ['nat_nw_1_g2'], {
    adjacentRightLaneId: 'nat_nw_0_s3',
  }),

  straightNationalLane('nat_nw_0_g2', 'National Rd NW Outer (Gate 2 Box)', 'NW', 0, 4, -26, ['nat_nw_0_s4']),
  straightNationalLane('nat_nw_1_g2', 'National Rd NW Inner (Gate 2 Box)', 'NW', 1, 4, -26, ['nat_nw_1_s4']),

  straightNationalLane('nat_nw_0_s4', 'National Rd NW Outer (Cebuana-Noceco)', 'NW', 0, -26, -51, ['nat_nw_0_pz', 'turn_nw_to_pz'], {
    adjacentLeftLaneId: 'nat_nw_1_s4',
  }),
  straightNationalLane('nat_nw_1_s4', 'National Rd NW Inner (Cebuana-Noceco)', 'NW', 1, -26, -51, ['nat_nw_1_pz'], {
    adjacentRightLaneId: 'nat_nw_0_s4',
  }),

  straightNationalLane('nat_nw_0_pz', 'National Rd NW Outer (Pedro Zayco Box)', 'NW', 0, -51, -76, ['nat_nw_0_s5']),
  straightNationalLane('nat_nw_1_pz', 'National Rd NW Inner (Pedro Zayco Box)', 'NW', 1, -51, -76, ['nat_nw_1_s5']),

  straightNationalLane('nat_nw_0_s5', 'National Rd NW Outer (NW Exit)', 'NW', 0, -76, -165, [], {
    adjacentLeftLaneId: 'nat_nw_1_s5',
    isExit: true,
  }),
  straightNationalLane('nat_nw_1_s5', 'National Rd NW Inner (NW Exit)', 'NW', 1, -76, -165, [], {
    adjacentRightLaneId: 'nat_nw_0_s5',
    isExit: true,
  }),

  // =========================================================================
  // C. CERES BUS TERMINAL — GATE 1 INGRESS, INTERNAL LOOP & GATE 2 EGRESS
  // =========================================================================
  {
    id: 'ceres_gate1_ingress',
    roadId: 'ceres_gate1_driveway',
    name: 'Ceres Gate 1 Right-Turn Ingress (from SE Outer)',
    direction: 'INBOUND',
    laneIndex: 0,
    width: 4.2,
    speedLimit: TURN_SPEED,
    priority: 2,
    points: sampleBezierSD(
      [18.0, D_SE_OUTER],
      [27.5, D_SE_OUTER],
      [JUNCTION_S.ceresGate1, -9.5],
      [JUNCTION_S.ceresGate1, -19.0],
      16
    ),
    nextLaneIds: ['ceres_gate1_throat'],
    allowedVehicles: BUS_ONLY,
    isConnector: true,
  },
  {
    id: 'turn_nw_to_gate1',
    roadId: 'ceres_gate1_driveway',
    name: 'Ceres Gate 1 Left-Turn Ingress (from NW Inner)',
    direction: 'INBOUND',
    laneIndex: 0,
    width: 4.2,
    speedLimit: 5.0,
    priority: 2,
    points: sampleBezierSD(
      [44.0, D_NW_INNER],
      [35.0, D_NW_INNER],
      [JUNCTION_S.ceresGate1, -6.5],
      [JUNCTION_S.ceresGate1, -19.0],
      18
    ),
    nextLaneIds: ['ceres_gate1_throat'],
    allowedVehicles: BUS_ONLY,
    isConnector: true,
  },
  {
    id: 'ceres_gate1_throat',
    roadId: 'ceres_gate1_driveway',
    name: 'Ceres Gate 1 Entry Throat',
    direction: 'INBOUND',
    laneIndex: 0,
    width: 4.4,
    speedLimit: TERMINAL_SPEED,
    priority: 2,
    points: [sdToWorld(JUNCTION_S.ceresGate1, -19.0), sdToWorld(JUNCTION_S.ceresGate1, -26.0)],
    nextLaneIds: ['ceres_alighting_lane', 'ceres_staging_loop'],
    allowedVehicles: BUS_ONLY,
    isTerminalInternal: true,
  },
  {
    id: 'ceres_alighting_lane',
    roadId: 'ceres_gate1_driveway',
    name: 'Ceres Terminal Alighting Platform Lane',
    direction: 'INTERNAL',
    laneIndex: 0,
    width: 4.2,
    speedLimit: TERMINAL_SPEED,
    priority: 2,
    points: CERES_ALIGHTING_PTS,
    nextLaneIds: ['ceres_gate2_throat'],
    allowedVehicles: BUS_ONLY,
    isTerminalInternal: true,
    loadingZones: [
      { id: 'ceres_alighting_platform', sStart: 19.5, sEnd: 36.5, side: 'right', kind: 'alighting' },
    ],
  },
  {
    id: 'ceres_staging_loop',
    roadId: 'ceres_gate1_driveway',
    name: 'Ceres Terminal Bus Staging Yard Loop',
    direction: 'INTERNAL',
    laneIndex: 0,
    width: 4.2,
    speedLimit: 3.4,
    priority: 2,
    points: CERES_STAGING_PTS,
    nextLaneIds: ['ceres_gate2_throat'],
    allowedVehicles: BUS_ONLY,
    isTerminalInternal: true,
    loadingZones: [
      { id: 'ceres_staging_bays_zone', sStart: 39.0, sEnd: 55.0, side: 'left', kind: 'staging' },
    ],
  },
  {
    id: 'ceres_gate2_throat',
    roadId: 'ceres_gate2_driveway',
    name: 'Ceres Gate 2 Departure Throat',
    direction: 'OUTBOUND',
    laneIndex: 0,
    width: 4.4,
    speedLimit: TERMINAL_SPEED,
    priority: 3,
    points: [sdToWorld(JUNCTION_S.ceresGate2, -25.0), sdToWorld(JUNCTION_S.ceresGate2, -10.5)],
    nextLaneIds: ['ceres_gate2_egress_se', 'ceres_gate2_egress_nw'],
    allowedVehicles: BUS_ONLY,
    isTerminalInternal: true,
  },
  {
    id: 'ceres_gate2_egress_se',
    roadId: 'ceres_gate2_driveway',
    name: 'Ceres Gate 2 Right-Turn Merge (to SE Outer)',
    direction: 'OUTBOUND',
    laneIndex: 0,
    width: 4.2,
    speedLimit: TURN_SPEED,
    priority: 3,
    points: sampleBezierSD(
      [JUNCTION_S.ceresGate2, -10.5],
      [JUNCTION_S.ceresGate2, -6.0],
      [-5.0, D_SE_OUTER],
      [4.0, D_SE_OUTER],
      16
    ),
    nextLaneIds: ['nat_se_0_s3'],
    allowedVehicles: BUS_ONLY,
    isConnector: true,
  },
  {
    id: 'ceres_gate2_egress_nw',
    roadId: 'ceres_gate2_driveway',
    name: 'Ceres Gate 2 Wide Left-Turn Egress (to NW Inner)',
    direction: 'OUTBOUND',
    laneIndex: 0,
    width: 4.2,
    speedLimit: 4.8,
    priority: 3,
    points: sampleBezierSD(
      [JUNCTION_S.ceresGate2, -10.5],
      [JUNCTION_S.ceresGate2, -0.5],
      [-15.5, D_NW_INNER],
      [-26.0, D_NW_INNER],
      18
    ),
    nextLaneIds: ['nat_nw_1_s4'],
    allowedVehicles: BUS_ONLY,
    isConnector: true,
  },

  // =========================================================================
  // D. PEDRO ZAYCO SR. STREET (NE Branch, T-Junction at s = -63.4m)
  // =========================================================================
  {
    id: 'pedro_zayco_nb',
    roadId: 'pedro_zayco_st',
    name: 'Pedro Zayco Sr. St. NE-bound (Exit)',
    direction: 'NE',
    laneIndex: 0,
    width: 3.2,
    speedLimit: SIDE_SPEED,
    priority: 2,
    points: pzNbPts,
    nextLaneIds: [],
    allowedVehicles: SIDE_STREET_VEHICLES,
    isExit: true,
  },
  {
    id: 'pedro_zayco_sb',
    roadId: 'pedro_zayco_st',
    name: 'Pedro Zayco Sr. St. SW-bound (Approach)',
    direction: 'SW',
    laneIndex: 0,
    width: 3.2,
    speedLimit: SIDE_SPEED,
    priority: 4,
    points: pzSbPts,
    nextLaneIds: ['turn_pz_to_nw', 'turn_pz_to_se'],
    allowedVehicles: SIDE_STREET_VEHICLES,
    isEntry: true,
  },
  {
    id: 'turn_nw_to_pz',
    roadId: 'pedro_zayco_st',
    name: 'Right Turn National NW -> Pedro Zayco NE',
    direction: 'NE',
    laneIndex: 0,
    width: 3.4,
    speedLimit: TURN_SPEED,
    priority: 2,
    points: sampleBezierSD(
      [-51.0, D_NW_OUTER],
      [-57.5, D_NW_OUTER],
      [JUNCTION_S.pedroZayco + 1.6, 6.8],
      [JUNCTION_S.pedroZayco + 1.6, 10.0],
      14
    ),
    nextLaneIds: ['pedro_zayco_nb'],
    allowedVehicles: SIDE_STREET_VEHICLES,
    isConnector: true,
  },
  {
    id: 'turn_se_to_pz',
    roadId: 'pedro_zayco_st',
    name: 'Left Turn National SE -> Pedro Zayco NE',
    direction: 'NE',
    laneIndex: 0,
    width: 3.4,
    speedLimit: 5.0,
    priority: 2,
    points: sampleBezierSD(
      [-76.0, D_SE_INNER],
      [-65.0, D_SE_INNER],
      [JUNCTION_S.pedroZayco + 1.6, 2.5],
      [JUNCTION_S.pedroZayco + 1.6, 10.0],
      16
    ),
    nextLaneIds: ['pedro_zayco_nb'],
    allowedVehicles: SIDE_STREET_VEHICLES,
    isConnector: true,
  },
  {
    id: 'turn_pz_to_nw',
    roadId: 'pedro_zayco_st',
    name: 'Right Turn Pedro Zayco -> National NW Outer',
    direction: 'NW',
    laneIndex: 0,
    width: 3.4,
    speedLimit: TURN_SPEED,
    priority: 4,
    points: sampleBezierSD(
      [JUNCTION_S.pedroZayco - 1.6, 10.0],
      [JUNCTION_S.pedroZayco - 1.6, 6.2],
      [-69.0, D_NW_OUTER],
      [-76.0, D_NW_OUTER],
      14
    ),
    nextLaneIds: ['nat_nw_0_s5'],
    allowedVehicles: SIDE_STREET_VEHICLES,
    isConnector: true,
  },
  {
    id: 'turn_pz_to_se',
    roadId: 'pedro_zayco_st',
    name: 'Left Turn Pedro Zayco -> National SE Inner',
    direction: 'SE',
    laneIndex: 0,
    width: 3.4,
    speedLimit: 4.8,
    priority: 4,
    points: sampleBezierSD(
      [JUNCTION_S.pedroZayco - 1.6, 10.0],
      [JUNCTION_S.pedroZayco - 1.6, 0.5],
      [-60.5, D_SE_INNER],
      [-51.0, D_SE_INNER],
      16
    ),
    nextLaneIds: ['nat_se_1_s2'],
    allowedVehicles: SIDE_STREET_VEHICLES,
    isConnector: true,
  },

  // =========================================================================
  // E. REPOLLO STREET (NE Branch at s = +151.5m)
  // =========================================================================
  {
    id: 'repollo_nb',
    roadId: 'repollo_st',
    name: 'Repollo St. NE-bound (Exit)',
    direction: 'NE',
    laneIndex: 0,
    width: 3.0,
    speedLimit: SIDE_SPEED,
    priority: 2,
    points: repNbPts,
    nextLaneIds: [],
    allowedVehicles: SIDE_STREET_VEHICLES,
    isExit: true,
  },
  {
    id: 'repollo_sb',
    roadId: 'repollo_st',
    name: 'Repollo St. SW-bound (Approach)',
    direction: 'SW',
    laneIndex: 0,
    width: 3.0,
    speedLimit: SIDE_SPEED,
    priority: 4,
    points: repSbPts,
    nextLaneIds: ['turn_repollo_to_nw', 'turn_repollo_to_se'],
    allowedVehicles: SIDE_STREET_VEHICLES,
    isEntry: true,
  },
  {
    id: 'turn_nw_to_repollo',
    roadId: 'repollo_st',
    name: 'Right Turn National NW -> Repollo St.',
    direction: 'NE',
    laneIndex: 0,
    width: 3.2,
    speedLimit: TURN_SPEED,
    priority: 2,
    points: sampleBezierSD(
      [165.0, D_NW_OUTER],
      [155.0, D_NW_OUTER],
      repolloSD(8.0, 1.5),
      repolloSD(13.0, 1.5),
      14
    ),
    nextLaneIds: ['repollo_nb'],
    allowedVehicles: SIDE_STREET_VEHICLES,
    isConnector: true,
  },
  {
    id: 'turn_se_to_repollo',
    roadId: 'repollo_st',
    name: 'Left Turn National SE -> Repollo St.',
    direction: 'NE',
    laneIndex: 0,
    width: 3.2,
    speedLimit: 5.0,
    priority: 2,
    points: sampleBezierSD(
      [138.0, D_SE_INNER],
      [148.0, D_SE_INNER],
      repolloSD(5.0, 1.5),
      repolloSD(13.0, 1.5),
      16
    ),
    nextLaneIds: ['repollo_nb'],
    allowedVehicles: SIDE_STREET_VEHICLES,
    isConnector: true,
  },
  {
    id: 'turn_repollo_to_nw',
    roadId: 'repollo_st',
    name: 'Right Turn Repollo St. -> National NW Outer',
    direction: 'NW',
    laneIndex: 0,
    width: 3.2,
    speedLimit: TURN_SPEED,
    priority: 4,
    points: sampleBezierSD(
      repolloSD(13.0, -1.5),
      repolloSD(7.0, -1.5),
      [143.0, D_NW_OUTER],
      [138.0, D_NW_OUTER],
      14
    ),
    nextLaneIds: ['nat_nw_0_s2'],
    allowedVehicles: SIDE_STREET_VEHICLES,
    isConnector: true,
  },
  {
    id: 'turn_repollo_to_se',
    roadId: 'repollo_st',
    name: 'Left Turn Repollo St. -> National SE Inner',
    direction: 'SE',
    laneIndex: 0,
    width: 3.2,
    speedLimit: 4.8,
    priority: 4,
    points: sampleBezierSD(
      repolloSD(13.0, -1.5),
      repolloSD(3.5, -1.5),
      [155.0, D_SE_INNER],
      [165.0, D_SE_INNER],
      16
    ),
    nextLaneIds: ['nat_se_1_s5'],
    allowedVehicles: SIDE_STREET_VEHICLES,
    isConnector: true,
  },

  // =========================================================================
  // F. CERES PERIMETER ACCESS ROAD (SW Feeder past City Health & Duremdes)
  // =========================================================================
  {
    id: 'perimeter_sw',
    roadId: 'ceres_perimeter_rd',
    name: 'Ceres Perimeter Access Rd SW-bound (Exit)',
    direction: 'SW',
    laneIndex: 0,
    width: 3.0,
    speedLimit: 7.5,
    priority: 2,
    points: perimSwPts,
    nextLaneIds: [],
    allowedVehicles: SIDE_STREET_VEHICLES,
    isExit: true,
  },
  {
    id: 'perimeter_ne',
    roadId: 'ceres_perimeter_rd',
    name: 'Ceres Perimeter Access Rd NE-bound (Feeder)',
    direction: 'NE',
    laneIndex: 0,
    width: 3.0,
    speedLimit: 7.5,
    priority: 4,
    points: perimNePts,
    nextLaneIds: ['turn_perim_to_se'],
    allowedVehicles: SIDE_STREET_VEHICLES,
    isEntry: true,
  },
  {
    id: 'turn_se_to_perim',
    roadId: 'ceres_perimeter_rd',
    name: 'Right Turn National SE -> Perimeter Rd',
    direction: 'SW',
    laneIndex: 0,
    width: 3.2,
    speedLimit: TURN_SPEED,
    priority: 2,
    points: sampleBezierSD(
      [-37.0, D_SE_OUTER],
      [-31.5, D_SE_OUTER],
      [JUNCTION_S.perimeterRd - 1.5, -7.2],
      [JUNCTION_S.perimeterRd - 1.5, -10.0],
      12
    ),
    nextLaneIds: ['perimeter_sw'],
    allowedVehicles: SIDE_STREET_VEHICLES,
    isConnector: true,
  },
  {
    id: 'turn_perim_to_se',
    roadId: 'ceres_perimeter_rd',
    name: 'Right Turn Perimeter Rd -> National SE Outer',
    direction: 'SE',
    laneIndex: 0,
    width: 3.2,
    speedLimit: TURN_SPEED,
    priority: 4,
    points: sampleBezierSD(
      [JUNCTION_S.perimeterRd + 1.5, -10.0],
      [JUNCTION_S.perimeterRd + 1.5, -6.5],
      [-22.0, D_SE_OUTER],
      [-18.0, D_SE_OUTER],
      12
    ),
    nextLaneIds: ['nat_se_0_g2'],
    allowedVehicles: SIDE_STREET_VEHICLES,
    isConnector: true,
  },
];

// ---------------------------------------------------------------------------
// 3. Crosswalks
// ---------------------------------------------------------------------------
export interface CrosswalkSpec {
  readonly id: string;
  readonly roadId: string;
  readonly label: string;
  readonly s: number;
  readonly width: number;
  readonly signalizedInScenario2: boolean;
}

export const CROSSWALK_SPECS: readonly CrosswalkSpec[] = [
  {
    id: 'cw_pedro_zayco',
    roadId: 'national_rd',
    label: 'Pedro Zayco / Noceco Pedestrian Crossing',
    s: -46.5,
    width: 3.4,
    signalizedInScenario2: true,
  },
  {
    id: 'cw_ceres_frontage',
    roadId: 'national_rd',
    label: 'Ceres Bus Terminal Main Crosswalk',
    s: 10.0,
    width: 3.6,
    signalizedInScenario2: true,
  },
  {
    id: 'cw_repollo',
    roadId: 'national_rd',
    label: 'Repollo St. / Modern Glass Crosswalk',
    s: 133.0,
    width: 3.4,
    signalizedInScenario2: false,
  },
];

// ---------------------------------------------------------------------------
// 4. Landmark & Contextual Building Footprints (100% Verified Clear of Roads)
// ---------------------------------------------------------------------------
export interface BuildingSpec {
  readonly id: string;
  readonly label: string;
  readonly category: BuildingCategory;
  readonly side: 'NE' | 'SW';
  readonly footprint: readonly Vec2[];
  readonly center: Vec2;
  readonly width: number;
  readonly depth: number;
  readonly heading: number;
  readonly height: number;
  readonly roofStyle: RoofStyle;
  readonly roofColor: string;
  readonly facadeColor: string;
  readonly accentColor?: string;
  readonly landmark?: boolean;
}

function makeBuildingSD(
  id: string,
  label: string,
  category: BuildingCategory,
  side: 'NE' | 'SW',
  sMin: number,
  sMax: number,
  dMin: number,
  dMax: number,
  height: number,
  roofStyle: RoofStyle,
  roofColor: string,
  facadeColor: string,
  accentColor?: string,
  landmark = false
): BuildingSpec {
  const geom = rectSD(sMin, sMax, dMin, dMax);
  return {
    id,
    label,
    category,
    side,
    ...geom,
    height,
    roofStyle,
    roofColor,
    facadeColor,
    accentColor,
    landmark,
  };
}

// Helper for buildings aligned with Repollo Street
const REPOLLO_WORLD_UX = REPOLLO_DIR_S * T_SE.x + REPOLLO_DIR_D * N_NE.x;
const REPOLLO_WORLD_UZ = REPOLLO_DIR_S * T_SE.z + REPOLLO_DIR_D * N_NE.z;
function makeRepolloBuilding(
  id: string,
  label: string,
  tAlong: number,
  lateralRight: number,
  width: number,
  depth: number,
  height: number,
  roofColor: string,
  facadeColor: string
): BuildingSpec {
  const [cs, cd] = repolloSD(tAlong, lateralRight);
  const geom = rectAligned(sdToWorld(cs, cd), REPOLLO_WORLD_UX, REPOLLO_WORLD_UZ, width, depth);
  return {
    id,
    label,
    category: 'residential',
    side: 'NE',
    ...geom,
    height,
    roofStyle: 'gable',
    roofColor,
    facadeColor,
    landmark: false,
  };
}

export const BUILDING_SPECS: readonly BuildingSpec[] = [
  // ---- SW SIDE OF NATIONAL ROAD (NW -> SE) ----
  makeBuildingSD('sw_plaza_nw', 'Kabankalan Commercial Plaza', 'commercial', 'SW', -138, -104, -30, -12, 7.2, 'gable', '#b55442', '#e8dfd1', '#7d3a2e'),
  makeBuildingSD('sw_arcade_nw', 'Hardware & Supply Row', 'commercial', 'SW', -98, -68, -29, -12, 6.4, 'gable', '#a84f3c', '#ebe4d8'),
  makeBuildingSD('sw_corner_perim', 'Perimeter Corner Arcade', 'commercial', 'SW', -62, -35, -28, -12, 6.8, 'flat', '#69727a', '#dfd8cc', '#2e5984'),
  makeBuildingSD(
    'city_health_office',
    'Kabankalan City Health Office',
    'civic',
    'SW',
    -76,
    -42,
    -100,
    -68,
    7.8,
    'hip',
    '#4a8b7c',
    '#edf2ef',
    '#2f6e60',
    true
  ),
  makeBuildingSD(
    'ceres_terminal_shed',
    'Ceres Bus Terminal Shed',
    'terminal_shed',
    'SW',
    -2.0,
    22.0,
    -30.5,
    -19.5,
    6.2,
    'shed_canopy',
    '#216b45',
    '#e9ecef',
    '#f2b705',
    true
  ),
  makeBuildingSD(
    'ceres_admin_ticketing',
    'Ceres Admin & Ticketing',
    'terminal_admin',
    'SW',
    -22.5,
    -15.5,
    -86.0,
    -56.0,
    5.4,
    'gable',
    '#2d6a4f',
    '#f4f1e8',
    '#f2b705',
    true
  ),
  makeBuildingSD(
    'duremdes_suites',
    'Duremdes Suites Hotel',
    'hotel',
    'SW',
    46.0,
    70.0,
    -36.0,
    -14.0,
    11.5,
    'flat',
    '#d8dce0',
    '#f4f2ec',
    '#2c5282',
    true
  ),
  makeBuildingSD('sw_commercial_se_1', 'South Corridor Commercial Row', 'commercial', 'SW', 76, 106, -30, -12.5, 6.6, 'gable', '#7d4438', '#e8e0d2'),
  makeBuildingSD('sw_commercial_se_2', 'South Terminal Annex Shops', 'commercial', 'SW', 112, 138, -31, -12.5, 6.2, 'flat', '#8c949c', '#ebe5db'),
  makeBuildingSD('sw_chapel_se', 'Community Worship Hall', 'civic', 'SW', 154, 178, -38, -16, 7.6, 'gable', '#d8d4c8', '#f0ece2'),

  // ---- NE SIDE OF NATIONAL ROAD (NW -> SE, Exact Landmark Sequence) ----
  makeBuildingSD('ne_annex_nw', 'North Commercial Annex', 'commercial', 'NE', -142, -106, 12.0, 27.5, 6.4, 'gable', '#9e4b3c', '#e6ded0'),
  makeBuildingSD(
    'bascon_cakes',
    'Bascon Cakes',
    'commercial',
    'NE',
    -98,
    -74,
    11.5,
    25.5,
    6.8,
    'flat',
    '#8c4a32',
    '#f5e6d3',
    '#c85a32',
    true
  ),
  makeBuildingSD(
    'noceco_sub_office',
    'Noceco Sub-Office',
    'civic',
    'NE',
    -53,
    -37,
    11.5,
    26.0,
    7.4,
    'hip',
    '#3d6b82',
    '#eef2f5',
    '#1f4e79',
    true
  ),
  makeBuildingSD(
    'cebuana_lhuillier',
    'Cebuana Lhuillier',
    'commercial',
    'NE',
    -34,
    -20,
    11.5,
    23.5,
    6.5,
    'flat',
    '#293d5a',
    '#f2eadc',
    '#d99b26',
    true
  ),
  makeBuildingSD(
    'simonnes_pharmacy',
    "Simonne's Pharmacy",
    'commercial',
    'NE',
    -16,
    2,
    11.5,
    24.0,
    6.8,
    'flat',
    '#2b7a78',
    '#f5f7f8',
    '#20a496',
    true
  ),
  makeBuildingSD(
    'ms_glass_aluminum',
    'MS Glass Aluminum Supply',
    'commercial',
    'NE',
    6,
    28,
    11.5,
    25.5,
    6.2,
    'gable',
    '#b84735',
    '#eae6de',
    '#3c5a72',
    true
  ),
  makeBuildingSD(
    'kz_motorparts',
    'KZ Motorparts',
    'commercial',
    'NE',
    32,
    52,
    11.5,
    24.5,
    6.4,
    'gable',
    '#8c3b2f',
    '#e9e2d5',
    '#c9382b',
    true
  ),
  makeBuildingSD(
    'modern_glass',
    'Modern Glass',
    'commercial',
    'NE',
    56,
    80,
    11.5,
    25.5,
    6.6,
    'flat',
    '#4f6272',
    '#e4eaee',
    '#2d6a8e',
    true
  ),
  makeBuildingSD('ne_strip_se_1', 'Commercial Shophouses SE', 'commercial', 'NE', 84, 108, 11.5, 24.5, 6.2, 'gable', '#9d4a3a', '#e8dfd2'),
  makeBuildingSD('ne_strip_se_2', 'Repollo Corner Commercial', 'commercial', 'NE', 112, 125, 11.5, 21.5, 6.4, 'gable', '#a65442', '#ece4d8'),
  makeBuildingSD('ne_corner_repollo_se', 'Repollo East Commercial', 'commercial', 'NE', 164, 182, 11.5, 26.0, 6.8, 'gable', '#4d7c4f', '#e9e5dc'),

  // ---- URBAN FILL ALONG PEDRO ZAYCO SR. ST. ----
  makeBuildingSD('pz_res_nw_1', 'Pedro Zayco Residence NW-1', 'residential', 'NE', -86, -71, 36, 52, 5.2, 'gable', '#9c4e3d', '#e8dfd1'),
  makeBuildingSD('pz_res_nw_2', 'Pedro Zayco Residence NW-2', 'residential', 'NE', -86, -71, 58, 74, 5.6, 'hip', '#6e5245', '#ede6da'),
  makeBuildingSD('pz_res_nw_3', 'Pedro Zayco Residence NW-3', 'residential', 'NE', -84, -70, 82, 96, 5.0, 'gable', '#4e6e58', '#e5e2d8'),
  makeBuildingSD('pz_res_se_1', 'Pedro Zayco Commercial SE-1', 'commercial', 'NE', -54, -39, 36, 52, 5.8, 'gable', '#8f4739', '#ebe3d5'),
  makeBuildingSD('pz_res_se_2', 'Pedro Zayco Residence SE-2', 'residential', 'NE', -54, -39, 58, 74, 5.2, 'hip', '#546b7a', '#e9ecee'),
  makeBuildingSD('pz_res_se_3', 'Pedro Zayco Residence SE-3', 'residential', 'NE', -52, -38, 80, 94, 5.0, 'gable', '#7d4c3e', '#ede4d8'),

  // ---- URBAN FILL ALONG REPOLLO ST. ----
  makeRepolloBuilding('rep_res_w_1', 'Repollo Residence W-1', 42, -13.5, 16, 11, 5.2, '#8b4938', '#e9e1d5'),
  makeRepolloBuilding('rep_res_w_2', 'Repollo Residence W-2', 76, -13.5, 16, 11, 5.4, '#5a6f5e', '#e7e5dd'),
  makeRepolloBuilding('rep_res_e_1', 'Repollo Residence E-1', 36, 13.5, 16, 11, 5.4, '#4e6f7a', '#eceae4'),
  makeRepolloBuilding('rep_res_e_2', 'Repollo Residence E-2', 68, 13.5, 18, 12, 5.8, '#964e3d', '#ebe3d6'),
  makeRepolloBuilding('rep_res_e_3', 'Repollo Residence E-3', 100, 13.5, 16, 11, 5.0, '#6a5b4e', '#e8e0d4'),
];

// ---------------------------------------------------------------------------
// 5. Ceres Terminal Concrete Yard, Perimeter Walls, Staging Bays & Gate Gantries
// ---------------------------------------------------------------------------
export const TERMINAL_YARD_PADS = [
  {
    id: 'ceres_main_yard',
    label: 'Ceres Bus Terminal Concrete Yard & Forecourt',
    surface: 'concrete' as const,
    polygon: [
      sdToWorld(-20.8, -10.0),
      sdToWorld(41.0, -10.0),
      sdToWorld(41.0, -94.0),
      sdToWorld(-14.0, -94.0),
      sdToWorld(-20.8, -55.0),
    ],
  },
] as const;

export const PERIMETER_WALL_SPECS = [
  {
    id: 'wall_front_nw_pier',
    start: sdToWorld(-21.2, -9.6),
    end: sdToWorld(-18.0, -9.6),
    height: 2.2,
    thickness: 0.35,
  },
  {
    id: 'wall_front_center',
    start: sdToWorld(-5.0, -9.6),
    end: sdToWorld(25.5, -9.6),
    height: 2.2,
    thickness: 0.35,
  },
  {
    id: 'wall_front_se_pier',
    start: sdToWorld(38.5, -9.6),
    end: sdToWorld(41.5, -9.6),
    height: 2.2,
    thickness: 0.35,
  },
  {
    id: 'wall_side_se',
    start: sdToWorld(41.5, -9.6),
    end: sdToWorld(41.5, -94.0),
    height: 2.4,
    thickness: 0.35,
  },
  {
    id: 'wall_side_nw',
    start: sdToWorld(-21.2, -9.6),
    end: sdToWorld(-21.2, -55.0),
    height: 2.2,
    thickness: 0.35,
  },
] as const;

// 3 Marked Bus Staging Bays in the open yard facing Gate 2 (angled slightly toward Gate 2 throat)
const BAY_HEADING_NE = vecHeading(N_NE.x - 0.32 * T_SE.x, N_NE.z - 0.32 * T_SE.z);
export const STAGING_BAY_SPECS = [
  { id: 'ceres_bay_1', bayNumber: 1, center: sdToWorld(19.0, -72.0), heading: BAY_HEADING_NE, length: 13.5, width: 3.8 },
  { id: 'ceres_bay_2', bayNumber: 2, center: sdToWorld(11.0, -72.0), heading: BAY_HEADING_NE, length: 13.5, width: 3.8 },
  { id: 'ceres_bay_3', bayNumber: 3, center: sdToWorld(3.0, -72.0), heading: BAY_HEADING_NE, length: 13.5, width: 3.8 },
] as const;

// Gate Gantries: clearSpanWidth = 10.6m (> 2x bus width + swept path) and clearHeight = 5.2m -> ZERO bus clipping
const GATE1_HEADING = vecHeading(-N_NE.x, -N_NE.z); // Facing SW into terminal
const GATE2_HEADING = vecHeading(N_NE.x, N_NE.z); // Facing NE out onto National Rd
export const GATE_STRUCTURE_SPECS = [
  {
    id: 'gate_1_ingress' as const,
    label: 'Gate 1 — Bus Entrance',
    center: sdToWorld(JUNCTION_S.ceresGate1, -13.5),
    heading: GATE1_HEADING,
    clearSpanWidth: 10.6,
    clearHeight: 5.2,
    pillarLeft: sdToWorld(JUNCTION_S.ceresGate1 + 5.3, -13.5),
    pillarRight: sdToWorld(JUNCTION_S.ceresGate1 - 5.3, -13.5),
    signText: 'CERES TERMINAL — ENTRANCE (GATE 1)',
  },
  {
    id: 'gate_2_egress' as const,
    label: 'Gate 2 — Bus Exit',
    center: sdToWorld(JUNCTION_S.ceresGate2, -13.5),
    heading: GATE2_HEADING,
    clearSpanWidth: 10.6,
    clearHeight: 5.2,
    pillarLeft: sdToWorld(JUNCTION_S.ceresGate2 - 5.3, -13.5),
    pillarRight: sdToWorld(JUNCTION_S.ceresGate2 + 5.3, -13.5),
    signText: 'CERES TERMINAL — EXIT (GATE 2)',
  },
] as const;

// ---------------------------------------------------------------------------
// 6. Calibrated Tropical Trees (matching dense canopy zones in satellite tiles)
// ---------------------------------------------------------------------------
export const TREE_SPECS = [
  // Dense canopy cluster behind Ceres Terminal & City Health Office
  { id: 'tree_cho_1', position: sdToWorld(-40, -52), canopyRadius: 4.5, height: 8.5, species: 'tropical_shade' as const },
  { id: 'tree_cho_2', position: sdToWorld(-56, -56), canopyRadius: 5.0, height: 9.2, species: 'tropical_shade' as const },
  { id: 'tree_cho_3', position: sdToWorld(-84, -84), canopyRadius: 5.2, height: 9.5, species: 'tropical_shade' as const },
  { id: 'tree_cho_4', position: sdToWorld(-48, -112), canopyRadius: 4.8, height: 8.8, species: 'tropical_shade' as const },
  // Ceres yard perimeter shade trees (well clear of staging bays & loop)
  { id: 'tree_yard_1', position: sdToWorld(32, -88), canopyRadius: 4.4, height: 8.2, species: 'tropical_shade' as const },
  { id: 'tree_yard_2', position: sdToWorld(48, -62), canopyRadius: 5.2, height: 9.4, species: 'tropical_shade' as const },
  { id: 'tree_yard_3', position: sdToWorld(48, -84), canopyRadius: 4.8, height: 8.6, species: 'tropical_shade' as const },
  { id: 'tree_yard_4', position: sdToWorld(-5, -104), canopyRadius: 5.4, height: 9.8, species: 'tropical_shade' as const },
  { id: 'tree_yard_5', position: sdToWorld(20, -108), canopyRadius: 5.0, height: 9.0, species: 'tropical_shade' as const },
  // Large green grove behind MS Glass / KZ Motorparts / Repollo St. (prominent in tile_E.jpg!)
  { id: 'tree_ne_grove_1', position: sdToWorld(15, 42), canopyRadius: 5.5, height: 10.2, species: 'tropical_shade' as const },
  { id: 'tree_ne_grove_2', position: sdToWorld(28, 52), canopyRadius: 6.0, height: 11.0, species: 'tropical_shade' as const },
  { id: 'tree_ne_grove_3', position: sdToWorld(45, 46), canopyRadius: 5.8, height: 10.5, species: 'tropical_shade' as const },
  { id: 'tree_ne_grove_4', position: sdToWorld(64, 48), canopyRadius: 5.2, height: 9.6, species: 'tropical_shade' as const },
  { id: 'tree_ne_grove_5', position: sdToWorld(82, 42), canopyRadius: 5.6, height: 10.0, species: 'tropical_shade' as const },
  { id: 'tree_ne_grove_6', position: sdToWorld(52, 72), canopyRadius: 6.2, height: 11.4, species: 'tropical_shade' as const },
  // Palms & ornamentals along frontage setbacks (strictly outside sidewalks & driveways)
  { id: 'tree_palm_1', position: sdToWorld(10, -13.5), canopyRadius: 2.4, height: 7.4, species: 'palm' as const },
  { id: 'tree_palm_2', position: sdToWorld(43, -11.8), canopyRadius: 2.5, height: 7.8, species: 'palm' as const },
  { id: 'tree_palm_3', position: sdToWorld(-102, 12.0), canopyRadius: 2.6, height: 7.5, species: 'ornamental' as const },
  { id: 'tree_palm_4', position: sdToWorld(-35, 11.5), canopyRadius: 2.3, height: 6.8, species: 'ornamental' as const },
  { id: 'tree_palm_5', position: sdToWorld(83, 11.8), canopyRadius: 2.5, height: 7.2, species: 'palm' as const },
] as const;

// ---------------------------------------------------------------------------
// 7. Streetlight Placement s-positions along National Road (auto-skipping cutouts)
// ---------------------------------------------------------------------------
export const NATIONAL_STREETLIGHT_S: readonly number[] = [
  -145, -115, -85, -42, 0, 18, 52, 84, 116, 172,
];
