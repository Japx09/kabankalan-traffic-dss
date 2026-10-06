import {
  Vehicle,
  Pedestrian,
  ConflictEvent,
  ConflictType,
  PedestrianState,
  VEHICLE_DIMENSIONS,
} from './types';

let conflictIdCounter = 0;

function nextConflictId(): string {
  return `c-${++conflictIdCounter}-${Math.random().toString(36).slice(2, 7)}`;
}

export function resetConflictIds(): void {
  conflictIdCounter = 0;
}

// ─── TTC / PET Critical Safety Thresholds (FHWA SSAM Standards) ─────────────

export const TTC_CRITICAL = 1.5; // seconds
export const PET_CRITICAL = 1.0; // seconds

// ─── Conflict Point Tracking for PET ────────────────────────────────────────

interface ConflictPointOccupancy {
  position: { x: number; z: number };
  time: number;
  entityId: string;
}

const recentOccupancies: ConflictPointOccupancy[] = [];
const MAX_OCCUPANCY_HISTORY = 250;

/**
 * 2D analytical closest approach and Time-to-Collision between vehicle and pedestrian.
 */
function computeVehiclePedestrianTTC(
  vehicle: Vehicle,
  pedestrian: Pedestrian
): { ttc: number; pos: { x: number; z: number } } {
  if (vehicle.isParkedStandby || vehicle.speed < 0.3) {
    return { ttc: Infinity, pos: pedestrian.position };
  }

  const vDims = VEHICLE_DIMENSIONS[vehicle.type];
  const effectiveWidth = (vehicle.sweptWidth || vDims.width) / 2 + 0.6;

  // Relative vector from vehicle to pedestrian
  const dx = pedestrian.position.x - vehicle.position.x;
  const dz = pedestrian.position.z - vehicle.position.z;

  // Vehicle forward direction
  const fwdX = Math.cos(vehicle.heading);
  const fwdZ = Math.sin(vehicle.heading);

  // Longitudinal distance along vehicle heading
  const longDist = dx * fwdX + dz * fwdZ;
  // Lateral distance perpendicular to vehicle heading
  const latDist = -fwdZ * dx + fwdX * dz;

  if (longDist > 0.5 && longDist < 28) {
    const timeToReach = longDist / vehicle.speed;

    // Pedestrian motion vector
    const pedVelX = 0;
    const pedVelZ = pedestrian.speed * (pedestrian.crossingDirection || 1);

    // If pedestrian is crossing or waiting near road
    const futureLatDist = latDist + (-fwdZ * pedVelX + fwdX * pedVelZ) * timeToReach;

    if (Math.abs(futureLatDist) < effectiveWidth) {
      return {
        ttc: Math.max(0.1, timeToReach),
        pos: {
          x: vehicle.position.x + fwdX * (longDist * 0.8),
          z: vehicle.position.z + fwdZ * (longDist * 0.8),
        },
      };
    }
  }

  return { ttc: Infinity, pos: pedestrian.position };
}

/**
 * 2D Vehicle-Vehicle Crossing TTC (e.g. wide bus egress across oncoming traffic,
 * or left turns into Pedro Zayco Sr. St / Aquiles-Zayco Ave).
 */
function compute2DCrossingTTC(
  v1: Vehicle,
  v2: Vehicle
): { ttc: number; pos: { x: number; z: number } } {
  if (v1.isParkedStandby || v2.isParkedStandby) return { ttc: Infinity, pos: v1.position };
  if (v1.speed < 0.4 && v2.speed < 0.4) return { ttc: Infinity, pos: v1.position };

  const dx = v2.position.x - v1.position.x;
  const dz = v2.position.z - v1.position.z;
  const dist = Math.hypot(dx, dz);
  if (dist > 35) return { ttc: Infinity, pos: v1.position };

  // Velocities in 2D
  const v1x = v1.speed * Math.cos(v1.heading);
  const v1z = v1.speed * Math.sin(v1.heading);
  const v2x = v2.speed * Math.cos(v2.heading);
  const v2z = v2.speed * Math.sin(v2.heading);

  const dvx = v2x - v1x;
  const dvz = v2z - v1z;
  const dvSq = dvx * dvx + dvz * dvz;
  if (dvSq < 0.25) return { ttc: Infinity, pos: v1.position };

  // Analytical time of minimum distance t = - (dP . dV) / |dV|^2
  const dot = dx * dvx + dz * dvz;
  const tMin = -dot / dvSq;

  if (tMin > 0.05 && tMin <= 3.8) {
    const minDx = dx + dvx * tMin;
    const minDz = dz + dvz * tMin;
    const minD = Math.hypot(minDx, minDz);

    const r1 = (v1.sweptWidth || VEHICLE_DIMENSIONS[v1.type].width) * 0.5 + 0.6;
    const r2 = (v2.sweptWidth || VEHICLE_DIMENSIONS[v2.type].width) * 0.5 + 0.6;

    if (minD <= r1 + r2) {
      const conflictX = v1.position.x + v1x * tMin;
      const conflictZ = v1.position.z + v1z * tMin;
      return { ttc: Math.max(0.1, tMin), pos: { x: conflictX, z: conflictZ } };
    }
  }

  return { ttc: Infinity, pos: v1.position };
}

/**
 * 2D Rear-End TTC between follower and leader along the same trajectory.
 */
function computeRearEndTTC(follower: Vehicle, leader: Vehicle): number {
  if (follower.isParkedStandby || leader.isParkedStandby) return Infinity;

  // Heading alignment check (moving roughly same direction within 30 deg)
  let headingDiff = Math.abs(follower.heading - leader.heading);
  while (headingDiff > Math.PI) headingDiff -= Math.PI;
  if (headingDiff > 0.55) return Infinity;

  const dx = leader.position.x - follower.position.x;
  const dz = leader.position.z - follower.position.z;

  const fwdX = Math.cos(follower.heading);
  const fwdZ = Math.sin(follower.heading);
  const longDist = dx * fwdX + dz * fwdZ;
  const latDist = Math.abs(-fwdZ * dx + fwdX * dz);

  if (latDist > 2.2) return Infinity; // Not in same lateral path

  const leaderLength = VEHICLE_DIMENSIONS[leader.type].length;
  const gap = longDist - leaderLength;

  if (gap > 0 && gap < 28) {
    const closingSpeed = follower.speed - leader.speed;
    if (closingSpeed > 0.4) {
      return gap / closingSpeed;
    }
  }

  return Infinity;
}

/**
 * Compute Post-Encroachment Time (PET) at a conflict point.
 */
function computePET(
  entityId: string,
  position: { x: number; z: number },
  currentTime: number
): number {
  let minPET = Infinity;

  for (const occ of recentOccupancies) {
    if (occ.entityId === entityId) continue;
    const dist = Math.hypot(occ.position.x - position.x, occ.position.z - position.z);
    if (dist < 2.5) {
      const pet = Math.abs(currentTime - occ.time);
      if (pet < minPET) {
        minPET = pet;
      }
    }
  }

  recentOccupancies.push({ position: { ...position }, time: currentTime, entityId });
  if (recentOccupancies.length > MAX_OCCUPANCY_HISTORY) {
    recentOccupancies.shift();
  }

  return minPET;
}

/**
 * Detect all conflicts (Vehicle-Pedestrian, Crossing, Rear-End, Weaving) in current state.
 */
export function detectConflicts(
  vehicles: Vehicle[],
  pedestrians: Pedestrian[],
  simTime: number,
  existingConflicts: ConflictEvent[]
): ConflictEvent[] {
  const newConflicts: ConflictEvent[] = [];

  const isNearRecentConflict = (x: number, z: number) =>
    existingConflicts.some(
      (c) => Math.hypot(c.position.x - x, c.position.z - z) < 3.2 && c.age < 2.0
    );

  // 1. Vehicle-Pedestrian Conflicts
  for (const vehicle of vehicles) {
    if (vehicle.isParkedStandby) continue;

    for (const ped of pedestrians) {
      const { ttc, pos } = computeVehiclePedestrianTTC(vehicle, ped);
      if (ttc <= TTC_CRITICAL) {
        if (!isNearRecentConflict(pos.x, pos.z)) {
          const pet = computePET(ped.id, pos, simTime);
          newConflicts.push({
            id: nextConflictId(),
            type: ConflictType.VehiclePedestrian,
            position: pos,
            ttc,
            pet: pet === Infinity ? NaN : pet,
            time: simTime,
            age: 0,
          });
          ped.state = PedestrianState.InConflict;
          vehicle.isInConflict = true;
        }
      }
    }
  }

  // 2. Vehicle-Vehicle Conflicts (Crossing, Rear-End, Weaving)
  for (let i = 0; i < vehicles.length; i++) {
    const v1 = vehicles[i];
    if (v1.isParkedStandby) continue;

    for (let j = i + 1; j < vehicles.length; j++) {
      const v2 = vehicles[j];
      if (v2.isParkedStandby) continue;

      // Check crossing/weaving conflict
      const cross = compute2DCrossingTTC(v1, v2);
      if (cross.ttc <= TTC_CRITICAL) {
        if (!isNearRecentConflict(cross.pos.x, cross.pos.z)) {
          const pet = computePET(v2.id, cross.pos, simTime);
          
          // FHWA SSAM Angle-based classification
          let angleDiff = Math.abs(v1.heading - v2.heading);
          while (angleDiff > Math.PI) angleDiff = Math.abs(angleDiff - 2 * Math.PI);
          const acuteAngleDeg = (Math.min(angleDiff, Math.PI - angleDiff) * 180) / Math.PI;
          const assignedType = acuteAngleDeg > 65 || angleDiff > 1.48 ? ConflictType.Crossing : ConflictType.Weaving;

          newConflicts.push({
            id: nextConflictId(),
            type: assignedType,
            position: cross.pos,
            ttc: cross.ttc,
            pet: pet === Infinity ? NaN : pet,
            time: simTime,
            age: 0,
          });
          v1.isInConflict = true;
          v2.isInConflict = true;
          continue;
        }
      }

      // Check rear-end conflict (v1 following v2 or v2 following v1)
      let rearTTC = computeRearEndTTC(v1, v2);
      let follower = v1;
      let leader = v2;
      if (rearTTC === Infinity) {
        rearTTC = computeRearEndTTC(v2, v1);
        follower = v2;
        leader = v1;
      }

      if (rearTTC <= TTC_CRITICAL) {
        const conflictPos = {
          x: (follower.position.x + leader.position.x) / 2,
          z: (follower.position.z + leader.position.z) / 2,
        };
        if (!isNearRecentConflict(conflictPos.x, conflictPos.z)) {
          const pet = computePET(follower.id, conflictPos, simTime);
          newConflicts.push({
            id: nextConflictId(),
            type: ConflictType.RearEnd,
            position: conflictPos,
            ttc: rearTTC,
            pet: pet === Infinity ? NaN : pet,
            time: simTime,
            age: 0,
          });
          v1.isInConflict = true;
          v2.isInConflict = true;
        }
      }
    }
  }

  return newConflicts;
}

/**
 * Age existing conflict markers and remove old ones.
 */
export function ageConflicts(conflicts: ConflictEvent[], dt: number): ConflictEvent[] {
  return conflicts
    .map((c) => ({ ...c, age: c.age + dt }))
    .filter((c) => c.age < 7); // Keep markers for 7 seconds
}
