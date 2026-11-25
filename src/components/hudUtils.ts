import {
  SCENARIOS,
  type LevelOfService,
  type ScenarioId,
  type ScenarioSnapshot,
  type SimVehicleType,
  type SimulationParams,
  type TelemetryPoint,
  type TerminalPhase,
  type VehicleState,
} from '@/sim/types';

export const SCENARIO_ORDER: readonly ScenarioId[] = [
  'baseline',
  'dedicated-bays',
  'signalized-overpass',
];

export const PLAYBACK_SPEEDS: readonly number[] = [0.5, 1, 2, 4];

export const CORRIDOR_COORDS = '9.99786°N, 122.81195°E';

export const LOS_CSS_VAR: Readonly<Record<LevelOfService, string>> = {
  A: 'var(--los-a)',
  B: 'var(--los-b)',
  C: 'var(--los-c)',
  D: 'var(--los-d)',
  E: 'var(--los-e)',
  F: 'var(--los-f)',
};

export const LOS_DESCRIPTION: Readonly<Record<LevelOfService, string>> = {
  A: 'Free Flow',
  B: 'Reasonably Free',
  C: 'Stable Flow',
  D: 'Approaching Unstable',
  E: 'At Capacity',
  F: 'Forced / Breakdown',
};

export const VEHICLE_TYPE_LABEL: Readonly<Record<SimVehicleType, string>> = {
  bus: 'Ceres Bus',
  jeepney: 'PUJ Jeepney',
  tricycle: 'Tricycle',
  car: 'Private Car',
};

export const VEHICLE_STATE_LABEL: Readonly<Record<VehicleState, string>> = {
  cruising: 'Cruising',
  braking: 'Braking',
  yielding: 'Yielding',
  lane_changing: 'MOBIL Shift',
  dwelling: 'Dwelling',
  queued: 'Queued',
};

export const TERMINAL_PHASE_LABEL: Readonly<Record<TerminalPhase, string>> = {
  none: 'Corridor',
  ingress: 'Gate 1 Ingress',
  alighting: 'Alighting',
  staging: 'Bay Staging',
  egress: 'Gate 2 Egress',
};

export function formatSimClock(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function computePercentDelta(baseline: number, target: number): number | null {
  if (!Number.isFinite(baseline) || baseline === 0) return null;
  return ((target - baseline) / baseline) * 100;
}

export function formatSignedPct(delta: number | null): string {
  if (delta === null || !Number.isFinite(delta)) return '—';
  const sign = delta > 0 ? '+' : '';
  return `${sign}${delta.toFixed(1)}%`;
}

function escapeCsvCell(value: string | number | boolean | null): string {
  const str = value === null ? '' : String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildThesisChapter4Csv(
  params: SimulationParams,
  snapshots: Partial<Record<ScenarioId, ScenarioSnapshot>>,
  liveHistory: readonly TelemetryPoint[],
  activeSimTime: number
): string {
  const lines: string[] = [];
  const pushRow = (cells: Array<string | number | boolean | null>) => {
    lines.push(cells.map(escapeCsvCell).join(','));
  };

  pushRow(['KABANKALAN CITY 3D TRAFFIC MICROSIMULATION DSS — THESIS CHAPTER 4 DATASET']);
  pushRow(['Corridor', 'Ceres Bus Terminal Frontage (Guanzon St / National Hwy & Pedro Zayco Sr. St.)']);
  pushRow(['Coordinates', CORRIDOR_COORDS]);
  pushRow(['Active Scenario', SCENARIOS[params.scenario].name]);
  pushRow(['Active Sim Time (s)', activeSimTime.toFixed(1)]);
  pushRow(['Random Seed', params.seed]);
  pushRow([]);

  pushRow(['CALIBRATION PARAMETERS']);
  pushRow(['Parameter', 'Value', 'Unit']);
  pushRow(['Ceres Bus Headway', params.busHeadwaySeconds, 's']);
  pushRow(['PUJ Jeepney Volume', params.jeepneyRatePerHour, 'veh/h']);
  pushRow(['Tricycle Volume', params.tricycleRatePerHour, 'veh/h']);
  pushRow(['Private Car Volume', params.carRatePerHour, 'veh/h']);
  pushRow(['Pedestrian Volume', params.pedestrianRatePerHour, 'ped/h']);
  pushRow([]);

  pushRow(['SCENARIO BENCHMARK COMPARISON']);
  pushRow([
    'Scenario',
    'SimTime_s',
    'HCM_LOS',
    'AvgDelay_s_veh',
    'AvgSpeed_kph',
    'Throughput_vph',
    'Queue_veh',
    'Queue_m',
    'TotalConflicts',
    'RearEnd',
    'Crossing',
    'Weaving',
    'Pedestrian',
    'CriticalConflicts',
    'MOBIL_LaneChanges',
    'Faults',
  ]);

  for (const id of SCENARIO_ORDER) {
    const snap = snapshots[id];
    if (!snap) continue;
    const m = snap.metrics;
    pushRow([
      SCENARIOS[id].name,
      snap.simTime.toFixed(1),
      m.los,
      m.avgControlDelaySec.toFixed(2),
      m.avgSpeedKph.toFixed(2),
      Math.round(m.throughputVehPerHour),
      m.queueVehicles,
      m.queueLengthMeters.toFixed(1),
      m.totalConflicts,
      m.rearEndConflicts,
      m.crossingConflicts,
      m.weavingConflicts,
      m.pedestrianConflicts,
      m.criticalConflicts,
      m.laneChangesCompleted,
      m.faultCount,
    ]);
  }
  pushRow([]);

  pushRow(['ACTIVE RUN TELEMETRY TIME SERIES']);
  pushRow(['SimTime_s', 'AvgSpeed_kph', 'AvgDelay_s', 'Queue_veh', 'ActiveVehicles', 'ConflictsPerMin']);
  for (const pt of liveHistory) {
    pushRow([
      pt.time.toFixed(1),
      pt.avgSpeedKph.toFixed(2),
      pt.avgDelaySec.toFixed(2),
      pt.queueLength,
      pt.activeVehicles,
      pt.conflictsPerMin.toFixed(2),
    ]);
  }

  return lines.join('\n');
}

export function downloadCsvFile(filename: string, csvContent: string): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
