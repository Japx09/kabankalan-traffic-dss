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

let pedIdCounter = 0;

function nextPedId(): string {
  return `p-${++pedIdCounter}-${Math.random().toString(36).slice(2, 7)}`;
}

export function resetPedestrianIds(): void {
  pedIdCounter = 0;
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
  if (Math.random() > probability) return null;

  const desireLines = getPedDesireLinesForLocation(corridor.id);

  // 60% chance to follow an authentic attractor desire line if available
  if (desireLines.length && Math.random() < 0.65) {
    const totalWeight = desireLines.reduce((acc, l) => acc + l.weight, 0);
    let roll = Math.random() * totalWeight;
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

    const waitTime = Math.random() * 1.5;
    return {
      id: nextPedId(),
      state: waitTime > 0 ? PedestrianState.Waiting : PedestrianState.Crossing,
      position: { x: startPt.x, z: startPt.z },
      speed: 1.15 + Math.random() * 0.35,
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

  // Crosswalk crossing
  const cw =
    corridor.crosswalks[Math.floor(Math.random() * corridor.crosswalks.length)] || {
      x: 80,
      width: 4,
    };
  const crossingX = cw.x + (Math.random() - 0.5) * cw.width * 0.8;
  const fromTop = Math.random() < 0.5;
  const halfRoad = corridor.roadWidth / 2;
  const originZ = fromTop
    ? -(halfRoad + corridor.sidewalkWidth * 0.5)
    : halfRoad + corridor.sidewalkWidth * 0.5;
  const targetZ = fromTop
    ? halfRoad + corridor.sidewalkWidth * 0.5
    : -(halfRoad + corridor.sidewalkWidth * 0.5);
  const direction = fromTop ? 1 : -1;

  const tooClose = existingPeds.some(
    (p) =>
      Math.abs(p.crossingX - crossingX) < 1.0 &&
      Math.abs(p.position.z - originZ) < 1.0
  );
  if (tooClose) return null;

  const waitTime = Math.random() * 2.0;

  return {
    id: nextPedId(),
    state: waitTime > 0 ? PedestrianState.Waiting : PedestrianState.Crossing,
    position: { x: crossingX, z: originZ },
    speed: 1.1 + Math.random() * 0.4,
    crossingDirection: direction,
    targetZ,
    originZ,
    isJaywalker: false,
    crossingX,
    waitTimer: waitTime,
    pathProgress: 0,
  };
}

/**
 * Check if a pedestrian should wait for approaching vehicles.
 */
function shouldWaitForVehicles(ped: Pedestrian, vehicles: Vehicle[]): boolean {
  for (const v of vehicles) {
    if (v.isParkedStandby) continue;
    const dist = Math.hypot(v.position.x - ped.position.x, v.position.z - ped.position.z);

    // Aggressive Transit check (Bus): 6.0m detection, wait if TTC < 2.5s
    if (v.type === VehicleType.Bus) {
      if (dist < 6.0 && v.speed > 0.5) {
        const timeToReach = dist / v.speed;
        if (timeToReach < 2.5) {
          return true;
        }
      }
    }

    if (dist < 18 && v.speed > 1.0) {
      const timeToReach = dist / v.speed;
      if (timeToReach < 3.0) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Update all pedestrian positions, states, and desire line trajectories.
 */
export function updatePedestrians(
  pedestrians: Pedestrian[],
  vehicles: Vehicle[],
  dt: number
): Pedestrian[] {
  return pedestrians.map((ped) => {
    const p = { ...ped, position: { ...ped.position } };

    // Waiting state
    if (p.state === PedestrianState.Waiting) {
      p.waitTimer -= dt;
      if (p.waitTimer <= 0) {
        if (!shouldWaitForVehicles(p, vehicles)) {
          p.state = PedestrianState.Crossing;
        } else {
          p.waitTimer = 0.5;
        }
      }
      return p;
    }

    // Crossing state along desire line
    if (p.desireLineId) {
      const line = ALL_PED_DESIRE_LINES[p.desireLineId];
      if (line) {
        let inConflictNow = false;
        let busEvasion = false;
        for (const v of vehicles) {
          if (v.isParkedStandby) continue;
          const dist = Math.hypot(v.position.x - p.position.x, v.position.z - p.position.z);
          const vehicleWidth = v.sweptWidth || (v.type === VehicleType.Bus ? 2.5 : 1.8);
          
          if (v.type === VehicleType.Bus && dist < 6.0) {
            inConflictNow = true;
            busEvasion = true;
          } else if (dist < (vehicleWidth / 2) + 0.8 && v.speed > 0.1) {
            inConflictNow = true;
          }
        }

        if (inConflictNow) {
          p.state = PedestrianState.InConflict;
          // Repulsion: move path progress backwards slightly
          const repulsionSpeed = busEvasion ? p.speed * 1.5 : p.speed * 0.5;
          p.pathProgress = Math.max(0, (p.pathProgress || 0) - (repulsionSpeed * dt) / Math.max(line.length, 1));
        } else {
          if (p.state === PedestrianState.InConflict) {
            p.state = PedestrianState.Crossing;
          }
          p.pathProgress = (p.pathProgress || 0) + (p.speed * dt) / Math.max(line.length, 1);
        }

        if (p.pathProgress >= 1.0) {
          p.state = PedestrianState.Completed;
          return p;
        }
        const pt = evaluatePedDesireLine(line, p.pathProgress);
        p.position.x = pt.x;
        p.position.z = pt.z;
        return p;
      }
    }

    // Default straight crosswalk crossing
    if (p.state === PedestrianState.Crossing || p.state === PedestrianState.InConflict) {
      let inConflictNow = false;
      let busEvasion = false;
      for (const v of vehicles) {
        if (v.isParkedStandby) continue;
        const dist = Math.hypot(v.position.x - p.position.x, v.position.z - p.position.z);
        const vehicleWidth = v.sweptWidth || (v.type === VehicleType.Bus ? 2.5 : 1.8);

        if (v.type === VehicleType.Bus && dist < 6.0) {
          inConflictNow = true;
          busEvasion = true;
        } else if (dist < (vehicleWidth / 2) + 0.8 && v.speed > 0.1) {
          inConflictNow = true;
        }
      }

      if (inConflictNow) {
        p.state = PedestrianState.InConflict;
        // Backpedal slightly (repulsion)
        const repulsionSpeed = busEvasion ? p.speed * 1.5 : p.speed * 0.5;
        p.position.z -= p.crossingDirection * repulsionSpeed * dt;
      } else {
        if (p.state === PedestrianState.InConflict) {
          p.state = PedestrianState.Crossing;
        }
        p.position.z += p.crossingDirection * p.speed * dt;
      }

      const distToTarget = Math.abs(p.position.z - p.targetZ);
      if (distToTarget < 0.6) {
        p.state = PedestrianState.Completed;
        return p;
      }
    }

    return p;
  });
}

/**
 * Remove completed pedestrians.
 */
export function removeCompletedPedestrians(
  pedestrians: Pedestrian[]
): {
  remaining: Pedestrian[];
  completed: Pedestrian[];
} {
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
