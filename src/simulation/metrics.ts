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
 * Determine HCM Level of Service based on Average Control Delay.
 * References:
 * - Signalized Facilities: HCM 2010 Exhibit 18-4
 * - Unsignalized / Priority Intersections: HCM 2010 Exhibit 19-1
 */
export function delayToLOS(controlDelay: number, isSignalized = false): LevelOfService {
  if (isSignalized) {
    if (controlDelay <= 10.0) return LevelOfService.A;
    if (controlDelay <= 20.0) return LevelOfService.B;
    if (controlDelay <= 35.0) return LevelOfService.C;
    if (controlDelay <= 55.0) return LevelOfService.D;
    if (controlDelay <= 80.0) return LevelOfService.E;
    return LevelOfService.F;
  } else {
    if (controlDelay <= 10.0) return LevelOfService.A;
    if (controlDelay <= 15.0) return LevelOfService.B;
    if (controlDelay <= 25.0) return LevelOfService.C;
    if (controlDelay <= 35.0) return LevelOfService.D;
    if (controlDelay <= 50.0) return LevelOfService.E;
    return LevelOfService.F;
  }
}

export function getLOSColor(los: LevelOfService): string {
  switch (los) {
    case LevelOfService.A:
      return '#10b981'; // Green
    case LevelOfService.B:
      return '#34d399'; // Mint
    case LevelOfService.C:
      return '#38bdf8'; // Sky blue
    case LevelOfService.D:
      return '#fbbf24'; // Amber
    case LevelOfService.E:
      return '#f97316'; // Orange
    case LevelOfService.F:
      return '#ef4444'; // Red
    default:
      return '#94a3b8';
  }
}

/**
 * Empirical percentile calculation from discrete measured samples.
 * Nearest-rank method with linear interpolation.
 */
export function computeEmpiricalPercentile(samples: number[], percentile = 0.95): number {
  if (!samples.length) return 0;
  if (samples.length === 1) return samples[0];

  const sorted = [...samples].sort((a, b) => a - b);
  const index = (sorted.length - 1) * percentile;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;

  return sorted[lower] + weight * (sorted[upper] - sorted[lower]);
}

/**
 * Compute instantaneous queue metrics in vehicles and meters.
 * A queued vehicle is defined as having speed < 0.5 m/s.
 */
export function sampleCurrentQueue(vehicles: Vehicle[]): {
  queueMeters: number;
  queueVehicles: number;
} {
  const queued = vehicles.filter((v) => !v.isParkedStandby && v.speed < 0.5);
  let queueMeters = 0;

  for (const v of queued) {
    queueMeters += VEHICLE_DIMENSIONS[v.type].length + 1.8; // Vehicle footprint + inter-vehicle headway gap
  }

  return {
    queueMeters,
    queueVehicles: queued.length,
  };
}

/**
 * Compute comprehensive operational, delay, and safety metrics.
 */
export function computeMetrics(
  vehicles: Vehicle[],
  pedestrians: Pedestrian[],
  allConflicts: ConflictEvent[],
  exitedVehicles: Vehicle[],
  completedPedestrians: Pedestrian[],
  simTime: number,
  totalTravelDelayAccumulated: number,
  totalControlDelayAccumulated: number,
  totalStoppedDelayAccumulated: number,
  totalVehiclesExited: number,
  queueSamplesMeters: number[],
  queueSamplesVehicles: number[],
  simulationFaultsCount: number,
  pendingQueuedVehicles: number,
  unmetDemandCount: number,
  isSignalized = false
): SimulationMetrics {
  const exitCount = totalVehiclesExited > 0 ? totalVehiclesExited : exitedVehicles.length;

  // Active in-transit vehicles currently navigating the network
  const activeVehicles = vehicles.filter((v) => !v.isParkedStandby && v.terminalPhase !== 'queued');
  const activeControlDelay = activeVehicles.reduce((sum, v) => sum + (v.controlDelay || 0), 0);
  const activeStoppedDelay = activeVehicles.reduce((sum, v) => sum + (v.stoppedDelay || 0), 0);
  const activeTravelDelay = activeVehicles.reduce((sum, v) => sum + (v.accumulatedDelay || 0), 0);

  const totalEvaluated = exitCount + activeVehicles.length;

  // 1. Differentiated Delay Metrics (seconds/vehicle)
  const averageDelay = totalEvaluated > 0 ? (totalTravelDelayAccumulated + activeTravelDelay) / totalEvaluated : 0;
  const controlDelay = totalEvaluated > 0 ? (totalControlDelayAccumulated + activeControlDelay) / totalEvaluated : 0;
  const stoppedDelay = totalEvaluated > 0 ? (totalStoppedDelayAccumulated + activeStoppedDelay) / totalEvaluated : 0;

  // 2. Queue Length Metrics (Empirical Percentiles from 1.0s periodic observations)
  const avgMeters = queueSamplesMeters.length
    ? queueSamplesMeters.reduce((a, b) => a + b, 0) / queueSamplesMeters.length
    : 0;
  const avgVehicles = queueSamplesVehicles.length
    ? queueSamplesVehicles.reduce((a, b) => a + b, 0) / queueSamplesVehicles.length
    : 0;

  const q95QueueLength = computeEmpiricalPercentile(queueSamplesMeters, 0.95);
  const q95QueueVehicles = Math.round(computeEmpiricalPercentile(queueSamplesVehicles, 0.95));

  // 3. Level of Service based on control delay
  const los = delayToLOS(controlDelay, isSignalized);

  // 4. SSAM-Inspired Deduplicated Conflict Matrix
  const conflictCounts: Record<ConflictType, number> = {
    [ConflictType.VehiclePedestrian]: 0,
    [ConflictType.RearEnd]: 0,
    [ConflictType.Weaving]: 0,
    [ConflictType.Crossing]: 0,
  };

  for (const c of allConflicts) {
    if (conflictCounts[c.type] !== undefined) {
      conflictCounts[c.type]++;
    }
  }

  // 5. Critical Conflicts per Hour (TTC <= 1.5s or observed PET <= 1.0s)
  const totalCritical = allConflicts.filter(
    (c) => c.ttc <= TTC_CRITICAL || (!isNaN(c.pet) && c.pet <= PET_CRITICAL)
  ).length;

  const hoursElapsed = Math.max(simTime / 3600, 1 / 3600);
  const criticalConflictsPerHour = totalCritical / hoursElapsed;

  // 6. Crosswalk Violations
  const crosswalkViolations = vehicles.filter((v) => v.isEncroachingCrosswalk).length;

  return {
    averageDelay: +averageDelay.toFixed(2),
    controlDelay: +controlDelay.toFixed(2),
    stoppedDelay: +stoppedDelay.toFixed(2),
    averageQueueLength: +avgMeters.toFixed(1),
    averageQueueVehicles: +avgVehicles.toFixed(1),
    q95QueueLength: +q95QueueLength.toFixed(1),
    q95QueueVehicles,
    queueSampleCount: queueSamplesMeters.length,
    los,
    conflictCounts,
    criticalConflictsPerHour: +criticalConflictsPerHour.toFixed(1),
    simulationFaults: simulationFaultsCount,
    vehiclesProcessed: exitCount,
    pedestriansProcessed: completedPedestrians.length,
    activeVehicles: vehicles.length,
    activePedestrians: pedestrians.length,
    pendingQueuedVehicles,
    unmetDemand: unmetDemandCount,
    crosswalkViolations,
  };
}

/**
 * Generate a formal engineering executive summary report.
 */
export function generateExecutiveSummary(
  baseline: SimulationMetrics,
  intervention: SimulationMetrics,
  locationName: string,
  scenarioName: string,
  seed = 12345
): string {
  const delayDelta = intervention.controlDelay - baseline.controlDelay;
  const delayPct = baseline.controlDelay > 0 ? ((delayDelta / baseline.controlDelay) * 100).toFixed(1) : '0.0';

  const q95Delta = intervention.q95QueueLength - baseline.q95QueueLength;
  const q95Pct = baseline.q95QueueLength > 0 ? ((q95Delta / baseline.q95QueueLength) * 100).toFixed(1) : '0.0';

  const conflictDelta = intervention.criticalConflictsPerHour - baseline.criticalConflictsPerHour;
  const conflictPct = baseline.criticalConflictsPerHour > 0
    ? ((conflictDelta / baseline.criticalConflictsPerHour) * 100).toFixed(1)
    : '0.0';

  return `================================================================================
KABANKALAN CITY 3D TRAFFIC MICROSIMULATION DECISION SUPPORT SYSTEM
CIVIL & TRANSPORTATION ENGINEERING COMPARATIVE ASSESSMENT REPORT
================================================================================
Corridor: ${locationName}
Evaluated Scenario: ${scenarioName}
Deterministic Seed: ${seed}
Evaluation Horizon: Empirical Steady-State (Fixed Timestep 0.05s)
Safety Engine: SSAM-Inspired Analytical Conflict Model (TTC <= 1.5s, PET <= 1.0s)
Queue Standard: Empirical 95th Percentile from 1.0s Periodic Observations

1. OPERATIONAL EFFICIENCY (HCM 2010 STANDARD)
--------------------------------------------------------------------------------
- Average Control Delay:
  Baseline: ${baseline.controlDelay.toFixed(2)} s/veh (LOS ${baseline.los})
  Intervention: ${intervention.controlDelay.toFixed(2)} s/veh (LOS ${intervention.los})
  Delta: ${delayDelta > 0 ? '+' : ''}${delayDelta.toFixed(2)} s/veh (${delayDelta > 0 ? '+' : ''}${delayPct}%)

- Average Stopped Delay (v < 0.3 m/s):
  Baseline: ${baseline.stoppedDelay.toFixed(2)} s/veh
  Intervention: ${intervention.stoppedDelay.toFixed(2)} s/veh

- Empirical Q95 Back-of-Queue (95th Percentile):
  Baseline: ${baseline.q95QueueLength.toFixed(1)} m (${baseline.q95QueueVehicles} veh)
  Intervention: ${intervention.q95QueueLength.toFixed(1)} m (${intervention.q95QueueVehicles} veh)
  Delta: ${q95Delta > 0 ? '+' : ''}${q95Delta.toFixed(1)} m (${q95Delta > 0 ? '+' : ''}${q95Pct}%)
  Queue Sample Population: ${intervention.queueSampleCount} periodic observations

2. SAFETY PERFORMANCE ASSESSMENT (SSAM-INSPIRED METRICS)
--------------------------------------------------------------------------------
- Critical Conflict Frequency:
  Baseline: ${baseline.criticalConflictsPerHour.toFixed(1)} conflicts/hr
  Intervention: ${intervention.criticalConflictsPerHour.toFixed(1)} conflicts/hr
  Delta: ${conflictDelta > 0 ? '+' : ''}${conflictDelta.toFixed(1)} conflicts/hr (${conflictDelta > 0 ? '+' : ''}${conflictPct}%)

- Breakdown of Deduplicated Conflicts by Encounter Type:
  * Vehicle-Pedestrian: Baseline ${baseline.conflictCounts[ConflictType.VehiclePedestrian]} -> Intervention ${intervention.conflictCounts[ConflictType.VehiclePedestrian]}
  * Crossing:           Baseline ${baseline.conflictCounts[ConflictType.Crossing]} -> Intervention ${intervention.conflictCounts[ConflictType.Crossing]}
  * Rear-End:           Baseline ${baseline.conflictCounts[ConflictType.RearEnd]} -> Intervention ${intervention.conflictCounts[ConflictType.RearEnd]}
  * Weaving:            Baseline ${baseline.conflictCounts[ConflictType.Weaving]} -> Intervention ${intervention.conflictCounts[ConflictType.Weaving]}

- Crosswalk Obstruction Violations:
  Baseline: ${baseline.crosswalkViolations} | Intervention: ${intervention.crosswalkViolations}

- Simulation Faults Recorded (Mesh Overlaps):
  Baseline: ${baseline.simulationFaults} | Intervention: ${intervention.simulationFaults}

3. THROUGHPUT & CORRIDOR DEMAND
--------------------------------------------------------------------------------
- Total Processed Vehicles: ${intervention.vehiclesProcessed}
- Total Processed Pedestrians: ${intervention.pedestriansProcessed}
- Unmet Entry Demand (Spillback Queue): ${intervention.unmetDemand} vehicles

4. METHODOLOGICAL NOTES & ASSUMPTIONS
--------------------------------------------------------------------------------
* All reported outputs are generated from microsimulation trajectory predictions.
* Model assumes calibrated DPWH geometric dimensions (6.70m carriageway, 1.50m paved shoulders).
* Paratransit dwell times follow calibrated log-normal distributions.
* Conflict events are deduplicated per encounter to eliminate multi-frame artifacts.
================================================================================`;
}
