import {
  Vehicle,
  Pedestrian,
  ConflictEvent,
  SimulationMetrics,
  ConflictType,
  LevelOfService,
  VEHICLE_DIMENSIONS,
} from './types';
import { TTC_CRITICAL, PET_CRITICAL } from './conflicts';

/**
 * Determine Level of Service from average delay.
 * Based on HCM 2010 signalized intersection delay thresholds.
 */
export function delayToLOS(averageDelay: number): LevelOfService {
  if (averageDelay <= 10) return LevelOfService.A;
  if (averageDelay <= 20) return LevelOfService.B;
  if (averageDelay <= 35) return LevelOfService.C;
  if (averageDelay <= 55) return LevelOfService.D;
  if (averageDelay <= 80) return LevelOfService.E;
  return LevelOfService.F;
}

/**
 * Compute queue length: sum of lengths of vehicles with speed < 0.5 m/s,
 * including inter-vehicle gaps.
 */
function computeQueueLength(vehicles: Vehicle[]): number {
  const queuedVehicles = vehicles.filter(v => v.speed < 0.5);
  if (queuedVehicles.length === 0) return 0;

  // Sum vehicle lengths + 2m gaps
  let totalLength = 0;
  for (const v of queuedVehicles) {
    totalLength += VEHICLE_DIMENSIONS[v.type].length + 2;
  }
  return totalLength;
}

/**
 * Compute all operational and safety metrics from current state.
 */
export function computeMetrics(
  vehicles: Vehicle[],
  pedestrians: Pedestrian[],
  conflicts: ConflictEvent[],
  exitedVehicles: Vehicle[],
  completedPedestrians: Pedestrian[],
  simTime: number,
  totalAccumulatedDelay?: number,
  totalVehiclesExited?: number,
): SimulationMetrics {
  // ─── Average Delay ─────────────────────────────────────────
  const vehicleCount = totalVehiclesExited ?? exitedVehicles.length;
  let averageDelay = 0;
  if (totalAccumulatedDelay !== undefined && totalVehiclesExited !== undefined) {
    averageDelay = totalVehiclesExited > 0 ? totalAccumulatedDelay / totalVehiclesExited : 0;
  } else if (exitedVehicles.length > 0) {
    const totalDelay = exitedVehicles.reduce((sum, v) => sum + v.accumulatedDelay, 0);
    averageDelay = totalDelay / exitedVehicles.length;
  }

  // ─── Queue Length & HCM Q95 (95th Percentile) ─────────────
  const averageQueueLength = computeQueueLength(vehicles);
  const q95QueueLength = +(averageQueueLength * 1.68).toFixed(1);

  // ─── Level of Service ──────────────────────────────────────
  const los = delayToLOS(averageDelay);

  // ─── Conflict Counts (FHWA SSAM 4-Type Matrix) ──────────────
  const conflictCounts: Record<ConflictType, number> = {
    [ConflictType.VehiclePedestrian]: 0,
    [ConflictType.RearEnd]: 0,
    [ConflictType.Weaving]: 0,
    [ConflictType.Crossing]: 0,
  };

  for (const c of conflicts) {
    if (conflictCounts[c.type] !== undefined) {
      conflictCounts[c.type]++;
    }
  }

  // ─── Critical Conflicts per Hour ───────────────────────────
  const totalCritical = conflicts.filter(
    c => c.ttc <= TTC_CRITICAL || (!isNaN(c.pet) && c.pet <= PET_CRITICAL)
  ).length;

  const hoursElapsed = Math.max(simTime / 3600, 1 / 3600); // Avoid division by zero
  const criticalConflictsPerHour = totalCritical / hoursElapsed;

  // ─── Crosswalk Blocking / Encroachment Violations ──────────
  const crosswalkViolations = vehicles.filter(v => v.isEncroachingCrosswalk).length;

  return {
    averageDelay,
    averageQueueLength,
    q95QueueLength,
    los,
    conflictCounts,
    criticalConflictsPerHour,
    vehiclesProcessed: vehicleCount,
    pedestriansProcessed: completedPedestrians.length,
    activeVehicles: vehicles.length,
    activePedestrians: pedestrians.length,
    crosswalkViolations,
  };
}

/**
 * Get a color code for the LOS grade.
 */
export function getLOSColor(los: LevelOfService): string {
  const colors: Record<LevelOfService, string> = {
    [LevelOfService.A]: '#22c55e', // green
    [LevelOfService.B]: '#84cc16', // lime
    [LevelOfService.C]: '#eab308', // yellow
    [LevelOfService.D]: '#f97316', // orange
    [LevelOfService.E]: '#ef4444', // red
    [LevelOfService.F]: '#dc2626', // dark red
  };
  return colors[los];
}

/**
 * Generate an executive summary / engineering recommendation.
 */
export function generateExecutiveSummary(
  baselineMetrics: SimulationMetrics,
  scenarioMetrics: SimulationMetrics,
  locationName: string,
  scenarioName: string,
): string {
  const delayReduction = baselineMetrics.averageDelay > 0
    ? ((baselineMetrics.averageDelay - scenarioMetrics.averageDelay) / baselineMetrics.averageDelay * 100).toFixed(1)
    : '0.0';

  const baselineConflicts = Object.values(baselineMetrics.conflictCounts).reduce((a, b) => a + b, 0);
  const scenarioConflicts = Object.values(scenarioMetrics.conflictCounts).reduce((a, b) => a + b, 0);
  const conflictReduction = baselineConflicts > 0
    ? ((baselineConflicts - scenarioConflicts) / baselineConflicts * 100).toFixed(1)
    : '0.0';

  const losImproved = baselineMetrics.los > scenarioMetrics.los;

  let summary = `ENGINEERING ASSESSMENT — ${locationName}\n\n`;
  summary += `Baseline Condition: The ${locationName} corridor currently operates at LOS ${baselineMetrics.los} `;
  summary += `with an average vehicle delay of ${baselineMetrics.averageDelay.toFixed(1)} sec/veh `;
  summary += `and ${baselineMetrics.criticalConflictsPerHour.toFixed(0)} critical surrogate safety conflicts per hour. `;
  summary += `Vehicle-pedestrian conflicts account for ${baselineMetrics.conflictCounts[ConflictType.VehiclePedestrian]} events, `;
  summary += `indicating significant exposure risk under current informal loading operations.\n\n`;

  summary += `Intervention (${scenarioName}): Under the proposed intervention, `;
  summary += `average delay ${Number(delayReduction) >= 0 ? 'decreases' : 'increases'} by ${Math.abs(Number(delayReduction))}% `;
  summary += `to ${scenarioMetrics.averageDelay.toFixed(1)} sec/veh, `;
  summary += `improving operations to LOS ${scenarioMetrics.los}. `;
  summary += `Total conflicts are reduced by ${conflictReduction}%. `;

  if (losImproved) {
    summary += `The Level of Service improves from grade ${baselineMetrics.los} to ${scenarioMetrics.los}. `;
  }

  summary += `\n\nRECOMMENDATION: The Kabankalan City LGU should prioritize implementation of `;
  summary += `${scenarioName} at the ${locationName} corridor. `;
  summary += `This intervention is projected to reduce critical conflicts by ${conflictReduction}% `;
  summary += `and improve traffic operations. The LGU should complement infrastructure changes `;
  summary += `with enforcement of dwell time limits and pedestrian crossing regulations `;
  summary += `to maximize safety benefits.`;

  return summary;
}
