import {
  Vehicle,
  VehicleType,
  VehicleState,
  ManeuverState,
  CorridorConfig,
  VEHICLE_DIMENSIONS,
  Pedestrian,
  PedestrianState,
  LocationId,
  SimulationFault,
} from './types';
import { ALL_ROUTES, evaluateRoute, RouteDefinition } from './routes';
import { CONFLICT_AREAS, getConflictAreasForLocation } from './conflictAreas';
import { getSignalState, evaluateYellowStopFeasibility } from './signals';
import { seededLogNormal, seededRandom } from './random';

/**
 * Intelligent Driver Model (IDM) car-following acceleration.
 * Returns the acceleration in m/s².
 */
export function idmAcceleration(
  speed: number,
  desiredSpeed: number,
  gap: number, // net gap to leader in meters
  deltaV: number // speed difference (self - leader)
): number {
  const a = 1.4; // max acceleration (m/s²)
  const b = 3.0; // comfortable deceleration (m/s²)
  const s0 = 1.5; // minimum gap (m)
  const T = 1.4; // desired time headway (s)
  const delta = 4;

  const sStar = s0 + Math.max(0, speed * T + (speed * deltaV) / (2 * Math.sqrt(a * b)));
  const freeRoadTerm = Math.pow(speed / Math.max(desiredSpeed, 0.1), delta);
  const interactionTerm = Math.pow(sStar / Math.max(gap, 0.1), 2);

  return a * (1 - freeRoadTerm - interactionTerm);
}

/**
 * Sample calibrated paratransit dwell time (log-normal distribution).
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
      mu = 3.4;
      sigma = 0.32;
      minDwell = 20;
      maxDwell = 75;
      break;
    case VehicleType.Bus:
      mu = 3.7;
      sigma = 0.35;
      minDwell = 30;
      maxDwell = 120;
      break;
    default:
      return 0;
  }

  const scaleFactor = Math.max(0.5, baseDwellParam / 30);
  let sampled = seededLogNormal(mu, sigma, minDwell, maxDwell) * scaleFactor;

  if (maxDwellCap !== null && maxDwellCap > 0) {
    sampled = Math.min(sampled, maxDwellCap);
  }
  return sampled;
}

// ─── Active Simulation Fault Encounters Deduplication ───────────────────────
const activeFaultPairs = new Set<string>();

export function resetFaultEngine(): void {
  activeFaultPairs.clear();
}

export interface VehicleDecision {
  acc: number;
  maneuverState: ManeuverState;
  isYielding: boolean;
  yieldingReason?: string;
  conflictingVehicleId?: string;
  leaderVehicleId?: string;
  targetConflictAreaId?: string;
  predictedGap?: number;
  targetSpeed: number;
  detectedNearbyVehicleIds?: string[];
  targetStopDistance?: number;
}

/**
 * PHASE 1: Compute driving decisions for ALL vehicles synchronously from the same immutable state snapshot.
 * Guarantees vehicle array order does NOT determine right-of-way priority!
 */
export function computeVehicleDecisions(
  vehicles: Vehicle[],
  corridor: CorridorConfig,
  simTime: number,
  pedestrians: Pedestrian[] = [],
  signalizedCrossings = false
): Map<string, VehicleDecision> {
  const decisions = new Map<string, VehicleDecision>();
  const conflictAreas = getConflictAreasForLocation(corridor.id);
  const signalState = getSignalState(simTime, signalizedCrossings);

  for (const v of vehicles) {
    // 1. Terminal Staging / Parking / Dwelling handling
    if (v.isParkedStandby || v.state === VehicleState.Dwelling) {
      decisions.set(v.id, {
        acc: 0,
        maneuverState: v.state === VehicleState.Dwelling ? ManeuverState.Dwelling : ManeuverState.Queued,
        isYielding: false,
        targetSpeed: 0,
        detectedNearbyVehicleIds: [],
      });
      continue;
    }

    if (v.terminalPhase === 'queued') {
      decisions.set(v.id, {
        acc: 0,
        maneuverState: ManeuverState.Queued,
        isYielding: false,
        targetSpeed: 0,
        detectedNearbyVehicleIds: [],
      });
      continue;
    }

    const routeId = v.routeId || 'ceres_hw_nb';
    const route = ALL_ROUTES[routeId] || Object.values(ALL_ROUTES)[0];
    const s = v.distanceAlongRoute ?? 0;
    const myDims = VEHICLE_DIMENSIONS[v.type];

    let minGap = 120.0;
    let deltaV = 0.0;
    let maneuverState = ManeuverState.Cruise;
    let isYielding = false;
    let yieldingReason: string | undefined;
    let conflictingVehicleId: string | undefined;
    let leaderVehicleId: string | undefined;
    let targetConflictAreaId: string | undefined;
    let predictedGap: number | undefined;
    let targetStopDistance: number | undefined;
    const detectedNearbyVehicleIds: string[] = [];

    // Broad-phase neighborhood identification (< 45m radius)
    for (const other of vehicles) {
      if (other.id === v.id || other.isParkedStandby) continue;
      const dist = Math.hypot(other.position.x - v.position.x, other.position.z - v.position.z);
      if (dist < 45) {
        detectedNearbyVehicleIds.push(other.id);
      }
    }

    // ─── 2. Car-Following along spline route (Leader Detection) ───
    for (const other of vehicles) {
      if (other.id === v.id || other.isParkedStandby) continue;

      // Ceres Gate 2 egress internal driveway throat: routes ceres_egress_north and ceres_egress_south
      // share the exact same physical driveway throat from distance 0 to 28m
      const isCeresEgressV = v.routeId === 'ceres_egress_north' || v.routeId === 'ceres_egress_south';
      const isCeresEgressOther = other.routeId === 'ceres_egress_north' || other.routeId === 'ceres_egress_south';
      const shareThroat = isCeresEgressV && isCeresEgressOther && s <= 30 && (other.distanceAlongRoute ?? 0) <= 30;

      if (other.routeId === v.routeId || shareThroat) {
        const otherS = other.distanceAlongRoute ?? 0;
        if (otherS > s) {
          const halfLengths = (myDims.length + VEHICLE_DIMENSIONS[other.type].length) / 2;
          const leaderGap = otherS - s - halfLengths;
          if (leaderGap > -5 && leaderGap < minGap) {
            minGap = Math.max(0.2, leaderGap);
            deltaV = v.speed - other.speed;
            leaderVehicleId = other.id;
          }
        }
      } else {
        // Intersecting / merging longitudinal headway check
        const dx = other.position.x - v.position.x;
        const dz = other.position.z - v.position.z;
        const dist = Math.hypot(dx, dz);

        const fwdX = Math.cos(v.heading);
        const fwdZ = Math.sin(v.heading);
        const dot = dx * fwdX + dz * fwdZ;

        if (dot > 0 && dist < minGap + 20) {
          const perpDist = Math.abs(-fwdZ * dx + fwdX * dz);
          const requiredClearance =
            (v.sweptWidth || myDims.width) / 2 +
            (other.sweptWidth || VEHICLE_DIMENSIONS[other.type].width) / 2 +
            0.8;

          if (perpDist < requiredClearance && dot < minGap) {
            const netHeadway = dot - (myDims.length + VEHICLE_DIMENSIONS[other.type].length) / 2;
            minGap = Math.max(0.2, netHeadway);
            deltaV = v.speed - other.speed;
            leaderVehicleId = other.id;
          }
        }
      }
    }

    // ─── 3. Cross-Route 2D Trajectory Footprint Conflict Prediction ───
    // Predict forward trajectories over 0.5s to 3.5s to identify crossing conflicts on un-designated routes
    for (const other of vehicles) {
      if (other.id === v.id || other.isParkedStandby || other.routeId === v.routeId) continue;
      const otherRoute = ALL_ROUTES[other.routeId || ''];
      if (!otherRoute) continue;

      const otherS = other.distanceAlongRoute ?? 0;
      const dist = Math.hypot(other.position.x - v.position.x, other.position.z - v.position.z);
      if (dist > 35) continue;

      const safeClearance = (myDims.length + VEHICLE_DIMENSIONS[other.type].length) / 2 + 1.2;

      // Sample prospective future positions over time horizon
      for (let t = 0.4; t <= 3.2; t += 0.4) {
        const prospectiveV = evaluateRoute(route, s + Math.max(v.speed, 0.5) * t);
        const prospectiveOther = evaluateRoute(otherRoute, otherS + Math.max(other.speed, 0.5) * t);
        const futureDist = Math.hypot(prospectiveOther.x - prospectiveV.x, prospectiveOther.z - prospectiveV.z);

        if (futureDist < safeClearance) {
          // Trajectory conflict predicted at time t
          // Priority check: Priority 1 corridor route > side-street / turning route
          const vIsThrough = v.routeId?.includes('_hw_') || false;
          const otherIsThrough = other.routeId?.includes('_hw_') || false;

          let otherHasPriority = false;
          if (otherIsThrough && !vIsThrough) {
            otherHasPriority = true;
          } else if (!otherIsThrough && vIsThrough) {
            otherHasPriority = false;
          } else {
            // Equal priority: earlier arrival has right of way; tie-break on ID
            otherHasPriority = other.id < v.id;
          }

          if (otherHasPriority) {
            isYielding = true;
            maneuverState = ManeuverState.Yield;
            yieldingReason = `Cross-route trajectory conflict: yielding to ${other.type.toUpperCase()} (${other.id})`;
            conflictingVehicleId = other.id;
            predictedGap = t;

            const distToConflict = Math.max(0.4, v.speed * t - myDims.length / 2);
            if (distToConflict < minGap) {
              minGap = distToConflict;
              deltaV = v.speed;
            }
          }
          break;
        }
      }
    }

    // ─── 4. Conflict Area Negotiation & Movement Priority Arbitration ───
    for (const ca of conflictAreas) {
      const approach = ca.approaches[routeId];
      if (!approach) continue;

      const distToStopBar = approach.stopBarDistance - s;
      const isInsideConflict = s >= approach.entryDistance - 0.5 && s <= approach.exitDistance;

      if (isInsideConflict) {
        if (!isYielding) {
          maneuverState = ManeuverState.Turn;
        }
        targetConflictAreaId = ca.id;

        // Acute obstacle avoidance INSIDE conflict area (never blind cruise)
        for (const other of vehicles) {
          if (other.id === v.id || other.isParkedStandby) continue;
          const otherApproach = ca.approaches[other.routeId || ''];
          if (!otherApproach) continue;

          const otherS = other.distanceAlongRoute ?? 0;
          const otherIsInside = otherS >= otherApproach.entryDistance - 0.5 && otherS <= otherApproach.exitDistance + 2.0;

          if (otherIsInside) {
            const d = Math.hypot(other.position.x - v.position.x, other.position.z - v.position.z);
            const halfL = (myDims.length + VEHICLE_DIMENSIONS[other.type].length) / 2;
            const fwdX = Math.cos(v.heading);
            const fwdZ = Math.sin(v.heading);
            const dot = (other.position.x - v.position.x) * fwdX + (other.position.z - v.position.z) * fwdZ;

            if (dot > 0 && d < halfL + 3.0) {
              // Obstacle ahead inside intersection: brake immediately
              isYielding = true;
              maneuverState = ManeuverState.Yield;
              yieldingReason = `Yielding to ${other.type.toUpperCase()} inside ${ca.name}`;
              conflictingVehicleId = other.id;
              minGap = Math.max(0.2, d - halfL);
              deltaV = v.speed - other.speed;
            }
          }
        }
      } else if (distToStopBar >= -2.0 && distToStopBar < 45) {
        // Approaching conflict area stop bar
        targetConflictAreaId = ca.id;
        targetStopDistance = distToStopBar;
        if (!isYielding) {
          maneuverState = ManeuverState.Approach;
        }

        // A. Check Downstream Receiving Lane Clearance (Merge Front & Rear Check)
        if (approach.receivingRouteId && approach.receivingDistanceStart !== undefined) {
          const rxRouteId = approach.receivingRouteId;
          const rxStart = approach.receivingDistanceStart;
          const rxEnd = approach.receivingDistanceEnd ?? rxStart + 30;

          // Check Front: Queue Spillback in receiving lane
          const frontBlocked = vehicles.some((other) => {
            if (other.id === v.id || other.isParkedStandby) return false;
            if (other.routeId === rxRouteId) {
              const otherS = other.distanceAlongRoute ?? 0;
              return otherS >= rxStart && otherS <= rxEnd && other.speed < 1.0;
            }
            return false;
          });

          if (frontBlocked) {
            isYielding = true;
            maneuverState = ManeuverState.Yield;
            yieldingReason = 'Receiving lane queue spillback (Anti-gridlock)';
            targetStopDistance = distToStopBar;
            const virtualGap = Math.max(0.2, distToStopBar);
            if (virtualGap < minGap) {
              minGap = virtualGap;
              deltaV = v.speed;
            }
          }

          // Check Rear: Approaching oncoming traffic upstream in receiving lane
          if (!isYielding) {
            for (const other of vehicles) {
              if (other.id === v.id || other.isParkedStandby) continue;
              if (other.routeId === rxRouteId) {
                const otherS = other.distanceAlongRoute ?? 0;
                // Vehicle approaching merge point from upstream
                if (otherS < rxStart && otherS > rxStart - 50) {
                  const distToMerge = rxStart - otherS;
                  const timeToMerge = distToMerge / Math.max(other.speed, 1.5);
                  const requiredGap = approach.requiredGapSeconds || (v.type === VehicleType.Bus ? 5.0 : 3.5);

                  if (timeToMerge <= requiredGap) {
                    isYielding = true;
                    maneuverState = ManeuverState.Yield;
                    yieldingReason = `Yielding to approaching ${other.type.toUpperCase()} in receiving lane (${timeToMerge.toFixed(1)}s gap)`;
                    conflictingVehicleId = other.id;
                    predictedGap = timeToMerge;
                    targetStopDistance = distToStopBar;
                    const virtualGap = Math.max(0.2, distToStopBar);
                    if (virtualGap < minGap) {
                      minGap = virtualGap;
                      deltaV = v.speed;
                    }
                    break;
                  }
                }
              }
            }
          }
        }

        // B. Check Conflicting Vehicles on other approaches
        if (!isYielding) {
          let mustYieldToVehicle: Vehicle | null = null;
          let lowestConflictingTime = Infinity;

          for (const other of vehicles) {
            if (other.id === v.id || other.isParkedStandby) continue;
            const otherRouteId = other.routeId || '';
            const otherApproach = ca.approaches[otherRouteId];
            if (!otherApproach) continue;

            const otherS = other.distanceAlongRoute ?? 0;
            const otherIsInside = otherS >= otherApproach.entryDistance - 0.5 && otherS <= otherApproach.exitDistance + VEHICLE_DIMENSIONS[other.type].length / 2;

            // Rule A: If conflicting vehicle is ALREADY inside, self MUST YIELD!
            if (otherIsInside) {
              mustYieldToVehicle = other;
              yieldingReason = `${other.type.toUpperCase()} already inside ${ca.name}`;
              conflictingVehicleId = other.id;
              break;
            }

            // Rule B: Both approaching
            const otherDistToStopBar = otherApproach.stopBarDistance - otherS;
            if (otherDistToStopBar >= -1.0 && otherDistToStopBar < 45) {
              const otherHasHigherPriority = otherApproach.priority < approach.priority;
              const equalPriority = otherApproach.priority === approach.priority;

              const otherArrivalTime = Math.max(0, otherDistToStopBar) / Math.max(other.speed, 1.0);
              const selfClearanceTime = (approach.exitDistance + myDims.length - s) / Math.max(v.speed, 1.0);
              const requiredGap = Math.max(approach.requiredGapSeconds, other.type === VehicleType.Bus ? 4.5 : 3.0);

              if (otherHasHigherPriority) {
                if (otherArrivalTime <= selfClearanceTime + requiredGap) {
                  if (otherArrivalTime < lowestConflictingTime) {
                    lowestConflictingTime = otherArrivalTime;
                    mustYieldToVehicle = other;
                    predictedGap = otherArrivalTime;
                    yieldingReason = `Yielding to higher priority ${other.type.toUpperCase()} (${otherApproach.movementType})`;
                    conflictingVehicleId = other.id;
                  }
                }
              } else if (equalPriority) {
                const selfArrivalTime = Math.max(0, distToStopBar) / Math.max(v.speed, 1.0);
                if (otherArrivalTime < selfArrivalTime || (Math.abs(otherArrivalTime - selfArrivalTime) < 0.5 && other.id < v.id)) {
                  if (otherArrivalTime <= selfClearanceTime + requiredGap) {
                    mustYieldToVehicle = other;
                    predictedGap = otherArrivalTime;
                    yieldingReason = `Yielding to earlier arrival ${other.type.toUpperCase()}`;
                    conflictingVehicleId = other.id;
                    break;
                  }
                }
              }
            }
          }

          if (mustYieldToVehicle) {
            isYielding = true;
            maneuverState = ManeuverState.Yield;
            targetStopDistance = distToStopBar;
            const virtualGap = Math.max(0.2, distToStopBar);
            if (virtualGap < minGap) {
              minGap = virtualGap;
              deltaV = v.speed;
            }
          }
        }
      }
    }

    // ─── 5. Crosswalk Keep-Clear, Signals, & Pedestrian Yielding ───
    for (const cw of corridor.crosswalks) {
      const dxToCw = cw.x - v.position.x;
      const fwdX = Math.cos(v.heading);
      const distAlongHeading = dxToCw * fwdX;

      if (distAlongHeading >= -1.0 && distAlongHeading < 35) {
        // Signalized Crosswalk Stop Line Enforcement
        if (cw.signalized && signalState.vehicularPhase !== 'green') {
          const stopLineGap = distAlongHeading - (cw.width / 2 + (cw.stopLineOffset ?? 2.5));

          if (signalState.vehicularPhase === 'red') {
            if (stopLineGap >= -0.5 && stopLineGap < 30) {
              isYielding = true;
              yieldingReason = 'Red Signal Stop Line';
              targetStopDistance = stopLineGap;
              const virtualGap = Math.max(0.2, stopLineGap);
              if (virtualGap < minGap) {
                minGap = virtualGap;
                deltaV = v.speed;
              }
            }
          } else if (signalState.vehicularPhase === 'yellow') {
            const { shouldStop } = evaluateYellowStopFeasibility(v.speed, stopLineGap);
            if (shouldStop && stopLineGap >= -0.5 && stopLineGap < 25) {
              isYielding = true;
              yieldingReason = 'Yellow Signal Stopping Feasibility';
              targetStopDistance = stopLineGap;
              const virtualGap = Math.max(0.2, stopLineGap);
              if (virtualGap < minGap) {
                minGap = virtualGap;
                deltaV = v.speed;
              }
            }
          }
        }

        // Yield to Pedestrians crossing roadway
        const pedCrossing = pedestrians.some((p) => {
          if (Math.abs(p.position.x - cw.x) > cw.width / 2 + 2.5) return false;
          if (p.state === PedestrianState.Crossing || p.state === PedestrianState.InConflict) {
            return Math.abs(p.position.z - v.position.z) < 6.0;
          }
          return false;
        });

        if (pedCrossing) {
          isYielding = true;
          yieldingReason = 'Yielding to Crossing Pedestrian';
          const safetyBuffer = v.type === VehicleType.Bus ? 3.0 : 1.8;
          const virtualGap = Math.max(0.2, distAlongHeading - cw.width / 2 - safetyBuffer);
          targetStopDistance = virtualGap;
          if (virtualGap < minGap) {
            minGap = virtualGap;
            deltaV = v.speed;
          }
        }
      }
    }

    // ─── 6. Loading Bay Dwell Trigger (Public Transport) ───
    if (v.isPublicTransport && !v.hasDwelled && maneuverState === ManeuverState.Cruise) {
      for (const lz of corridor.loadingZones) {
        if (
          v.position.x >= lz.xStart &&
          v.position.x <= lz.xEnd &&
          Math.abs(v.position.z - lz.z) < 4.5
        ) {
          if (seededRandom() < 0.65) {
            decisions.set(v.id, {
              acc: -3.5,
              maneuverState: ManeuverState.Dwelling,
              isYielding: false,
              targetSpeed: 0,
              detectedNearbyVehicleIds,
            });
            continue;
          }
        }
      }
    }

    // ─── 7. Compute IDM Acceleration from Unified Snapshot ───
    let acc = idmAcceleration(v.speed, v.desiredSpeed, minGap, deltaV);

    // Enforce stopping deceleration when yielding
    if (isYielding) {
      if (targetStopDistance !== undefined && targetStopDistance > 0) {
        const stopDecel = -(v.speed * v.speed) / (2 * Math.max(0.4, targetStopDistance));
        acc = Math.max(-5.5, Math.min(acc, stopDecel));
      } else {
        acc = Math.min(-3.0, acc);
      }
    }

    decisions.set(v.id, {
      acc,
      maneuverState,
      isYielding,
      yieldingReason,
      conflictingVehicleId,
      leaderVehicleId,
      targetConflictAreaId,
      predictedGap,
      targetSpeed: isYielding || minGap < 0.3 ? 0 : v.desiredSpeed,
      detectedNearbyVehicleIds,
      targetStopDistance,
    });
  }

  return decisions;
}

/**
 * PHASE 2: Apply integrated kinematic updates simultaneously to all vehicles.
 */
export function updateVehicles(
  vehicles: Vehicle[],
  dt: number,
  simTime: number,
  corridor: CorridorConfig,
  dwellTime: number,
  maxDwellTime: number | null,
  pedestrians: Pedestrian[] = [],
  signalizedCrossings = false
): { updatedVehicles: Vehicle[]; faults: SimulationFault[] } {
  // 1. Compute unified decisions from snapshot
  const decisions = computeVehicleDecisions(
    vehicles,
    corridor,
    simTime,
    pedestrians,
    signalizedCrossings
  );

  const faults: SimulationFault[] = [];

  const updatedVehicles = vehicles.map((v) => {
    const updated = { ...v, position: { ...v.position }, isInConflict: false };
    const routeId = updated.routeId || 'ceres_hw_nb';
    const route = ALL_ROUTES[routeId] || Object.values(ALL_ROUTES)[0];
    let s = updated.distanceAlongRoute ?? 0;
    const oldS = s;

    // 1. Ceres Staging Yard Queued Bus Countdown
    if (updated.terminalPhase === 'queued' || (updated.isParkedStandby && updated.routeId?.includes('ceres'))) {
      updated.dispatchTimer = (updated.dispatchTimer ?? 12) - dt;
      if (updated.dispatchTimer <= 0) {
        // Prevent following bus from entering until preceding bus has cleared Gate 2 apron (s >= 30m)
        const gateThroatBlocked = vehicles.some((other) => {
          if (other.id === updated.id || other.isParkedStandby) return false;
          if (other.routeId === 'ceres_egress_north' || other.routeId === 'ceres_egress_south') {
            const oS = other.distanceAlongRoute ?? 0;
            return oS < 30; // 12m bus rear clears Gate 2 threshold (24.5m) around s=30.5m
          }
          return false;
        });

        if (gateThroatBlocked) {
          updated.dispatchTimer = 2.0;
          updated.speed = 0;
          updated.state = VehicleState.Queued;
          updated.maneuverState = ManeuverState.Queued;
          return updated;
        }

        // Dispatched bus: transition from staging bay to Gate 2 exit route!
        updated.terminalPhase = 'egress';
        updated.isParkedStandby = false;
        updated.state = VehicleState.Moving;
        updated.maneuverState = ManeuverState.Cruise;
        updated.routeId = seededRandom() < 0.75 ? 'ceres_egress_north' : 'ceres_egress_south';
        updated.distanceAlongRoute = 0;
        updated.desiredSpeed = 6.94;
        updated.speed = 1.5;
        updated.dwellTimer = 0;
        updated.hasDwelled = false;
      } else {
        updated.speed = 0;
        updated.state = VehicleState.Queued;
        updated.maneuverState = ManeuverState.Queued;
        return updated;
      }
    }

    // 2. Active Dwelling State
    if (updated.state === VehicleState.Dwelling) {
      updated.dwellTimer -= dt;
      updated.speed = 0;
      updated.stoppedDuration = (updated.stoppedDuration ?? 0) + dt;
      updated.stoppedDelay = (updated.stoppedDelay ?? 0) + dt;
      updated.accumulatedDelay += dt;
      updated.controlDelay += dt;

      if (updated.dwellTimer <= 0) {
        updated.state = VehicleState.Moving;
        updated.maneuverState = ManeuverState.Cruise;
        updated.dwellTimer = 0;
        updated.hasDwelled = true;

        if (updated.terminalPhase === 'alighting') {
          updated.terminalPhase = 'inbound';
          updated.routeId = 'ceres_alight_to_staging';
          updated.distanceAlongRoute = 0;
          updated.desiredSpeed = 4.8;
          updated.speed = 2.0;
          const loopRoute = ALL_ROUTES['ceres_alight_to_staging'];
          if (loopRoute) {
            const startPt = evaluateRoute(loopRoute, 0);
            updated.position.x = startPt.x;
            updated.position.z = startPt.z;
            updated.heading = startPt.heading;
          }
          return updated;
        }
      } else {
        return updated;
      }
    }

    // 3. Apply Decision & Integrated Kinematics
    const dec = decisions.get(updated.id);
    let appliedAcc = dec ? dec.acc : 0;

    if (dec) {
      updated.maneuverState = dec.maneuverState;
      updated.isYielding = dec.isYielding;
      updated.yieldingReason = dec.yieldingReason;
      updated.conflictingVehicleId = dec.conflictingVehicleId;
      updated.leaderVehicleId = dec.leaderVehicleId;
      updated.targetConflictAreaId = dec.targetConflictAreaId;
      updated.predictedGap = dec.predictedGap;
      updated.detectedNearbyVehicleIds = dec.detectedNearbyVehicleIds;
      updated.targetStopDistance = dec.targetStopDistance;

      if (dec.maneuverState === ManeuverState.Dwelling) {
        updated.state = VehicleState.Dwelling;
        updated.dwellTimer = sampleParatransitDwellTime(updated.type, dwellTime, maxDwellTime);
        updated.speed = 0;
        return updated;
      }

      // Hard Stop Line & Deceleration Integration
      if (dec.isYielding) {
        if (dec.targetStopDistance !== undefined && dec.targetStopDistance <= 0.2) {
          // Vehicle has reached or is at the stop bar: MUST HOLD STOPPED!
          updated.speed = 0;
          appliedAcc = -4.0;
          updated.state = VehicleState.Queued;
          updated.maneuverState = ManeuverState.Yield;
        } else {
          updated.speed = Math.max(0, updated.speed + appliedAcc * dt);
          if (dec.targetSpeed === 0 && updated.speed < 0.15) {
            updated.speed = 0;
          }
          s += updated.speed * dt;
          // Prevent advancing past stop line when yielding
          if (dec.targetStopDistance !== undefined && s > oldS + dec.targetStopDistance) {
            s = oldS + Math.max(0, dec.targetStopDistance);
            updated.speed = 0;
          }
        }
      } else {
        if (dec.targetSpeed === 0 && updated.speed < 0.2) {
          updated.speed = 0;
          appliedAcc = -3.0;
        } else {
          updated.speed = Math.max(0, updated.speed + appliedAcc * dt);
        }
        s += updated.speed * dt;
      }
    } else {
      s += updated.speed * dt;
    }

    updated.appliedAcc = appliedAcc;
    updated.requestedAcc = dec ? dec.acc : 0;
    updated.deltaDistance = s - oldS;
    updated.distanceAlongRoute = s;

    // 4. Update Delays
    if (updated.speed < 0.3) {
      updated.stoppedDuration = (updated.stoppedDuration ?? 0) + dt;
      updated.stoppedDelay = (updated.stoppedDelay ?? 0) + dt;
      updated.state = VehicleState.Queued;
    } else {
      updated.stoppedDuration = 0;
      updated.state = dec && appliedAcc < -1.8 ? VehicleState.Braking : VehicleState.Moving;
    }

    if (updated.speed < updated.desiredSpeed * 0.9) {
      const delayDelta = dt * (1 - updated.speed / updated.desiredSpeed);
      updated.accumulatedDelay += delayDelta;
      if (updated.isYielding || updated.state === VehicleState.Queued || updated.state === VehicleState.Braking) {
        updated.controlDelay += delayDelta;
      }
    }

    // Terminal Route lifecycle transitions
    if (updated.routeId === 'ceres_ingress_gate1' && s >= route.length - 1.5) {
      updated.terminalPhase = 'alighting';
      updated.state = VehicleState.Dwelling;
      updated.maneuverState = ManeuverState.Dwelling;
      updated.dwellTimer = sampleParatransitDwellTime(updated.type, dwellTime, maxDwellTime);
      updated.speed = 0;
      return updated;
    }

    if (updated.routeId === 'ceres_alight_to_staging' && s >= route.length - 1.5) {
      updated.terminalPhase = 'queued';
      updated.state = VehicleState.Queued;
      updated.maneuverState = ManeuverState.Queued;
      updated.dispatchTimer = 10 + seededRandom() * 12;
      updated.speed = 0;
      return updated;
    }

    // Evaluate 2D position and heading along route spline
    const pt = evaluateRoute(route, s);
    updated.position.x = pt.x;
    updated.position.z = pt.z;
    updated.heading = pt.heading;

    return updated;
  });

  // 6. Separate Physical Collision Detection (Encounter-based Simulation Faults)
  const currentOverlappingPairs = new Set<string>();

  for (let i = 0; i < updatedVehicles.length; i++) {
    const v1 = updatedVehicles[i];
    if (v1.isParkedStandby) continue;
    const l1 = VEHICLE_DIMENSIONS[v1.type].length;
    const w1 = VEHICLE_DIMENSIONS[v1.type].width;

    for (let j = i + 1; j < updatedVehicles.length; j++) {
      const v2 = updatedVehicles[j];
      if (v2.isParkedStandby) continue;
      const l2 = VEHICLE_DIMENSIONS[v2.type].length;
      const w2 = VEHICLE_DIMENSIONS[v2.type].width;

      const dx = v2.position.x - v1.position.x;
      const dz = v2.position.z - v1.position.z;
      const dist = Math.hypot(dx, dz);
      const minSafeDist = (l1 + l2) * 0.48;

      if (dist < minSafeDist) {
        // Detailed bounding box check based on physical vehicle dimensions
        const fwd1X = Math.cos(v1.heading);
        const fwd1Z = Math.sin(v1.heading);
        const longDist = Math.abs(dx * fwd1X + dz * fwd1Z);
        const latDist = Math.abs(-fwd1Z * dx + fwd1X * dz);

        const safeLong = (l1 + l2) / 2;
        const safeLat = (w1 + w2) / 2;

        if (longDist < safeLong && latDist < safeLat) {
          const overlap = safeLong - longDist;
          const pairKey = v1.id < v2.id ? `${v1.id}:${v2.id}` : `${v2.id}:${v1.id}`;
          currentOverlappingPairs.add(pairKey);

          if (!activeFaultPairs.has(pairKey)) {
            activeFaultPairs.add(pairKey);
            faults.push({
              id: `fault-${simTime.toFixed(2)}-${v1.id}-${v2.id}`,
              time: simTime,
              location: { x: (v1.position.x + v2.position.x) / 2, z: (v1.position.z + v2.position.z) / 2 },
              entity1Id: v1.id,
              entity2Id: v2.id,
              entity1Type: v1.type,
              entity2Type: v2.type,
              overlapDistance: +overlap.toFixed(2),
              severity: overlap > 1.0 ? 'severe' : 'minor',
            });
          }
        }
      }
    }
  }

  // Clear pairs that have separated
  for (const pairKey of activeFaultPairs) {
    if (!currentOverlappingPairs.has(pairKey)) {
      activeFaultPairs.delete(pairKey);
    }
  }

  return { updatedVehicles, faults };
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
      v.position.x < -30 ||
      v.position.x > corridorLength + 35 ||
      Math.abs(v.position.z) > 60;

    if (reachedEnd || outOfBounds) {
      exited.push(v);
    } else {
      remaining.push(v);
    }
  }

  return { remaining, exited };
}
