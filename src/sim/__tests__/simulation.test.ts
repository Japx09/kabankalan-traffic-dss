import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildCeresRoadGraph } from '@/gis/roadGraphBuilder';
import { evaluateScenarioBenchmark } from '@/sim/analytics';
import {
  createVehicleAgent,
  FIXED_PHYSICS_DT,
  initSimulation,
  stepSimulation,
} from '@/sim/engine';
import {
  DEFAULT_SIM_PARAMS,
  type ScenarioId,
  type SimulationParams,
  type TerminalPhase,
} from '@/sim/types';
import { getLiveSimState, useSimStore } from '@/store/simStore';

const sharedGraph = buildCeresRoadGraph();

function makeEmptySim(params: SimulationParams = DEFAULT_SIM_PARAMS) {
  const state = initSimulation(params, sharedGraph);
  state.vehicles = [];
  state.pedestrians = [];
  state.conflicts = [];
  state.faults = [];
  state.totalExitedCount = 0;
  state.totalControlDelaySum = 0;
  state.laneChangesCompleted = 0;
  return state;
}

describe('Kabankalan Ceres Corridor Microsimulation Engine V2', () => {
  it('1. verifies GIS Directed Lane-Edge Graph integrity & all 25 conflict zones', () => {
    assert.ok(sharedGraph.lanes.length >= 60, `expected >= 60 lanes, got ${sharedGraph.lanes.length}`);
    assert.equal(
      sharedGraph.conflictZones.length,
      25,
      `expected 25 auto-derived conflict zones, got ${sharedGraph.conflictZones.length}`
    );
    assert.equal(sharedGraph.crosswalks.length, 3, 'expected 3 corridor crosswalks');

    for (const lane of sharedGraph.lanes) {
      assert.ok(lane.samples.length >= 2, `lane ${lane.id} needs >= 2 samples`);
      assert.ok(lane.length > 0.5, `lane ${lane.id} length must be positive`);
      if (!lane.isExit) {
        assert.ok(
          lane.nextLaneIds.length > 0,
          `non-exit lane ${lane.id} must not be a dead end`
        );
      }
      for (const nextId of lane.nextLaneIds) {
        assert.ok(sharedGraph.laneById[nextId], `unknown nextLaneId ${nextId} on ${lane.id}`);
      }
      for (const prevId of lane.prevLaneIds) {
        assert.ok(sharedGraph.laneById[prevId], `unknown prevLaneId ${prevId} on ${lane.id}`);
      }
      if (lane.adjacentLeftLaneId) {
        assert.ok(
          sharedGraph.laneById[lane.adjacentLeftLaneId],
          `unknown adjacentLeftLaneId on ${lane.id}`
        );
      }
      if (lane.adjacentRightLaneId) {
        assert.ok(
          sharedGraph.laneById[lane.adjacentRightLaneId],
          `unknown adjacentRightLaneId on ${lane.id}`
        );
      }
    }

    for (const zone of sharedGraph.conflictZones) {
      assert.ok(zone.participants.length >= 2, `conflict zone ${zone.id} needs >= 2 participants`);
      for (const p of zone.participants) {
        const lane = sharedGraph.laneById[p.laneId];
        assert.ok(lane, `conflict zone ${zone.id} references unknown lane ${p.laneId}`);
        assert.ok(p.sStart >= 0 && p.sEnd <= lane.length + 0.05);
        assert.ok(p.stopBarS >= 0 && p.stopBarS <= p.sEnd + 0.05);
      }
    }

    for (const cw of sharedGraph.crosswalks) {
      assert.ok(cw.affectedLanes.length >= 2, `crosswalk ${cw.id} should intersect >= 2 lanes`);
      for (const ref of cw.affectedLanes) {
        assert.ok(sharedGraph.laneById[ref.laneId], `crosswalk ${cw.id} unknown lane ${ref.laneId}`);
      }
    }
  });

  it('2. coordinates fast car behind slow tricycle across lanes & executes MOBIL lane change with 0 faults', () => {
    const noSpawnParams: SimulationParams = {
      ...DEFAULT_SIM_PARAMS,
      busHeadwaySeconds: 9999,
      jeepneyRatePerHour: 0,
      tricycleRatePerHour: 0,
      carRatePerHour: 0,
      pedestrianRatePerHour: 0,
    };
    const state = makeEmptySim(noSpawnParams);
    state.lastBusSpawnTime = 9999;

    const se0Route = [
      'nat_se_0_pz',
      'nat_se_0_s2',
      'nat_se_0_perim',
      'nat_se_0_g2',
      'nat_se_0_s3',
      'nat_se_0_g1',
      'nat_se_0_s4',
      'nat_se_0_rep',
      'nat_se_0_s5',
    ];

    const trike = createVehicleAgent(sharedGraph, {
      id: 'trike_slow',
      type: 'tricycle',
      laneId: 'nat_se_0_s1',
      s: 42,
      speed: 5.5,
      desiredSpeed: 5.5,
      routeQueue: se0Route,
    });
    const car = createVehicleAgent(sharedGraph, {
      id: 'car_fast',
      type: 'car',
      laneId: 'nat_se_0_s1',
      s: 20,
      speed: 13.0,
      desiredSpeed: 13.5,
      routeQueue: se0Route,
    });
    state.vehicles.push(trike, car);

    let sawLeader = false;
    let changedToInnerLane = false;

    for (let step = 0; step < 200; step++) {
      stepSimulation(state, noSpawnParams, FIXED_PHYSICS_DT);
      const c = state.vehicles.find((v) => v.id === 'car_fast');
      if (!c) break;
      if (c.leaderVehicleId === 'trike_slow') sawLeader = true;
      if (c.laneId.startsWith('nat_se_1_')) changedToInnerLane = true;
    }

    assert.ok(sawLeader || changedToInnerLane, 'car must detect slow tricycle leader ahead');
    assert.ok(changedToInnerLane, 'fast car must MOBIL lane-change into inner fast lane nat_se_1_*');
    assert.ok(state.laneChangesCompleted >= 1, 'laneChangesCompleted must increment');
    assert.equal(state.faults.length, 0, 'must have ZERO physical overlap faults during overtake');

    // Also verify cross-lane-boundary lookahead (NO laneId silo blindness)
    // Use junction segment nat_se_0_pz -> nat_se_0_s2 (no MOBIL bypass) so car must brake to a full stop
    const stateBoundary = makeEmptySim(noSpawnParams);
    stateBoundary.lastBusSpawnTime = 9999;
    const stoppedTrikeNextLane = createVehicleAgent(sharedGraph, {
      id: 'trike_next_lane',
      type: 'tricycle',
      laneId: 'nat_se_0_s2',
      s: 8,
      speed: 0,
      dwellTimer: 20,
      routeQueue: se0Route.slice(2),
    });
    const approachingCarPrevLane = createVehicleAgent(sharedGraph, {
      id: 'car_prev_lane',
      type: 'car',
      laneId: 'nat_se_0_pz',
      s: 6,
      speed: 11.5,
      desiredSpeed: 13.0,
      routeQueue: se0Route.slice(1),
    });
    stateBoundary.vehicles.push(stoppedTrikeNextLane, approachingCarPrevLane);

    let sawCrossBoundaryLeader = false;
    for (let step = 0; step < 120; step++) {
      stepSimulation(stateBoundary, noSpawnParams, FIXED_PHYSICS_DT);
      const c = stateBoundary.vehicles.find((v) => v.id === 'car_prev_lane');
      if (c?.leaderVehicleId === 'trike_next_lane') {
        sawCrossBoundaryLeader = true;
      }
    }
    const finalCar = stateBoundary.vehicles.find((v) => v.id === 'car_prev_lane')!;
    assert.ok(sawCrossBoundaryLeader, 'car on nat_se_0_pz must see leader on next lane nat_se_0_s2');
    assert.ok(finalCar.speed < 0.25, `car must brake to a stop behind next-lane obstacle (got ${finalCar.speed})`);
    assert.equal(stateBoundary.faults.length, 0, 'cross-boundary stop must incur 0 faults');
  });

  it('3. forces approaching vehicle to yield before stopBarS when conflicting vehicle is stopped (speed === 0) inside conflict zone', () => {
    const noSpawnParams: SimulationParams = {
      ...DEFAULT_SIM_PARAMS,
      busHeadwaySeconds: 9999,
      jeepneyRatePerHour: 0,
      tricycleRatePerHour: 0,
      carRatePerHour: 0,
      pedestrianRatePerHour: 0,
    };
    const state = makeEmptySim(noSpawnParams);
    state.lastBusSpawnTime = 9999;

    // Conflict zone: cz_cross_nat_se_0_g1__turn_nw_to_gate1
    // nat_se_0_g1: sStart=11.02, sEnd=19.93, stopBarS=7.52, priority=1
    // turn_nw_to_gate1: sStart=8.28, sEnd=18.15, stopBarS=4.78, priority=2
    const zone = sharedGraph.conflictZones.find(
      (z) => z.id === 'cz_cross_nat_se_0_g1__turn_nw_to_gate1'
    );
    assert.ok(zone, 'expected cz_cross_nat_se_0_g1__turn_nw_to_gate1');
    const natParticipant = zone.participants.find((p) => p.laneId === 'nat_se_0_g1')!;

    // Place bus STOPPED (speed === 0) dead-center inside the crossing zone on lower-priority lane!
    const stoppedBus = createVehicleAgent(sharedGraph, {
      id: 'bus_stopped_in_box',
      type: 'bus',
      laneId: 'turn_nw_to_gate1',
      s: 13.0,
      speed: 0,
      dwellTimer: 30,
      routeQueue: ['ceres_gate1_throat', 'ceres_alighting_lane', 'ceres_gate2_throat'],
    });

    // High-priority car approaching on National Rd SE from upstream lane nat_se_0_g2 -> nat_se_0_s3 -> nat_se_0_g1
    const approachingCar = createVehicleAgent(sharedGraph, {
      id: 'car_approaching_conflict',
      type: 'car',
      laneId: 'nat_se_0_s3',
      s: 2.0,
      speed: 10.5,
      desiredSpeed: 12.5,
      routeQueue: ['nat_se_0_g1', 'nat_se_0_s4', 'nat_se_0_rep', 'nat_se_0_s5'],
    });

    state.vehicles.push(stoppedBus, approachingCar);

    for (let step = 0; step < 160; step++) {
      stepSimulation(state, noSpawnParams, FIXED_PHYSICS_DT);
    }

    const carAfter = state.vehicles.find((v) => v.id === 'car_approaching_conflict')!;
    assert.ok(carAfter, 'approaching car must remain safely yielded before the blocked zone');
    assert.ok(
      carAfter.speed < 0.2,
      `car must stop cleanly for speed===0 obstacle in conflict zone (got speed=${carAfter.speed})`
    );
    if (carAfter.laneId === 'nat_se_0_g1') {
      assert.ok(
        carAfter.s <= natParticipant.stopBarS + 0.3,
        `car must stop before stopBarS=${natParticipant.stopBarS}, got s=${carAfter.s}`
      );
    } else {
      assert.equal(carAfter.laneId, 'nat_se_0_s3', 'or stopped cleanly on upstream lane nat_se_0_s3');
    }
    assert.equal(state.faults.length, 0, 'zero physical overlap faults');
  });

  it('4. completes Ceres Terminal 4-phase bus loop (Gate 1 -> Alighting & Staging -> Gate 2 Egress) with 0 faults', () => {
    const noSpawnParams: SimulationParams = {
      ...DEFAULT_SIM_PARAMS,
      scenario: 'dedicated-bays',
      busHeadwaySeconds: 9999,
      jeepneyRatePerHour: 0,
      tricycleRatePerHour: 0,
      carRatePerHour: 0,
      pedestrianRatePerHour: 0,
    };
    const state = makeEmptySim(noSpawnParams);
    state.lastBusSpawnTime = 9999;

    const busAlighting = createVehicleAgent(sharedGraph, {
      id: 'bus_alighting_test',
      type: 'bus',
      laneId: 'nat_se_0_s3',
      s: 2.0,
      speed: 5.0,
      routeQueue: [
        'ceres_gate1_ingress',
        'ceres_gate1_throat',
        'ceres_alighting_lane',
        'ceres_gate2_throat',
        'ceres_gate2_egress_se',
        'nat_se_0_s3',
        'nat_se_0_g1',
        'nat_se_0_s4',
        'nat_se_0_rep',
        'nat_se_0_s5',
      ],
    });

    const busStaging = createVehicleAgent(sharedGraph, {
      id: 'bus_staging_test',
      type: 'bus',
      laneId: 'nat_nw_1_s2',
      s: 74.0,
      speed: 5.5,
      stagingBayIndex: 1,
      routeQueue: [
        'turn_nw_to_gate1',
        'ceres_gate1_throat',
        'ceres_staging_loop',
        'ceres_gate2_throat',
        'ceres_gate2_egress_nw',
        'nat_nw_1_s4',
        'nat_nw_1_pz',
        'nat_nw_1_s5',
      ],
    });

    state.vehicles.push(busAlighting, busStaging);

    const phasesSeenA = new Set<TerminalPhase>();
    const phasesSeenB = new Set<TerminalPhase>();
    let dwelledA = false;
    let dwelledB = false;

    for (let step = 0; step < 3600; step++) {
      stepSimulation(state, noSpawnParams, FIXED_PHYSICS_DT);
      const a = state.vehicles.find((v) => v.id === 'bus_alighting_test');
      const b = state.vehicles.find((v) => v.id === 'bus_staging_test');
      if (a) {
        phasesSeenA.add(a.terminalPhase);
        if (a.state === 'dwelling' && a.dwellTimer > 0) dwelledA = true;
      }
      if (b) {
        phasesSeenB.add(b.terminalPhase);
        if (b.state === 'dwelling' && b.dwellTimer > 0) dwelledB = true;
      }
      if (!a && !b) break;
    }

    assert.ok(phasesSeenA.has('ingress'), 'bus A entered ingress phase');
    assert.ok(phasesSeenA.has('alighting'), 'bus A entered alighting phase');
    assert.ok(phasesSeenA.has('egress'), 'bus A entered Gate 2 egress phase');
    assert.ok(dwelledA, 'bus A dwelled at Ceres alighting platform');

    assert.ok(phasesSeenB.has('ingress'), 'bus B entered ingress phase');
    assert.ok(phasesSeenB.has('staging'), 'bus B entered staging bay phase');
    assert.ok(phasesSeenB.has('egress'), 'bus B entered Gate 2 egress phase');
    assert.ok(dwelledB, 'bus B dwelled in Ceres staging loop');

    assert.equal(state.totalExitedCount, 2, 'both Ceres buses must cleanly exit corridor');
    assert.equal(state.faults.length, 0, 'zero physical faults throughout 4-phase Ceres loop');
  });

  it('5. runs deterministic 240s peak demand across all 3 scenarios with 0 faults and measurable Scenario 1 & 2 improvements', () => {
    const peakParams: SimulationParams = {
      ...DEFAULT_SIM_PARAMS,
      busHeadwaySeconds: 32,
      jeepneyRatePerHour: 130,
      tricycleRatePerHour: 220,
      carRatePerHour: 280,
      pedestrianRatePerHour: 180,
      seed: 202609,
    };

    const scenarios: readonly ScenarioId[] = [
      'baseline',
      'dedicated-bays',
      'signalized-overpass',
    ];
    const results = Object.fromEntries(
      scenarios.map((sc) => [sc, evaluateScenarioBenchmark(sharedGraph, peakParams, sc, 240)])
    ) as Record<ScenarioId, ReturnType<typeof evaluateScenarioBenchmark>>;

    // Determinism check (short 40s replay must match identically)
    const replayA = evaluateScenarioBenchmark(sharedGraph, peakParams, 'baseline', 40);
    const replayB = evaluateScenarioBenchmark(sharedGraph, peakParams, 'baseline', 40);
    assert.deepEqual(replayA.metrics, replayB.metrics, 'simulation must be 100% deterministic');

    for (const sc of scenarios) {
      const m = results[sc].metrics;
      assert.equal(m.faultCount, 0, `${sc}: must have ZERO physical faults over 240s peak run`);
      assert.ok(m.totalExited >= 25, `${sc}: expected healthy throughput >= 25 exited, got ${m.totalExited}`);
      assert.ok(m.avgSpeedKph > 10, `${sc}: traffic must keep flowing (got ${m.avgSpeedKph} kph)`);
    }

    const base = results.baseline.metrics;
    const bays = results['dedicated-bays'].metrics;
    const sig = results['signalized-overpass'].metrics;

    // Scenario 1 (Dedicated Bays) improves delay & safety over Baseline
    assert.ok(
      bays.avgControlDelaySec < base.avgControlDelaySec || bays.totalConflicts < base.totalConflicts,
      `Scenario 1 should improve over Baseline (delay ${bays.avgControlDelaySec}s vs ${base.avgControlDelaySec}s, conflicts ${bays.totalConflicts} vs ${base.totalConflicts})`
    );

    // Scenario 2 (Signalized + Overpass) strictly reduces pedestrian conflicts & improves safety/delay over Baseline
    assert.ok(
      sig.pedestrianConflicts < base.pedestrianConflicts,
      `Scenario 2 must have strictly fewer vehicle-pedestrian conflicts (${sig.pedestrianConflicts}) than Baseline (${base.pedestrianConflicts})`
    );
    assert.ok(
      sig.avgControlDelaySec <= base.avgControlDelaySec && sig.totalConflicts <= base.totalConflicts,
      `Scenario 2 should improve delay & total conflicts over Baseline (delay ${sig.avgControlDelaySec}s vs ${base.avgControlDelaySec}s, conflicts ${sig.totalConflicts} vs ${base.totalConflicts})`
    );
  });

  it('6. verifies Zustand simStore contract, 60 FPS getLiveSimState, and 3-scenario benchmark runner', () => {
    const store = useSimStore.getState();
    store.resetSimulation();
    assert.ok(getLiveSimState().vehicles.length >= 10, 'frame 1 should be pre-populated');
    assert.equal(getLiveSimState().faults.length, 0, 'frame 1 must have 0 faults');

    // Step 12 frames at 60 FPS (0.2s total) -> advances liveSimState AND publishes UI snapshot
    store.setRunning(true);
    for (let f = 0; f < 12; f++) {
      useSimStore.getState().step(1 / 60);
    }
    assert.ok(getLiveSimState().simTime > 0.15, 'live state should advance at 60 FPS');
    assert.ok(useSimStore.getState().simState.simTime > 0.1, 'UI snapshot should publish ~6 Hz');

    // Camera preset nonce & overlays
    const nonceBefore = useSimStore.getState().cameraPresetNonce;
    useSimStore.getState().setCameraPreset('gates');
    assert.equal(useSimStore.getState().cameraPreset, 'gates');
    assert.equal(useSimStore.getState().cameraPresetNonce, nonceBefore + 1);

    useSimStore.getState().setOverlay('showConflictZones', true);
    assert.equal(useSimStore.getState().overlays.showConflictZones, true);

    // Scenario switch resets cleanly
    useSimStore.getState().setScenario('signalized-overpass');
    assert.equal(useSimStore.getState().params.scenario, 'signalized-overpass');
    assert.equal(getLiveSimState().simTime, 0);
    assert.equal(getLiveSimState().signalState.enabled, true);

    // Capture & runAllScenarioBenchmarks
    useSimStore.getState().runAllScenarioBenchmarks();
    const snaps = useSimStore.getState().scenarioSnapshots;
    assert.ok(snaps.baseline && snaps['dedicated-bays'] && snaps['signalized-overpass']);
    assert.equal(snaps.baseline.metrics.faultCount, 0);
    assert.equal(snaps['dedicated-bays'].metrics.faultCount, 0);
    assert.equal(snaps['signalized-overpass'].metrics.faultCount, 0);
  });
});
