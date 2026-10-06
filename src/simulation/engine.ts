import {
  Vehicle,
  Pedestrian,
  ConflictEvent,
  SimulationParameters,
  SimulationMetrics,
  VehicleType,
  VehicleState,
  PedestrianState,
  CorridorConfig,
  LocationId,
  ConflictType,
} from './types';
import { CORRIDORS, SCENARIOS, applyScenarioToCorridor } from './corridors';
import { trySpawnVehicle, updateVehicles, removeExitedVehicles, resetVehicleIds } from './vehicles';
import { trySpawnPedestrian, updatePedestrians, removeCompletedPedestrians, resetPedestrianIds } from './pedestrians';
import { detectConflicts, ageConflicts, resetConflictIds } from './conflicts';
import { computeMetrics } from './metrics';
import {
  ALL_ROUTES,
  evaluateRoute,
  getPedDesireLinesForLocation,
  evaluatePedDesireLine,
} from './routes';

export interface SimulationState {
  vehicles: Vehicle[];
  pedestrians: Pedestrian[];
  conflicts: ConflictEvent[];
  allConflicts: ConflictEvent[];
  metrics: SimulationMetrics;
  simTime: number;
  exitedVehicles: Vehicle[];
  completedPedestrians: Pedestrian[];
  corridor: CorridorConfig;
  lastSpawnTime: Record<VehicleType, number>;
  signalPhase: 'green' | 'yellow' | 'red';
  signalTimer: number;
  totalDelayAccumulated: number;
  totalVehiclesExited: number;
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
      position: { x: bay1.x, z: bay1.z },
      speed: 0,
      desiredSpeed: 6.94,
      heading: bay1.heading,
      lane: 0,
      dwellTimer: 0,
      dispatchTimer: 4.0, // Dispatches onto Gate 2 exit in 4 seconds!
      entryTime: 0,
      freeFlowTravelTime: 35,
      isPublicTransport: true,
      accumulatedDelay: 0,
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
      position: { x: bay2.x, z: bay2.z },
      speed: 0,
      desiredSpeed: 6.94,
      heading: bay2.heading,
      lane: 0,
      dwellTimer: 0,
      dispatchTimer: 18.0, // Dispatches after bus 1 departs
      entryTime: 0,
      freeFlowTravelTime: 35,
      isPublicTransport: true,
      accumulatedDelay: 0,
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
      hasDwelled: false,
      routeId: 'ceres_ingress_gate1',
      distanceAlongRoute: ingressS,
      terminalPhase: 'inbound',
    };

    // 3. Ceres Bus advancing through Gate 2 egress apron executing departure turn
    const egressRoute = ALL_ROUTES['ceres_egress_north'];
    const egressS = 24.5; // Gate 2 holding threshold
    const egressPt = egressRoute ? evaluateRoute(egressRoute, egressS) : { x: 103, z: 7.5, heading: -2.35 };
    const egressBus: Vehicle = {
      id: 'v-ceres-egress',
      type: VehicleType.Bus,
      state: VehicleState.Moving,
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
    const sbS = 40;
    const sbPt = sbRoute ? evaluateRoute(sbRoute, sbS) : { x: 40, z: 2.5, heading: 0 };
    const sbJeepney: Vehicle = {
      id: 'v-sb-jeepney',
      type: VehicleType.Jeepney,
      state: VehicleState.Moving,
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
      hasDwelled: false,
      routeId: 'ceres_hw_sb',
      distanceAlongRoute: sbS,
    };

    // 5. Guanzon St Northbound Private Car
    const nbRoute = ALL_ROUTES['ceres_hw_nb'];
    const nbS = 75;
    const nbPt = nbRoute ? evaluateRoute(nbRoute, nbS) : { x: 145, z: -2.5, heading: Math.PI };
    const nbCar: Vehicle = {
      id: 'v-nb-car',
      type: VehicleType.PrivateCar,
      state: VehicleState.Moving,
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
      hasDwelled: false,
      routeId: 'ceres_hw_nb',
      distanceAlongRoute: nbS,
    };

    // 6. Pedro Zayco Sr. St Egress Tricycle
    const zaycoRoute = ALL_ROUTES['ceres_pedro_zayco_out_sb'];
    const zaycoS = 18;
    const zaycoPt = zaycoRoute ? evaluateRoute(zaycoRoute, zaycoS) : { x: 64, z: -22, heading: Math.PI / 2 };
    const zaycoTrike: Vehicle = {
      id: 'v-zayco-trike',
      type: VehicleType.Tricycle,
      state: VehicleState.Moving,
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
      hasDwelled: false,
      routeId: 'ceres_pedro_zayco_out_sb',
      distanceAlongRoute: zaycoS,
    };

    return [bus1, bus2, inboundBus, egressBus, sbJeepney, nbCar, zaycoTrike];
  } else if (corridor.id === LocationId.KCCFrontage) {
    // KCC Frontage: Drop-off Jeepney at campus gate, Tricycle branching to Aquiles-Zayco Ave Y-fork, through flow
    const dropoffRoute = ALL_ROUTES['kcc_student_dropoff'];
    const dropoffS = 85;
    const dropoffPt = dropoffRoute ? evaluateRoute(dropoffRoute, dropoffS) : { x: 80, z: -4.5, heading: Math.PI };
    const dropoffJeep: Vehicle = {
      id: 'v-kcc-dropoff',
      type: VehicleType.Jeepney,
      state: VehicleState.Dwelling,
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
      hasDwelled: false,
      routeId: 'kcc_student_dropoff',
      distanceAlongRoute: dropoffS,
    };

    const forkRoute = ALL_ROUTES['kcc_aquiles_zayco_branch'];
    const forkS = 105;
    const forkPt = forkRoute ? evaluateRoute(forkRoute, forkS) : { x: 105, z: 3.5, heading: 0.35 };
    const forkTrike: Vehicle = {
      id: 'v-kcc-fork',
      type: VehicleType.Tricycle,
      state: VehicleState.Moving,
      position: { x: forkPt.x, z: forkPt.z },
      speed: 5.0,
      desiredSpeed: 5.56,
      heading: forkPt.heading,
      lane: 0,
      dwellTimer: 0,
      entryTime: 0,
      freeFlowTravelTime: 30,
      isPublicTransport: true,
      accumulatedDelay: 0,
      hasDwelled: false,
      routeId: 'kcc_aquiles_zayco_branch',
      distanceAlongRoute: forkS,
    };

    const sbRoute = ALL_ROUTES['kcc_guanzon_sb'];
    const sbS = 40;
    const sbPt = sbRoute ? evaluateRoute(sbRoute, sbS) : { x: 40, z: 2.0, heading: 0 };
    const sbCar: Vehicle = {
      id: 'v-kcc-car',
      type: VehicleType.PrivateCar,
      state: VehicleState.Moving,
      position: { x: sbPt.x, z: sbPt.z },
      speed: 7.5,
      desiredSpeed: 9.5,
      heading: sbPt.heading,
      lane: 0,
      dwellTimer: 0,
      entryTime: 0,
      freeFlowTravelTime: 20,
      isPublicTransport: false,
      accumulatedDelay: 0,
      hasDwelled: false,
      routeId: 'kcc_guanzon_sb',
      distanceAlongRoute: sbS,
    };

    const nbRoute = ALL_ROUTES['kcc_guanzon_nb'];
    const nbS = 50;
    const nbPt = nbRoute ? evaluateRoute(nbRoute, nbS) : { x: 130, z: -2.0, heading: Math.PI };
    const nbBus: Vehicle = {
      id: 'v-kcc-bus',
      type: VehicleType.Bus,
      state: VehicleState.Moving,
      position: { x: nbPt.x, z: nbPt.z },
      speed: 6.0,
      desiredSpeed: 6.94,
      heading: nbPt.heading,
      lane: 0,
      dwellTimer: 0,
      entryTime: 0,
      freeFlowTravelTime: 28,
      isPublicTransport: true,
      accumulatedDelay: 0,
      hasDwelled: false,
      routeId: 'kcc_guanzon_nb',
      distanceAlongRoute: nbS,
    };

    return [dropoffJeep, forkTrike, sbCar, nbBus];
  } else {
    // Public Market: Dense tricycles on Tan Lorenzo and Lirazan St terminal junction
    const ebRoute = ALL_ROUTES['market_tan_lorenzo_eb'];
    const ebS = 45;
    const ebPt = ebRoute ? evaluateRoute(ebRoute, ebS) : { x: 45, z: 2.0, heading: 0 };
    const ebTrike: Vehicle = {
      id: 'v-mkt-trike-1',
      type: VehicleType.Tricycle,
      state: VehicleState.Moving,
      position: { x: ebPt.x, z: ebPt.z },
      speed: 4.8,
      desiredSpeed: 5.56,
      heading: ebPt.heading,
      lane: 0,
      dwellTimer: 0,
      entryTime: 0,
      freeFlowTravelTime: 30,
      isPublicTransport: true,
      accumulatedDelay: 0,
      hasDwelled: false,
      routeId: 'market_tan_lorenzo_eb',
      distanceAlongRoute: ebS,
    };

    const wbRoute = ALL_ROUTES['market_tan_lorenzo_wb'];
    const wbS = 65;
    const wbPt = wbRoute ? evaluateRoute(wbRoute, wbS) : { x: 95, z: -2.0, heading: Math.PI };
    const wbJeep: Vehicle = {
      id: 'v-mkt-jeep',
      type: VehicleType.Jeepney,
      state: VehicleState.Moving,
      position: { x: wbPt.x, z: wbPt.z },
      speed: 5.5,
      desiredSpeed: 7.5,
      heading: wbPt.heading,
      lane: 0,
      dwellTimer: 0,
      entryTime: 0,
      freeFlowTravelTime: 25,
      isPublicTransport: true,
      accumulatedDelay: 0,
      hasDwelled: false,
      routeId: 'market_tan_lorenzo_wb',
      distanceAlongRoute: wbS,
    };

    const lirazanRoute = ALL_ROUTES['market_lirazan_nb'];
    const lirazanS = 18;
    const lirazanPt = lirazanRoute ? evaluateRoute(lirazanRoute, lirazanS) : { x: 80, z: 18, heading: -Math.PI / 2 };
    const lirazanTrike: Vehicle = {
      id: 'v-mkt-trike-2',
      type: VehicleType.Tricycle,
      state: VehicleState.Moving,
      position: { x: lirazanPt.x, z: lirazanPt.z },
      speed: 4.2,
      desiredSpeed: 5.56,
      heading: lirazanPt.heading,
      lane: 0,
      dwellTimer: 0,
      entryTime: 0,
      freeFlowTravelTime: 20,
      isPublicTransport: true,
      accumulatedDelay: 0,
      hasDwelled: false,
      routeId: 'market_lirazan_nb',
      distanceAlongRoute: lirazanS,
    };

    return [ebTrike, wbJeep, lirazanTrike];
  }
}

function seedInitialPedestrians(corridor: CorridorConfig): Pedestrian[] {
  const desireLines = getPedDesireLinesForLocation(corridor.id);
  if (desireLines.length >= 2) {
    const p1Pt = evaluatePedDesireLine(desireLines[0], 0.35);
    const p2Pt = evaluatePedDesireLine(desireLines[1], 0.65);
    const p3Pt = evaluatePedDesireLine(desireLines[0], 0.0);
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
      {
        id: 'p-init-3',
        state: PedestrianState.Waiting,
        position: { x: p3Pt.x, z: p3Pt.z },
        speed: 0,
        crossingDirection: 1,
        targetZ: 0,
        originZ: p3Pt.z,
        isJaywalker: false,
        crossingX: p3Pt.x,
        waitTimer: 2.0,
        desireLineId: desireLines[0].id,
        pathProgress: 0.0,
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
    {
      id: 'p-init-2',
      state: PedestrianState.Crossing,
      position: { x: firstCw.x + 0.8, z: 2.2 },
      speed: 1.1,
      crossingDirection: -1,
      targetZ: -(corridor.roadWidth / 2 + 1.5),
      originZ: corridor.roadWidth / 2 + 1.5,
      isJaywalker: false,
      crossingX: firstCw.x,
      waitTimer: 0,
    },
  ];
}

/**
 * Initialize or reset the simulation state.
 */
export function initSimulation(params: SimulationParameters): SimulationState {
  resetVehicleIds();
  resetPedestrianIds();
  resetConflictIds();

  const baseCorridor = CORRIDORS[params.location];
  const scenario = SCENARIOS[params.scenario];
  const corridor = applyScenarioToCorridor(baseCorridor, scenario);

  // Pre-seed realistic active traffic stream on authentic OD routes per corridor
  const initialVehicles: Vehicle[] = seedInitialVehicles(corridor);
  const initialPedestrians: Pedestrian[] = seedInitialPedestrians(corridor);

  return {
    vehicles: initialVehicles,
    pedestrians: initialPedestrians,
    conflicts: [],
    allConflicts: [],
    metrics: {
      averageDelay: 0,
      averageQueueLength: 0,
      q95QueueLength: 0,
      los: 'A' as SimulationMetrics['los'],
      conflictCounts: {
        [ConflictType.VehiclePedestrian]: 0,
        [ConflictType.RearEnd]: 0,
        [ConflictType.Weaving]: 0,
        [ConflictType.Crossing]: 0,
      },
      criticalConflictsPerHour: 0,
      vehiclesProcessed: 0,
      pedestriansProcessed: 0,
      activeVehicles: initialVehicles.length,
      activePedestrians: initialPedestrians.length,
      crosswalkViolations: 0,
    },
    simTime: 0,
    exitedVehicles: [],
    completedPedestrians: [],
    corridor,
    lastSpawnTime: {
      [VehicleType.Bus]: -999,
      [VehicleType.Jeepney]: -999,
      [VehicleType.Tricycle]: -999,
      [VehicleType.PrivateCar]: -999,
    },
    signalPhase: 'green',
    signalTimer: 0,
    totalDelayAccumulated: 0,
    totalVehiclesExited: 0,
  };
}

/**
 * Advance the simulation by one time step.
 */
export function stepSimulation(
  state: SimulationState,
  params: SimulationParameters,
  dt: number,
): SimulationState {
  const scenario = SCENARIOS[params.scenario];
  const effectiveDt = dt * params.speedMultiplier;
  const newSimTime = state.simTime + effectiveDt;

  // ─── Traffic Signal Cycle (2-Phase Controller) ─────────────
  // Total cycle: 60s (32s Green, 4s Amber, 24s Red)
  const cycleDuration = 60;
  const cycleTime = newSimTime % cycleDuration;
  let signalPhase: 'green' | 'yellow' | 'red' = 'green';
  if (scenario.signalizedCrossings) {
    if (cycleTime < 32) {
      signalPhase = 'green';
    } else if (cycleTime < 36) {
      signalPhase = 'yellow';
    } else {
      signalPhase = 'red';
    }
  }

  // ─── Spawn Vehicles ────────────────────────────────────────
  let newVehicles = [...state.vehicles];
  const vehicleTypes = [VehicleType.Tricycle, VehicleType.Jeepney, VehicleType.Bus, VehicleType.PrivateCar];

  for (const type of vehicleTypes) {
    const spawned = trySpawnVehicle(
      type,
      params.vehicleInflow[type],
      effectiveDt,
      state.corridor,
      newVehicles,
      newSimTime,
      state.lastSpawnTime,
      params.busHeadway
    );
    if (spawned) {
      spawned.entryTime = newSimTime;
      newVehicles.push(spawned);
      state.lastSpawnTime[type] = newSimTime;
    }
  }

  // ─── Spawn Pedestrians ─────────────────────────────────────
  let newPedestrians = [...state.pedestrians];
  const effectiveJaywalking = scenario.jaywalkingOverride ?? params.jaywalkingProbability;

  const spawnedPed = trySpawnPedestrian(
    params.pedestrianVolume,
    effectiveJaywalking,
    effectiveDt,
    state.corridor,
    newPedestrians,
  );
  if (spawnedPed) {
    newPedestrians.push(spawnedPed);
  }

  // ─── Update Vehicles ──────────────────────────────────────
  newVehicles = updateVehicles(
    newVehicles,
    effectiveDt,
    state.corridor,
    params.dwellTime,
    scenario.maxDwellTime,
    newPedestrians,
    signalPhase,
  );

  // ─── Update Pedestrians ───────────────────────────────────
  newPedestrians = updatePedestrians(
    newPedestrians,
    newVehicles,
    effectiveDt,
  );

  // ─── Detect Conflicts ─────────────────────────────────────
  const newConflictEvents = detectConflicts(
    newVehicles,
    newPedestrians,
    newSimTime,
    state.conflicts,
  );

  let updatedConflicts = ageConflicts(state.conflicts, effectiveDt);
  updatedConflicts = [...updatedConflicts, ...newConflictEvents];

  // ─── Remove Exited Entities & Running Metrics Accumulation ───
  const { remaining: remainingVehicles, exited } = removeExitedVehicles(newVehicles, state.corridor.length);
  const { remaining: remainingPeds, completed } = removeCompletedPedestrians(newPedestrians);

  // O(1) Delay & Throughput accumulation (prevents memory leaks and FPS drops in 30min runs)
  const newlyExitedDelay = exited.reduce((sum, v) => sum + v.accumulatedDelay, 0);
  const totalDelayAccumulated = (state.totalDelayAccumulated ?? 0) + newlyExitedDelay;
  const totalVehiclesExited = (state.totalVehiclesExited ?? 0) + exited.length;

  // Windowed history to avoid unbounded memory growth
  const exitedVehicles = [...state.exitedVehicles, ...exited].slice(-250);
  const completedPedestrians = [...state.completedPedestrians, ...completed].slice(-200);
  const allConflicts = [...state.allConflicts, ...newConflictEvents].slice(-500);

  // ─── Compute Metrics ──────────────────────────────────────
  const metrics = computeMetrics(
    remainingVehicles,
    remainingPeds,
    allConflicts,
    exitedVehicles,
    completedPedestrians,
    newSimTime,
    totalDelayAccumulated,
    totalVehiclesExited,
  );

  return {
    vehicles: remainingVehicles,
    pedestrians: remainingPeds,
    conflicts: updatedConflicts,
    allConflicts,
    metrics,
    simTime: newSimTime,
    exitedVehicles,
    completedPedestrians,
    corridor: state.corridor,
    lastSpawnTime: state.lastSpawnTime,
    signalPhase,
    signalTimer: cycleTime,
    totalDelayAccumulated,
    totalVehiclesExited,
  };
}
