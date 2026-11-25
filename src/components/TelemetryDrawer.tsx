'use client';

import React, { useMemo, useState } from 'react';
import {
  Activity,
  BarChart3,
  Camera,
  ChevronRight,
  Download,
  FileText,
  Play,
  Printer,
  ShieldAlert,
  TrafficCone,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { SCENARIOS } from '@/sim/types';
import { useSimStore } from '@/store/simStore';
import {
  buildThesisChapter4Csv,
  computePercentDelta,
  CORRIDOR_COORDS,
  downloadCsvFile,
  formatSignedPct,
  formatSimClock,
  LOS_CSS_VAR,
  LOS_DESCRIPTION,
  SCENARIO_ORDER,
} from './hudUtils';

type DrawerTab = 'live' | 'compare' | 'report';

interface TelemetryDrawerProps {
  isOpen: boolean;
  onToggle: () => void;
}

const TABS: readonly { id: DrawerTab; label: string; icon: React.ComponentType<{ className?: string; strokeWidth?: number }> }[] = [
  { id: 'live', label: 'Live', icon: Activity },
  { id: 'compare', label: 'Compare', icon: BarChart3 },
  { id: 'report', label: 'Report', icon: FileText },
];

export function TelemetryDrawer({ isOpen, onToggle }: TelemetryDrawerProps) {
  const [activeTab, setActiveTab] = useState<DrawerTab>('live');
  const [benchmarkRanNotice, setBenchmarkRanNotice] = useState(false);

  const simState = useSimStore((s) => s.simState);
  const params = useSimStore((s) => s.params);
  const scenarioSnapshots = useSimStore((s) => s.scenarioSnapshots);
  const captureScenarioSnapshot = useSimStore((s) => s.captureScenarioSnapshot);
  const runAllScenarioBenchmarks = useSimStore((s) => s.runAllScenarioBenchmarks);

  const { metrics, signalState, telemetryHistory, simTime } = simState;
  const losColor = LOS_CSS_VAR[metrics.los];

  const chartData = useMemo(
    () =>
      telemetryHistory.slice(-48).map((pt) => ({
        clock: formatSimClock(pt.time),
        speed: Number(pt.avgSpeedKph.toFixed(1)),
        delay: Number(pt.avgDelaySec.toFixed(1)),
      })),
    [telemetryHistory]
  );

  const handleRunBenchmarks = () => {
    runAllScenarioBenchmarks();
    setBenchmarkRanNotice(true);
    window.setTimeout(() => setBenchmarkRanNotice(false), 2400);
  };

  const handleExportCsv = () => {
    const csv = buildThesisChapter4Csv(
      params,
      scenarioSnapshots,
      telemetryHistory,
      simTime
    );
    downloadCsvFile(`kabankalan-dss-ch4-${params.scenario}.csv`, csv);
  };

  const handlePrintReport = () => {
    window.print();
  };

  const baselineSnap = scenarioSnapshots.baseline;
  const snapshotCount = SCENARIO_ORDER.filter((id) => Boolean(scenarioSnapshots[id])).length;

  if (!isOpen) {
    return (
      <div data-hud-chrome className="fixed top-[60px] right-3 z-20">
        <button
          type="button"
          onClick={onToggle}
          aria-label="Open telemetry drawer"
          title="Open Telemetry & Reports"
          className="hud-surface-strong flex h-10 items-center gap-1.5 rounded-[var(--radius-md)] px-2.5 text-[var(--ink-primary)] transition-colors duration-150 hover:border-[var(--border-strong)]"
        >
          <span
            className="metric-value flex h-5 w-5 items-center justify-center rounded-[4px] font-mono text-xs font-bold text-[var(--surface-canvas)]"
            style={{ backgroundColor: losColor }}
          >
            {metrics.los}
          </span>
          <Activity className="h-4 w-4 text-[var(--ink-secondary)]" strokeWidth={1.75} />
        </button>
      </div>
    );
  }

  return (
    <aside
      data-hud-chrome
      aria-label="Corridor telemetry and reporting"
      className="hud-surface fixed top-[60px] right-3 z-20 flex max-h-[calc(100vh-132px)] w-[320px] flex-col rounded-[var(--radius-lg)]"
    >
      {/* Drawer Header & Tabs */}
      <div className="shrink-0 border-b border-[var(--border-subtle)] px-3 pt-2.5 pb-2">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity
              className="h-3.5 w-3.5 text-[var(--accent-primary)]"
              strokeWidth={1.75}
            />
            <h2 className="text-xs font-semibold tracking-[0.02em] text-[var(--ink-primary)] uppercase">
              Corridor Telemetry
            </h2>
          </div>
          <button
            type="button"
            onClick={onToggle}
            aria-label="Collapse telemetry drawer"
            title="Collapse Telemetry"
            className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-[var(--radius-sm)] text-[var(--ink-secondary)] transition-colors duration-150 hover:bg-[var(--surface-control-hover)] hover:text-[var(--ink-primary)]"
          >
            <ChevronRight className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>

        <div
          role="tablist"
          aria-label="Telemetry views"
          className="grid grid-cols-3 gap-1 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--surface-control)] p-0.5"
        >
          {TABS.map(({ id, label, icon: Icon }) => {
            const selected = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setActiveTab(id)}
                className={`flex h-7 cursor-pointer items-center justify-center gap-1.5 rounded-[5px] text-xs font-medium transition-colors duration-150 ${
                  selected
                    ? 'border border-[var(--border-accent)] bg-[var(--accent-primary-muted)] text-[var(--accent-primary-hover)]'
                    : 'border border-transparent text-[var(--ink-secondary)] hover:bg-[var(--surface-control-hover)] hover:text-[var(--ink-primary)]'
                }`}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Scrollable Tab Body */}
      <div className="dss-scroll flex-1 overflow-y-auto px-3 py-3">
        {activeTab === 'live' && (
          <div className="space-y-3">
            {/* HCM LOS Primary Grade Strip */}
            <section className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-panel)] p-2.5">
              <div className="flex items-center gap-2.5">
                <div
                  aria-label={`Level of Service ${metrics.los}`}
                  className="metric-value flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-sm)] font-mono text-[22px] font-bold text-[var(--surface-canvas)]"
                  style={{ backgroundColor: losColor }}
                >
                  {metrics.los}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-[var(--ink-primary)]">
                    HCM Level of Service
                  </div>
                  <div className="text-[11px] font-medium" style={{ color: losColor }}>
                    {LOS_DESCRIPTION[metrics.los]}
                  </div>
                  <div className="text-[11px] text-[var(--ink-muted)]">
                    {SCENARIOS[params.scenario].shortName}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="metric-value font-mono text-base font-semibold text-[var(--ink-primary)]">
                  {metrics.avgControlDelaySec.toFixed(1)}s
                </div>
                <div className="text-[11px] text-[var(--ink-muted)]">delay/veh</div>
              </div>
            </section>

            {/* Actuated Signal Phase Banner (Scenario 2) */}
            {signalState.enabled && (
              <section
                aria-label="Actuated signal controller phase"
                className="flex items-center justify-between rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--surface-panel)] px-2.5 py-2"
              >
                <div className="flex items-center gap-2">
                  <TrafficCone
                    className="h-3.5 w-3.5 text-[var(--accent-primary)]"
                    strokeWidth={1.75}
                  />
                  <span className="text-[11px] font-semibold text-[var(--ink-primary)]">
                    Signal Phase
                  </span>
                </div>
                <div className="flex items-center gap-2 font-mono text-[11px]">
                  <span
                    className="metric-value rounded px-1.5 py-0.5 font-semibold uppercase"
                    style={{
                      color:
                        signalState.vehicularPhase === 'green'
                          ? 'var(--status-ok)'
                          : signalState.vehicularPhase === 'yellow'
                            ? 'var(--status-warn)'
                            : 'var(--status-danger)',
                      backgroundColor:
                        signalState.vehicularPhase === 'green'
                          ? 'var(--status-ok-muted)'
                          : signalState.vehicularPhase === 'yellow'
                            ? 'var(--status-warn-muted)'
                            : 'var(--status-danger-muted)',
                    }}
                  >
                    VEH {signalState.vehicularPhase}
                  </span>
                  <span className="metric-value text-[var(--ink-secondary)]">
                    {signalState.pedestrianPhase.replace('_', ' ').toUpperCase()}
                  </span>
                  <span className="metric-value font-semibold text-[var(--ink-primary)]">
                    {Math.ceil(signalState.phaseRemainingSeconds)}s
                  </span>
                </div>
              </section>
            )}

            {/* Key Engineering Metrics Grid (Hairline Matrix, No Nested Cards) */}
            <section className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--border-subtle)]">
              <div className="bg-[var(--surface-panel)] px-2.5 py-2">
                <div className="text-[11px] text-[var(--ink-secondary)]">Avg Delay</div>
                <div
                  className="metric-value mt-0.5 font-mono text-sm font-semibold"
                  style={{ color: losColor }}
                >
                  {metrics.avgControlDelaySec.toFixed(1)}{' '}
                  <span className="text-[11px] font-normal text-[var(--ink-muted)]">s/veh</span>
                </div>
              </div>
              <div className="bg-[var(--surface-panel)] px-2.5 py-2">
                <div className="text-[11px] text-[var(--ink-secondary)]">Avg Speed</div>
                <div className="metric-value mt-0.5 font-mono text-sm font-semibold text-[var(--accent-primary-hover)]">
                  {metrics.avgSpeedKph.toFixed(1)}{' '}
                  <span className="text-[11px] font-normal text-[var(--ink-muted)]">km/h</span>
                </div>
              </div>
              <div className="bg-[var(--surface-panel)] px-2.5 py-2">
                <div className="text-[11px] text-[var(--ink-secondary)]">Throughput</div>
                <div className="metric-value mt-0.5 font-mono text-sm font-semibold text-[var(--ink-primary)]">
                  {Math.round(metrics.throughputVehPerHour)}{' '}
                  <span className="text-[11px] font-normal text-[var(--ink-muted)]">vph</span>
                </div>
              </div>
              <div className="bg-[var(--surface-panel)] px-2.5 py-2">
                <div className="text-[11px] text-[var(--ink-secondary)]">Queue</div>
                <div className="metric-value mt-0.5 font-mono text-sm font-semibold text-[var(--ink-primary)]">
                  {metrics.queueVehicles}{' '}
                  <span className="text-[11px] font-normal text-[var(--ink-muted)]">
                    ({Math.round(metrics.queueLengthMeters)}m)
                  </span>
                </div>
              </div>
              <div className="bg-[var(--surface-panel)] px-2.5 py-2">
                <div className="text-[11px] text-[var(--ink-secondary)]">Active Agents</div>
                <div className="metric-value mt-0.5 font-mono text-sm font-semibold text-[var(--ink-primary)]">
                  {metrics.activeVehicles}{' '}
                  <span className="text-[11px] font-normal text-[var(--ink-muted)]">
                    / {metrics.totalExited} out
                  </span>
                </div>
              </div>
              <div className="bg-[var(--surface-panel)] px-2.5 py-2">
                <div className="text-[11px] text-[var(--ink-secondary)]">MOBIL Shifts</div>
                <div className="metric-value mt-0.5 font-mono text-sm font-semibold text-[var(--ink-primary)]">
                  {metrics.laneChangesCompleted}
                </div>
              </div>
            </section>

            {/* SSAM Surrogate Safety Conflict Breakdown */}
            <section className="space-y-2 border-t border-[var(--border-subtle)] pt-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <ShieldAlert
                    className="h-3.5 w-3.5 text-[var(--status-warn)]"
                    strokeWidth={1.75}
                  />
                  <h3 className="text-xs font-semibold text-[var(--ink-primary)]">
                    SSAM Surrogate Conflicts
                  </h3>
                </div>
                <span className="metric-value font-mono text-xs font-semibold text-[var(--ink-primary)]">
                  {metrics.totalConflicts} total
                </span>
              </div>

              <div className="space-y-1.5 text-xs">
                {[
                  {
                    label: 'Rear-End (TTC)',
                    count: metrics.rearEndConflicts,
                    color: 'var(--ssam-rear-end)',
                  },
                  {
                    label: 'Crossing (Gate / Jct)',
                    count: metrics.crossingConflicts,
                    color: 'var(--ssam-crossing)',
                  },
                  {
                    label: 'Weaving (MOBIL)',
                    count: metrics.weavingConflicts,
                    color: 'var(--ssam-weaving)',
                  },
                  {
                    label: 'Pedestrian-Vehicle',
                    count: metrics.pedestrianConflicts,
                    color: 'var(--los-e)',
                  },
                  {
                    label: 'Critical (TTC < 1.0s)',
                    count: metrics.criticalConflicts,
                    color: 'var(--status-danger)',
                  },
                ].map((row) => (
                  <div
                    key={row.label}
                    className="flex items-center justify-between text-[11px]"
                  >
                    <span className="flex items-center gap-2 text-[var(--ink-secondary)]">
                      <span
                        aria-hidden="true"
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: row.color }}
                      />
                      {row.label}
                    </span>
                    <span className="metric-value font-mono font-semibold text-[var(--ink-primary)]">
                      {row.count}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            {/* Live Speed & Delay Trend Chart */}
            <section className="space-y-2 border-t border-[var(--border-subtle)] pt-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-[var(--ink-primary)]">
                  Corridor Trend
                </h3>
                <div className="flex items-center gap-3 text-[11px] text-[var(--ink-secondary)]">
                  <span className="flex items-center gap-1">
                    <span
                      aria-hidden="true"
                      className="h-1.5 w-2.5 rounded-sm bg-[var(--accent-primary)]"
                    />
                    km/h
                  </span>
                  <span className="flex items-center gap-1">
                    <span
                      aria-hidden="true"
                      className="h-1.5 w-2.5 rounded-sm bg-[var(--status-warn)]"
                    />
                    delay s
                  </span>
                </div>
              </div>

              <div className="h-[124px] w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-panel)] px-1 pt-2 pb-1">
                {chartData.length < 2 ? (
                  <div className="flex h-full items-center justify-center text-[11px] text-[var(--ink-muted)]">
                    Sampling corridor telemetry...
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={chartData}
                      margin={{ top: 4, right: 6, left: -24, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="speedFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--accent-primary)" stopOpacity={0.32} />
                          <stop offset="95%" stopColor="var(--accent-primary)" stopOpacity={0.02} />
                        </linearGradient>
                        <linearGradient id="delayFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--status-warn)" stopOpacity={0.28} />
                          <stop offset="95%" stopColor="var(--status-warn)" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        strokeDasharray="2 3"
                        stroke="var(--border-subtle)"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="clock"
                        tick={{ fill: 'var(--ink-muted)', fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                        minTickGap={24}
                      />
                      <YAxis
                        tick={{ fill: 'var(--ink-muted)', fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'var(--surface-hud-strong)',
                          border: '1px solid var(--border-strong)',
                          borderRadius: '6px',
                          fontSize: '11px',
                          color: 'var(--ink-primary)',
                        }}
                        labelStyle={{
                          color: 'var(--ink-secondary)',
                          fontFamily: 'var(--font-mono)',
                          marginBottom: '2px',
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="speed"
                        name="Speed (km/h)"
                        stroke="var(--accent-primary)"
                        strokeWidth={1.75}
                        fill="url(#speedFill)"
                        isAnimationActive={false}
                      />
                      <Area
                        type="monotone"
                        dataKey="delay"
                        name="Delay (s)"
                        stroke="var(--status-warn)"
                        strokeWidth={1.75}
                        fill="url(#delayFill)"
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </section>
          </div>
        )}

        {activeTab === 'compare' && (
          <div className="space-y-3">
            {/* Benchmark & Snapshot Actions */}
            <div className="flex flex-col gap-1.5">
              <button
                type="button"
                onClick={handleRunBenchmarks}
                className="flex h-8 w-full cursor-pointer items-center justify-center gap-1.5 rounded-[var(--radius-sm)] bg-[var(--accent-primary)] px-3 text-xs font-semibold text-[var(--surface-canvas)] transition-colors duration-150 hover:bg-[var(--accent-primary-hover)] active:scale-[0.99]"
              >
                <Play className="h-3.5 w-3.5" strokeWidth={2} />
                <span>
                  {benchmarkRanNotice
                    ? '3-Scenario Benchmark Complete'
                    : 'Run 3-Scenario Benchmark (120s)'}
                </span>
              </button>
              <button
                type="button"
                onClick={captureScenarioSnapshot}
                className="flex h-7 w-full cursor-pointer items-center justify-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--surface-control)] px-3 text-xs font-medium text-[var(--ink-primary)] transition-colors duration-150 hover:border-[var(--border-strong)] hover:bg-[var(--surface-control-hover)]"
              >
                <Camera className="h-3.5 w-3.5 text-[var(--ink-secondary)]" strokeWidth={1.75} />
                <span>Snapshot Active ({SCENARIOS[params.scenario].shortName})</span>
              </button>
            </div>

            {snapshotCount === 0 ? (
              <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-panel)] p-3 text-xs leading-relaxed text-[var(--ink-secondary)]">
                Run the deterministic <strong className="text-[var(--ink-primary)]">3-Scenario Benchmark</strong> to simulate Baseline, Dedicated Bays, and Signalized conditions for 120 seconds each and inspect HCM LOS and SSAM deltas side-by-side.
              </div>
            ) : (
              <div className="space-y-2.5">
                {SCENARIO_ORDER.map((id) => {
                  const snap = scenarioSnapshots[id];
                  const spec = SCENARIOS[id];
                  if (!snap) {
                    return (
                      <div
                        key={id}
                        className="flex items-center justify-between rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-panel)] px-3 py-2.5 text-xs text-[var(--ink-muted)]"
                      >
                        <span>{spec.shortName}</span>
                        <span>Not captured</span>
                      </div>
                    );
                  }

                  const m = snap.metrics;
                  const delayDelta =
                    id !== 'baseline' && baselineSnap
                      ? computePercentDelta(
                          baselineSnap.metrics.avgControlDelaySec,
                          m.avgControlDelaySec
                        )
                      : null;
                  const conflictDelta =
                    id !== 'baseline' && baselineSnap
                      ? computePercentDelta(
                          baselineSnap.metrics.totalConflicts,
                          m.totalConflicts
                        )
                      : null;

                  return (
                    <div
                      key={id}
                      className="space-y-2 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-panel)] p-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-xs font-semibold text-[var(--ink-primary)]">
                            {spec.shortName}
                          </div>
                          <div className="metric-value font-mono text-[11px] text-[var(--ink-muted)]">
                            t = {snap.simTime.toFixed(0)}s · {m.faultCount} FAULTS
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {id !== 'baseline' && baselineSnap && baselineSnap.metrics.los !== m.los && (
                            <span className="metric-value font-mono text-[11px] text-[var(--ink-secondary)]">
                              {baselineSnap.metrics.los} →
                            </span>
                          )}
                          <span
                            className="metric-value flex h-6 w-6 items-center justify-center rounded-[4px] font-mono text-xs font-bold text-[var(--surface-canvas)]"
                            style={{ backgroundColor: LOS_CSS_VAR[m.los] }}
                          >
                            {m.los}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 border-t border-[var(--border-subtle)] pt-2 text-[11px]">
                        <div>
                          <div className="text-[var(--ink-muted)]">Delay</div>
                          <div className="metric-value font-mono font-semibold text-[var(--ink-primary)]">
                            {m.avgControlDelaySec.toFixed(1)}s
                          </div>
                          {delayDelta !== null && (
                            <div
                              className="metric-value font-mono text-[11px]"
                              style={{
                                color:
                                  delayDelta <= 0 ? 'var(--status-ok)' : 'var(--status-danger)',
                              }}
                            >
                              {formatSignedPct(delayDelta)}
                            </div>
                          )}
                        </div>
                        <div>
                          <div className="text-[var(--ink-muted)]">Conflicts</div>
                          <div className="metric-value font-mono font-semibold text-[var(--ink-primary)]">
                            {m.totalConflicts}
                          </div>
                          {conflictDelta !== null && (
                            <div
                              className="metric-value font-mono text-[11px]"
                              style={{
                                color:
                                  conflictDelta <= 0 ? 'var(--status-ok)' : 'var(--status-danger)',
                              }}
                            >
                              {formatSignedPct(conflictDelta)}
                            </div>
                          )}
                        </div>
                        <div>
                          <div className="text-[var(--ink-muted)]">Speed</div>
                          <div className="metric-value font-mono font-semibold text-[var(--accent-primary-hover)]">
                            {m.avgSpeedKph.toFixed(1)}
                          </div>
                          <div className="metric-value font-mono text-[11px] text-[var(--ink-muted)]">
                            {Math.round(m.throughputVehPerHour)} vph
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'report' && (
          <div className="space-y-3">
            <section className="space-y-2 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-panel)] p-3">
              <h3 className="text-xs font-semibold text-[var(--ink-primary)]">
                Thesis Chapter 4 Summary
              </h3>
              <dl className="space-y-1.5 text-[11px]">
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-[var(--ink-secondary)]">Corridor Anchor</dt>
                  <dd className="metric-value font-mono text-[var(--ink-primary)]">
                    {CORRIDOR_COORDS}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-[var(--ink-secondary)]">Active Scenario</dt>
                  <dd className="font-medium text-[var(--ink-primary)]">
                    {SCENARIOS[params.scenario].shortName}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-[var(--ink-secondary)]">Active LOS / Delay</dt>
                  <dd className="metric-value font-mono text-[var(--ink-primary)]">
                    LOS {metrics.los} · {metrics.avgControlDelaySec.toFixed(1)}s
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-[var(--ink-secondary)]">Benchmarks Ready</dt>
                  <dd className="metric-value font-mono text-[var(--ink-primary)]">
                    {snapshotCount} / 3 scenarios
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-[var(--ink-secondary)]">Telemetry Points</dt>
                  <dd className="metric-value font-mono text-[var(--ink-primary)]">
                    {telemetryHistory.length} samples
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-[var(--ink-secondary)]">Deterministic Seed</dt>
                  <dd className="metric-value font-mono text-[var(--ink-primary)]">
                    #{params.seed}
                  </dd>
                </div>
              </dl>
            </section>

            {snapshotCount < 3 && (
              <div className="rounded-[var(--radius-sm)] border border-[var(--status-warn)]/30 bg-[var(--status-warn-muted)] px-2.5 py-2 text-[11px] leading-snug text-[var(--ink-primary)]">
                Tip: Run the 3-Scenario Benchmark in the Compare tab first to populate all three scenarios in your CSV and printed A4 tables.
              </div>
            )}

            <div className="space-y-2 border-t border-[var(--border-subtle)] pt-3">
              <button
                type="button"
                onClick={handleExportCsv}
                className="flex h-8 w-full cursor-pointer items-center justify-center gap-1.5 rounded-[var(--radius-sm)] bg-[var(--accent-primary)] px-3 text-xs font-semibold text-[var(--surface-canvas)] transition-colors duration-150 hover:bg-[var(--accent-primary-hover)]"
              >
                <Download className="h-3.5 w-3.5" strokeWidth={2} />
                <span>Export Chapter 4 CSV</span>
              </button>
              <button
                type="button"
                onClick={handlePrintReport}
                className="flex h-8 w-full cursor-pointer items-center justify-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--surface-control)] px-3 text-xs font-medium text-[var(--ink-primary)] transition-colors duration-150 hover:border-[var(--border-strong)] hover:bg-[var(--surface-control-hover)]"
              >
                <Printer className="h-3.5 w-3.5 text-[var(--ink-secondary)]" strokeWidth={1.75} />
                <span>Print Thesis A4 Report</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
