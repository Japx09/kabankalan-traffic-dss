// ─── Enums ──────────────────────────────────────────────────────────────────

export enum VehicleType {
  Bus = 'bus',
  Jeepney = 'jeepney',
  Tricycle = 'tricycle',
  PrivateCar = 'privateCar',
}

export enum PedestrianState {
  Waiting = 'waiting',
  Crossing = 'crossing',
  InConflict = 'inConflict',
  Completed = 'completed',
}

export enum VehicleState {
  Moving = 'moving',
  Braking = 'braking',
  Dwelling = 'dwelling',
  Queued = 'queued',
  Reversing = 'reversing',
  Adjusting = 'adjusting',
}

export enum ConflictType {
  VehiclePedestrian = 'vehicle-pedestrian',
  RearEnd = 'rear-end',
  Weaving = 'weaving',
  Crossing = 'crossing',
}

export enum LocationId {
  CeresTerminal = 'ceres-terminal',
  KCCFrontage = 'kcc-frontage',
  PublicMarket = 'public-market',
}

export enum ScenarioId {
  Baseline = 'scenario-0',
  DedicatedBay = 'scenario-1',
  StrictRegulation = 'scenario-2',
}

export enum LevelOfService {
  A = 'A',
  B = 'B',
  C = 'C',
  D = 'D',
  E = 'E',
  F = 'F',
}

// ─── Vehicle Dimensions (DPWH & AASHTO 1:1 Metric Standard) ────────────────

export const VEHICLE_DIMENSIONS: Record<VehicleType, { length: number; width: number; height: number }> = {
  [VehicleType.Bus]: { length: 12.0, width: 2.5, height: 3.4 },
  [VehicleType.Jeepney]: { length: 6.5, width: 1.8, height: 2.3 },
  [VehicleType.Tricycle]: { length: 2.2, width: 1.4, height: 1.8 },
  [VehicleType.PrivateCar]: { length: 4.8, width: 1.8, height: 1.5 },
};

// ─── Entity Interfaces ──────────────────────────────────────────────────────

export interface Vehicle {
  id: string;
  type: VehicleType;
  state: VehicleState;
  /** Position in meters along the corridor (x) and lateral offset (z) */
  position: { x: number; z: number };
  /** Speed in m/s */
  speed: number;
  /** Target speed in m/s */
  desiredSpeed: number;
  /** Heading angle in radians */
  heading: number;
  /** Lane index (0 = leftmost) */
  lane: number;
  /** Dwell timer (seconds remaining) — only for PT vehicles at loading zones */
  dwellTimer: number;
  /** Time entered the corridor (simulation seconds) */
  entryTime: number;
  /** Free-flow travel time for delay calculation */
  freeFlowTravelTime: number;
  /** Whether the vehicle is a public transport vehicle that will stop to load */
  isPublicTransport: boolean;
  /** Accumulated delay in seconds */
  accumulatedDelay: number;
  /** Whether the vehicle has already completed a dwell stop */
  hasDwelled: boolean;
  /** Whether the vehicle is currently illegally stopped/encroaching on a pedestrian crosswalk */
  isEncroachingCrosswalk?: boolean;
  /** Active OD route ID (e.g. ceres-egress-north, pedro-zayco-in) */
  routeId?: string;
  /** Curvilinear distance s (meters) along assigned spline route */
  distanceAlongRoute?: number;
  /** Whether currently waiting/yielding at a conflict point or gate apron */
  isYielding?: boolean;
  /** Yield wait timer (seconds) */
  yieldTimer?: number;
  /** Whether this is a parked standby vehicle in staging bay */
  isParkedStandby?: boolean;
  /** True if the vehicle is currently involved in an acute conflict (TTC < 1.5s) */
  isInConflict?: boolean;
  /** Dynamic lateral swept envelope width during wide turns (e.g. 6.5m for turning 11m bus) */
  sweptWidth?: number;
  /** Flag indicating wide-turning long vehicle */
  isWideTurningBus?: boolean;
  /** Phase in the terminal compound lifecycle: 'inbound' | 'alighting' | 'queued' | 'egress' */
  terminalPhase?: 'inbound' | 'alighting' | 'queued' | 'egress';
  /** Dispatch countdown timer for queued buses waiting in staging yard */
  dispatchTimer?: number;
  /** Timer tracking how long the vehicle has been stuck (velocity near 0 while moving) */
  stuckTimer?: number;
  /** Distance to traverse in reverse during anti-gridlock maneuver */
  reverseDistanceTarget?: number;
  /** Distance successfully reversed so far */
  reverseDistanceTraveled?: number;
}

export interface Pedestrian {
  id: string;
  state: PedestrianState;
  /** Position (x along corridor, z lateral) */
  position: { x: number; z: number };
  /** Speed in m/s */
  speed: number;
  /** Crossing direction: +1 or -1 on z-axis */
  crossingDirection: number;
  /** Target z-position when crossing */
  targetZ: number;
  /** Origin z-position */
  originZ: number;
  /** Whether this is a jaywalker (mid-block crossing) */
  isJaywalker: boolean;
  /** Crossing x-position (fixed during crossing) */
  crossingX: number;
  /** Wait timer before crossing */
  waitTimer: number;
  /** Assigned desire line ID */
  desireLineId?: string;
  /** Normalized progress along desire line (0 to 1) */
  pathProgress?: number;
}

export interface ConflictEvent {
  id: string;
  type: ConflictType;
  /** Position where conflict occurred */
  position: { x: number; z: number };
  /** TTC value at detection (seconds) */
  ttc: number;
  /** PET value at detection (seconds) — may be NaN if not applicable */
  pet: number;
  /** Simulation time when conflict was detected */
  time: number;
  /** Age of the marker in seconds (for fade-out) */
  age: number;
}

// ─── Metrics ────────────────────────────────────────────────────────────────

export interface SimulationMetrics {
  /** Average delay per vehicle (seconds/vehicle) */
  averageDelay: number;
  /** Average queue length (meters) */
  averageQueueLength: number;
  /** 95th percentile queue length (meters) */
  q95QueueLength: number;
  /** Level of Service */
  los: LevelOfService;
  /** Total conflicts by type */
  conflictCounts: Record<ConflictType, number>;
  /** Critical conflicts per hour (TTC <= 1.5s or PET <= 1.0s) */
  criticalConflictsPerHour: number;
  /** Total vehicles processed */
  vehiclesProcessed: number;
  /** Total pedestrians processed */
  pedestriansProcessed: number;
  /** Current vehicle count in corridor */
  activeVehicles: number;
  /** Current pedestrian count */
  activePedestrians: number;
  /** Total pedestrian crosswalk obstruction / blocking violations */
  crosswalkViolations: number;
}

// ─── Simulation Parameters ──────────────────────────────────────────────────

export interface SimulationParameters {
  /** Vehicles per hour by type */
  vehicleInflow: Record<VehicleType, number>;
  /** Public transport dwell time in seconds */
  dwellTime: number;
  /** Pedestrians per minute */
  pedestrianVolume: number;
  /** Jaywalking probability (0-1) */
  jaywalkingProbability: number;
  /** Selected location */
  location: LocationId;
  /** Selected scenario */
  scenario: ScenarioId;
  /** Simulation speed multiplier */
  speedMultiplier: number;
  /** Bus scheduled headway dispatch interval in seconds (default 60s) */
  busHeadway: number;
}

export type TrafficSignalPhase = 'green' | 'yellow' | 'red';

// ─── Corridor Configuration ─────────────────────────────────────────────────

export interface LaneConfig {
  /** Center z-offset of this lane */
  centerZ: number;
  /** Direction: +1 = positive x, -1 = negative x */
  direction: number;
}

export interface CrosswalkConfig {
  /** X-position along corridor */
  x: number;
  /** Width of crosswalk in meters */
  width: number;
  /** Whether it has signal control */
  signalized: boolean;
  /** Optional stop bar distance upstream (default 2.5m) */
  stopLineOffset?: number;
}

export interface LoadingZoneConfig {
  /** X-position start */
  xStart: number;
  /** X-position end */
  xEnd: number;
  /** Z-position (lateral offset, positive = right side) */
  z: number;
  /** Whether it's a formal dedicated bay (vs informal curb) */
  isDedicated: boolean;
}

export interface LandmarkConfig {
  id: string;
  name: string;
  category: 'terminal' | 'commercial' | 'convenience' | 'hardware' | 'pharmacy' | 'institution';
  position: { x: number; z: number };
  dimensions: { width: number; height: number; depth: number };
  color: string;
  roofColor?: string;
  signText?: string;
  signColor?: string;
}

export interface SideStreetConfig {
  id?: string;
  name: string;
  x: number;
  width: number;
  side: 'north' | 'south'; // negative Z (north) or positive Z (south)
  length?: number;
  angle?: number; // radians offset from perpendicular
  hasStopBar?: boolean;
}

export interface TerminalYardConfig {
  x: number;
  z: number;
  width: number;
  depth: number;
  /** Gate 1: Entrance / Ingress Gate (downstream) */
  gate1X: number;
  gate1Z: number;
  gate1Width: number;
  /** Gate 2: Exit / Egress Gate (upstream) */
  gate2X: number;
  gate2Z: number;
  gate2Width: number;
  // Legacy / fallback fields
  gateX?: number;
  gateZ?: number;
  gateWidth?: number;
  stagingBays: Array<{ x: number; z: number; heading: number }>;
}

export interface CorridorConfig {
  id: LocationId;
  name: string;
  description: string;
  /** Official street name (e.g. Pedro Zayco Sr. St.) */
  streetName?: string;
  /** Total corridor length in meters */
  length: number;
  /** Road width in meters */
  roadWidth: number;
  /** Sidewalk width each side */
  sidewalkWidth: number;
  /** Lane configurations */
  lanes: LaneConfig[];
  /** Crosswalk positions */
  crosswalks: CrosswalkConfig[];
  /** Loading zones */
  loadingZones: LoadingZoneConfig[];
  /** Whether corridor has median/barrier */
  hasMedian: boolean;
  /** Default speed limit in m/s */
  speedLimit: number;
  /** Spawn rates scale factor for this corridor */
  spawnScale: number;
  /** Real-world landmark buildings */
  landmarks?: LandmarkConfig[];
  /** Side streets / intersections */
  sideStreets?: SideStreetConfig[];
  /** Off-street terminal yard configuration (e.g. Ceres Terminal compound) */
  terminalYard?: TerminalYardConfig;
}

// ─── Scenario Configuration ─────────────────────────────────────────────────

export interface ScenarioConfig {
  id: ScenarioId;
  name: string;
  description: string;
  /** Override loading zones to dedicated bays */
  dedicatedBays: boolean;
  /** Whether physical barriers/median islands are present */
  hasBarrier: boolean;
  /** Max dwell time override (null = no cap) */
  maxDwellTime: number | null;
  /** Whether crossings are signalized */
  signalizedCrossings: boolean;
  /** Jaywalking probability override (null = use slider) */
  jaywalkingOverride: number | null;
}
