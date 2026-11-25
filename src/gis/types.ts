import type { LatLng, LocalBounds, SatelliteCoverageSpec } from './projection';

/**
 * Ground-plane 2D metric vector in Three.js right-handed coordinates:
 * +x = East, +z = South, -z = North.
 */
export interface Vec2 {
  readonly x: number;
  readonly z: number;
}

export interface ArcInterval {
  readonly sStart: number;
  readonly sEnd: number;
  readonly reason?: string;
}

/**
 * Uniformly arc-length-sampled point along a road or lane spline.
 * - `(tx, tz)`: unit forward tangent
 * - `(nx, nz)`: unit LEFT normal (`Up x T = (tz, -tx)`); right side is `(-nx, -nz)`
 * - `heading`: `Math.atan2(tx, tz)` (radians from +Z toward +X; matches Three.js `rotation.y` for +Z-forward meshes)
 */
export interface SamplePoint {
  readonly s: number;
  readonly x: number;
  readonly z: number;
  readonly tx: number;
  readonly tz: number;
  readonly nx: number;
  readonly nz: number;
  readonly heading: number;
  readonly curvature: number;
}

export type VehicleClass =
  | 'bus'
  | 'jeepney'
  | 'tricycle'
  | 'car'
  | 'truck'
  | 'motorcycle';

export type LanePriority = 1 | 2 | 3 | 4;

export type RoadClass = 'arterial' | 'collector' | 'local' | 'driveway' | 'perimeter';

export interface RoadSegment {
  readonly id: string;
  readonly name: string;
  readonly roadClass: RoadClass;
  readonly points: readonly Vec2[];
  readonly samples: readonly SamplePoint[];
  readonly length: number;
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

export interface LoadingZone {
  readonly id: string;
  readonly sStart: number;
  readonly sEnd: number;
  readonly side: 'left' | 'right';
  readonly kind: 'alighting' | 'boarding' | 'staging' | 'curbside';
}

export interface LaneEdge {
  readonly id: string;
  readonly roadId: string;
  readonly name: string;
  readonly direction: 'NW' | 'SE' | 'NE' | 'SW' | 'INBOUND' | 'OUTBOUND' | 'INTERNAL';
  /** 0 = outer/curb lane, 1 = inner/fast lane */
  readonly laneIndex: number;
  readonly width: number;
  /** Speed limit in m/s */
  readonly speedLimit: number;
  /** 1 = arterial through, 2 = turn/ingress, 3 = terminal egress, 4 = side-street egress */
  readonly priority: LanePriority;
  readonly points: readonly Vec2[];
  readonly samples: readonly SamplePoint[];
  readonly length: number;
  readonly nextLaneIds: readonly string[];
  readonly prevLaneIds: readonly string[];
  readonly adjacentLeftLaneId?: string;
  readonly adjacentRightLaneId?: string;
  readonly allowedVehicles: readonly VehicleClass[];
  readonly isTerminalInternal?: boolean;
  readonly loadingZones?: readonly LoadingZone[];
  readonly isEntry?: boolean;
  readonly isExit?: boolean;
  readonly isConnector?: boolean;
}

export interface ConflictParticipant {
  readonly laneId: string;
  readonly sStart: number;
  readonly sEnd: number;
  readonly stopBarS: number;
  readonly priority: LanePriority;
}

export interface ConflictZone {
  readonly id: string;
  readonly kind: 'crossing' | 'merge';
  readonly center: Vec2;
  readonly radius: number;
  readonly participants: readonly ConflictParticipant[];
}

export interface CrosswalkLaneRef {
  readonly laneId: string;
  readonly sCenter: number;
  readonly stopBarS: number;
}

export interface Crosswalk {
  readonly id: string;
  readonly roadId: string;
  readonly label: string;
  readonly roadS: number;
  readonly center: Vec2;
  readonly tangent: Vec2;
  /** Unit vector from SW/right curb to NE/left curb */
  readonly normal: Vec2;
  /** Band width measured along the road centerline */
  readonly width: number;
  readonly curbStart: Vec2;
  readonly curbEnd: Vec2;
  readonly length: number;
  readonly affectedLanes: readonly CrosswalkLaneRef[];
  readonly signalizedInScenario2: boolean;
}

export type BuildingCategory =
  | 'terminal_shed'
  | 'terminal_admin'
  | 'commercial'
  | 'civic'
  | 'hotel'
  | 'residential';

export type RoofStyle = 'gable' | 'shed_canopy' | 'flat' | 'hip';

export interface BuildingFootprint {
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

export interface TerminalYardPad {
  readonly id: string;
  readonly label: string;
  readonly polygon: readonly Vec2[];
  readonly surface: 'concrete' | 'asphalt';
}

export interface PerimeterWallSegment {
  readonly id: string;
  readonly start: Vec2;
  readonly end: Vec2;
  readonly height: number;
  readonly thickness: number;
}

export interface BusStagingBay {
  readonly id: string;
  readonly bayNumber: number;
  readonly center: Vec2;
  readonly heading: number;
  readonly length: number;
  readonly width: number;
}

export interface GateStructure {
  readonly id: 'gate_1_ingress' | 'gate_2_egress';
  readonly label: string;
  readonly center: Vec2;
  readonly heading: number;
  readonly clearSpanWidth: number;
  readonly clearHeight: number;
  readonly pillarLeft: Vec2;
  readonly pillarRight: Vec2;
  readonly signText: string;
}

export interface TreePlacement {
  readonly id: string;
  readonly position: Vec2;
  readonly canopyRadius: number;
  readonly height: number;
  readonly species: 'tropical_shade' | 'palm' | 'ornamental';
}

export interface StreetlightPlacement {
  readonly id: string;
  readonly position: Vec2;
  readonly heading: number;
  readonly roadId: string;
  readonly armDirection: Vec2;
  readonly height: number;
}

export interface RoadNetworkGraph {
  readonly origin: LatLng;
  readonly corridorBearingDeg: number;
  readonly corridorBounds: LocalBounds;
  readonly satelliteCoverage: SatelliteCoverageSpec;
  readonly roadSegments: readonly RoadSegment[];
  readonly lanes: readonly LaneEdge[];
  readonly laneById: Readonly<Record<string, LaneEdge>>;
  readonly conflictZones: readonly ConflictZone[];
  readonly crosswalks: readonly Crosswalk[];
  readonly buildings: readonly BuildingFootprint[];
  readonly yardPads: readonly TerminalYardPad[];
  readonly perimeterWalls: readonly PerimeterWallSegment[];
  readonly stagingBays: readonly BusStagingBay[];
  readonly gateStructures: readonly GateStructure[];
  readonly trees: readonly TreePlacement[];
  readonly streetlights: readonly StreetlightPlacement[];
}
