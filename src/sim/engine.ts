import { buildCeresRoadGraph } from '@/gis/roadGraphBuilder';
import type { RoadNetworkGraph } from '@/gis/types';
import { computeMetrics, detectSsamConflicts } from './analytics';
import {
  IDM_PARAMS,
  computeObbOverlap,
  computeVehiclePose,
  getEffectiveLateralOffset,
  stepVehicles,
} from './coordinator';
import { spawnInitialPedestrians, stepPedestrians } from './pedestrians';
import { initSeed, nextRand, randInt, randRange } from './random';
import {
  SCENARIOS,
  VEHICLE_DIMENSIONS,
  type SignalState,
  type SimVehicleType,
  type SimulationParams,
  type SimulationState,
  type TerminalPhase,
  type VehicleAgent,
} from './types';

export const FIXED_PHYSICS_DT = 0.05;
const MAX_ACTIVE_VEHICLES = 72;
const TELEMETRY_MAX_POINTS = 180;

// Canonical National Road through-corridor suffixes
const NAT_SE_0_AFTER_S1 = [
  'nat_se_0_pz',
  'nat_se_0_s2',
  'nat_se_0_perim',
  'nat_se_0_g2',
  'nat_se_0_s3',
  'nat_se_0_g1',
  'nat_se_0_s4',
  'nat_se_0_rep',
  'nat_se_0_s5',
] as const;

const NAT_SE_1_AFTER_S1 = [
  'nat_se_1_pz',
  'nat_se_1_s2',
  'nat_se_1_perim',
  'nat_se_1_g2',
  'nat_se_1_s3',
  'nat_se_1_g1',
  'nat_se_1_s4',
  'nat_se_1_rep',
  'nat_se_1_s5',
] as const;

const NAT_NW_0_AFTER_S1 = [
  'nat_nw_0_rep',
  'nat_nw_0_s2',
  'nat_nw_0_g1',
  'nat_nw_0_s3',
  'nat_nw_0_g2',
  'nat_nw_0_s4',
  'nat_nw_0_pz',
  'nat_nw_0_s5',
] as const;

const NAT_NW_1_AFTER_S1 = [
  'nat_nw_1_rep',
  'nat_nw_1_s2',
  'nat_nw_1_g1',
  'nat_nw_1_s3',
  'nat_nw_1_g2',
  'nat_nw_1_s4',
  'nat_nw_1_pz',
  'nat_nw_1_s5',
] as const;

const CERES_EGRESS_SE = [
  'ceres_gate2_egress_se',
  'nat_se_0_s3',
  'nat_se_0_g1',
  'nat_se_0_s4',
  'nat_se_0_rep',
  'nat_se_0_s5',
] as const;

const CERES_EGRESS_NW = [
  'ceres_gate2_egress_nw',
  'nat_nw_1_s4',
  'nat_nw_1_pz',
  'nat_nw_1_s5',
] as const;

/** Updates Scenario 2 pedestrian-actuated crossing signal phase (52s cycle: 38G / 3Y / 11R). */
export function computeSignalState(simTime: number, params: SimulationParams): SignalState {
  const scenario = SCENARIOS[params.scenario];
  if (!scenario.signalizedCrossings) {
    return {
      enabled: false,
      vehicularPhase: 'green',
      pedestrianPhase: 'dont_walk',
      phaseRemainingSeconds: 0,
    };
  }

  const cycle = 54;
  const t = simTime % cycle;
  if (t < 40) {
    return {
      enabled: true,
      vehicularPhase: 'green',
      pedestrianPhase: 'dont_walk',
      phaseRemainingSeconds: Number((40 - t).toFixed(1)),
    };
  }
  if (t < 44) {
    return {
      enabled: true,
      vehicularPhase: 'yellow',
      pedestrianPhase: 'dont_walk',
      phaseRemainingSeconds: Number((44 - t).toFixed(1)),
    };
  }
  if (t < 50) {
    return {
      enabled: true,
      vehicularPhase: 'red',
      pedestrianPhase: 'walk',
      phaseRemainingSeconds: Number((50 - t).toFixed(1)),
    };
  }
  return {
    enabled: true,
    vehicularPhase: 'red',
    pedestrianPhase: 'flashing',
    phaseRemainingSeconds: Number((54 - t).toFixed(1)),
  };
}

/** Creates a fully initialized `VehicleAgent` placed cleanly on the RoadNetworkGraph. */
export function createVehicleAgent(
  graph: RoadNetworkGraph,
  opts: {
    id: string;
    type: SimVehicleType;
    laneId: string;
    s: number;
    routeQueue: string[];
    speed?: number;
    desiredSpeed?: number;
    lateralOffset?: number;
    terminalPhase?: TerminalPhase;
    stagingBayIndex?: number | null;
    dwellTimer?: number;
    hasDwelled?: boolean;
    entryTime?: number;
    colorVariant?: number;
  }
): VehicleAgent {
  const lane = graph.laneById[opts.laneId];
  if (!lane) throw new Error(`Unknown laneId in createVehicleAgent: ${opts.laneId}`);

  const p = IDM_PARAMS[opts.type];
  const desiredSpeed = opts.desiredSpeed ?? p.v0;
  const speed = opts.speed ?? Math.min(desiredSpeed * 0.85, lane.speedLimit * 0.85);
  const lateralOffset = opts.lateralOffset ?? (opts.type === 'tricycle' && lane.roadId === 'national_rd' ? -0.42 : 0);
  const dwellTimer = opts.dwellTimer ?? 0;

  const v: VehicleAgent = {
    id: opts.id,
    type: opts.type,
    laneId: opts.laneId,
    s: opts.s,
    routeQueue: opts.routeQueue.slice(),
    position: { x: 0, z: 0 },
    heading: 0,
    speed: dwellTimer > 0 ? 0 : speed,
    desiredSpeed,
    acc: 0,
    lateralOffset,
    targetLateralOffset: lateralOffset,
    laneChangeProgress: 1,
    laneChangeFromOffset: 0,
    turnSignal: 'none',
    state: dwellTimer > 0 ? 'dwelling' : 'cruising',
    terminalPhase: opts.terminalPhase ?? 'none',
    stagingBayIndex: opts.stagingBayIndex ?? null,
    dwellTimer,
    hasDwelled: opts.hasDwelled ?? false,
    entryTime: opts.entryTime ?? 0,
    accumulatedDelay: 0,
    controlDelay: 0,
    stoppedDelay: 0,
    leaderVehicleId: null,
    leaderGapMeters: null,
    yieldingReason: dwellTimer > 0 ? 'Terminal dwell' : null,
    conflictingVehicleId: null,
    activeConflictZoneId: null,
    isBrakingLightOn: dwellTimer > 0,
    mobilCooldown: 0,
    colorVariant: opts.colorVariant ?? 0,
    trail: [],
  };

  const pose = computeVehiclePose(graph, v.laneId, v.s, getEffectiveLateralOffset(v));
  v.position = pose.position;
  v.heading = pose.heading;
  v.trail.push({ x: pose.position.x, z: pose.position.z });
  return v;
}

/** Verifies entry clearance (longitudinal + strict 2D OBB buffer) before spawning. */
function isSpawnClear(
  state: SimulationState,
  laneId: string,
  sSpawn: number,
  type: SimVehicleType
): boolean {
  const { graph, vehicles } = state;
  const lane = graph.laneById[laneId];
  if (!lane || sSpawn < 0 || sSpawn > lane.length) return false;

  const halfLen = VEHICLE_DIMENSIONS[type].length * 0.5;
  const minLongGap = IDM_PARAMS[type].s0 + 5.5;
  const pose = computeVehiclePose(graph, laneId, sSpawn, 0);

  for (let i = 0; i < vehicles.length; i++) {
    const other = vehicles[i];
    if (other.laneId === laneId) {
      const oHalf = VEHICLE_DIMENSIONS[other.type].length * 0.5;
      if (Math.abs(other.s - sSpawn) < halfLen + oHalf + minLongGap) {
        return false;
      }
    }
    if (
      computeObbOverlap(
        pose.position,
        pose.heading,
        type,
        other.position,
        other.heading,
        other.type,
        1.5
      ) > 0
    ) {
      return false;
    }
  }
  return true;
}

function countTerminalBuses(vehicles: readonly VehicleAgent[]): number {
  let count = 0;
  for (let i = 0; i < vehicles.length; i++) {
    const v = vehicles[i];
    if (v.type === 'bus' && v.terminalPhase !== 'none') count++;
  }
  return count;
}

/** Builds a valid, vehicle-class-compliant `(laneId, routeQueue)` pair for spawning. */
function pickSpawnRoute(
  state: SimulationState,
  type: SimVehicleType
): { laneId: string; routeQueue: string[]; terminalPhase: TerminalPhase; stagingBayIndex: number | null } {
  const [uEntry, s1] = nextRand(state.rngState);
  const [uBranch, s2] = nextRand(s1);
  const [uLoop, s3] = nextRand(s2);
  const [uExit, s4] = nextRand(s3);
  state.rngState = s4;

  // Buses: National Road SE/NW, with ~70% looping through Ceres Terminal when yard has room
  if (type === 'bus') {
    const yardHasRoom = countTerminalBuses(state.vehicles) < 4;
    const enterTerminal = yardHasRoom && uBranch < 0.72;
    const internalLane = uLoop < 0.55 ? 'ceres_alighting_lane' : 'ceres_staging_loop';
    const egress = uExit < 0.55 ? CERES_EGRESS_SE : CERES_EGRESS_NW;
    const bayIdx = internalLane === 'ceres_staging_loop' ? Math.floor(uExit * 3) % 3 : null;

    if (uEntry < 0.52) {
      // SE-bound bus
      if (enterTerminal) {
        return {
          laneId: 'nat_se_0_s1',
          routeQueue: [
            'nat_se_0_pz',
            'nat_se_0_s2',
            'nat_se_0_perim',
            'nat_se_0_g2',
            'nat_se_0_s3',
            'ceres_gate1_ingress',
            'ceres_gate1_throat',
            internalLane,
            'ceres_gate2_throat',
            ...egress,
          ],
          terminalPhase: 'none',
          stagingBayIndex: bayIdx,
        };
      }
      const laneId = uBranch < 0.85 ? 'nat_se_0_s1' : 'nat_se_1_s1';
      return {
        laneId,
        routeQueue: laneId === 'nat_se_0_s1' ? [...NAT_SE_0_AFTER_S1] : [...NAT_SE_1_AFTER_S1],
        terminalPhase: 'none',
        stagingBayIndex: null,
      };
    }

    // NW-bound bus
    if (enterTerminal) {
      return {
        laneId: 'nat_nw_1_s1',
        routeQueue: [
          'nat_nw_1_rep',
          'nat_nw_1_s2',
          'turn_nw_to_gate1',
          'ceres_gate1_throat',
          internalLane,
          'ceres_gate2_throat',
          ...egress,
        ],
        terminalPhase: 'none',
        stagingBayIndex: bayIdx,
      };
    }
    const laneId = uBranch < 0.85 ? 'nat_nw_0_s1' : 'nat_nw_1_s1';
    return {
      laneId,
      routeQueue: laneId === 'nat_nw_0_s1' ? [...NAT_NW_0_AFTER_S1] : [...NAT_NW_1_AFTER_S1],
      terminalPhase: 'none',
      stagingBayIndex: null,
    };
  }

  // Tricycles: strictly outer National Road lanes (`*_0_*`) + side streets (right turns onto `*_0_*`)
  if (type === 'tricycle') {
    if (uEntry < 0.4) {
      return {
        laneId: 'nat_se_0_s1',
        routeQueue:
          uBranch < 0.12
            ? ['nat_se_0_pz', 'nat_se_0_s2', 'turn_se_to_perim', 'perimeter_sw']
            : [...NAT_SE_0_AFTER_S1],
        terminalPhase: 'none',
        stagingBayIndex: null,
      };
    }
    if (uEntry < 0.78) {
      if (uBranch < 0.12) {
        return {
          laneId: 'nat_nw_0_s1',
          routeQueue: ['turn_nw_to_repollo', 'repollo_nb'],
          terminalPhase: 'none',
          stagingBayIndex: null,
        };
      }
      if (uBranch < 0.24) {
        return {
          laneId: 'nat_nw_0_s1',
          routeQueue: [
            'nat_nw_0_rep',
            'nat_nw_0_s2',
            'nat_nw_0_g1',
            'nat_nw_0_s3',
            'nat_nw_0_g2',
            'nat_nw_0_s4',
            'turn_nw_to_pz',
            'pedro_zayco_nb',
          ],
          terminalPhase: 'none',
          stagingBayIndex: null,
        };
      }
      return {
        laneId: 'nat_nw_0_s1',
        routeQueue: [...NAT_NW_0_AFTER_S1],
        terminalPhase: 'none',
        stagingBayIndex: null,
      };
    }
    if (uEntry < 0.88) {
      return {
        laneId: 'pedro_zayco_sb',
        routeQueue: ['turn_pz_to_nw', 'nat_nw_0_s5'],
        terminalPhase: 'none',
        stagingBayIndex: null,
      };
    }
    if (uEntry < 0.94) {
      return {
        laneId: 'repollo_sb',
        routeQueue: [
          'turn_repollo_to_nw',
          'nat_nw_0_s2',
          'nat_nw_0_g1',
          'nat_nw_0_s3',
          'nat_nw_0_g2',
          'nat_nw_0_s4',
          'nat_nw_0_pz',
          'nat_nw_0_s5',
        ],
        terminalPhase: 'none',
        stagingBayIndex: null,
      };
    }
    return {
      laneId: 'perimeter_ne',
      routeQueue: [
        'turn_perim_to_se',
        'nat_se_0_g2',
        'nat_se_0_s3',
        'nat_se_0_g1',
        'nat_se_0_s4',
        'nat_se_0_rep',
        'nat_se_0_s5',
      ],
      terminalPhase: 'none',
      stagingBayIndex: null,
    };
  }

  // Cars & Jeepneys: full corridor network (National Rd lanes 0 & 1 + side streets + turns)
  if (uEntry < 0.24) {
    // SE outer lane (jeepneys often use outer lane for curb loading; cars overtake via MOBIL!)
    return {
      laneId: 'nat_se_0_s1',
      routeQueue:
        uBranch < 0.08
          ? ['nat_se_0_pz', 'nat_se_0_s2', 'turn_se_to_perim', 'perimeter_sw']
          : [...NAT_SE_0_AFTER_S1],
      terminalPhase: 'none',
      stagingBayIndex: null,
    };
  }
  if (uEntry < 0.44) {
    // SE inner fast lane
    if (uBranch < 0.14) {
      return {
        laneId: 'nat_se_1_s1',
        routeQueue: ['turn_se_to_pz', 'pedro_zayco_nb'],
        terminalPhase: 'none',
        stagingBayIndex: null,
      };
    }
    if (uBranch < 0.24) {
      return {
        laneId: 'nat_se_1_s1',
        routeQueue: [
          'nat_se_1_pz',
          'nat_se_1_s2',
          'nat_se_1_perim',
          'nat_se_1_g2',
          'nat_se_1_s3',
          'nat_se_1_g1',
          'nat_se_1_s4',
          'turn_se_to_repollo',
          'repollo_nb',
        ],
        terminalPhase: 'none',
        stagingBayIndex: null,
      };
    }
    return {
      laneId: 'nat_se_1_s1',
      routeQueue: [...NAT_SE_1_AFTER_S1],
      terminalPhase: 'none',
      stagingBayIndex: null,
    };
  }
  if (uEntry < 0.65) {
    // NW outer lane
    if (uBranch < 0.1) {
      return {
        laneId: 'nat_nw_0_s1',
        routeQueue: ['turn_nw_to_repollo', 'repollo_nb'],
        terminalPhase: 'none',
        stagingBayIndex: null,
      };
    }
    if (uBranch < 0.22) {
      return {
        laneId: 'nat_nw_0_s1',
        routeQueue: [
          'nat_nw_0_rep',
          'nat_nw_0_s2',
          'nat_nw_0_g1',
          'nat_nw_0_s3',
          'nat_nw_0_g2',
          'nat_nw_0_s4',
          'turn_nw_to_pz',
          'pedro_zayco_nb',
        ],
        terminalPhase: 'none',
        stagingBayIndex: null,
      };
    }
    return {
      laneId: 'nat_nw_0_s1',
      routeQueue: [...NAT_NW_0_AFTER_S1],
      terminalPhase: 'none',
      stagingBayIndex: null,
    };
  }
  if (uEntry < 0.84) {
    // NW inner fast lane
    return {
      laneId: 'nat_nw_1_s1',
      routeQueue: [...NAT_NW_1_AFTER_S1],
      terminalPhase: 'none',
      stagingBayIndex: null,
    };
  }
  if (uEntry < 0.92) {
    // Pedro Zayco SB side street
    return {
      laneId: 'pedro_zayco_sb',
      routeQueue:
        uBranch < 0.55
          ? ['turn_pz_to_nw', 'nat_nw_0_s5']
          : [
              'turn_pz_to_se',
              'nat_se_1_s2',
              'nat_se_1_perim',
              'nat_se_1_g2',
              'nat_se_1_s3',
              'nat_se_1_g1',
              'nat_se_1_s4',
              'nat_se_1_rep',
              'nat_se_1_s5',
            ],
      terminalPhase: 'none',
      stagingBayIndex: null,
    };
  }
  if (uEntry < 0.97) {
    // Repollo SB side street
    return {
      laneId: 'repollo_sb',
      routeQueue:
        uBranch < 0.6
          ? [
              'turn_repollo_to_nw',
              'nat_nw_0_s2',
              'nat_nw_0_g1',
              'nat_nw_0_s3',
              'nat_nw_0_g2',
              'nat_nw_0_s4',
              'nat_nw_0_pz',
              'nat_nw_0_s5',
            ]
          : ['turn_repollo_to_se', 'nat_se_1_s5'],
      terminalPhase: 'none',
      stagingBayIndex: null,
    };
  }
  return {
    laneId: 'perimeter_ne',
    routeQueue: [
      'turn_perim_to_se',
      'nat_se_0_g2',
      'nat_se_0_s3',
      'nat_se_0_g1',
      'nat_se_0_s4',
      'nat_se_0_rep',
      'nat_se_0_s5',
    ],
    terminalPhase: 'none',
    stagingBayIndex: null,
  };
}

function trySpawnVehicle(state: SimulationState, type: SimVehicleType): void {
  if (state.vehicles.length >= MAX_ACTIVE_VEHICLES) return;

  const route = pickSpawnRoute(state, type);
  const sSpawn = Math.min(4.0, VEHICLE_DIMENSIONS[type].length * 0.5 + 0.5);
  if (!isSpawnClear(state, route.laneId, sSpawn, type)) return;

  const p = IDM_PARAMS[type];
  const [speedJitter, s1] = randRange(state.rngState, 0.9, 1.08);
  const [colorVar, s2] = randInt(s1, 0, 6);
  state.rngState = s2;

  const desiredSpeed = Number((p.v0 * speedJitter).toFixed(2));
  const lane = state.graph.laneById[route.laneId];
  const initSpeed = Math.min(desiredSpeed * 0.85, lane.speedLimit * 0.85);

  const agent = createVehicleAgent(state.graph, {
    id: `${type}_${state.nextEntityId++}`,
    type,
    laneId: route.laneId,
    s: sSpawn,
    routeQueue: route.routeQueue,
    speed: initSpeed,
    desiredSpeed,
    terminalPhase: route.terminalPhase,
    stagingBayIndex: route.stagingBayIndex,
    entryTime: state.simTime,
    colorVariant: colorVar,
  });

  state.vehicles.push(agent);
}

/** Spawns buses on scheduled headways and PUV/car demand via Poisson arrivals. */
function spawnTrafficDemand(state: SimulationState, params: SimulationParams, dt: number): void {
  // 1. Ceres Bus headway schedule
  const busHeadway = Math.max(15, params.busHeadwaySeconds);
  if (state.simTime - state.lastBusSpawnTime >= busHeadway) {
    const beforeCount = state.vehicles.length;
    trySpawnVehicle(state, 'bus');
    if (state.vehicles.length > beforeCount) {
      state.lastBusSpawnTime = state.simTime;
    }
  }

  // 2. Poisson arrival rates for jeepneys, tricycles, and cars
  const streams: ReadonlyArray<{ type: SimVehicleType; ratePerHour: number }> = [
    { type: 'jeepney', ratePerHour: params.jeepneyRatePerHour },
    { type: 'tricycle', ratePerHour: params.tricycleRatePerHour },
    { type: 'car', ratePerHour: params.carRatePerHour },
  ];

  for (let i = 0; i < streams.length; i++) {
    const { type, ratePerHour } = streams[i];
    const lambda = Math.max(0, ratePerHour) / 3600;
    const [u, sNext] = nextRand(state.rngState);
    state.rngState = sNext;
    if (u < 1 - Math.exp(-lambda * dt)) {
      trySpawnVehicle(state, type);
    }
  }
}

/**
 * Initializes a deterministic `SimulationState` pre-populated with realistic,
 * well-spaced vehicles across National Road, side streets, and Ceres Terminal
 * so Frame 1 is immediately active with ZERO physical faults.
 */
export function initSimulation(
  params: SimulationParams,
  existingGraph?: RoadNetworkGraph
): SimulationState {
  const graph = existingGraph ?? buildCeresRoadGraph();
  const rngState = initSeed(params.seed);

  const state: SimulationState = {
    graph,
    simTime: 0,
    vehicles: [],
    pedestrians: [],
    conflicts: [],
    faults: [],
    signalState: computeSignalState(0, params),
    metrics: {
      activeVehicles: 0,
      totalExited: 0,
      throughputVehPerHour: 0,
      avgSpeedKph: 0,
      avgControlDelaySec: 0,
      queueVehicles: 0,
      queueLengthMeters: 0,
      los: 'A',
      totalConflicts: 0,
      rearEndConflicts: 0,
      crossingConflicts: 0,
      weavingConflicts: 0,
      pedestrianConflicts: 0,
      criticalConflicts: 0,
      laneChangesCompleted: 0,
      faultCount: 0,
    },
    telemetryHistory: [],
    totalExitedCount: 0,
    totalControlDelaySum: 0,
    totalConflictsEver: 0,
    conflictCountsByType: {
      rear_end: 0,
      crossing: 0,
      weaving: 0,
      vehicle_pedestrian: 0,
    },
    criticalConflictsEver: 0,
    laneChangesCompleted: 0,
    nextEntityId: 1,
    lastBusSpawnTime: -18,
    lastTelemetrySampleTime: -1,
    rngState,
  };

  // Pre-populate well-spaced initial vehicles (guaranteed OBB-disjoint!)
  const seeds: Array<{
    type: SimVehicleType;
    laneId: string;
    s: number;
    routeQueue: string[];
    terminalPhase?: TerminalPhase;
    stagingBayIndex?: number | null;
    dwellTimer?: number;
    colorVariant: number;
  }> = [
    // 2 Ceres Buses already active inside the terminal (Alighting + Staging)
    {
      type: 'bus',
      laneId: 'ceres_alighting_lane',
      s: 27.5,
      routeQueue: ['ceres_gate2_throat', ...CERES_EGRESS_SE],
      terminalPhase: 'alighting',
      dwellTimer: 5.5,
      colorVariant: 0,
    },
    {
      type: 'bus',
      laneId: 'ceres_staging_loop',
      s: 46.0,
      routeQueue: ['ceres_gate2_throat', ...CERES_EGRESS_NW],
      terminalPhase: 'staging',
      stagingBayIndex: 0,
      dwellTimer: 8.5,
      colorVariant: 1,
    },
    // 1 Ceres Bus approaching Gate 1 along National Rd SE
    {
      type: 'bus',
      laneId: 'nat_se_0_s1',
      s: 62.0,
      routeQueue: [
        'nat_se_0_pz',
        'nat_se_0_s2',
        'nat_se_0_perim',
        'nat_se_0_g2',
        'nat_se_0_s3',
        'ceres_gate1_ingress',
        'ceres_gate1_throat',
        'ceres_alighting_lane',
        'ceres_gate2_throat',
        ...CERES_EGRESS_SE,
      ],
      colorVariant: 2,
    },
    // National Road SE traffic (outer & inner lanes cleanly separated)
    {
      type: 'tricycle',
      laneId: 'nat_se_0_s1',
      s: 36.0,
      routeQueue: [...NAT_SE_0_AFTER_S1],
      colorVariant: 1,
    },
    {
      type: 'car',
      laneId: 'nat_se_0_s1',
      s: 12.0,
      routeQueue: [...NAT_SE_0_AFTER_S1],
      colorVariant: 2,
    },
    {
      type: 'car',
      laneId: 'nat_se_1_s1',
      s: 52.0,
      routeQueue: [...NAT_SE_1_AFTER_S1],
      colorVariant: 3,
    },
    {
      type: 'jeepney',
      laneId: 'nat_se_0_s4',
      s: 32.0,
      routeQueue: ['nat_se_0_rep', 'nat_se_0_s5'],
      colorVariant: 0,
    },
    {
      type: 'car',
      laneId: 'nat_se_1_s4',
      s: 60.0,
      routeQueue: ['nat_se_1_rep', 'nat_se_1_s5'],
      colorVariant: 4,
    },
    // National Road NW traffic
    {
      type: 'tricycle',
      laneId: 'nat_nw_0_s2',
      s: 42.0,
      routeQueue: [
        'nat_nw_0_g1',
        'nat_nw_0_s3',
        'nat_nw_0_g2',
        'nat_nw_0_s4',
        'nat_nw_0_pz',
        'nat_nw_0_s5',
      ],
      colorVariant: 2,
    },
    {
      type: 'car',
      laneId: 'nat_nw_0_s2',
      s: 18.0,
      routeQueue: [
        'nat_nw_0_g1',
        'nat_nw_0_s3',
        'nat_nw_0_g2',
        'nat_nw_0_s4',
        'nat_nw_0_pz',
        'nat_nw_0_s5',
      ],
      colorVariant: 5,
    },
    {
      type: 'jeepney',
      laneId: 'nat_nw_1_s2',
      s: 58.0,
      routeQueue: [
        'nat_nw_1_g1',
        'nat_nw_1_s3',
        'nat_nw_1_g2',
        'nat_nw_1_s4',
        'nat_nw_1_pz',
        'nat_nw_1_s5',
      ],
      colorVariant: 1,
    },
    {
      type: 'car',
      laneId: 'nat_nw_1_s5',
      s: 30.0,
      routeQueue: [],
      colorVariant: 0,
    },
    // Side streets (Pedro Zayco & Repollo)
    {
      type: 'jeepney',
      laneId: 'pedro_zayco_sb',
      s: 88.0,
      routeQueue: ['turn_pz_to_nw', 'nat_nw_0_s5'],
      colorVariant: 3,
    },
    {
      type: 'tricycle',
      laneId: 'repollo_sb',
      s: 70.0,
      routeQueue: [
        'turn_repollo_to_nw',
        'nat_nw_0_s2',
        'nat_nw_0_g1',
        'nat_nw_0_s3',
        'nat_nw_0_g2',
        'nat_nw_0_s4',
        'nat_nw_0_pz',
        'nat_nw_0_s5',
      ],
      colorVariant: 4,
    },
  ];

  for (const spec of seeds) {
    const v = createVehicleAgent(graph, {
      id: `${spec.type}_${state.nextEntityId++}`,
      type: spec.type,
      laneId: spec.laneId,
      s: spec.s,
      routeQueue: spec.routeQueue,
      terminalPhase: spec.terminalPhase,
      stagingBayIndex: spec.stagingBayIndex,
      dwellTimer: spec.dwellTimer,
      colorVariant: spec.colorVariant,
    });
    state.vehicles.push(v);
  }

  spawnInitialPedestrians(state, params);
  state.metrics = computeMetrics(state, params);
  return state;
}

function stepSingleTick(state: SimulationState, params: SimulationParams, dt: number): void {
  state.simTime += dt;
  state.signalState = computeSignalState(state.simTime, params);

  spawnTrafficDemand(state, params, dt);
  stepPedestrians(state, params, dt);
  stepVehicles(state, params, dt);
  detectSsamConflicts(state, dt);
  state.metrics = computeMetrics(state, params);

  // Sample 1-second telemetry ring buffer (last 180 points)
  if (state.simTime - state.lastTelemetrySampleTime >= 1.0 - 1e-6) {
    state.lastTelemetrySampleTime = Math.floor(state.simTime);
    const conflictsPerMin =
      state.simTime >= 1 ? Number(((state.totalConflictsEver / state.simTime) * 60).toFixed(1)) : 0;
    state.telemetryHistory.push({
      time: Number(state.simTime.toFixed(1)),
      avgSpeedKph: state.metrics.avgSpeedKph,
      avgDelaySec: state.metrics.avgControlDelaySec,
      queueLength: state.metrics.queueVehicles,
      activeVehicles: state.metrics.activeVehicles,
      conflictsPerMin,
    });
    if (state.telemetryHistory.length > TELEMETRY_MAX_POINTS) {
      state.telemetryHistory.shift();
    }
  }
}

/**
 * Advances `state` deterministically by `dt` simulated seconds using fixed `0.05s` physics ticks.
 */
export function stepSimulation(
  state: SimulationState,
  params: SimulationParams,
  dt: number
): SimulationState {
  const clampedDt = Math.max(0, Math.min(dt, 1.0));
  if (clampedDt <= 0) return state;

  let remaining = clampedDt;
  while (remaining > 1e-6) {
    const subDt = remaining > FIXED_PHYSICS_DT + 1e-6 ? FIXED_PHYSICS_DT : remaining;
    stepSingleTick(state, params, subDt);
    remaining -= subDt;
  }
  return state;
}
