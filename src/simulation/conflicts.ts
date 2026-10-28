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
  return `c-${++conflictIdCounter}`;
}

export function resetConflictIds(): void {
  conflictIdCounter = 0;
}

// ─── SSAM-Inspired Critical Safety Thresholds (FHWA Guidelines) ─────────────
export const TTC_CRITICAL = 1.5; // seconds
export const PET_CRITICAL = 1.0; // seconds

// ─── Conflict Point Spatial Occupancy History for PET ───────────────────────
export interface OccupancyRecord {
  position: { x: number; z: number };
  exitTime: number;
  entityId: string;
}

const MAX_OCCUPANCY_RECORDS = 250;
const occupancyHistory: OccupancyRecord[] = [];

export function recordOccupancyExit(entityId: string, position: { x: number; z: number }, time: number): void {
  occupancyHistory.push({ position: { ...position }, exitTime: time, entityId });
  if (occupancyHistory.length > MAX_OCCUPANCY_RECORDS) {
    occupancyHistory.shift();
  }
}

export function computeObservedPET(
  enteringEntityId: string,
  position: { x: number; z: number },
  entryTime: number
): number {
  let minPET = Infinity;

  for (const occ of occupancyHistory) {
    if (occ.entityId === enteringEntityId) continue;
    const dist = Math.hypot(occ.position.x - position.x, occ.position.z - position.z);
    if (dist < 3.0) {
      const pet = Math.abs(entryTime - occ.exitTime);
      if (pet < minPET) {
        minPET = pet;
      }
    }
  }

  return minPET === Infinity ? NaN : minPET;
}

// ─── Active Encounter State for Deduplication ───────────────────────────────
export interface ActiveEncounter {
  key: string;
  type: ConflictType;
  entity1Id: string;
  entity2Id: string;
  minTTC: number;
  minPET: number;
  position: { x: number; z: number };
  startTime: number;
  lastSeenTime: number;
}

const activeEncounters = new Map<string, ActiveEncounter>();

export function resetConflictEngine(): void {
  activeEncounters.clear();
  occupancyHistory.length = 0;
  conflictIdCounter = 0;
}

/**
 * 2D Analytical Trajectory & Footprint TTC for Vehicle-Pedestrian Encounters.
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

  const dx = pedestrian.position.x - vehicle.position.x;
  const dz = pedestrian.position.z - vehicle.position.z;

  const fwdX = Math.cos(vehicle.heading);
  const fwdZ = Math.sin(vehicle.heading);

  const longDist = dx * fwdX + dz * fwdZ;
  const latDist = -fwdZ * dx + fwdX * dz;

  if (longDist > 0.4 && longDist < 30) {
    const timeToReach = longDist / vehicle.speed;

    const pedVelZ = pedestrian.speed * (pedestrian.crossingDirection || 1);
    const futureLatDist = latDist + (fwdX * pedVelZ) * timeToReach;

    if (Math.abs(futureLatDist) < effectiveWidth) {
      return {
        ttc: Math.max(0.1, timeToReach),
        pos: {
          x: vehicle.position.x + fwdX * (longDist * 0.75),
          z: vehicle.position.z + fwdZ * (longDist * 0.75),
        },
      };
    }
  }

  return { ttc: Infinity, pos: pedestrian.position };
}

/**
 * 2D Analytical Trajectory & Footprint TTC for Crossing & Merging Vehicles.
 */
function computeCrossingTTC(
  v1: Vehicle,
  v2: Vehicle
): { ttc: number; pos: { x: number; z: number } } {
  if (v1.isParkedStandby || v2.isParkedStandby) return { ttc: Infinity, pos: v1.position };
  if (v1.speed < 0.3 && v2.speed < 0.3) return { ttc: Infinity, pos: v1.position };

  const dx = v2.position.x - v1.position.x;
  const dz = v2.position.z - v1.position.z;
  const dist = Math.hypot(dx, dz);
  if (dist > 40) return { ttc: Infinity, pos: v1.position };

  const v1x = v1.speed * Math.cos(v1.heading);
  const v1z = v1.speed * Math.sin(v1.heading);
  const v2x = v2.speed * Math.cos(v2.heading);
  const v2z = v2.speed * Math.sin(v2.heading);

  const dvx = v2x - v1x;
  const dvz = v2z - v1z;
  const dvSq = dvx * dvx + dvz * dvz;
  if (dvSq < 0.2) return { ttc: Infinity, pos: v1.position };

  const dot = dx * dvx + dz * dvz;
  const tMin = -dot / dvSq;

  if (tMin > 0.05 && tMin <= 4.0) {
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
 * 2D Longitudinal Rear-End TTC between follower and leader.
 */
function computeRearEndTTC(follower: Vehicle, leader: Vehicle): number {
  if (follower.isParkedStandby || leader.isParkedStandby) return Infinity;

  let headingDiff = Math.abs(follower.heading - leader.heading);
  while (headingDiff > Math.PI) headingDiff -= Math.PI;
  if (headingDiff > 0.5) return Infinity; // Not parallel

  const dx = leader.position.x - follower.position.x;
  const dz = leader.position.z - follower.position.z;

  const fwdX = Math.cos(follower.heading);
  const fwdZ = Math.sin(follower.heading);
  const longDist = dx * fwdX + dz * fwdZ;
  const latDist = Math.abs(-fwdZ * dx + fwdX * dz);

  if (latDist > 2.2) return Infinity;

  const leaderLength = VEHICLE_DIMENSIONS[leader.type].length;
  const gap = longDist - leaderLength;

  if (gap > 0 && gap < 30) {
    const closingSpeed = follower.speed - leader.speed;
    if (closingSpeed > 0.4) {
      return gap / closingSpeed;
    }
  }

  return Infinity;
}

/**
 * Deduplicated Conflict Event Processor.
 * Tracks ongoing encounters until entities separate, outputting EXACTLY ONE conflict event per encounter.
 */
export function detectDeduplicatedConflicts(
  vehicles: Vehicle[],
  pedestrians: Pedestrian[],
  simTime: number
): ConflictEvent[] {
  const completedEvents: ConflictEvent[] = [];
  const activeKeysThisFrame = new Set<string>();

  // 1. Vehicle-Pedestrian Encounters
  for (const vehicle of vehicles) {
    if (vehicle.isParkedStandby) continue;

    for (const ped of pedestrians) {
      const { ttc, pos } = computeVehiclePedestrianTTC(vehicle, ped);
      if (ttc <= TTC_CRITICAL) {
        const key = `ped:${vehicle.id}:${ped.id}`;
        activeKeysThisFrame.add(key);

        const observedPet = computeObservedPET(ped.id, pos, simTime);
        const existing = activeEncounters.get(key);

        if (existing) {
          if (ttc < existing.minTTC) {
            existing.minTTC = ttc;
            existing.position = pos;
          }
          if (!isNaN(observedPet) && (isNaN(existing.minPET) || observedPet < existing.minPET)) {
            existing.minPET = observedPet;
          }
          existing.lastSeenTime = simTime;
        } else {
          activeEncounters.set(key, {
            key,
            type: ConflictType.VehiclePedestrian,
            entity1Id: vehicle.id,
            entity2Id: ped.id,
            minTTC: ttc,
            minPET: observedPet,
            position: pos,
            startTime: simTime,
            lastSeenTime: simTime,
          });
        }
        vehicle.isInConflict = true;
        ped.state = PedestrianState.InConflict;
      }
    }
  }

  // 2. Vehicle-Vehicle Encounters
  for (let i = 0; i < vehicles.length; i++) {
    const v1 = vehicles[i];
    if (v1.isParkedStandby) continue;

    for (let j = i + 1; j < vehicles.length; j++) {
      const v2 = vehicles[j];
      if (v2.isParkedStandby) continue;

      const cross = computeCrossingTTC(v1, v2);
      let detectedType: ConflictType | null = null;
      let detectedTTC = Infinity;
      let detectedPos = cross.pos;

      if (cross.ttc <= TTC_CRITICAL) {
        let angleDiff = Math.abs(v1.heading - v2.heading);
        while (angleDiff > Math.PI) angleDiff = Math.abs(angleDiff - 2 * Math.PI);
        const acuteAngleDeg = (Math.min(angleDiff, Math.PI - angleDiff) * 180) / Math.PI;
        detectedType = acuteAngleDeg > 60 ? ConflictType.Crossing : ConflictType.Weaving;
        detectedTTC = cross.ttc;
      } else {
        let rearTTC = computeRearEndTTC(v1, v2);
        let follower = v1;
        let leader = v2;
        if (rearTTC === Infinity) {
          rearTTC = computeRearEndTTC(v2, v1);
          follower = v2;
          leader = v1;
        }
        if (rearTTC <= TTC_CRITICAL) {
          detectedType = ConflictType.RearEnd;
          detectedTTC = rearTTC;
          detectedPos = {
            x: (follower.position.x + leader.position.x) / 2,
            z: (follower.position.z + leader.position.z) / 2,
          };
        }
      }

      if (detectedType !== null && detectedTTC <= TTC_CRITICAL) {
        const key = `veh:${v1.id < v2.id ? `${v1.id}:${v2.id}` : `${v2.id}:${v1.id}`}`;
        activeKeysThisFrame.add(key);

        const observedPet = computeObservedPET(v2.id, detectedPos, simTime);
        const existing = activeEncounters.get(key);

        if (existing) {
          if (detectedTTC < existing.minTTC) {
            existing.minTTC = detectedTTC;
            existing.position = detectedPos;
          }
          if (!isNaN(observedPet) && (isNaN(existing.minPET) || observedPet < existing.minPET)) {
            existing.minPET = observedPet;
          }
          existing.lastSeenTime = simTime;
        } else {
          activeEncounters.set(key, {
            key,
            type: detectedType,
            entity1Id: v1.id,
            entity2Id: v2.id,
            minTTC: detectedTTC,
            minPET: observedPet,
            position: detectedPos,
            startTime: simTime,
            lastSeenTime: simTime,
          });
        }
        v1.isInConflict = true;
        v2.isInConflict = true;
      }
    }
  }

  // 3. Close finished encounters (entities separated for > 1.2s) and emit exactly ONE ConflictEvent
  for (const [key, enc] of activeEncounters.entries()) {
    if (!activeKeysThisFrame.has(key)) {
      if (simTime - enc.lastSeenTime > 1.2) {
        completedEvents.push({
          id: nextConflictId(),
          type: enc.type,
          position: enc.position,
          ttc: enc.minTTC,
          pet: isNaN(enc.minPET) ? NaN : enc.minPET,
          time: enc.startTime,
          age: 0,
          entity1Id: enc.entity1Id,
          entity2Id: enc.entity2Id,
        });
        activeEncounters.delete(key);
      }
    }
  }

  return completedEvents;
}

/**
 * Age existing active conflict markers in 3D viewport.
 */
export function ageConflicts(conflicts: ConflictEvent[], dt: number): ConflictEvent[] {
  return conflicts
    .map((c) => ({ ...c, age: c.age + dt }))
    .filter((c) => c.age < 7.0); // Persist markers for 7.0 seconds in viewport
}
