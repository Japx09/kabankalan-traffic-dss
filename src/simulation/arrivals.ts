import {
  Vehicle,
  VehicleType,
  VehicleState,
  ManeuverState,
  CorridorConfig,
  VEHICLE_DIMENSIONS,
  LocationId,
} from './types';
import { ALL_ROUTES, getRoutesForLocation, evaluateRoute, RouteDefinition } from './routes';
import { seededRandom } from './random';

export interface PendingVehicleEntry {
  vehicle: Vehicle;
  routeId: string;
  targetInsertTime: number;
}

export interface ArrivalManager {
  pendingQueues: Record<string, Vehicle[]>;
  lastSpawnTimes: Record<string, number>;
  busScheduledTimes: number[];
  unmetDemandCount: number;
}

let vehicleIdSequence = 0;

export function resetArrivalSequence(): void {
  vehicleIdSequence = 0;
}

export function nextVehicleId(): string {
  return `v-${++vehicleIdSequence}`;
}

export function createArrivalManager(): ArrivalManager {
  return {
    pendingQueues: {},
    lastSpawnTimes: {},
    busScheduledTimes: [],
    unmetDemandCount: 0,
  };
}

/** Desired speed by vehicle type in m/s (based on Kabankalan corridor speed limit) */
export function getDesiredSpeed(type: VehicleType, speedLimit: number): number {
  const base: Record<VehicleType, number> = {
    [VehicleType.Bus]: Math.min(6.94, speedLimit), // ~25 km/h
    [VehicleType.Jeepney]: Math.min(8.33, speedLimit), // ~30 km/h
    [VehicleType.Tricycle]: Math.min(5.56, speedLimit), // ~20 km/h
    [VehicleType.PrivateCar]: Math.min(11.11, speedLimit), // ~40 km/h
  };
  return base[type] * (0.92 + seededRandom() * 0.16);
}

/**
 * Check if the entry segment of a route is sufficiently clear for safe vehicle insertion.
 */
export function isRouteEntryClear(
  route: RouteDefinition,
  type: VehicleType,
  existingVehicles: Vehicle[]
): boolean {
  const spawnPt = evaluateRoute(route, 0);
  const myLength = VEHICLE_DIMENSIONS[type].length;
  const safeClearance = myLength + 4.0; // Clearance distance in meters

  for (const v of existingVehicles) {
    if (v.isParkedStandby) continue;

    // Check same route arc-length headway
    if (v.routeId === route.id) {
      const s = v.distanceAlongRoute ?? 0;
      if (s < safeClearance) {
        return false;
      }
    }

    // Spatial radius check around route entry point
    const dx = v.position.x - spawnPt.x;
    const dz = v.position.z - spawnPt.z;
    if (Math.hypot(dx, dz) < safeClearance) {
      return false;
    }
  }

  return true;
}

/**
 * Generate traffic demand and insert vehicles onto routes, preserving queues on spillback.
 */
export function processVehicleArrivals(
  manager: ArrivalManager,
  simTime: number,
  dt: number,
  corridor: CorridorConfig,
  existingVehicles: Vehicle[],
  vehicleInflow: Record<VehicleType, number>,
  busHeadway: number,
  platoonCycle = 90,
  platoonReleaseDuration = 45
): {
  insertedVehicles: Vehicle[];
  pendingQueueCount: number;
  unmetDemandCount: number;
} {
  const insertedVehicles: Vehicle[] = [];
  const routes = getRoutesForLocation(corridor.id);
  if (!routes.length) {
    return { insertedVehicles: [], pendingQueueCount: 0, unmetDemandCount: manager.unmetDemandCount };
  }

  // 1. Upstream Platoon Wave Multiplier (Preserves exact mathematical hourly integral)
  // Release duration D with cycle C: multiplier = C / D during release, 0 during gap
  const cycleTime = simTime % Math.max(platoonCycle, 30);
  const isPlatoonRelease = cycleTime < platoonReleaseDuration;
  const platoonMultiplier = isPlatoonRelease ? platoonCycle / platoonReleaseDuration : 0.05;

  const vehicleTypes = [VehicleType.Tricycle, VehicleType.Jeepney, VehicleType.Bus, VehicleType.PrivateCar];

  // 2. Generate Demand Arrivals for each vehicle type
  for (const type of vehicleTypes) {
    const hourlyRate = vehicleInflow[type] ?? 0;
    if (hourlyRate <= 0) continue;

    let shouldSpawn = false;

    if (type === VehicleType.Bus) {
      // Buses follow an absolute scheduled departure headway
      const interval = Math.max(busHeadway, 30);
      const lastBusTime = manager.lastSpawnTimes[type] ?? -interval;
      if (simTime - lastBusTime >= interval) {
        shouldSpawn = true;
        manager.lastSpawnTimes[type] = simTime;
      }
    } else {
      // General paratransit and private cars follow platooned Poisson arrivals
      const effectiveRate = hourlyRate * platoonMultiplier * corridor.spawnScale;
      const prob = (effectiveRate / 3600) * dt;
      if (seededRandom() < prob) {
        shouldSpawn = true;
      }
    }

    if (shouldSpawn) {
      // Select appropriate route for this vehicle
      let eligibleRoutes = routes.filter(
        (r) => (!r.allowedVehicles || r.allowedVehicles.includes(type)) && !r.isInternalTerminalRoute
      );

      // In Ceres Terminal corridor: give high propensity for inbound buses to enter Gate 1
      if (corridor.id === LocationId.CeresTerminal && type === VehicleType.Bus) {
        const ingress = routes.find((r) => r.id === 'ceres_ingress_gate1');
        if (ingress && seededRandom() < 0.7) {
          eligibleRoutes = [ingress];
        }
      }

      if (eligibleRoutes.length > 0) {
        const totalWeight = eligibleRoutes.reduce((acc, r) => acc + r.weight, 0);
        let roll = seededRandom() * totalWeight;
        let selectedRoute = eligibleRoutes[0];
        for (const r of eligibleRoutes) {
          roll -= r.weight;
          if (roll <= 0) {
            selectedRoute = r;
            break;
          }
        }

        const desiredSpeed = getDesiredSpeed(type, corridor.speedLimit);
        const spawnPt = evaluateRoute(selectedRoute, 0);

        const newVehicle: Vehicle = {
          id: nextVehicleId(),
          type,
          state: VehicleState.Moving,
          maneuverState: ManeuverState.Cruise,
          position: { x: spawnPt.x, z: spawnPt.z },
          speed: desiredSpeed * 0.75,
          desiredSpeed,
          heading: spawnPt.heading,
          lane: 0,
          dwellTimer: 0,
          entryTime: simTime,
          freeFlowTravelTime: selectedRoute.length / desiredSpeed,
          isPublicTransport: type === VehicleType.Bus || type === VehicleType.Jeepney || type === VehicleType.Tricycle,
          accumulatedDelay: 0,
          stoppedDelay: 0,
          controlDelay: 0,
          stoppedDuration: 0,
          hasDwelled: false,
          routeId: selectedRoute.id,
          distanceAlongRoute: 0,
          isYielding: false,
          yieldTimer: 0,
          sweptWidth: type === VehicleType.Bus && selectedRoute.isWideTurningBus ? 6.5 : VEHICLE_DIMENSIONS[type].width,
          stuckTimer: 0,
        };

        // Add to pending queue for this route
        if (!manager.pendingQueues[selectedRoute.id]) {
          manager.pendingQueues[selectedRoute.id] = [];
        }
        manager.pendingQueues[selectedRoute.id].push(newVehicle);
      }
    }
  }

  // 3. Process Safe Road Insertion from Pending Queues
  for (const route of routes) {
    const queue = manager.pendingQueues[route.id];
    if (!queue || queue.length === 0) continue;

    // Check if the route entry has safe gap
    const candidate = queue[0];
    const canInsert = isRouteEntryClear(route, candidate.type, [...existingVehicles, ...insertedVehicles]);

    if (canInsert) {
      queue.shift(); // Remove from queue
      candidate.entryTime = simTime;
      candidate.position = evaluateRoute(route, 0);
      insertedVehicles.push(candidate);
    } else {
      // Entry is blocked: track unmet demand / queue overflow
      manager.unmetDemandCount += dt * 0.05;
    }
  }

  // Calculate total pending queued vehicles across all entry gates
  let totalPending = 0;
  for (const q of Object.values(manager.pendingQueues)) {
    totalPending += q.length;
  }

  return {
    insertedVehicles,
    pendingQueueCount: totalPending,
    unmetDemandCount: Math.round(manager.unmetDemandCount),
  };
}
