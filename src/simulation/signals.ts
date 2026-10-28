import { TrafficSignalPhase, TrafficSignalInterval } from './types';

export interface TrafficSignalState {
  interval: TrafficSignalInterval;
  vehicularPhase: TrafficSignalPhase;
  pedestrianWalk: boolean;
  pedestrianClearance: boolean;
  timeInInterval: number;
  remainingInInterval: number;
  cycleTime: number;
}

export const SIGNAL_INTERVALS = {
  VEH_GREEN: { duration: 30, vehPhase: 'green' as TrafficSignalPhase, pedWalk: false, pedClearance: false },
  VEH_YELLOW: { duration: 4, vehPhase: 'yellow' as TrafficSignalPhase, pedWalk: false, pedClearance: false },
  PED_WALK: { duration: 18, vehPhase: 'red' as TrafficSignalPhase, pedWalk: true, pedClearance: false },
  PED_CLEARANCE: { duration: 8, vehPhase: 'red' as TrafficSignalPhase, pedWalk: false, pedClearance: true },
};

export const TOTAL_CYCLE_DURATION = 30 + 4 + 18 + 8; // 60 seconds

/**
 * Compute the active signal interval and indications at a given simulation time.
 */
export function getSignalState(simTime: number, isSignalized: boolean): TrafficSignalState {
  if (!isSignalized) {
    return {
      interval: 'veh_green',
      vehicularPhase: 'green',
      pedestrianWalk: true,
      pedestrianClearance: false,
      timeInInterval: simTime,
      remainingInInterval: 9999,
      cycleTime: 0,
    };
  }

  const cycleTime = simTime % TOTAL_CYCLE_DURATION;

  if (cycleTime < 30) {
    return {
      interval: 'veh_green',
      vehicularPhase: 'green',
      pedestrianWalk: false,
      pedestrianClearance: false,
      timeInInterval: cycleTime,
      remainingInInterval: 30 - cycleTime,
      cycleTime,
    };
  } else if (cycleTime < 34) {
    const elapsed = cycleTime - 30;
    return {
      interval: 'veh_yellow',
      vehicularPhase: 'yellow',
      pedestrianWalk: false,
      pedestrianClearance: false,
      timeInInterval: elapsed,
      remainingInInterval: 4 - elapsed,
      cycleTime,
    };
  } else if (cycleTime < 52) {
    const elapsed = cycleTime - 34;
    return {
      interval: 'all_red_ped_walk',
      vehicularPhase: 'red',
      pedestrianWalk: true,
      pedestrianClearance: false,
      timeInInterval: elapsed,
      remainingInInterval: 18 - elapsed,
      cycleTime,
    };
  } else {
    const elapsed = cycleTime - 52;
    return {
      interval: 'ped_clearance',
      vehicularPhase: 'red',
      pedestrianWalk: false,
      pedestrianClearance: true,
      timeInInterval: elapsed,
      remainingInInterval: 8 - elapsed,
      cycleTime,
    };
  }
}

/**
 * Determine stopping feasibility during yellow phase (AASHTO / ITE Kinematic Equation).
 * Returns true if vehicle should stop, false if vehicle is in dilemma zone / clearance zone.
 */
export function evaluateYellowStopFeasibility(
  speed: number, // m/s
  distToStopLine: number, // meters (positive when upstream of stop line)
  comfortDecel = 3.0, // m/s²
  reactionTime = 1.0 // seconds
): { shouldStop: boolean; stoppingDistance: number } {
  if (distToStopLine <= 0) {
    // Already past stop line, must clear intersection
    return { shouldStop: false, stoppingDistance: 0 };
  }

  // Distance traveled during perception-reaction + braking distance
  const stoppingDistance = speed * reactionTime + (speed * speed) / (2 * comfortDecel);

  // If vehicle can stop before stop line with comfortable deceleration
  const shouldStop = stoppingDistance <= distToStopLine;

  return { shouldStop, stoppingDistance };
}
