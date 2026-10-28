import {
  Pedestrian,
  PedestrianState,
  CorridorConfig,
  Vehicle,
  VehicleType,
} from './types';
import {
  ALL_PED_DESIRE_LINES,
  getPedDesireLinesForLocation,
  evaluatePedDesireLine,
} from './routes';
import { seededRandom } from './random';
import { TrafficSignalState, getSignalState } from './signals';

let pedIdCounter = 0;

function nextPedId(): string {
  return `p-${++pedIdCounter}`;
}

export function resetPedestrianIds(): void {
  pedIdCounter = 0;
}

/**
 * Check if a waiting pedestrian should yield to approaching vehicles.
 * Based on time required to clear conflicting lane vs approaching vehicle arrival time.
 */
function shouldWaitForVehicles(
  ped: Pedestrian,
  vehicles: Vehicle[],
  safetyMarginSeconds = 2.0
): boolean {
  const crossingWidth = 7.0; // Half road or conflicting lane width (meters)
  const timeToClear = crossingWidth / Math.max(ped.speed, 0.8) + safetyMarginSeconds;

  for (const v of vehicles) {
    if (v.isParkedStandby) continue;

    const dx = v.position.x - ped.position.x;
    const dz = v.position.z - ped.position.z;
    const dist = Math.hypot(dx, dz);

    // Vector pointing forward from vehicle
    const fwdX = Math.cos(v.heading);
    const fwdZ = Math.sin(v.heading);
    const dot = -dx * fwdX - dz * fwdZ; // Is pedestrian ahead of vehicle?

    if (dot > 0 && dist < 35) {
      const timeToArrive = dist / Math.max(v.speed, 0.8);
      // Large bus wide swept envelope requires extra caution (3.5s)
      const adjustedClearTime = v.type === VehicleType.Bus ? timeToClear + 1.5 : timeToClear;

      if (timeToArrive <= adjustedClearTime) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Try to spawn a pedestrian along authentic desire lines or crosswalks.
 */
export function trySpawnPedestrian(
  rate: number, // peds per minute
  jaywalkProb: number, // 0-1
  dt: number,
  corridor: CorridorConfig,
  existingPeds: Pedestrian[]
): Pedestrian | null {
  const probability = (rate / 60) * dt;
  if (seededRandom() > probability) return null;

  const desireLines = getPedDesireLinesForLocation(corridor.id);

  // Attractor desire lines (commercial attractor, Ceres terminal gate to Pedro Zayco, etc.)
  if (desireLines.length && seededRandom() < 0.65) {
    const totalWeight = desireLines.reduce((acc, l) => acc + l.weight, 0);
    let roll = seededRandom() * totalWeight;
    let selectedLine = desireLines[0];
    for (const l of desireLines) {
      roll -= l.weight;
      if (roll <= 0) {
        selectedLine = l;
        break;
      }
    }

    const startPt = evaluatePedDesireLine(selectedLine, 0);
    const tooClose = existingPeds.some(
      (p) => Math.hypot(p.position.x - startPt.x, p.position.z - startPt.z) < 1.2
    );
    if (tooClose) return null;

    const waitTime = seededRandom() * 1.5;
    return {
      id: nextPedId(),
      state: waitTime > 0 ? PedestrianState.Waiting : PedestrianState.Crossing,
      position: { x: startPt.x, z: startPt.z },
      speed: 1.15 + seededRandom() * 0.35,
      crossingDirection: 1,
      targetZ: 0,
      originZ: startPt.z,
      isJaywalker: false,
      crossingX: startPt.x,
      waitTimer: waitTime,
      desireLineId: selectedLine.id,
      pathProgress: 0,
    };
  }

  // Crosswalk / Midblock Crossing
  const cw =
    corridor.crosswalks[Math.floor(seededRandom() * corridor.crosswalks.length)] || {
      x: 80,
      width: 4,
    };
  const isJaywalking = seededRandom() < jaywalkProb;
  const crossingX = isJaywalking
    ? 25 + seededRandom() * (corridor.length - 50)
    : cw.x + (seededRandom() - 0.5) * cw.width * 0.8;

  const fromTop = seededRandom() < 0.5;
  const halfRoad = corridor.roadWidth / 2;
  const originZ = fromTop
    ? -(halfRoad + corridor.sidewalkWidth * 0.5)
    : halfRoad + corridor.sidewalkWidth * 0.5;
  const targetZ = fromTop
    ? halfRoad + corridor.sidewalkWidth * 0.5
    : -(halfRoad + corridor.sidewalkWidth * 0.5);
  const direction = fromTop ? 1 : -1;

  const tooClose = existingPeds.some(
    (p) => Math.abs(p.crossingX - crossingX) < 1.0 && Math.abs(p.position.z - originZ) < 1.0
  );
  if (tooClose) return null;

  const waitTime = seededRandom() * 2.0;

  return {
    id: nextPedId(),
    state: waitTime > 0 ? PedestrianState.Waiting : PedestrianState.Crossing,
    position: { x: crossingX, z: originZ },
    speed: 1.1 + seededRandom() * 0.4,
    crossingDirection: direction,
    targetZ,
    originZ,
    isJaywalker: isJaywalking,
    crossingX,
    waitTimer: waitTime,
    pathProgress: 0,
  };
}

/**
 * Update all pedestrian positions, states, desire lines, and gap acceptance decisions.
 */
export function updatePedestrians(
  pedestrians: Pedestrian[],
  vehicles: Vehicle[],
  dt: number,
  simTime: number,
  signalizedCrossings = false
): Pedestrian[] {
  const signalState = getSignalState(simTime, signalizedCrossings);

  return pedestrians.map((ped) => {
    const p = { ...ped, position: { ...ped.position } };

    // 1. Waiting State Gap Acceptance
    if (p.state === PedestrianState.Waiting) {
      p.waitTimer -= dt;
      if (p.waitTimer <= 0) {
        // Check signal state if at a signalized crossing
        if (signalizedCrossings && !p.isJaywalker) {
          if (signalState.pedestrianWalk) {
            // Safe to cross!
            p.state = PedestrianState.Crossing;
          } else {
            // Signal indicates Don't Walk: continue waiting
            p.waitTimer = 0.5;
            return p;
          }
        }

        // Unsignalized or Jaywalking: gap acceptance check
        if (!shouldWaitForVehicles(p, vehicles)) {
          p.state = PedestrianState.Crossing;
        } else {
          p.waitTimer = 0.6; // Check again shortly
        }
      }
      return p;
    }

    // 2. Crossing along Desire Line Spline
    if (p.desireLineId) {
      const line = ALL_PED_DESIRE_LINES[p.desireLineId];
      if (line) {
        let inConflictNow = false;
        let busEvasion = false;

        for (const v of vehicles) {
          if (v.isParkedStandby) continue;
          const dist = Math.hypot(v.position.x - p.position.x, v.position.z - p.position.z);
          const vehicleWidth = v.sweptWidth || (v.type === VehicleType.Bus ? 2.5 : 1.8);

          if (v.type === VehicleType.Bus && dist < 5.5) {
            inConflictNow = true;
            busEvasion = true;
          } else if (dist < vehicleWidth / 2 + 0.8 && v.speed > 0.1) {
            inConflictNow = true;
          }
        }

        if (inConflictNow) {
          p.state = PedestrianState.InConflict;
          // Step back safely
          const repulsionSpeed = busEvasion ? p.speed * 1.2 : p.speed * 0.4;
          p.pathProgress = Math.max(0, (p.pathProgress || 0) - (repulsionSpeed * dt) / Math.max(line.length, 1));
        } else {
          if (p.state === PedestrianState.InConflict) {
            p.state = PedestrianState.Crossing;
          }
          p.pathProgress = (p.pathProgress || 0) + (p.speed * dt) / Math.max(line.length, 1);
        }

        if (p.pathProgress >= 1.0) {
          p.state = PedestrianState.Completed;
        } else {
          const pt = evaluatePedDesireLine(line, p.pathProgress);
          p.position.x = pt.x;
          p.position.z = pt.z;
        }
        return p;
      }
    }

    // 3. Standard Crosswalk Lateral Crossing (Z axis)
    p.position.z += p.speed * p.crossingDirection * dt;

    // Check proximity conflicts with vehicles
    let inProximityConflict = false;
    for (const v of vehicles) {
      if (v.isParkedStandby) continue;
      const dist = Math.hypot(v.position.x - p.position.x, v.position.z - p.position.z);
      if (dist < 2.5 && v.speed > 0.3) {
        inProximityConflict = true;
        break;
      }
    }

    p.state = inProximityConflict ? PedestrianState.InConflict : PedestrianState.Crossing;

    // Check completion
    const reachedTarget =
      (p.crossingDirection > 0 && p.position.z >= p.targetZ) ||
      (p.crossingDirection < 0 && p.position.z <= p.targetZ);

    if (reachedTarget) {
      p.state = PedestrianState.Completed;
    }

    return p;
  });
}

/**
 * Remove pedestrians who have successfully crossed the roadway.
 */
export function removeCompletedPedestrians(
  pedestrians: Pedestrian[]
): { remaining: Pedestrian[]; completed: Pedestrian[] } {
  const remaining: Pedestrian[] = [];
  const completed: Pedestrian[] = [];

  for (const p of pedestrians) {
    if (p.state === PedestrianState.Completed) {
      completed.push(p);
    } else {
      remaining.push(p);
    }
  }

  return { remaining, completed };
}
