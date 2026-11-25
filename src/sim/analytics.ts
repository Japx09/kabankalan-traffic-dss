import type { RoadNetworkGraph, Vec2 } from '@/gis/types';
import { getGraphSimIndex } from './coordinator';
import { FIXED_PHYSICS_DT, initSimulation, stepSimulation } from './engine';
import {
  SCENARIOS,
  VEHICLE_DIMENSIONS,
  type ConflictEvent,
  type ConflictType,
  type LevelOfService,
  type ScenarioId,
  type ScenarioSnapshot,
  type SimulationMetrics,
  type SimulationParams,
  type SimulationState,
  type VehicleAgent,
} from './types';

interface AnalyticsMemory {
  /** Cooldown timestamp (simTime) of last recorded SSAM conflict per unordered entity pair */
  lastConflictByPair: Map<string, number>;
  /** Currently occupied conflict zone participants: `${zoneId}|${laneId}` -> vehicleId */
  activeZoneOccupancy: Map<string, string>;
  /** Last exit record per `${zoneId}|${laneId}` for true Post-Encroachment Time (PET) */
  lastZoneExit: Map<string, { time: number; vehicleId: string; location: Vec2 }>;
}

const memoryByState = new WeakMap<SimulationState, AnalyticsMemory>();

function getMemory(state: SimulationState): AnalyticsMemory {
  let mem = memoryByState.get(state);
  if (!mem) {
    mem = {
      lastConflictByPair: new Map(),
      activeZoneOccupancy: new Map(),
      lastZoneExit: new Map(),
    };
    memoryByState.set(state, mem);
  }
  return mem;
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}__${b}` : `${b}__${a}`;
}

/**
 * HCM 2010 Level of Service (LOS A–F) based on average control delay (seconds/vehicle).
 * Uses distinct standard thresholds for signalized vs. unsignalized intersections.
 */
export function delayToLOS(delaySec: number, isSignalized: boolean): LevelOfService {
  if (isSignalized) {
    if (delaySec <= 10) return 'A';
    if (delaySec <= 20) return 'B';
    if (delaySec <= 35) return 'C';
    if (delaySec <= 55) return 'D';
    if (delaySec <= 80) return 'E';
    return 'F';
  }
  if (delaySec <= 10) return 'A';
  if (delaySec <= 15) return 'B';
  if (delaySec <= 25) return 'C';
  if (delaySec <= 35) return 'D';
  if (delaySec <= 50) return 'E';
  return 'F';
}

function recordConflict(
  state: SimulationState,
  mem: AnalyticsMemory,
  type: ConflictType,
  entity1Id: string,
  entity2Id: string,
  location: Vec2,
  ttc: number,
  pet: number | null
): void {
  const key = pairKey(entity1Id, entity2Id);
  const prevTime = mem.lastConflictByPair.get(key);
  // Deduplicate same pair within 6.0s window (FHWA SSAM event clustering)
  if (prevTime !== undefined && state.simTime - prevTime < 6.0) {
    return;
  }
  mem.lastConflictByPair.set(key, state.simTime);

  const clampedTtc = Number(Math.max(0.05, ttc).toFixed(2));
  const clampedPet = pet !== null ? Number(Math.max(0.05, pet).toFixed(2)) : null;
  const severity: 'moderate' | 'critical' =
    clampedTtc < 0.8 || (clampedPet !== null && clampedPet < 0.6) ? 'critical' : 'moderate';

  const ev: ConflictEvent = {
    id: `ssam_${state.nextEntityId++}`,
    time: Number(state.simTime.toFixed(2)),
    type,
    location: { x: Number(location.x.toFixed(2)), z: Number(location.z.toFixed(2)) },
    ttc: clampedTtc,
    pet: clampedPet,
    entity1Id,
    entity2Id,
    severity,
    age: 0,
  };

  state.conflicts.push(ev);
  state.totalConflictsEver++;
  state.conflictCountsByType[type]++;
  if (severity === 'critical') {
    state.criticalConflictsEver++;
  }
}

/**
 * Deduplicated FHWA SSAM surrogate safety conflict detector:
 * detects `rear_end`, `weaving`, `crossing` (TTC < 1.5s or PET < 1.2s),
 * and `vehicle_pedestrian` conflicts, aging out visual pulses after 8 seconds.
 */
export function detectSsamConflicts(state: SimulationState, dt: number): void {
  const mem = getMemory(state);
  const { vehicles, pedestrians, graph } = state;

  // Age active visual conflict markers and prune expired (> 8s)
  for (let i = state.conflicts.length - 1; i >= 0; i--) {
    state.conflicts[i].age += dt;
    if (state.conflicts[i].age > 8.0) {
      state.conflicts.splice(i, 1);
    }
  }

  const vehById = new Map<string, VehicleAgent>();
  for (let i = 0; i < vehicles.length; i++) {
    vehById.set(vehicles[i].id, vehicles[i]);
  }

  // 1. Rear-end & Weaving conflicts
  for (let i = 0; i < vehicles.length; i++) {
    const v = vehicles[i];

    if (v.leaderVehicleId && v.leaderGapMeters !== null && v.leaderGapMeters > 0.05) {
      const leader = vehById.get(v.leaderVehicleId);
      if (leader) {
        const closing = v.speed - leader.speed;
        if (closing > 1.25) {
          const ttc = v.leaderGapMeters / closing;
          if (ttc < 1.5) {
            const type: ConflictType = v.laneChangeProgress < 0.95 ? 'weaving' : 'rear_end';
            recordConflict(
              state,
              mem,
              type,
              v.id,
              leader.id,
              {
                x: (v.position.x + leader.position.x) * 0.5,
                z: (v.position.z + leader.position.z) * 0.5,
              },
              ttc,
              null
            );
          }
        }
      }
    }

    // Active MOBIL lane-change lateral weaving proximity
    if (v.laneChangeProgress < 0.92 && v.speed > 2.5) {
      for (let j = 0; j < vehicles.length; j++) {
        if (i === j) continue;
        const other = vehicles[j];
        const dx = other.position.x - v.position.x;
        const dz = other.position.z - v.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 7.5 && dist > 0.5) {
          const relVx = v.speed * Math.sin(v.heading) - other.speed * Math.sin(other.heading);
          const relVz = v.speed * Math.cos(v.heading) - other.speed * Math.cos(other.heading);
          const closing = (relVx * dx + relVz * dz) / dist;
          if (closing > 1.4) {
            const ttc = dist / closing;
            if (ttc < 1.5) {
              recordConflict(
                state,
                mem,
                'weaving',
                v.id,
                other.id,
                {
                  x: (v.position.x + other.position.x) * 0.5,
                  z: (v.position.z + other.position.z) * 0.5,
                },
                ttc,
                null
              );
            }
          }
        }
      }
    }
  }

  // 2. Crossing & Merge Conflict-Zone PET (< 1.2s) & TTC (< 1.5s)
  const index = getGraphSimIndex(graph);
  const currentOcc = new Map<string, { vehicleId: string; location: Vec2 }>();

  for (let i = 0; i < vehicles.length; i++) {
    const v = vehicles[i];
    const entries = index.conflictEntriesByLane.get(v.laneId);
    if (!entries) continue;
    const halfLen = VEHICLE_DIMENSIONS[v.type].length * 0.5;

    for (let k = 0; k < entries.length; k++) {
      const { zone, self, other } = entries[k];
      const inZone = v.s + halfLen >= self.sStart && v.s - halfLen <= self.sEnd;
      if (!inZone) continue;

      const occKey = `${zone.id}|${self.laneId}`;
      currentOcc.set(occKey, { vehicleId: v.id, location: zone.center });

      // If newly entering this conflict box, check PET against conflicting participant's last exit
      if (mem.activeZoneOccupancy.get(occKey) !== v.id) {
        const otherExit = mem.lastZoneExit.get(`${zone.id}|${other.laneId}`);
        if (otherExit && otherExit.vehicleId !== v.id) {
          const pet = state.simTime - otherExit.time;
          if (pet >= 0.05 && pet < 1.2) {
            recordConflict(
              state,
              mem,
              zone.kind === 'merge' ? 'weaving' : 'crossing',
              v.id,
              otherExit.vehicleId,
              zone.center,
              pet,
              pet
            );
          }
        }
      }
    }
  }

  // Update exit records for vehicles that just vacated a conflict zone participant
  for (const [occKey, prevVehId] of mem.activeZoneOccupancy.entries()) {
    const curr = currentOcc.get(occKey);
    if (!curr || curr.vehicleId !== prevVehId) {
      const v = vehById.get(prevVehId);
      const loc = v ? v.position : { x: 0, z: 0 };
      mem.lastZoneExit.set(occKey, { time: state.simTime, vehicleId: prevVehId, location: loc });
    }
  }
  mem.activeZoneOccupancy.clear();
  for (const [occKey, val] of currentOcc.entries()) {
    mem.activeZoneOccupancy.set(occKey, val.vehicleId);
  }

  // 3. Vehicle–Pedestrian conflicts (excludes overpass pedestrians!)
  for (let pi = 0; pi < pedestrians.length; pi++) {
    const ped = pedestrians[pi];
    if (ped.usingOverpass) continue;
    if (ped.state !== 'crossing' && ped.state !== 'in_conflict') continue;

    for (let vi = 0; vi < vehicles.length; vi++) {
      const v = vehicles[vi];
      if (v.speed < 1.1) continue;
      const dx = ped.position.x - v.position.x;
      const dz = ped.position.z - v.position.z;
      const distSq = dx * dx + dz * dz;
      if (distSq > 20 * 20) continue;

      const vFx = Math.sin(v.heading);
      const vFz = Math.cos(v.heading);
      const dim = VEHICLE_DIMENSIONS[v.type];
      const along = dx * vFx + dz * vFz - dim.length * 0.5;
      const lateral = Math.abs(dx * vFz - dz * vFx);

      if (along > -0.6 && along < 18 && lateral < dim.width * 0.5 + 1.85) {
        const ttc = Math.max(0.05, along) / v.speed;
        if (ttc < 1.5) {
          recordConflict(
            state,
            mem,
            'vehicle_pedestrian',
            v.id,
            ped.id,
            { x: ped.position.x, z: ped.position.z },
            ttc,
            null
          );
        }
      }
    }
  }
}

/** Computes aggregate HCM 2010 + FHWA SSAM corridor performance metrics. */
export function computeMetrics(
  state: SimulationState,
  params: SimulationParams
): SimulationMetrics {
  const { vehicles, graph } = state;
  const activeCount = vehicles.length;

  let speedSum = 0;
  let speedCount = 0;
  let activeControlDelaySum = 0;
  let queueVehicles = 0;
  let queueLengthMeters = 0;

  for (let i = 0; i < activeCount; i++) {
    const v = vehicles[i];
    const lane = graph.laneById[v.laneId];
    const isTerminal = Boolean(lane?.isTerminalInternal);
    if (!isTerminal) {
      speedSum += v.speed;
      speedCount++;
      activeControlDelaySum += v.controlDelay;
    }
    if (v.speed < 1.4 && v.state !== 'dwelling' && !isTerminal) {
      queueVehicles++;
      queueLengthMeters += VEHICLE_DIMENSIONS[v.type].length + 2.2;
    }
  }

  const avgSpeedKph = speedCount > 0 ? (speedSum / speedCount) * 3.6 : 0;
  const totalSampled = Math.max(1, state.totalExitedCount + speedCount);
  const avgControlDelaySec = (state.totalControlDelaySum + activeControlDelaySum) / totalSampled;
  const throughputVehPerHour =
    state.simTime >= 1 ? Math.round((state.totalExitedCount / state.simTime) * 3600) : 0;

  const isSignalized = SCENARIOS[params.scenario].signalizedCrossings;

  return {
    activeVehicles: activeCount,
    totalExited: state.totalExitedCount,
    throughputVehPerHour,
    avgSpeedKph: Number(avgSpeedKph.toFixed(1)),
    avgControlDelaySec: Number(avgControlDelaySec.toFixed(1)),
    queueVehicles,
    queueLengthMeters: Number(queueLengthMeters.toFixed(1)),
    los: delayToLOS(avgControlDelaySec, isSignalized),
    totalConflicts: state.totalConflictsEver,
    rearEndConflicts: state.conflictCountsByType.rear_end,
    crossingConflicts: state.conflictCountsByType.crossing,
    weavingConflicts: state.conflictCountsByType.weaving,
    pedestrianConflicts: state.conflictCountsByType.vehicle_pedestrian,
    criticalConflicts: state.criticalConflictsEver,
    laneChangesCompleted: state.laneChangesCompleted,
    faultCount: state.faults.length,
  };
}

/**
 * Runs a deterministic headless comparative benchmark for `scenarioId` over `durationSeconds`.
 * Used by the Compare tab to populate side-by-side KPI metrics across all 3 thesis scenarios.
 */
export function evaluateScenarioBenchmark(
  graph: RoadNetworkGraph,
  params: SimulationParams,
  scenarioId: ScenarioId,
  durationSeconds = 120
): ScenarioSnapshot {
  const runParams: SimulationParams = {
    ...params,
    scenario: scenarioId,
    playbackSpeed: 1,
  };
  const sim = initSimulation(runParams, graph);
  const totalSteps = Math.max(1, Math.round(durationSeconds / FIXED_PHYSICS_DT));
  for (let s = 0; s < totalSteps; s++) {
    stepSimulation(sim, runParams, FIXED_PHYSICS_DT);
  }
  return {
    scenario: scenarioId,
    simTime: Number(sim.simTime.toFixed(1)),
    metrics: { ...sim.metrics },
  };
}
