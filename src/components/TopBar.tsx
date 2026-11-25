'use client';

import React from 'react';
import {
  AlertTriangle,
  Compass,
  Pause,
  Play,
  Presentation,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';
import { SCENARIOS } from '@/sim/types';
import { useSimStore } from '@/store/simStore';
import { formatSimClock, PLAYBACK_SPEEDS, SCENARIO_ORDER } from './hudUtils';

export function TopBar() {
  const scenario = useSimStore((s) => s.params.scenario);
  const playbackSpeed = useSimStore((s) => s.params.playbackSpeed);
  const simTime = useSimStore((s) => s.simState.simTime);
  const faultCount = useSimStore((s) => s.simState.metrics.faultCount);
  const isRunning = useSimStore((s) => s.isRunning);
  const isDefenseMode = useSimStore((s) => s.isDefenseMode);

  const setScenario = useSimStore((s) => s.setScenario);
  const toggleRunning = useSimStore((s) => s.toggleRunning);
  const updateParams = useSimStore((s) => s.updateParams);
  const resetSimulation = useSimStore((s) => s.resetSimulation);
  const toggleDefenseMode = useSimStore((s) => s.toggleDefenseMode);

  const cyclePlaybackSpeed = () => {
    const idx = PLAYBACK_SPEEDS.indexOf(playbackSpeed);
    const next = PLAYBACK_SPEEDS[(idx + 1) % PLAYBACK_SPEEDS.length];
    updateParams({ playbackSpeed: next });
  };

  const isHealthy = faultCount === 0;

  return (
    <header
      data-hud-chrome
      className="hud-surface-strong fixed top-0 right-0 left-0 z-30 flex h-12 flex-nowrap items-center justify-between gap-2 border-x-0 border-t-0 px-3"
    >
      {/* Left: Brand Mark & Corridor Identity */}
      <div className="flex shrink-0 items-center gap-2 whitespace-nowrap">
        <div
          aria-hidden="true"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border-accent)] bg-[var(--accent-primary-muted)] text-[var(--accent-primary-hover)]"
        >
          <Compass className="h-4 w-4" strokeWidth={1.75} />
        </div>
        <span className="text-[13px] font-semibold tracking-[-0.015em] text-[var(--ink-primary)]">
          Kabankalan DSS
        </span>
        <span
          aria-hidden="true"
          className="hidden h-3.5 w-px bg-[var(--border-strong)] xl:inline-block"
        />
        <span className="hidden text-xs font-medium text-[var(--ink-secondary)] xl:inline">
          Ceres Corridor
        </span>
      </div>

      {/* Center: Scenario Segmented Pill */}
      <nav
        aria-label="Corridor scenario"
        className="flex shrink-0 flex-nowrap items-center rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--surface-control)] p-0.5"
      >
        {SCENARIO_ORDER.map((id) => {
          const spec = SCENARIOS[id];
          const active = scenario === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setScenario(id)}
              aria-pressed={active}
              title={spec.description}
              className={`h-7 shrink-0 cursor-pointer rounded-[5px] px-2.5 text-xs font-medium whitespace-nowrap transition-colors duration-150 ${
                active
                  ? 'border border-[var(--border-accent)] bg-[var(--accent-primary-muted)] text-[var(--accent-primary-hover)]'
                  : 'border border-transparent text-[var(--ink-secondary)] hover:bg-[var(--surface-control-hover)] hover:text-[var(--ink-primary)]'
              }`}
            >
              {spec.shortName}
            </button>
          );
        })}
      </nav>

      {/* Right: Transport, Fault Integrity & Defense Mode */}
      <div className="flex shrink-0 flex-nowrap items-center gap-1.5 whitespace-nowrap">
        {/* Simulation Clock */}
        <div
          aria-label="Simulation elapsed clock"
          className="metric-value flex h-7 shrink-0 items-center rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--surface-panel)] px-2 font-mono text-xs font-semibold text-[var(--ink-primary)]"
        >
          {formatSimClock(simTime)}
        </div>

        {/* Play / Pause */}
        <button
          type="button"
          onClick={toggleRunning}
          aria-label={isRunning ? 'Pause simulation' : 'Play simulation'}
          title={isRunning ? 'Pause (Space)' : 'Resume (Space)'}
          className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--surface-control)] text-[var(--ink-primary)] transition-colors duration-150 hover:border-[var(--border-strong)] hover:bg-[var(--surface-control-hover)] active:scale-95"
        >
          {isRunning ? (
            <Pause className="h-3.5 w-3.5" strokeWidth={1.75} />
          ) : (
            <Play className="h-3.5 w-3.5" strokeWidth={1.75} />
          )}
        </button>

        {/* Playback Speed: Compact cycle pill below 1280px, direct 4-way pill at 1280px+ */}
        <button
          type="button"
          onClick={cyclePlaybackSpeed}
          aria-label={`Playback speed ${playbackSpeed}x, click to cycle`}
          title="Cycle playback speed (0.5×, 1×, 2×, 4×)"
          className="metric-value flex h-7 w-11 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--surface-control)] font-mono text-xs font-medium text-[var(--accent-primary-hover)] transition-colors duration-150 hover:border-[var(--border-strong)] hover:bg-[var(--surface-control-hover)] xl:hidden"
        >
          {playbackSpeed}×
        </button>

        <div
          role="group"
          aria-label="Playback speed"
          className="hidden shrink-0 flex-nowrap items-center rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--surface-control)] p-0.5 xl:flex"
        >
          {PLAYBACK_SPEEDS.map((spd) => {
            const active = playbackSpeed === spd;
            return (
              <button
                key={spd}
                type="button"
                onClick={() => updateParams({ playbackSpeed: spd })}
                aria-pressed={active}
                className={`metric-value h-6 shrink-0 cursor-pointer rounded-[4px] px-1.5 font-mono text-[11px] font-medium transition-colors duration-150 ${
                  active
                    ? 'bg-[var(--accent-primary-muted)] text-[var(--accent-primary-hover)]'
                    : 'text-[var(--ink-secondary)] hover:bg-[var(--surface-control-hover)] hover:text-[var(--ink-primary)]'
                }`}
              >
                {spd}×
              </button>
            );
          })}
        </div>

        {/* Reset */}
        <button
          type="button"
          onClick={resetSimulation}
          aria-label="Reset simulation"
          title="Reset simulation"
          className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--surface-control)] text-[var(--ink-secondary)] transition-colors duration-150 hover:border-[var(--border-strong)] hover:bg-[var(--surface-control-hover)] hover:text-[var(--ink-primary)] active:scale-95"
        >
          <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.75} />
        </button>

        {/* Runtime Fault Integrity Pill */}
        <div
          role="status"
          aria-live="polite"
          title={
            isHealthy
              ? 'Zero overlap or physics invariant violations detected'
              : `${faultCount} physics fault(s) recorded in current run`
          }
          className={`metric-value flex h-7 shrink-0 items-center gap-1.5 rounded-[var(--radius-sm)] border px-2 font-mono text-[11px] font-semibold whitespace-nowrap ${
            isHealthy
              ? 'border-[var(--status-ok)]/35 bg-[var(--status-ok-muted)] text-[var(--status-ok)]'
              : 'border-[var(--status-danger)]/45 bg-[var(--status-danger-muted)] text-[var(--status-danger)]'
          }`}
        >
          {isHealthy ? (
            <ShieldCheck className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
          ) : (
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
          )}
          <span>{faultCount === 0 ? '0 FAULTS' : `${faultCount} FAULTS`}</span>
        </div>

        {/* Defense Presentation Mode */}
        <button
          type="button"
          onClick={toggleDefenseMode}
          aria-pressed={isDefenseMode}
          title="Toggle Defense Mode (D) — collapses side drawers for projection"
          className={`flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-[var(--radius-sm)] border px-2.5 text-xs font-medium whitespace-nowrap transition-colors duration-150 ${
            isDefenseMode
              ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)] text-[var(--surface-canvas)]'
              : 'border-[var(--border-subtle)] bg-[var(--surface-control)] text-[var(--ink-primary)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-control-hover)]'
          }`}
        >
          <Presentation className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
          <span>Defense</span>
        </button>
      </div>
    </header>
  );
}
