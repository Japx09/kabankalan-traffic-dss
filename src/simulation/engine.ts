import {
  Vehicle,
  Pedestrian,
  ConflictEvent,
  SimulationParameters,
  SimulationMetrics,
  VehicleType,
  VehicleState,
  ManeuverState,
  PedestrianState,
  CorridorConfig,
  LocationId,
  SimulationFault,
} from './types';
import { CORRIDORS, SCENARIOS, applyScenarioToCorridor } from './corridors';
import { updateVehicles, removeExitedVehicles, resetFaultEngine } from './vehicles';
import { trySpawnPedestrian, updatePedestrians, removeCompletedPedestrians, resetPedestrianIds } from './pedestrians';
import { detectDeduplicatedConflicts, ageConflicts, resetConflictEngine } from './conflicts';
import { computeMetrics, sampleCurrentQueue } from './metrics';
import {
  ArrivalManager,
  createArrivalManager,
  processVehicleArrivals,
  resetArrivalSequence,
} from './arrivals';
import { TrafficSignalState, getSignalState } from './signals';
import { setSeed } from './random';
import {
  ALL_ROUTES,
  evaluateRoute,
  getPedDesireLinesForLocation,
  evaluatePedDesireLine,
} from './routes';

export const FIXED_PHYSICS_DT = 0.05; // 20 Hz fixed physics timestep

export interface SimulationState {
  vehicles: Vehicle[];
  pedestrians: Pedestrian[];
  conflicts: ConflictEvent[];
  allConflicts: ConflictEvent[];
  faults: SimulationFault[];
  allFaults: SimulationFault[];
  metrics: SimulationMetrics;
  simTime: number;
  exitedVehicles: Vehicle[];
  completedPedestrians: Pedestrian[];
  corridor: CorridorConfig;
  arrivalManager: ArrivalManager;
  signalState: TrafficSignalState;
  totalTravelDelayAccumulated: number;
  totalControlDelayAccumulated: number;
  totalStoppedDelayAccumulated: number;
  totalVehiclesExited: number;
  queueSamplesMeters: number[];
  queueSamplesVehicles: number[];
  lastQueueSampleTime: number;
}

function seedInitialVehicles(corridor: CorridorConfig): Vehicle[] {
  if (corridor.id === LocationId.CeresTerminal) {
    // 1. Two staging buses idling in queue inside Ceres terminal yard with active dispatch timers
    const bay1 = corridor.terminalYard?.stagingBays[0] || { x: 114, z: 28, heading: 0 };
    const bay2 = corridor.terminalYard?.stagingBays[1] || { x: 128, z: 28, heading: 0 };

    const bus1: Vehicle = {
      id: 'v-staging-1',
      type: VehicleType.Bus,
      state: VehicleState.Queued,
      maneuverState: ManeuverState.Queued,
      position: { x: bay1.x, z: bay1.z },
      speed: 0,
      desiredSpeed: 6.94,
      heading: bay1.heading,
      lane: 0,
      dwellTimer: 0,
      dispatchTimer: 6.0,
      scheduledDepartureTime: 6.0,
      entryTime: 0,
      freeFlowTravelTime: 35,
      isPublicTransport: true,
      accumulatedDelay: 0,
      stoppedDelay: 0,
      controlDelay: 0,
      stoppedDuration: 0,
      hasDwelled: false,
      isParkedStandby: false,
      terminalPhase: 'queued',
      routeId: 'ceres_egress_north',
      distanceAlongRoute: 0,
    };

    const bus2: Vehicle = {
      id: 'v-staging-2',
      type: VehicleType.Bus,
      state: VehicleState.Queued,
      maneuverState: ManeuverState.Queued,
      position: { x: bay2.x, z: bay2.z },
      speed: 0,
      desiredSpeed: 6.94,
      heading: bay2.heading,
      lane: 0,
      dwellTimer: 0,
      dispatchTimer: 24.0,
      scheduledDepartureTime: 24.0,
      entryTime: 0,
      freeFlowTravelTime: 35,
      isPublicTransport: true,
      accumulatedDelay: 0,
      stoppedDelay: 0,
      controlDelay: 0,
      stoppedDuration: 0,
      hasDwelled: false,
      isParkedStandby: false,
      terminalPhase: 'queued',
      routeId: 'ceres_egress_south',
      distanceAlongRoute: 0,
    };

    // 2. Ceres Inbound Bus on Guanzon St approaching Gate 1 (Ingress)
    const ingressRoute = ALL_ROUTES['ceres_ingress_gate1'];
    const ingressS = 110;
    const ingressPt = ingressRoute ? evaluateRoute(ingressRoute, ingressS) : { x: 110, z: 2.5, heading: 0 };
    const inboundBus: Vehicle = {
      id: 'v-inbound-bus',
      type: VehicleType.Bus,
      state: VehicleState.Moving,
      maneuverState: ManeuverState.Cruise,
      position: { x: ingressPt.x, z: ingressPt.z },
      speed: 5.8,
      desiredSpeed: 7.5,
      heading: ingressPt.heading,
      lane: 0,
      dwellTimer: 0,
      entryTime: 0,
      freeFlowTravelTime: (ingressRoute?.length ?? 160) / 7.5,
      isPublicTransport: true,
      accumulatedDelay: 0,
      stoppedDelay: 0,
      controlDelay: 0,
      stoppedDuration: 0,
      hasDwelled: false,
      routeId: 'ceres_ingress_gate1',
      distanceAlongRoute: ingressS,
      terminalPhase: 'inbound',
    };

    // 3. Ceres Bus advancing through Gate 2 egress apron executing wide departure turn
    const egressRoute = ALL_ROUTES['ceres_egress_north'];
    const egressS = 22.0; // Holding threshold
    const egressPt = egressRoute ? evaluateRoute(egressRoute, egressS) : { x: 103, z: 7.5, heading: -2.35 };
    const egressBus: Vehicle = {
      id: 'v-ceres-egress',
      type: VehicleType.Bus,
      state: VehicleState.Moving,
      maneuverState: ManeuverState.Approach,
      position: { x: egressPt.x, z: egressPt.z },
      speed: 2.2,
      desiredSpeed: 6.94,
      heading: egressPt.heading,
      lane: 0,
      dwellTimer: 0,
      entryTime: 0,
      freeFlowTravelTime: egressRoute ? egressRoute.length / 6.94 : 35,
      isPublicTransport: true,
      accumulatedDelay: 0,
      stoppedDelay: 0,
      controlDelay: 0,
      stoppedDuration: 0,
      hasDwelled: false,
      routeId: 'ceres_egress_north',
      distanceAlongRoute: egressS,
      isWideTurningBus: true,
      sweptWidth: 6.5,
      isYielding: false,
      yieldTimer: 0,
      terminalPhase: 'egress',
    };

    // 4. Guanzon St Southbound Jeepney
    const sbRoute = ALL_ROUTES['ceres_hw_sb'];
    const sbS = 35;
    const sbPt = sbRoute ? evaluateRoute(sbRoute, sbS) : { x: 35, z: 2.5, heading: 0 };
    const sbJeepney: Vehicle = {
      id: 'v-sb-jeepney',
      type: VehicleType.Jeepney,
      state: VehicleState.Moving,
      maneuverState: ManeuverState.Cruise,
      position: { x: sbPt.x, z: sbPt.z },
      speed: 6.5,
      desiredSpeed: 8.33,
      heading: sbPt.heading,
      lane: 0,
      dwellTimer: 0,
      entryTime: 0,
      freeFlowTravelTime: (sbRoute?.length ?? 220) / 8.33,
      isPublicTransport: true,
      accumulatedDelay: 0,
      stoppedDelay: 0,
      controlDelay: 0,
      stoppedDuration: 0,
      hasDwelled: false,
      routeId: 'ceres_hw_sb',
      distanceAlongRoute: sbS,
    };

    // 5. Guanzon St Northbound Private Car
    const nbRoute = ALL_ROUTES['ceres_hw_nb'];
    const nbS = 70;
    const nbPt = nbRoute ? evaluateRoute(nbRoute, nbS) : { x: 150, z: -2.5, heading: Math.PI };
    const nbCar: Vehicle = {
      id: 'v-nb-car',
      type: VehicleType.PrivateCar,
      state: VehicleState.Moving,
      maneuverState: ManeuverState.Cruise,
      position: { x: nbPt.x, z: nbPt.z },
      speed: 8.0,
      desiredSpeed: 10.0,
      heading: nbPt.heading,
      lane: 0,
      dwellTimer: 0,
      entryTime: 0,
      freeFlowTravelTime: (nbRoute?.length ?? 220) / 10.0,
      isPublicTransport: false,
      accumulatedDelay: 0,
      stoppedDelay: 0,
      controlDelay: 0,
      stoppedDuration: 0,
      hasDwelled: false,
      routeId: 'ceres_hw_nb',
      distanceAlongRoute: nbS,
    };

    // 6. Pedro Zayco Sr. St Egress Tricycle (Stationed before stop bar)
    const zaycoRoute = ALL_ROUTES['ceres_pedro_zayco_out_sb'];
    const zaycoS = 18;
    const zaycoPt = zaycoRoute ? evaluateRoute(zaycoRoute, zaycoS) : { x: 64, z: -22, heading: Math.PI / 2 };
    const zaycoTrike: Vehicle = {
      id: 'v-zayco-trike',
      type: VehicleType.Tricycle,
      state: VehicleState.Moving,
      maneuverState: ManeuverState.Approach,
      position: { x: zaycoPt.x, z: zaycoPt.z },
      speed: 4.5,
      desiredSpeed: 5.56,
      heading: zaycoPt.heading,
      lane: 0,
      dwellTimer: 0,
      entryTime: 0,
      freeFlowTravelTime: (zaycoRoute?.length ?? 180) / 5.56,
      isPublicTransport: true,
      accumulatedDelay: 0,
      stoppedDelay: 0,
      controlDelay: 0,
      stoppedDuration: 0,
      hasDwelled: false,
      routeId: 'ceres_pedro_zayco_out_sb',
      distanceAlongRoute: zaycoS,
    };

    return [bus1, bus2, inboundBus, egressBus, sbJeepney, nbCar, zaycoTrike];
  } else if (corridor.id === LocationId.KCCFrontage) {
    const dropoffRoute = ALL_ROUTES['kcc_student_dropoff'];
    const dropoffS = 85;
    const dropoffPt = dropoffRoute ? evaluateRoute(dropoffRoute, dropoffS) : { x: 80, z: -4.5, heading: Math.PI };
    const dropoffJeep: Vehicle = {
      id: 'v-kcc-dropoff',
      type: VehicleType.Jeepney,
      state: VehicleState.Dwelling,
      maneuverState: ManeuverState.Dwelling,
      position: { x: dropoffPt.x, z: dropoffPt.z },
      speed: 0,
      desiredSpeed: 8.33,
      heading: dropoffPt.heading,
      lane: 0,
      dwellTimer: 20,
      entryTime: 0,
      freeFlowTravelTime: 25,
      isPublicTransport: true,
      accumulatedDelay: 0,
      stoppedDelay: 0,
      controlDelay: 0,
      stoppedDuration: 0,
      hasDwelled: false,
      routeId: 'kcc_student_dropoff',
      distanceAlongRoute: dropoffS,
    };

    const forkRoute = ALL_ROUTES['kcc_aquiles_zayco_branch'];
    const forkS = 90;
    const forkPt = forkRoute ? evaluateRoute(forkRoute, forkS) : { x: 90, z: 2.5, heading: 0.35 };
    const forkTrike: Vehicle = {
      id: 'v-kcc-fork',
      type: VehicleType.Tricycle,
      state: VehicleState.Moving,
      maneuverState: ManeuverState.Approach,
      position: { x: forkPt.x, z: forkPt.z },
      speed: 4.8,
      desiredSpeed: 5.56,
      heading: forkPt.heading,
      lane: 0,
      dwellTimer: 0,
      entryTime: 0,
      freeFlowTravelTime: 22,
      isPublicTransport: true,
      accumulatedDelay: 0,
      stoppedDelay: 0,
      controlDelay: 0,
      stoppedDuration: 0,
      hasDwelled: false,
      routeId: 'kcc_aquiles_zayco_branch',
      distanceAlongRoute: forkS,
    };

    return [dropoffJeep, forkTrike];
  } else {
    // Public Market Corridor
    const ebRoute = ALL_ROUTES['market_corridor_eb'];
    const ebPt = ebRoute ? evaluateRoute(ebRoute, 45) : { x: 45, z: 2.5, heading: 0 };
    const ebTrike: Vehicle = {
      id: 'v-mkt-trike-1',
      type: VehicleType.Tricycle,
      state: VehicleState.Moving,
      maneuverState: ManeuverState.Cruise,
      position: { x: ebPt.x, z: ebPt.z },
      speed: 4.5,
      desiredSpeed: 5.56,
      heading: ebPt.heading,
      lane: 0,
      dwellTimer: 0,
      entryTime: 0,
      freeFlowTravelTime: 20,
      isPublicTransport: true,
      accumulatedDelay: 0,
      stoppedDelay: 0,
      controlDelay: 0,
      stoppedDuration: 0,
      hasDwelled: false,
      routeId: 'market_corridor_eb',
      distanceAlongRoute: 45,
    };

    return [ebTrike];
  }
}

function seedInitialPedestrians(corridor: CorridorConfig): Pedestrian[] {
  const desireLines = getPedDesireLinesForLocation(corridor.id);
  if (desireLines.length >= 2) {
    const p1Pt = evaluatePedDesireLine(desireLines[0], 0.35);
    const p2Pt = evaluatePedDesireLine(desireLines[1], 0.65);
    return [
      {
        id: 'p-init-1',
        state: PedestrianState.Crossing,
        position: { x: p1Pt.x, z: p1Pt.z },
        speed: 1.2,
        crossingDirection: 1,
        targetZ: 0,
        originZ: p1Pt.z,
        isJaywalker: false,
        crossingX: p1Pt.x,
        waitTimer: 0,
        desireLineId: desireLines[0].id,
        pathProgress: 0.35,
      },
      {
        id: 'p-init-2',
        state: PedestrianState.Crossing,
        position: { x: p2Pt.x, z: p2Pt.z },
        speed: 1.1,
        crossingDirection: -1,
        targetZ: 0,
        originZ: p2Pt.z,
        isJaywalker: false,
        crossingX: p2Pt.x,
        waitTimer: 0,
        desireLineId: desireLines[1].id,
        pathProgress: 0.65,
      },
    ];
  }
  const firstCw = corridor.crosswalks[0] ?? { x: 80, width: 4 };
  return [
    {
      id: 'p-init-1',
      state: PedestrianState.Crossing,
      position: { x: firstCw.x - 0.5, z: -1.5 },
      speed: 1.2,
      crossingDirection: 1,
      targetZ: corridor.roadWidth / 2 + 1.5,
      originZ: -(corridor.roadWidth / 2 + 1.5),
      isJaywalker: false,
      crossingX: firstCw.x,
      waitTimer: 0,
    },
  ];
}

/**
 * Initialize a clean, reproducible simulation run.
 */
export function initSimulation(params: SimulationParameters): SimulationState {
  setSeed(params.seed ?? 12345);
  resetArrivalSequence();
  resetPedestrianIds();
  resetConflictEngine();
  resetFaultEngine();

  const baseCorridor = CORRIDORS[params.location];
  const scenario = SCENARIOS[params.scenario];
  const corridor = applyScenarioToCorridor(baseCorridor, scenario);

  const initialVehicles = seedInitialVehicles(corridor);
  const initialPedestrians = seedInitialPedestrians(corridor);
  const arrivalManager = createArrivalManager();
  const signalState = getSignalState(0, scenario.signalizedCrossings);

  const initialMetrics = computeMetrics(
    initialVehicles,
    initialPedestrians,
    [],
    [],
    [],
    0,
    0,
    0,
    0,
    0,
    [0],
    [0],
    0,
    0,
    0,
    scenario.signalizedCrossings
  );

  return {
    vehicles: initialVehicles,
    pedestrians: initialPedestrians,
    conflicts: [],
    allConflicts: [],
    faults: [],
    allFaults: [],
    metrics: initialMetrics,
    simTime: 0,
    exitedVehicles: [],
    completedPedestrians: [],
    corridor,
    arrivalManager,
    signalState,
    totalTravelDelayAccumulated: 0,
    totalControlDelayAccumulated: 0,
    totalStoppedDelayAccumulated: 0,
    totalVehiclesExited: 0,
    queueSamplesMeters: [0],
    queueSamplesVehicles: [0],
    lastQueueSampleTime: 0,
  };
}

/**
 * Advance the simulation by one exact fixed physics time step dt.
 */
export function stepSimulation(
  state: SimulationState,
  params: SimulationParameters,
  dt: number = FIXED_PHYSICS_DT
): SimulationState {
  const scenario = SCENARIOS[params.scenario];
  const newSimTime = state.simTime + dt;

  // 1. Signal Phase Update
  const signalState = getSignalState(newSimTime, scenario.signalizedCrossings);

  // 2. Process Arrivals from Platooned Demand & Entry Queues
  const { insertedVehicles, pendingQueueCount, unmetDemandCount } = processVehicleArrivals(
    state.arrivalManager,
    newSimTime,
    dt,
    state.corridor,
    state.vehicles,
    params.vehicleInflow,
    params.busHeadway,
    params.platoonCycle ?? 90,
    params.platoonReleaseDuration ?? 45
  );

  let currentVehicles = [...state.vehicles, ...insertedVehicles];

  // 3. Process Pedestrian Arrivals
  const effectiveJaywalking = scenario.jaywalkingOverride ?? params.jaywalkingProbability;
  const spawnedPed = trySpawnPedestrian(
    params.pedestrianVolume,
    effectiveJaywalking,
    dt,
    state.corridor,
    state.pedestrians
  );
  let currentPedestrians = spawnedPed ? [...state.pedestrians, spawnedPed] : [...state.pedestrians];

  // 4. Update Vehicles (Synchronous Snapshot Decisions + Kinematics)
  const { updatedVehicles, faults: stepFaults } = updateVehicles(
    currentVehicles,
    dt,
    newSimTime,
    state.corridor,
    params.dwellTime,
    scenario.maxDwellTime,
    currentPedestrians,
    scenario.signalizedCrossings
  );

  // 5. Update Pedestrians (Gap Acceptance + Signals)
  const updatedPedestrians = updatePedestrians(
    currentPedestrians,
    updatedVehicles,
    dt,
    newSimTime,
    scenario.signalizedCrossings
  );

  // 6. SSAM-Inspired Deduplicated Conflict Detection
  const newConflictEvents = detectDeduplicatedConflicts(
    updatedVehicles,
    updatedPedestrians,
    newSimTime
  );

  const updatedConflicts = ageConflicts(
    [...state.conflicts, ...newConflictEvents],
    dt
  );

  // 7. Remove Exited Entities & Accumulate Delays
  const { remaining: remainingVehicles, exited } = removeExitedVehicles(
    updatedVehicles,
    state.corridor.length
  );
  const { remaining: remainingPeds, completed } = removeCompletedPedestrians(updatedPedestrians);

  const newlyExitedTravelDelay = exited.reduce((sum, v) => sum + v.accumulatedDelay, 0);
  const newlyExitedControlDelay = exited.reduce((sum, v) => sum + v.controlDelay, 0);
  const newlyExitedStoppedDelay = exited.reduce((sum, v) => sum + v.stoppedDelay, 0);

  const totalTravelDelayAccumulated = state.totalTravelDelayAccumulated + newlyExitedTravelDelay;
  const totalControlDelayAccumulated = state.totalControlDelayAccumulated + newlyExitedControlDelay;
  const totalStoppedDelayAccumulated = state.totalStoppedDelayAccumulated + newlyExitedStoppedDelay;
  const totalVehiclesExited = state.totalVehiclesExited + exited.length;

  const exitedVehicles = [...state.exitedVehicles, ...exited].slice(-300);
  const completedPedestrians = [...state.completedPedestrians, ...completed].slice(-250);
  const allConflicts = [...state.allConflicts, ...newConflictEvents].slice(-600);
  const allFaults = [...state.allFaults, ...stepFaults].slice(-300);

  // 8. Empirical Periodic Queue Sampling (Once every 1.0 second)
  let queueSamplesMeters = state.queueSamplesMeters;
  let queueSamplesVehicles = state.queueSamplesVehicles;
  let lastQueueSampleTime = state.lastQueueSampleTime;

  if (newSimTime - lastQueueSampleTime >= 1.0) {
    const sample = sampleCurrentQueue(remainingVehicles);
    queueSamplesMeters = [...queueSamplesMeters, sample.queueMeters].slice(-600);
    queueSamplesVehicles = [...queueSamplesVehicles, sample.queueVehicles].slice(-600);
    lastQueueSampleTime = newSimTime;
  }

  // 9. Compute Comprehensive Metrics
  const metrics = computeMetrics(
    remainingVehicles,
    remainingPeds,
    allConflicts,
    exitedVehicles,
    completedPedestrians,
    newSimTime,
    totalTravelDelayAccumulated,
    totalControlDelayAccumulated,
    totalStoppedDelayAccumulated,
    totalVehiclesExited,
    queueSamplesMeters,
    queueSamplesVehicles,
    allFaults.length,
    pendingQueueCount,
    unmetDemandCount,
    scenario.signalizedCrossings
  );

  return {
    vehicles: remainingVehicles,
    pedestrians: remainingPeds,
    conflicts: updatedConflicts,
    allConflicts,
    faults: stepFaults,
    allFaults,
    metrics,
    simTime: newSimTime,
    exitedVehicles,
    completedPedestrians,
    corridor: state.corridor,
    arrivalManager: state.arrivalManager,
    signalState,
    totalTravelDelayAccumulated,
    totalControlDelayAccumulated,
    totalStoppedDelayAccumulated,
    totalVehiclesExited,
    queueSamplesMeters,
    queueSamplesVehicles,
    lastQueueSampleTime,
  };
}
