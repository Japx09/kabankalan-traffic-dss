import {
  Vehicle,
  VehicleType,
  VehicleState,
  CorridorConfig,
  VEHICLE_DIMENSIONS,
  Pedestrian,
  PedestrianState,
  LocationId,
} from './types';
import {
  ALL_ROUTES,
  getRoutesForLocation,
  evaluateRoute,
} from './routes';

let vehicleIdCounter = 0;

/** Generate a unique vehicle ID */
function nextVehicleId(): string {
  return `v-${++vehicleIdCounter}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Reset ID counter (for simulation restart) */
export function resetVehicleIds(): void {
  vehicleIdCounter = 0;
}

/** Desired speed by vehicle type in m/s (with some randomness) */
function getDesiredSpeed(type: VehicleType, speedLimit: number): number {
  const base: Record<VehicleType, number> = {
    [VehicleType.Bus]: Math.min(6.94, speedLimit), // ~25 km/h
    [VehicleType.Jeepney]: Math.min(8.33, speedLimit), // ~30 km/h
    [VehicleType.Tricycle]: Math.min(5.56, speedLimit), // ~20 km/h
    [VehicleType.PrivateCar]: Math.min(11.11, speedLimit), // ~40 km/h
  };
  return base[type] * (0.9 + Math.random() * 0.2);
}

/**
 * Probabilistically spawn a vehicle on an OD route appropriate for this corridor.
 */
export function trySpawnVehicle(
  type: VehicleType,
  rate: number, // vehicles/hour for this type
  dt: number, // time step in seconds
  corridor: CorridorConfig,
  existingVehicles: Vehicle[],
  simTime: number,
  lastSpawnTime: Record<VehicleType, number>,
  busHeadway: number = 60
): Vehicle | null {
  let effectiveRate = rate;

  if (type === VehicleType.Bus) {
    // Configurable schedule headway for Buses (default 60s)
    const timeSinceLastBus = simTime - (lastSpawnTime[type] ?? -999);
    const busHeadwayInterval = busHeadway > 0 ? busHeadway : 60;
    if (timeSinceLastBus < busHeadwayInterval) return null;
    effectiveRate = 999999; // Force spawn if route is clear
  } else {
    // 90s Platooning Cycle for Cars, Jeepneys, Tricycles
    const cycle = simTime % 90;
    if (cycle < 45) {
      effectiveRate = rate * 2.0; // Dense platoon
    } else {
      effectiveRate = rate * 0.1; // Stragglers/Gap
    }
  }

  const probability = (effectiveRate / 3600) * dt * corridor.spawnScale;
  if (Math.random() > probability) return null;

  const routes = getRoutesForLocation(corridor.id);
  if (!routes.length) return null;

  // Filter routes that allow this vehicle type and are not strictly internal compound routes
  let eligibleRoutes = routes.filter(
    (r) =>
      (!r.allowedVehicles || r.allowedVehicles.includes(type)) &&
      !r.isInternalTerminalRoute
  );

  // In Ceres Terminal corridor: ensure buses have high propensity to enter Gate 1 (Ingress)
  if (corridor.id === LocationId.CeresTerminal && type === VehicleType.Bus) {
    const ingressRoute = routes.find((r) => r.id === 'ceres_ingress_gate1');
    if (ingressRoute && Math.random() < 0.65) {
      eligibleRoutes = [ingressRoute];
    }
  }

  if (!eligibleRoutes.length) return null;

  // Weighted random route selection
  const totalWeight = eligibleRoutes.reduce((acc, r) => acc + r.weight, 0);
  let roll = Math.random() * totalWeight;
  let selectedRoute = eligibleRoutes[0];
  for (const r of eligibleRoutes) {
    roll -= r.weight;
    if (roll <= 0) {
      selectedRoute = r;
      break;
    }
  }

  // Check if route entrance is clear (no vehicle within 16m of spawn)
  const spawnPt = evaluateRoute(selectedRoute, 0);
  const tooClose = existingVehicles.some((v) => {
    if (v.isParkedStandby) return false;
    const dx = v.position.x - spawnPt.x;
    const dz = v.position.z - spawnPt.z;
    return Math.hypot(dx, dz) < VEHICLE_DIMENSIONS[type].length + 4.5;
  });
  if (tooClose) return null;

  const isPublicTransport =
    type === VehicleType.Bus ||
    type === VehicleType.Jeepney ||
    type === VehicleType.Tricycle;
  const desiredSpeed = getDesiredSpeed(type, corridor.speedLimit);

  return {
    id: nextVehicleId(),
    type,
    state: VehicleState.Moving,
    position: { x: spawnPt.x, z: spawnPt.z },
    speed: desiredSpeed * 0.75,
    desiredSpeed,
    heading: spawnPt.heading,
    lane: 0,
    dwellTimer: 0,
    entryTime: 0,
    freeFlowTravelTime: selectedRoute.length / desiredSpeed,
    isPublicTransport,
    accumulatedDelay: 0,
    hasDwelled: false,
    routeId: selectedRoute.id,
    distanceAlongRoute: 0,
    isYielding: false,
    yieldTimer: 0,
    sweptWidth:
      type === VehicleType.Bus && selectedRoute.isWideTurningBus
        ? 6.5
        : VEHICLE_DIMENSIONS[type].width,
    stuckTimer: 0,
  };
}

/**
 * Intelligent Driver Model (IDM) car-following.
 * Returns the acceleration in m/s².
 */
function idmAcceleration(
  speed: number,
  desiredSpeed: number,
  gap: number, // net gap to leader in meters
  deltaV: number // speed difference (self - leader)
): number {
  const a = 1.6; // max acceleration (m/s²)
  const b = 3.5; // comfortable deceleration (m/s²)
  const s0 = 1.5; // minimum gap (m)
  const T = 1.4; // desired time headway (s)
  const delta = 4;

  const sStar = s0 + Math.max(0, speed * T + (speed * deltaV) / (2 * Math.sqrt(a * b)));
  const freeRoadTerm = Math.pow(speed / Math.max(desiredSpeed, 0.1), delta);
  const interactionTerm = Math.pow(sStar / Math.max(gap, 0.1), 2);

  return a * (1 - freeRoadTerm - interactionTerm);
}

/**
 * Box-Muller standard normal generator for deterministic log-normal distribution.
 */
function standardNormal(): number {
  let u = 0,
    v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

/**
 * Calibrated log-normal dwell time.
 */
export function sampleParatransitDwellTime(
  type: VehicleType,
  baseDwellParam: number,
  maxDwellCap: number | null
): number {
  let mu: number;
  let sigma: number;
  let minDwell: number;
  let maxDwell: number;

  switch (type) {
    case VehicleType.Tricycle:
      mu = 3.1;
      sigma = 0.28;
      minDwell = 15;
      maxDwell = 50;
      break;
    case VehicleType.Jeepney:
      mu = 3.55;
      sigma = 0.35;
      minDwell = 20;
      maxDwell = 75;
      break;
    case VehicleType.Bus:
      mu = 4.05;
      sigma = 0.32;
      minDwell = 30;
      maxDwell = 120;
      break;
    default:
      mu = 3.2;
      sigma = 0.3;
      minDwell = 15;
      maxDwell = 45;
  }

  const scaleFactor = Math.max(0.5, baseDwellParam / 30);
  const z = standardNormal();
  const rawDwell = Math.exp(mu + sigma * z) * scaleFactor;
  let sampled = Math.min(Math.max(rawDwell, minDwell), maxDwell);

  if (maxDwellCap !== null && maxDwellCap > 0) {
    sampled = Math.min(sampled, maxDwellCap);
  }
  return sampled;
}

/**
 * Update all vehicle positions, headings, and states along 2D waypoint routes.
 */
export function updateVehicles(
  vehicles: Vehicle[],
  dt: number,
  corridor: CorridorConfig,
  dwellTime: number,
  maxDwellTime: number | null,
  pedestrians: Pedestrian[] = [],
  signalPhase: 'green' | 'yellow' | 'red' = 'green'
): Vehicle[] {
  return vehicles.map((vehicle) => {
    const v = { ...vehicle, position: { ...vehicle.position }, isInConflict: false };
    const myDims = VEHICLE_DIMENSIONS[v.type];
    const routeId = v.routeId || 'ceres_hw_nb';
    const route = ALL_ROUTES[routeId] || Object.values(ALL_ROUTES)[0];
    let s = v.distanceAlongRoute ?? 0;

    // 1. Queued / Staging buses inside Ceres terminal yard: active countdown & dispatch
    if (v.terminalPhase === 'queued' || (v.isParkedStandby && v.routeId?.includes('ceres'))) {
      v.dispatchTimer = (v.dispatchTimer ?? 12) - dt;
      if (v.dispatchTimer <= 0) {
        // DISPATCH BUS! Advance from staging queue to Gate 2 exit
        v.terminalPhase = 'egress';
        v.isParkedStandby = false;
        v.state = VehicleState.Moving;
        v.routeId = Math.random() < 0.75 ? 'ceres_egress_north' : 'ceres_egress_south';
        v.distanceAlongRoute = 0;
        v.desiredSpeed = 6.94;
        v.speed = 2.2;
        v.dwellTimer = 0;
        v.hasDwelled = false;
      } else {
        v.speed = 0;
        v.state = VehicleState.Queued;
        return v;
      }
    }

    // 2. Dwelling State Handling
    if (v.state === VehicleState.Dwelling) {
      v.dwellTimer -= dt;
      v.speed = 0;
      if (v.dwellTimer <= 0) {
        v.state = VehicleState.Moving;
        v.dwellTimer = 0;
        v.hasDwelled = true;
        // If bus finished alighting at platform, transition to internal loop to staging yard!
        if (v.terminalPhase === 'alighting') {
          v.terminalPhase = 'inbound';
          v.routeId = 'ceres_alight_to_staging';
          v.distanceAlongRoute = 0;
          v.desiredSpeed = 4.8;
          v.speed = 2.0;
          const loopRoute = ALL_ROUTES['ceres_alight_to_staging'];
          if (loopRoute) {
            const startPt = evaluateRoute(loopRoute, 0);
            v.position.x = startPt.x;
            v.position.z = startPt.z;
            v.heading = startPt.heading;
          }
        }
      }
      v.accumulatedDelay += dt;
      return v;
    }

    // 2.5 Reversing Maneuver (Anti-Gridlock AI)
    if (v.state === VehicleState.Reversing) {
      v.speed = 1.5; // Fixed reversing speed
      v.reverseDistanceTraveled = (v.reverseDistanceTraveled ?? 0) + v.speed * dt;
      
      // Move backwards along spline
      s -= v.speed * dt;
      v.distanceAlongRoute = Math.max(0, s);
      
      // End reversing once target is reached
      if (v.reverseDistanceTraveled >= (v.reverseDistanceTarget ?? 3.0)) {
        v.state = VehicleState.Adjusting; // Pause before moving forward again
        v.stuckTimer = -2.0; // Force a 2.0s yield/pause before forward movement
        v.speed = 0;
      }
      
      // Evaluate 2D position but keep original forward heading (so the mesh faces forward while reversing)
      const pt = evaluateRoute(route, Math.max(0, s));
      v.position.x = pt.x;
      v.position.z = pt.z;
      // Intentionally NOT updating heading so it backs up looking forward
      return v;
    }
    
    if (v.state === VehicleState.Adjusting) {
      v.stuckTimer = (v.stuckTimer ?? 0) + dt;
      v.speed = 0;
      if (v.stuckTimer >= 0) {
        v.state = VehicleState.Moving;
        v.stuckTimer = -8.0; // 8-second cooldown to prevent infinite reverse loops
      }
      return v;
    }

    // 3. Loading Zone Check (for public transport along corridor)
    if (v.isPublicTransport && v.state === VehicleState.Moving && !v.hasDwelled) {
      for (const lz of corridor.loadingZones) {
        if (
          v.position.x >= lz.xStart &&
          v.position.x <= lz.xEnd &&
          Math.abs(v.position.z - lz.z) < 4.5
        ) {
          if (Math.random() < 0.65) {
            v.state = VehicleState.Dwelling;
            v.dwellTimer = sampleParatransitDwellTime(v.type, dwellTime, maxDwellTime);
            v.speed = 0;
            return v;
          }
        }
      }
    }

    // 4. Car-Following along spline route
    let gap = 120; // Default open gap
    let deltaV = 0;

    // Check vehicles ahead on same route
    for (const other of vehicles) {
      if (other.id === v.id || other.isParkedStandby) continue;

      if (other.routeId === v.routeId) {
        const otherS = other.distanceAlongRoute ?? 0;
        if (otherS > s) {
          const leaderGap = otherS - s - VEHICLE_DIMENSIONS[other.type].length;
          // Even if leaderGap is slightly negative (collision), we MUST detect it so we can hard clamp!
          if (leaderGap > -12 && leaderGap < gap) {
            gap = leaderGap;
            deltaV = v.speed - other.speed;
          }
        }
      } else {
        // Spatial proximity check for merging or intersecting paths ahead
        const dx = other.position.x - v.position.x;
        const dz = other.position.z - v.position.z;
        const dist = Math.hypot(dx, dz);

        // Vector pointing forward from self
        const fwdX = Math.cos(v.heading);
        const fwdZ = Math.sin(v.heading);
        const dot = dx * fwdX + dz * fwdZ;

        if (dot > 0 && dist < gap + 15) {
          // Check lateral clearance
          const perpDist = Math.abs(-fwdZ * dx + fwdX * dz);
          const requiredClearance =
            (v.sweptWidth || myDims.width) / 2 +
            (other.sweptWidth || VEHICLE_DIMENSIONS[other.type].width) / 2 +
            0.8;

          if (perpDist < requiredClearance && dot < gap) {
            gap = Math.max(0.2, dot - VEHICLE_DIMENSIONS[other.type].length);
            deltaV = v.speed - other.speed;
          }
        } else if (other.state === VehicleState.Reversing && dist < 12) {
           // Yield to reversing vehicles!
           gap = Math.max(0.2, dist - VEHICLE_DIMENSIONS[other.type].length - 2.0);
           deltaV = v.speed;
        }
      }
    }

    // 5. Intersection & Gate Apron Yielding (Gap Acceptance)
    v.isYielding = false;
    if (route.yieldPoints && route.yieldPoints.length > 0) {
      for (const yp of route.yieldPoints) {
        const distToYield = yp.distanceAlongRoute - s;

        // Approaching yield zone (within 25 meters)
        if (distToYield >= -1.5 && distToYield < 25) {
          // Inspect vehicles on high-priority conflicting routes
          const conflictingVehicleApproaching = vehicles.some((other) => {
            if (other.id === v.id || other.isParkedStandby) return false;
            if (!yp.yieldsToRouteIds.includes(other.routeId || '')) return false;

            const dToCheck = Math.hypot(
              other.position.x - yp.checkLocation[0],
              other.position.z - yp.checkLocation[1]
            );

            // If other vehicle is within approach radius and moving toward junction
            if (dToCheck < 32 && other.speed > 0.8) {
              const arrivalTime = dToCheck / Math.max(other.speed, 1.0);
              return arrivalTime <= yp.priorityArrivalThreshold;
            }
            return false;
          });

          if (conflictingVehicleApproaching) {
            v.isYielding = true;
            const virtualGap = Math.max(0.2, distToYield);
            if (virtualGap < gap) {
              gap = virtualGap;
              deltaV = v.speed; // Decelerate toward stop
            }
          }
        }
      }
    }

    // 6. Crosswalk Keep-Clear, Signal Stop Bar & Pedestrian Yielding
    for (const cw of corridor.crosswalks) {
      const dxToCw = cw.x - v.position.x;
      const fwdX = Math.cos(v.heading);
      const distAlongHeading = dxToCw * fwdX;

      if (distAlongHeading >= -1.0 && distAlongHeading < 35) {
        // 6a. Signal Stop Bar Enforcement (Red & Amber Phase)
        if (cw.signalized && (signalPhase === 'red' || signalPhase === 'yellow')) {
          const stopLineGap = distAlongHeading - (cw.width / 2 + (cw.stopLineOffset ?? 2.5));
          if (stopLineGap >= -0.5 && stopLineGap < 30) {
            // Vehicle must smoothly stop at the stop line
            const virtualGap = Math.max(0.2, stopLineGap);
            if (virtualGap < gap) {
              gap = virtualGap;
              deltaV = v.speed;
            }
          }
        }

        // 6b. Yield to crossing pedestrians (including Buses)
        const pedCrossing = pedestrians.some((p) => {
          if (Math.abs(p.position.x - cw.x) > cw.width / 2 + 2) return false;
          if (p.state === PedestrianState.Crossing) {
            return Math.abs(p.position.z - v.position.z) < 6.5;
          }
          return false;
        });

        if (pedCrossing) {
          // Maintain safety buffer (2.5m for long buses, 1.5m for standard vehicles)
          const safetyBuffer = v.type === VehicleType.Bus ? 2.5 : 1.5;
          const virtualGap = Math.max(0.2, distAlongHeading - cw.width / 2 - safetyBuffer);
          if (virtualGap < gap) {
            gap = virtualGap;
            deltaV = v.speed;
          }
        }
      }
    }

    // 7. Kinematics Integration (IDM + Arc-length Progress)
    const acc = idmAcceleration(v.speed, v.desiredSpeed, gap, deltaV);
    v.speed = Math.max(0, v.speed + acc * dt);

    // Explicit Bounding Box Collision Clamp (Zero Mesh Intersection)
    if (gap < 0.2) {
      v.speed = 0; // Hard clamp to prevent clipping
    }

    s += v.speed * dt;
    v.distanceAlongRoute = s;

    // Route-end transitions for authentic Ceres terminal compound circulation
    if (v.routeId === 'ceres_ingress_gate1' && s >= route.length - 1.5) {
      v.terminalPhase = 'alighting';
      v.state = VehicleState.Dwelling;
      v.dwellTimer = sampleParatransitDwellTime(v.type, dwellTime, maxDwellTime);
      v.speed = 0;
      // Do NOT force position to route.length, this teleports multiple buses onto the exact same spot!
      return v;
    }

    if (v.routeId === 'ceres_alight_to_staging' && s >= route.length - 1.5) {
      v.terminalPhase = 'queued';
      v.state = VehicleState.Queued;
      v.dispatchTimer = 10 + Math.random() * 12; // 10-22 seconds queue idle before dispatch
      v.speed = 0;
      // Do NOT force position to route.length, this teleports multiple buses onto the exact same spot!
      return v;
    }

    // Evaluate 2D position and heading along spline
    const pt = evaluateRoute(route, s);
    v.position.x = pt.x;
    v.position.z = pt.z;
    v.heading = pt.heading;

    // 8. State classification & Stuck Detection (Anti-Gridlock AI)
    if (v.speed < 0.4) {
      v.state = VehicleState.Queued;
      v.accumulatedDelay += dt;
      
      // Only large vehicles (Buses, Tricycles) invoke reversing adjustment
      if (v.type === VehicleType.Bus || v.type === VehicleType.Tricycle) {
        const isIntersectionRoute = v.routeId?.includes('egress') || v.routeId?.includes('in') || v.routeId?.includes('branch') || v.routeId?.includes('merge');
        
        // ONLY trigger if actively blocked in an intersection (NOT safely yielding at a yield line)
        if (isIntersectionRoute && !v.isYielding && gap < 2.0 && (v.stuckTimer ?? 0) >= 0) {
          v.stuckTimer = (v.stuckTimer ?? 0) + dt;
          if (v.stuckTimer > 2.5) {
            v.state = VehicleState.Reversing;
            v.reverseDistanceTarget = 2.5 + Math.random() * 1.5; // 2.5 - 4.0 meters
            v.reverseDistanceTraveled = 0;
            v.stuckTimer = 0;
          }
        } else if ((v.stuckTimer ?? 0) < 0) {
          // Increment cooldown
          v.stuckTimer = (v.stuckTimer ?? 0) + dt;
        }
      }
    } else if (acc < -1.8) {
      v.state = VehicleState.Braking;
      v.stuckTimer = 0;
    } else {
      v.state = VehicleState.Moving;
      v.stuckTimer = 0;
    }

    if (v.speed < v.desiredSpeed * 0.8) {
      v.accumulatedDelay += dt * (1 - v.speed / v.desiredSpeed);
    }

    return v;
  });
}

/**
 * Remove vehicles that have reached their route destination.
 */
export function removeExitedVehicles(
  vehicles: Vehicle[],
  corridorLength: number
): {
  remaining: Vehicle[];
  exited: Vehicle[];
} {
  const remaining: Vehicle[] = [];
  const exited: Vehicle[] = [];

  for (const v of vehicles) {
    // Preserve internal compound buses during their active circulation lifecycle
    if (
      v.isParkedStandby ||
      v.terminalPhase === 'alighting' ||
      v.terminalPhase === 'queued' ||
      (v.routeId === 'ceres_ingress_gate1' && !v.hasDwelled) ||
      v.routeId === 'ceres_alight_to_staging'
    ) {
      remaining.push(v);
      continue;
    }

    const route = ALL_ROUTES[v.routeId || ''];
    const maxS = route ? route.length : corridorLength;
    const reachedEnd = (v.distanceAlongRoute ?? 0) >= maxS - 1.5;
    const outOfBounds =
      v.position.x < -25 ||
      v.position.x > corridorLength + 30 ||
      Math.abs(v.position.z) > 55;

    if (reachedEnd || outOfBounds) {
      exited.push(v);
    } else {
      remaining.push(v);
    }
  }

  return { remaining, exited };
}
