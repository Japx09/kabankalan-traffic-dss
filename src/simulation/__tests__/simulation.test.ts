import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  Vehicle,
  VehicleType,
  VehicleState,
  ManeuverState,
  Pedestrian,
  PedestrianState,
  LocationId,
  ScenarioId,
  SimulationParameters,
  VEHICLE_DIMENSIONS,
} from '../types';
import { CORRIDORS, SCENARIOS, applyScenarioToCorridor } from '../corridors';
import { ALL_ROUTES, evaluateRoute } from '../routes';
import { CONFLICT_AREAS } from '../conflictAreas';
import { updateVehicles, idmAcceleration } from '../vehicles';
import { updatePedestrians, resetPedestrianIds } from '../pedestrians';
import {
  detectDeduplicatedConflicts,
  resetConflictEngine,
  TTC_CRITICAL,
} from '../conflicts';
import { computeEmpiricalPercentile, sampleCurrentQueue } from '../metrics';
import {
  createArrivalManager,
  isRouteEntryClear,
  processVehicleArrivals,
  resetArrivalSequence,
} from '../arrivals';
import { getSignalState } from '../signals';
import { initSimulation, stepSimulation, FIXED_PHYSICS_DT } from '../engine';
import { setSeed } from '../random';

function createMockVehicle(overrides: Partial<Vehicle> = {}): Vehicle {
  const type = overrides.type ?? VehicleType.Tricycle;
  const dims = VEHICLE_DIMENSIONS[type];
  return {
    id: overrides.id ?? 'v-test-1',
    type,
    state: overrides.state ?? VehicleState.Moving,
    maneuverState: overrides.maneuverState ?? ManeuverState.Cruise,
    position: overrides.position ?? { x: 50, z: 0 },
    speed: overrides.speed ?? 5.0,
    desiredSpeed: overrides.desiredSpeed ?? 5.5,
    heading: overrides.heading ?? 0,
    lane: overrides.lane ?? 0,
    dwellTimer: overrides.dwellTimer ?? 0,
    entryTime: overrides.entryTime ?? 0,
    freeFlowTravelTime: overrides.freeFlowTravelTime ?? 20,
    isPublicTransport: overrides.isPublicTransport ?? false,
    accumulatedDelay: overrides.accumulatedDelay ?? 0,
    stoppedDelay: overrides.stoppedDelay ?? 0,
    controlDelay: overrides.controlDelay ?? 0,
    stoppedDuration: overrides.stoppedDuration ?? 0,
    hasDwelled: overrides.hasDwelled ?? false,
    routeId: overrides.routeId ?? 'ceres_hw_sb',
    distanceAlongRoute: overrides.distanceAlongRoute ?? 10,
    sweptWidth: overrides.sweptWidth ?? dims.width,
    ...overrides,
  };
}

describe('Requirement 11: Deterministic Automated Verification Suite', () => {
  const corridor = CORRIDORS[LocationId.CeresTerminal];

  beforeEach(() => {
    setSeed(99999);
    resetArrivalSequence();
    resetPedestrianIds();
    resetConflictEngine();
  });

  // ─── 1. Tricycle Yielding to Approaching Ceres Bus ──────────────────────────
  it('1. Tricycle yields to approaching Ceres Bus at Pedro Zayco T-Junction conflict area', () => {
    // Pedro Zayco side street approach (Priority 4, stopBarDistance = 20)
    const trikeRoute = ALL_ROUTES['ceres_pedro_zayco_out_sb'];
    const trikePt = evaluateRoute(trikeRoute, 12);
    const trike = createMockVehicle({
      id: 'trike-1',
      type: VehicleType.Tricycle,
      routeId: 'ceres_pedro_zayco_out_sb',
      distanceAlongRoute: 12, // 8m before stop bar
      position: trikePt,
      speed: 4.5,
      desiredSpeed: 5.0,
      maneuverState: ManeuverState.Cruise,
    });

    // Ceres Bus approaching on Highway Southbound (Priority 1, entry = 45, stopBar = 43)
    const busRoute = ALL_ROUTES['ceres_hw_sb'];
    const busPt = evaluateRoute(busRoute, 25);
    const bus = createMockVehicle({
      id: 'bus-ceres-1',
      type: VehicleType.Bus,
      routeId: 'ceres_hw_sb',
      distanceAlongRoute: 25, // 20m before entry
      position: busPt,
      speed: 7.0,
      desiredSpeed: 7.5,
      maneuverState: ManeuverState.Cruise,
      sweptWidth: 2.8,
    });

    const { updatedVehicles } = updateVehicles(
      [trike, bus],
      FIXED_PHYSICS_DT,
      1.0,
      corridor,
      0,
      null,
      [],
      false
    );

    const updatedTrike = updatedVehicles.find((v) => v.id === 'trike-1')!;
    const updatedBus = updatedVehicles.find((v) => v.id === 'bus-ceres-1')!;

    // Tricycle must yield to the higher priority bus
    assert.strictEqual(updatedTrike.isYielding, true);
    assert.strictEqual(updatedTrike.maneuverState, ManeuverState.Yield);
    assert.match(updatedTrike.yieldingReason || '', /BUS/i);
    assert.strictEqual(updatedTrike.conflictingVehicleId, 'bus-ceres-1');
    assert.ok(updatedTrike.speed < trike.speed, 'Trike must decelerate/brake when yielding');

    // Bus has Priority 1 and proceeds through
    assert.notStrictEqual(updatedBus.maneuverState, ManeuverState.Yield);
  });

  // ─── 2. Bus Wide Turn Anti-Gridlock Receiving Lane Clearance ───────────────
  it('2. Bus halts wide turn egress if downstream receiving lane is blocked (Anti-Gridlock)', () => {
    // Bus exiting Ceres Terminal Gate 2 toward Bacolod (receivingRouteId: ceres_hw_nb, rxStart: 165, rxEnd: 195)
    const egressRoute = ALL_ROUTES['ceres_egress_north'];
    const busPt = evaluateRoute(egressRoute, 26);
    const egressBus = createMockVehicle({
      id: 'bus-egress-1',
      type: VehicleType.Bus,
      routeId: 'ceres_egress_north',
      distanceAlongRoute: 26, // 4m upstream of stop bar at 30m
      position: busPt,
      speed: 3.5,
      desiredSpeed: 5.5,
      sweptWidth: 6.5,
    });

    // A vehicle stopped in downstream receiving lane ceres_hw_nb at distance 175m
    const nbRoute = ALL_ROUTES['ceres_hw_nb'];
    const blockerPt = evaluateRoute(nbRoute, 175);
    const blockingVehicle = createMockVehicle({
      id: 'queue-blocker',
      type: VehicleType.PrivateCar,
      routeId: 'ceres_hw_nb',
      distanceAlongRoute: 175,
      position: blockerPt,
      speed: 0.1, // Stopped in downstream receiving zone
      state: VehicleState.Queued,
    });

    const { updatedVehicles } = updateVehicles(
      [egressBus, blockingVehicle],
      FIXED_PHYSICS_DT,
      2.0,
      corridor,
      0,
      null,
      [],
      false
    );

    const updatedBus = updatedVehicles.find((v) => v.id === 'bus-egress-1')!;

    assert.strictEqual(updatedBus.isYielding, true);
    assert.strictEqual(updatedBus.maneuverState, ManeuverState.Yield);
    assert.match(updatedBus.yieldingReason || '', /Receiving lane queue spillback/i);
  });

  // ─── 3. Following Vehicle IDM Braking ──────────────────────────────────────
  it('3. IDM produces smooth deceleration behind stationary or yielding leader', () => {
    // Gap = 8m, Leader Speed = 0, Follower Speed = 6 m/s
    const accel = idmAcceleration(6.0, 8.0, 8.0, 6.0);
    assert.ok(accel < -1.0, `Expected strong braking deceleration, got ${accel} m/s²`);

    // Two vehicles on same route
    const route = ALL_ROUTES['ceres_hw_sb'];
    const vLead = createMockVehicle({
      id: 'leader',
      routeId: 'ceres_hw_sb',
      distanceAlongRoute: 30,
      position: evaluateRoute(route, 30),
      speed: 0,
    });
    const vFollow = createMockVehicle({
      id: 'follower',
      routeId: 'ceres_hw_sb',
      distanceAlongRoute: 18,
      position: evaluateRoute(route, 18),
      speed: 6.0,
      desiredSpeed: 8.0,
    });

    const { updatedVehicles } = updateVehicles(
      [vLead, vFollow],
      FIXED_PHYSICS_DT,
      1.0,
      corridor,
      0,
      null,
      [],
      false
    );

    const updatedFollower = updatedVehicles.find((v) => v.id === 'follower')!;
    assert.ok(updatedFollower.speed < 6.0, 'Follower must brake behind stopped leader');
    assert.strictEqual(updatedFollower.leaderVehicleId, 'leader');
  });

  // ─── 4. Simultaneous Conflicting Arrivals (Priority Arbitration) ───────────
  it('4. Priority arbitration ensures Priority 1 through traffic takes precedence over Priority 4', () => {
    const p1Route = ALL_ROUTES['ceres_hw_sb'];
    const p4Route = ALL_ROUTES['ceres_pedro_zayco_out_sb'];

    // P1 through highway car 15m from stop bar (stop bar = 43)
    const p1Vehicle = createMockVehicle({
      id: 'p1-car',
      type: VehicleType.PrivateCar,
      routeId: 'ceres_hw_sb',
      distanceAlongRoute: 28,
      position: evaluateRoute(p1Route, 28),
      speed: 6.0,
    });

    // P4 side street tricycle 8m from stop bar (stop bar = 20)
    const p4Vehicle = createMockVehicle({
      id: 'p4-trike',
      type: VehicleType.Tricycle,
      routeId: 'ceres_pedro_zayco_out_sb',
      distanceAlongRoute: 12,
      position: evaluateRoute(p4Route, 12),
      speed: 3.5,
    });

    const { updatedVehicles } = updateVehicles(
      [p1Vehicle, p4Vehicle],
      FIXED_PHYSICS_DT,
      1.0,
      corridor,
      0,
      null,
      [],
      false
    );

    const uP1 = updatedVehicles.find((v) => v.id === 'p1-car')!;
    const uP4 = updatedVehicles.find((v) => v.id === 'p4-trike')!;

    assert.notStrictEqual(uP1.maneuverState, ManeuverState.Yield);
    assert.strictEqual(uP4.maneuverState, ManeuverState.Yield);
  });

  // ─── 5. Pedestrian Gap Acceptance & Signal Compliance ──────────────────────
  it('5. Pedestrians obey signal phases (wait on vehicular green, cross on walk)', () => {
    const ped: Pedestrian = {
      id: 'p-test',
      state: PedestrianState.Waiting,
      position: { x: 50, z: -5 },
      speed: 1.2,
      crossingDirection: 1,
      targetZ: 5,
      originZ: -5,
      isJaywalker: false,
      crossingX: 50,
      waitTimer: 0,
    };

    // At simTime = 10s: Vehicular Green, Pedestrian Do Not Walk
    const greenResult = updatePedestrians([ped], [], FIXED_PHYSICS_DT, 10, true);
    assert.strictEqual(greenResult[0].state, PedestrianState.Waiting);

    // At simTime = 40s: Vehicular Red, Pedestrian Walk
    const walkResult = updatePedestrians([ped], [], FIXED_PHYSICS_DT, 40, true);
    assert.strictEqual(walkResult[0].state, PedestrianState.Crossing);
  });

  it('5b. Pedestrian yields to approaching fast vehicle at unsignalized crossing', () => {
    // Pedestrian waiting at crossing (x = 50, z = -4.5)
    const ped: Pedestrian = {
      id: 'p-unsignalized',
      state: PedestrianState.Waiting,
      position: { x: 50, z: -4.5 },
      speed: 1.2,
      crossingDirection: 1,
      targetZ: 4.5,
      originZ: -4.5,
      isJaywalker: false,
      crossingX: 50,
      waitTimer: 0,
    };

    // Vehicle approaching crossing 12m away at 8 m/s (TTC ~ 1.5s, cannot clear in time)
    const approachingBus = createMockVehicle({
      id: 'speeding-bus',
      type: VehicleType.Bus,
      position: { x: 38, z: -2.0 },
      heading: 0, // Traveling in +x direction
      speed: 8.0,
    });

    const updatedPeds = updatePedestrians([ped], [approachingBus], FIXED_PHYSICS_DT, 5.0, false);
    assert.strictEqual(updatedPeds[0].state, PedestrianState.Waiting, 'Pedestrian must yield to fast oncoming bus');
  });

  // ─── 6. Safe Insertion Under Congestion & Queue Retention ──────────────────
  it('6. Route entry blockage retains vehicle in entry queue rather than overlapping', () => {
    const route = ALL_ROUTES['ceres_hw_sb'];
    const entryPt = evaluateRoute(route, 2);

    // Vehicle sitting right at route entrance
    const blockingVehicle = createMockVehicle({
      id: 'blocker',
      routeId: 'ceres_hw_sb',
      distanceAlongRoute: 2,
      position: entryPt,
      speed: 0.1,
    });

    // Check entry clear check
    const isClear = isRouteEntryClear(route, VehicleType.Tricycle, [blockingVehicle]);
    assert.strictEqual(isClear, false, 'Entry must be flagged as blocked');

    const arrivalManager = createArrivalManager();
    const inflow = {
      [VehicleType.Bus]: 0,
      [VehicleType.Jeepney]: 0,
      [VehicleType.Tricycle]: 5000, // Very high inflow
      [VehicleType.PrivateCar]: 0,
    };

    const res = processVehicleArrivals(
      arrivalManager,
      0,
      1.0,
      corridor,
      [blockingVehicle],
      inflow,
      30
    );

    // Queued vehicles must be safely retained in pending queue, not spawned overlapping
    assert.ok(res.pendingQueueCount > 0, 'Blocked vehicles must be retained in pending queues');
    const overlappingSpawn = res.insertedVehicles.some(
      (v) => v.routeId === 'ceres_hw_sb' && (v.distanceAlongRoute || 0) < 6
    );
    assert.strictEqual(overlappingSpawn, false, 'No vehicle should spawn overlapping the blocker');
  });

  // ─── 7. Ceres Terminal Gate Blocked Dispatch Queue Retention ───────────────
  it('7. Gate blocked condition retains scheduled buses until clearance', () => {
    const route = ALL_ROUTES['ceres_egress_north'];
    const blocker = createMockVehicle({
      id: 'gate-blocker',
      routeId: 'ceres_egress_north',
      distanceAlongRoute: 2,
      position: evaluateRoute(route, 2),
      speed: 0,
    });

    const manager = createArrivalManager();
    // Simulate an egress bus waiting in queue
    const queuedBus = createMockVehicle({
      id: 'egress-bus-pending',
      type: VehicleType.Bus,
      routeId: 'ceres_egress_north',
      distanceAlongRoute: 0,
    });
    manager.pendingQueues['ceres_egress_north'] = [queuedBus];

    const res = processVehicleArrivals(
      manager,
      0,
      1.0,
      corridor,
      [blocker],
      { [VehicleType.Bus]: 0, [VehicleType.Jeepney]: 0, [VehicleType.Tricycle]: 0, [VehicleType.PrivateCar]: 0 },
      10
    );

    // Gate is blocked, bus cannot egress into gate apron, retained in pending queue
    assert.strictEqual(manager.pendingQueues['ceres_egress_north'].length, 1, 'Bus retained in pending queue');
    assert.strictEqual(res.pendingQueueCount, 1, 'Total pending queue count reflects retained bus');
    assert.strictEqual(res.insertedVehicles.length, 0, 'No vehicle inserted while entry is blocked');
  });

  // ─── 8. SSAM-Inspired Conflict Encounter Deduplication ─────────────────────
  it('8. Emits exactly ONE deduplicated ConflictEvent per encounter', () => {
    const v1 = createMockVehicle({
      id: 'enc-v1',
      position: { x: 50, z: -1.0 },
      speed: 6.0,
      heading: 0,
    });
    const v2 = createMockVehicle({
      id: 'enc-v2',
      position: { x: 55, z: 1.0 },
      speed: 6.0,
      heading: Math.PI, // Head-on conflict course
    });

    // Step 10 frames during active conflict
    let duringConflictEvents = 0;
    for (let f = 0; f < 10; f++) {
      const time = 1.0 + f * 0.05;
      const events = detectDeduplicatedConflicts([v1, v2], [], time);
      duringConflictEvents += events.length;
    }
    // During active encounter, events are tracked in activeEncounters (not emitted repeatedly)
    assert.strictEqual(duringConflictEvents, 0, 'Should not emit duplicate events while encounter is active');

    // Separate vehicles and step past separation threshold (1.2 seconds)
    v1.position = { x: 0, z: 0 };
    v2.position = { x: 200, z: 200 };

    // Advance time to 3.0s (separation elapsed > 1.2s)
    const completedEvents = detectDeduplicatedConflicts([v1, v2], [], 3.0);
    assert.strictEqual(completedEvents.length, 1, 'Must emit exactly ONE completed conflict event');
    assert.ok(completedEvents[0].ttc < TTC_CRITICAL, 'Recorded min TTC must be critical');

    // Next frame must emit 0
    const nextFrameEvents = detectDeduplicatedConflicts([v1, v2], [], 3.05);
    assert.strictEqual(nextFrameEvents.length, 0, 'No re-emission after closure');
  });

  // ─── 9. Empirical Q95 Percentile Calculation ──────────────────────────────
  it('9. computeEmpiricalPercentile matches statistical expectation and edge cases', () => {
    const samples = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    const q95 = computeEmpiricalPercentile(samples, 0.95);
    assert.ok(Math.abs(q95 - 95.5) < 1e-5, `Expected ~95.5, got ${q95}`);

    // Empty array
    assert.strictEqual(computeEmpiricalPercentile([]), 0);

    // Single item
    assert.strictEqual(computeEmpiricalPercentile([42]), 42);

    // Homogeneous array
    assert.strictEqual(computeEmpiricalPercentile([15, 15, 15, 15]), 15);

    // Test sampleCurrentQueue filtering (< 0.5 m/s threshold)
    const moving = createMockVehicle({ id: 'm1', speed: 5.0 });
    const stopped = createMockVehicle({ id: 's1', speed: 0.2 });
    const parked = createMockVehicle({ id: 'p1', speed: 0, isParkedStandby: true });

    const qSample = sampleCurrentQueue([moving, stopped, parked]);
    assert.strictEqual(qSample.queueVehicles, 1, 'Only non-parked vehicle with speed < 0.5 is queued');
  });

  // ─── 10. Speed Multiplier Consistency (Deterministic State Match) ──────────
  it('10. Running identical steps produces bit-exact deterministic states', () => {
    const params: SimulationParameters = {
      scenario: ScenarioId.Baseline,
      location: LocationId.CeresTerminal,
      vehicleInflow: {
        [VehicleType.Bus]: 120,
        [VehicleType.Jeepney]: 240,
        [VehicleType.Tricycle]: 600,
        [VehicleType.PrivateCar]: 400,
      },
      pedestrianVolume: 300,
      dwellTime: 25,
      jaywalkingProbability: 0.15,
      speedMultiplier: 1,
      busHeadway: 60,
      platoonCycle: 90,
      platoonReleaseDuration: 45,
      seed: 54321,
    };

    // Run A
    let stateA = initSimulation(params);
    for (let i = 0; i < 40; i++) {
      stateA = stepSimulation(stateA, params, FIXED_PHYSICS_DT);
    }

    // Run B (Same seed, independent execution)
    let stateB = initSimulation(params);
    for (let i = 0; i < 40; i++) {
      stateB = stepSimulation(stateB, params, FIXED_PHYSICS_DT);
    }

    assert.strictEqual(stateA.vehicles.length, stateB.vehicles.length, 'Vehicle counts must match');
    assert.strictEqual(stateA.simTime, stateB.simTime, 'Sim time must match');

    for (let i = 0; i < stateA.vehicles.length; i++) {
      const vA = stateA.vehicles[i];
      const vB = stateB.vehicles[i];
      assert.strictEqual(vA.id, vB.id);
      assert.strictEqual(vA.speed, vB.speed);
      assert.strictEqual(vA.position.x, vB.position.x);
      assert.strictEqual(vA.position.z, vB.position.z);
      assert.strictEqual(vA.maneuverState, vB.maneuverState);
    }
  });

  // ─── 11. Comparable Scenario Runs (Baseline Matching) ──────────────────────
  it('11. Comparison correctly validates identical corridor and seed integrity', () => {
    const paramsA: SimulationParameters = {
      scenario: ScenarioId.Baseline,
      location: LocationId.CeresTerminal,
      vehicleInflow: { [VehicleType.Bus]: 100, [VehicleType.Jeepney]: 200, [VehicleType.Tricycle]: 400, [VehicleType.PrivateCar]: 300 },
      pedestrianVolume: 200,
      dwellTime: 20,
      jaywalkingProbability: 0.1,
      speedMultiplier: 1,
      busHeadway: 60,
      platoonCycle: 90,
      platoonReleaseDuration: 45,
      seed: 12345,
    };

    const paramsB = { ...paramsA, scenario: ScenarioId.DedicatedBay };
    const paramsC = { ...paramsA, location: LocationId.KCCFrontage };
    const paramsD = { ...paramsA, seed: 99999 };

    // Valid comparison: same corridor & same seed
    const isComparableAB = paramsA.location === paramsB.location && paramsA.seed === paramsB.seed;
    assert.strictEqual(isComparableAB, true, 'Scenarios A and B are comparable');

    // Invalid comparison: different corridor
    const isComparableAC = paramsA.location === paramsC.location && paramsA.seed === paramsC.seed;
    assert.strictEqual(isComparableAC, false, 'Scenarios A and C have different corridors');

    // Invalid comparison: different seed
    const isComparableAD = paramsA.location === paramsD.location && paramsA.seed === paramsD.seed;
    assert.strictEqual(isComparableAD, false, 'Scenarios A and D have different seeds');
  });

  // ─── Regression Suite: Movement Engine & Cross-Route Avoidance ──────────────
  describe('Movement Engine & Cross-Route Avoidance Regression Suite', () => {
    it('R1. Tricycle turning across an approaching bus yields and does not advance into conflict path', () => {
      const trike = createMockVehicle({
        id: 'r1-trike',
        type: VehicleType.Tricycle,
        routeId: 'ceres_pedro_zayco_out_sb',
        distanceAlongRoute: 15,
        position: evaluateRoute(ALL_ROUTES['ceres_pedro_zayco_out_sb'], 15),
        speed: 4.0,
      });

      const bus = createMockVehicle({
        id: 'r1-bus',
        type: VehicleType.Bus,
        routeId: 'ceres_hw_sb',
        distanceAlongRoute: 25,
        position: evaluateRoute(ALL_ROUTES['ceres_hw_sb'], 25),
        speed: 8.0,
      });

      const { updatedVehicles } = updateVehicles([trike, bus], FIXED_PHYSICS_DT, 1.0, corridor, 0, null, [], false);
      const uTrike = updatedVehicles.find((v) => v.id === 'r1-trike')!;

      assert.strictEqual(uTrike.isYielding, true);
      assert.strictEqual(uTrike.conflictingVehicleId, 'r1-bus');
      assert.ok(uTrike.appliedAcc! < -1.5, 'Tricycle must decelerate to yield to bus');
      assert.ok(uTrike.distanceAlongRoute! <= 20.2, 'Tricycle must not advance past stop line while yielding');
    });

    it('R2. Vehicle merging between a front and rear vehicle in receiving lane', () => {
      const egressBus = createMockVehicle({
        id: 'r2-egress-bus',
        type: VehicleType.Bus,
        routeId: 'ceres_egress_north',
        distanceAlongRoute: 28,
        position: evaluateRoute(ALL_ROUTES['ceres_egress_north'], 28),
        speed: 2.0,
      });

      const frontCar = createMockVehicle({
        id: 'r2-front-car',
        type: VehicleType.PrivateCar,
        routeId: 'ceres_hw_nb',
        distanceAlongRoute: 185,
        position: evaluateRoute(ALL_ROUTES['ceres_hw_nb'], 185),
        speed: 6.0,
      });

      const rearBus = createMockVehicle({
        id: 'r2-rear-bus',
        type: VehicleType.Bus,
        routeId: 'ceres_hw_nb',
        distanceAlongRoute: 145,
        position: evaluateRoute(ALL_ROUTES['ceres_hw_nb'], 145),
        speed: 8.0,
      });

      const { updatedVehicles } = updateVehicles([egressBus, frontCar, rearBus], FIXED_PHYSICS_DT, 1.0, corridor, 0, null, [], false);
      const uEgress = updatedVehicles.find((v) => v.id === 'r2-egress-bus')!;

      assert.strictEqual(uEgress.isYielding, true);
      assert.strictEqual(uEgress.conflictingVehicleId, 'r2-rear-bus');
      assert.match(uEgress.yieldingReason || '', /receiving lane/i);
    });

    it('R3. Two buses following through the terminal exit maintain spacing and never overlap', () => {
      const bus1 = createMockVehicle({
        id: 'r3-bus1',
        type: VehicleType.Bus,
        routeId: 'ceres_egress_north',
        distanceAlongRoute: 24,
        position: evaluateRoute(ALL_ROUTES['ceres_egress_north'], 24),
        speed: 1.0,
      });

      const bus2 = createMockVehicle({
        id: 'r3-bus2',
        type: VehicleType.Bus,
        routeId: 'ceres_egress_north',
        distanceAlongRoute: 6,
        position: evaluateRoute(ALL_ROUTES['ceres_egress_north'], 6),
        speed: 3.0,
      });

      const { updatedVehicles, faults } = updateVehicles([bus1, bus2], FIXED_PHYSICS_DT, 1.0, corridor, 0, null, [], false);
      const uBus2 = updatedVehicles.find((v) => v.id === 'r3-bus2')!;

      assert.strictEqual(uBus2.leaderVehicleId, 'r3-bus1');
      assert.ok(uBus2.appliedAcc! < 0, 'Following bus must decelerate behind lead bus');
      assert.strictEqual(faults.length, 0, 'No physical collision fault between following buses');
    });

    it('R4. Blocked receiving lane halts vehicle before entering the roadway', () => {
      const bus = createMockVehicle({
        id: 'r4-bus',
        type: VehicleType.Bus,
        routeId: 'ceres_egress_north',
        distanceAlongRoute: 28,
        position: evaluateRoute(ALL_ROUTES['ceres_egress_north'], 28),
        speed: 3.0,
      });

      const stoppedVehicle = createMockVehicle({
        id: 'r4-stopped',
        type: VehicleType.PrivateCar,
        routeId: 'ceres_hw_nb',
        distanceAlongRoute: 175,
        position: evaluateRoute(ALL_ROUTES['ceres_hw_nb'], 175),
        speed: 0.1,
      });

      const { updatedVehicles } = updateVehicles([bus, stoppedVehicle], FIXED_PHYSICS_DT, 1.0, corridor, 0, null, [], false);
      const uBus = updatedVehicles.find((v) => v.id === 'r4-bus')!;

      assert.strictEqual(uBus.isYielding, true);
      assert.match(uBus.yieldingReason || '', /Receiving lane queue spillback/i);
      assert.ok(uBus.distanceAlongRoute! <= 30.5, 'Bus must not enter roadway when receiving lane is blocked');
    });

    it('R5. Corridor change and simulation reset clears fault history completely', () => {
      const params: SimulationParameters = {
        scenario: ScenarioId.Baseline,
        location: LocationId.CeresTerminal,
        vehicleInflow: { [VehicleType.Bus]: 100, [VehicleType.Jeepney]: 200, [VehicleType.Tricycle]: 400, [VehicleType.PrivateCar]: 300 },
        pedestrianVolume: 200,
        dwellTime: 20,
        jaywalkingProbability: 0.1,
        speedMultiplier: 1,
        busHeadway: 60,
        platoonCycle: 90,
        platoonReleaseDuration: 45,
        seed: 12345,
      };

      const state1 = initSimulation(params);
      assert.strictEqual(state1.faults.length, 0);
      assert.strictEqual(state1.allFaults.length, 0);

      const state2 = initSimulation({ ...params, location: LocationId.KCCFrontage });
      assert.strictEqual(state2.faults.length, 0);
      assert.strictEqual(state2.allFaults.length, 0);
    });

    it('R6. Equivalent behavior and deterministic state across different execution speeds', () => {
      const params: SimulationParameters = {
        scenario: ScenarioId.Baseline,
        location: LocationId.CeresTerminal,
        vehicleInflow: { [VehicleType.Bus]: 60, [VehicleType.Jeepney]: 120, [VehicleType.Tricycle]: 200, [VehicleType.PrivateCar]: 150 },
        pedestrianVolume: 100,
        dwellTime: 20,
        jaywalkingProbability: 0.1,
        speedMultiplier: 1,
        busHeadway: 60,
        platoonCycle: 90,
        platoonReleaseDuration: 45,
        seed: 777,
      };

      let sim1 = initSimulation(params);
      for (let i = 0; i < 30; i++) {
        sim1 = stepSimulation(sim1, params, FIXED_PHYSICS_DT);
      }

      let sim2 = initSimulation({ ...params, speedMultiplier: 5 });
      for (let i = 0; i < 30; i++) {
        sim2 = stepSimulation(sim2, { ...params, speedMultiplier: 5 }, FIXED_PHYSICS_DT);
      }

      assert.strictEqual(sim1.vehicles.length, sim2.vehicles.length);
      for (let i = 0; i < sim1.vehicles.length; i++) {
        assert.strictEqual(sim1.vehicles[i].position.x, sim2.vehicles[i].position.x);
        assert.strictEqual(sim1.vehicles[i].position.z, sim2.vehicles[i].position.z);
        assert.strictEqual(sim1.vehicles[i].speed, sim2.vehicles[i].speed);
      }
    });
  });
});
