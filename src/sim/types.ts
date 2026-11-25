import type { RoadNetworkGraph, Vec2, VehicleClass } from '@/gis/types';

export type SimVehicleType = 'bus' | 'jeepney' | 'tricycle' | 'car';

export type ScenarioId = 'baseline' | 'dedicated-bays' | 'signalized-overpass';

export type GroundMode = 'game' | 'satellite' | 'cad';

export type CameraPresetId = 'isometric' | 'gates' | 'junction' | 'topdown';

export type LevelOfService = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

export type VehicleState =
  | 'cruising'
  | 'braking'
  | 'yielding'
  | 'lane_changing'
  | 'dwelling'
  | 'queued';

export type TerminalPhase =
  | 'none'
  | 'ingress'
  | 'alighting'
  | 'staging'
  | 'egress';

export type PedestrianState = 'waiting' | 'crossing' | 'in_conflict' | 'completed';

export type ConflictType = 'rear_end' | 'crossing' | 'weaving' | 'vehicle_pedestrian';

export interface VehicleDimensions {
  readonly length: number;
  readonly width: number;
  readonly height: number;
}

/** DPWH / AASHTO 1:1 Metric Dimensions */
export const VEHICLE_DIMENSIONS: Readonly<Record<SimVehicleType, VehicleDimensions>> = {
  bus: { length: 12.0, width: 2.5, height: 3.4 },
  jeepney: { length: 6.5, width: 1.85, height: 2.3 },
  tricycle: { length: 2.3, width: 1.4, height: 1.8 },
  car: { length: 4.7, width: 1.85, height: 1.55 },
};

export interface ScenarioSpec {
  readonly id: ScenarioId;
  readonly name: string;
  readonly shortName: string;
  readonly description: string;
  readonly dedicatedBaysOnly: boolean;
  readonly signalizedCrossings: boolean;
  readonly hasPedestrianOverpass: boolean;
  readonly maxDwellSeconds: number | null;
  readonly jaywalkingRate: number;
}

export const SCENARIOS: Readonly<Record<ScenarioId, ScenarioSpec>> = {
  baseline: {
    id: 'baseline',
    name: 'Scenario 0: Existing Baseline',
    shortName: 'Baseline',
    description: 'Unregulated curbside loading, jaywalking, unsignalized Pedro Zayco & Ceres frontage',
    dedicatedBaysOnly: false,
    signalizedCrossings: false,
    hasPedestrianOverpass: false,
    maxDwellSeconds: null,
    jaywalkingRate: 0.42,
  },
  'dedicated-bays': {
    id: 'dedicated-bays',
    name: 'Scenario 1: Dedicated PUV Bays',
    shortName: 'Dedicated Bays',
    description: 'Enforced off-street loading bays, capped PUV dwell (12s), disciplined Ceres terminal staging',
    dedicatedBaysOnly: true,
    signalizedCrossings: false,
    hasPedestrianOverpass: false,
    maxDwellSeconds: 12,
    jaywalkingRate: 0.22,
  },
  'signalized-overpass': {
    id: 'signalized-overpass',
    name: 'Scenario 2: Signalized + Overpass',
    shortName: 'Signalized',
    description: 'Actuated crossing signals, Ceres frontage pedestrian overpass (zero highway jaywalking), capped dwell',
    dedicatedBaysOnly: true,
    signalizedCrossings: true,
    hasPedestrianOverpass: true,
    maxDwellSeconds: 10,
    jaywalkingRate: 0.0,
  },
};

export interface SimulationParams {
  scenario: ScenarioId;
  playbackSpeed: number; // 0.5 | 1 | 2 | 4
  busHeadwaySeconds: number; // 20 - 120s
  jeepneyRatePerHour: number; // 20 - 240
  tricycleRatePerHour: number; // 40 - 400
  carRatePerHour: number; // 60 - 500
  pedestrianRatePerHour: number; // 30 - 300
  seed: number;
}

export const DEFAULT_SIM_PARAMS: SimulationParams = {
  scenario: 'baseline',
  playbackSpeed: 1,
  busHeadwaySeconds: 38,
  jeepneyRatePerHour: 110,
  tricycleRatePerHour: 190,
  carRatePerHour: 240,
  pedestrianRatePerHour: 140,
  seed: 202609,
};

export interface VehicleAgent {
  id: string;
  type: SimVehicleType;
  laneId: string;
  /** Arc-length along current lane (meters) */
  s: number;
  /** Planned upcoming lane IDs */
  routeQueue: string[];
  /** World-space position (meters, Three.js +X East, +Z South) */
  position: Vec2;
  /** Yaw radians: Math.atan2(tx, tz), matches Three.js rotation.y for +Z forward */
  heading: number;
  /** Current longitudinal velocity (m/s) */
  speed: number;
  /** Desired free-flow speed (m/s) */
  desiredSpeed: number;
  /** Current acceleration (m/s²) */
  acc: number;
  /** Current lateral offset relative to lane centerline (+ = left normal, - = right normal) */
  lateralOffset: number;
  /** Target lateral offset for tricycle curb pull / obstacle passing */
  targetLateralOffset: number;
  /** Smooth lane-change progress (0..1) when switching adjacent lanes via MOBIL */
  laneChangeProgress: number;
  /** Previous lane world offset when animating a lane change */
  laneChangeFromOffset: number;
  /** Turn indicator for visual 3D blinker */
  turnSignal: 'none' | 'left' | 'right';
  state: VehicleState;
  terminalPhase: TerminalPhase;
  stagingBayIndex: number | null;
  dwellTimer: number;
  hasDwelled: boolean;
  entryTime: number;
  accumulatedDelay: number;
  controlDelay: number;
  stoppedDelay: number;
  /** Coordination & Debug telemetry */
  leaderVehicleId: string | null;
  leaderGapMeters: number | null;
  yieldingReason: string | null;
  conflictingVehicleId: string | null;
  activeConflictZoneId: string | null;
  isBrakingLightOn: boolean;
  mobilCooldown: number;
  colorVariant: number;
  /** Trail history (last N world positions) */
  trail: Vec2[];
}

export interface PedestrianAgent {
  id: string;
  crosswalkId: string;
  position: Vec2;
  heading: number;
  speed: number;
  /** 0..1 progress across curbStart -> curbEnd */
  progress: number;
  /** +1 (curbStart -> curbEnd) or -1 (reverse) */
  direction: 1 | -1;
  isJaywalking: boolean;
  lateralShift: number;
  state: PedestrianState;
  waitTime: number;
  usingOverpass: boolean;
  shirtColor: string;
}

export interface ConflictEvent {
  id: string;
  time: number;
  type: ConflictType;
  location: Vec2;
  ttc: number;
  pet: number | null;
  entity1Id: string;
  entity2Id: string;
  severity: 'moderate' | 'critical';
  age: number;
}

export interface SimulationFault {
  id: string;
  time: number;
  location: Vec2;
  entity1Id: string;
  entity2Id: string;
  overlapMeters: number;
}

export interface SignalState {
  enabled: boolean;
  vehicularPhase: 'green' | 'yellow' | 'red';
  pedestrianPhase: 'walk' | 'flashing' | 'dont_walk';
  phaseRemainingSeconds: number;
}

export interface TelemetryPoint {
  time: number;
  avgSpeedKph: number;
  avgDelaySec: number;
  queueLength: number;
  activeVehicles: number;
  conflictsPerMin: number;
}

export interface SimulationMetrics {
  activeVehicles: number;
  totalExited: number;
  throughputVehPerHour: number;
  avgSpeedKph: number;
  avgControlDelaySec: number;
  queueVehicles: number;
  queueLengthMeters: number;
  los: LevelOfService;
  totalConflicts: number;
  rearEndConflicts: number;
  crossingConflicts: number;
  weavingConflicts: number;
  pedestrianConflicts: number;
  criticalConflicts: number;
  laneChangesCompleted: number;
  faultCount: number;
}

export interface ScenarioSnapshot {
  scenario: ScenarioId;
  simTime: number;
  metrics: SimulationMetrics;
}

export interface SimulationState {
  graph: RoadNetworkGraph;
  simTime: number;
  vehicles: VehicleAgent[];
  pedestrians: PedestrianAgent[];
  conflicts: ConflictEvent[];
  faults: SimulationFault[];
  signalState: SignalState;
  metrics: SimulationMetrics;
  telemetryHistory: TelemetryPoint[];
  totalExitedCount: number;
  totalControlDelaySum: number;
  totalConflictsEver: number;
  conflictCountsByType: Record<ConflictType, number>;
  criticalConflictsEver: number;
  laneChangesCompleted: number;
  nextEntityId: number;
  lastBusSpawnTime: number;
  lastTelemetrySampleTime: number;
  rngState: number;
}

export interface OverlayToggles {
  groundMode: GroundMode;
  showLaneSplines: boolean;
  showConflictZones: boolean;
  showBoundingBoxes: boolean;
  showTrails: boolean;
  showLandmarks: boolean;
  showConflictPulses: boolean;
}

export type VehicleClassFilter = VehicleClass;
