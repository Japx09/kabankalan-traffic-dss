import type { Crosswalk, Vec2 } from '@/gis/types';
import { nextRand, randInt, randRange } from './random';
import {
  SCENARIOS,
  VEHICLE_DIMENSIONS,
  type PedestrianAgent,
  type SimulationParams,
  type SimulationState,
  type VehicleAgent,
} from './types';

const SHIRT_PALETTE = [
  '#e2e8f0',
  '#38bdf8',
  '#f59e0b',
  '#ef4444',
  '#10b981',
  '#a78bfa',
  '#fb7185',
  '#facc15',
] as const;

const MAX_ACTIVE_PEDESTRIANS = 26;

function computePedestrianPosition(cw: Crosswalk, progress: number, lateralShift: number): Vec2 {
  const bx = cw.curbStart.x + (cw.curbEnd.x - cw.curbStart.x) * progress;
  const bz = cw.curbStart.z + (cw.curbEnd.z - cw.curbStart.z) * progress;
  return {
    x: bx + cw.tangent.x * lateralShift,
    z: bz + cw.tangent.z * lateralShift,
  };
}

function computePedestrianHeading(cw: Crosswalk, direction: 1 | -1): number {
  return Math.atan2(cw.normal.x * direction, cw.normal.z * direction);
}

/**
 * Computes minimum Time-To-Collision (seconds) from all approaching vehicles
 * to a pedestrian's crossing line across the roadway.
 */
function minApproachingVehicleTtc(
  ped: PedestrianAgent,
  cw: Crosswalk,
  vehicles: readonly VehicleAgent[]
): { minTtc: number; nearestDist: number } {
  let minTtc = Infinity;
  let nearestDist = Infinity;

  // Crossing line center shifted along road tangent by pedestrian's lateralShift
  const crossCenterX = cw.center.x + cw.tangent.x * ped.lateralShift;
  const crossCenterZ = cw.center.z + cw.tangent.z * ped.lateralShift;

  for (let i = 0; i < vehicles.length; i++) {
    const v = vehicles[i];
    const dx = crossCenterX - v.position.x;
    const dz = crossCenterZ - v.position.z;
    const distSq = dx * dx + dz * dz;
    if (distSq > 55 * 55) continue;

    // Check vehicle is on the same road corridor and heading toward the crossing point
    const vFx = Math.sin(v.heading);
    const vFz = Math.cos(v.heading);
    const along = dx * vFx + dz * vFz;
    const halfLen = VEHICLE_DIMENSIONS[v.type].length * 0.5;
    const bumperDist = along - halfLen;
    if (bumperDist < -2.0) continue; // Already passed crossing line

    // Lateral distance of vehicle to pedestrian's remaining path across road
    const pdx = ped.position.x - v.position.x;
    const pdz = ped.position.z - v.position.z;
    const perpToVeh = Math.abs(pdx * vFz - pdz * vFx);
    if (perpToVeh > cw.length + 1.5) continue;

    const absDist = Math.max(0, bumperDist);
    if (absDist < nearestDist) nearestDist = absDist;

    if (absDist < 2.2) {
      minTtc = 0;
      break;
    }

    if (v.speed > 0.4) {
      const ttc = absDist / v.speed;
      if (ttc < minTtc) minTtc = ttc;
    }
  }

  return { minTtc, nearestDist };
}

function createPedestrian(
  state: SimulationState,
  params: SimulationParams,
  cw: Crosswalk,
  initialProgress?: number
): PedestrianAgent {
  const scenario = SCENARIOS[params.scenario];
  const [uDir, s1] = nextRand(state.rngState);
  const direction: 1 | -1 = uDir < 0.5 ? 1 : -1;
  const [uJay, s2] = nextRand(s1);
  const [uShift, s3] = randRange(s2, -1, 1);
  const [shirtIdx, s4] = randInt(s3, 0, SHIRT_PALETTE.length);
  state.rngState = s4;

  const usingOverpass = scenario.hasPedestrianOverpass && cw.id === 'cw_ceres_frontage';
  const isJaywalking =
    !usingOverpass && cw.id === 'cw_ceres_frontage' && uJay < scenario.jaywalkingRate;

  let lateralShift: number;
  if (usingOverpass) {
    lateralShift = uShift * 0.7;
  } else if (isJaywalking) {
    const sign = uShift >= 0 ? 1 : -1;
    lateralShift = sign * (5.5 + Math.abs(uShift) * 8.0);
  } else {
    lateralShift = uShift * (cw.width * 0.34);
  }

  const progress =
    initialProgress !== undefined ? initialProgress : direction === 1 ? 0.0 : 1.0;

  return {
    id: `ped_${state.nextEntityId++}`,
    crosswalkId: cw.id,
    position: computePedestrianPosition(cw, progress, lateralShift),
    heading: computePedestrianHeading(cw, direction),
    speed: usingOverpass ? 1.35 : 0,
    progress,
    direction,
    isJaywalking,
    lateralShift,
    state: usingOverpass ? 'crossing' : 'waiting',
    waitTime: 0,
    usingOverpass,
    shirtColor: SHIRT_PALETTE[shirtIdx],
  };
}

/** Seeds initial pedestrians at frame 0 so the corridor immediately appears active. */
export function spawnInitialPedestrians(
  state: SimulationState,
  params: SimulationParams
): void {
  const { crosswalks } = state.graph;
  if (crosswalks.length === 0) return;

  const ceresCw = crosswalks.find((c) => c.id === 'cw_ceres_frontage') ?? crosswalks[0];
  const pzCw = crosswalks.find((c) => c.id === 'cw_pedro_zayco') ?? crosswalks[0];

  state.pedestrians.push(
    createPedestrian(state, params, ceresCw),
    createPedestrian(state, params, ceresCw),
    createPedestrian(state, params, pzCw)
  );
}

/** Spawns & updates all pedestrians with Social Force gap acceptance and signal compliance. */
export function stepPedestrians(
  state: SimulationState,
  params: SimulationParams,
  dt: number
): void {
  const { graph, pedestrians, vehicles, signalState } = state;
  const scenario = SCENARIOS[params.scenario];
  if (graph.crosswalks.length === 0) return;

  // 1. Poisson pedestrian arrivals across the 3 corridor crosswalks
  if (pedestrians.length < MAX_ACTIVE_PEDESTRIANS) {
    const ratePerSec = Math.max(0, params.pedestrianRatePerHour) / 3600;
    const [uSpawn, s1] = nextRand(state.rngState);
    state.rngState = s1;
    if (uSpawn < 1 - Math.exp(-ratePerSec * dt)) {
      const [uCw, s2] = nextRand(state.rngState);
      state.rngState = s2;
      // Weighted demand: 58% Ceres Terminal frontage, 28% Pedro Zayco, 14% Repollo
      const cwId =
        uCw < 0.58
          ? 'cw_ceres_frontage'
          : uCw < 0.86
            ? 'cw_pedro_zayco'
            : 'cw_repollo';
      const cw = graph.crosswalks.find((c) => c.id === cwId) ?? graph.crosswalks[0];
      pedestrians.push(createPedestrian(state, params, cw));
    }
  }

  const cwById = new Map(graph.crosswalks.map((c) => [c.id, c]));

  // 2. Step each pedestrian
  for (let i = pedestrians.length - 1; i >= 0; i--) {
    const ped = pedestrians[i];
    const cw = cwById.get(ped.crosswalkId);
    if (!cw) {
      pedestrians.splice(i, 1);
      continue;
    }

    // Overpass pedestrians cross smoothly at grade-separated elevation with zero vehicle conflict
    if (ped.usingOverpass) {
      ped.state = 'crossing';
      ped.speed = 1.38;
      ped.progress += (ped.direction * ped.speed * dt) / cw.length;
      if ((ped.direction === 1 && ped.progress >= 1) || (ped.direction === -1 && ped.progress <= 0)) {
        ped.state = 'completed';
        pedestrians.splice(i, 1);
        continue;
      }
      ped.position = computePedestrianPosition(cw, ped.progress, ped.lateralShift);
      continue;
    }

    const { minTtc, nearestDist } = minApproachingVehicleTtc(ped, cw, vehicles);

    if (ped.state === 'waiting') {
      ped.waitTime += dt;
      ped.speed = 0;

      const isSignalControlled =
        scenario.signalizedCrossings && cw.signalizedInScenario2 && !ped.isJaywalking;

      let canCross = false;
      if (isSignalControlled) {
        // Strict Scenario 2 signal compliance: cross only during protected WALK phase + clear gap
        canCross =
          signalState.pedestrianPhase === 'walk' && minTtc >= 3.0 && nearestDist >= 4.0;
      } else {
        // Unsignalized Social Force gap acceptance (TTC >= 3.0s regular, riskier 1.65s jaywalkers)
        const baseGap = ped.isJaywalking ? 1.65 : 3.0;
        const patienceRelax = ped.waitTime > 12 ? 0.35 : 0;
        const requiredTtc = Math.max(1.4, baseGap - patienceRelax);
        canCross = minTtc >= requiredTtc && nearestDist >= (ped.isJaywalking ? 3.2 : 4.2);
      }

      if (canCross) {
        ped.state = 'crossing';
        ped.speed = ped.isJaywalking ? 1.55 : 1.32;
      }
    } else if (ped.state === 'crossing' || ped.state === 'in_conflict') {
      // Social Force urgency repulsion if a moving vehicle approaches closely while mid-road
      let inDanger = false;
      for (let vi = 0; vi < vehicles.length; vi++) {
        const v = vehicles[vi];
        if (v.speed < 1.1) continue;
        const dx = ped.position.x - v.position.x;
        const dz = ped.position.z - v.position.z;
        const distSq = dx * dx + dz * dz;
        if (distSq > 16 * 16) continue;
        const vFx = Math.sin(v.heading);
        const vFz = Math.cos(v.heading);
        const along = dx * vFx + dz * vFz - VEHICLE_DIMENSIONS[v.type].length * 0.5;
        const lateral = Math.abs(dx * vFz - dz * vFx);
        if (along > -0.5 && along < 14 && lateral < VEHICLE_DIMENSIONS[v.type].width * 0.5 + 1.8) {
          const ttc = Math.max(0, along) / v.speed;
          if (ttc < 1.8) {
            inDanger = true;
            break;
          }
        }
      }

      ped.state = inDanger ? 'in_conflict' : 'crossing';
      const flashingBoost =
        scenario.signalizedCrossings &&
        cw.signalizedInScenario2 &&
        signalState.pedestrianPhase === 'flashing'
          ? 0.35
          : 0;
      ped.speed = inDanger
        ? 1.9
        : (ped.isJaywalking ? 1.58 : 1.32) + flashingBoost;

      ped.progress += (ped.direction * ped.speed * dt) / cw.length;

      if ((ped.direction === 1 && ped.progress >= 1) || (ped.direction === -1 && ped.progress <= 0)) {
        ped.state = 'completed';
        pedestrians.splice(i, 1);
        continue;
      }
      ped.position = computePedestrianPosition(cw, ped.progress, ped.lateralShift);
    }
  }
}
