'use client';

import React from 'react';
import {
  ChevronLeft,
  Eye,
  Layers,
  SlidersHorizontal,
} from 'lucide-react';
import {
  SCENARIOS,
  type GroundMode,
  type OverlayToggles,
} from '@/sim/types';
import { useSimStore } from '@/store/simStore';

interface ControlRailProps {
  isOpen: boolean;
  onToggle: () => void;
}

const GROUND_MODES: readonly { id: GroundMode; label: string }[] = [
  { id: 'game', label: '3D Game' },
  { id: 'satellite', label: 'Satellite' },
  { id: 'cad', label: 'Dark CAD' },
];

type BooleanOverlayKey = Exclude<keyof OverlayToggles, 'groundMode'>;

const OVERLAY_ITEMS: readonly { key: BooleanOverlayKey; label: string }[] = [
  { key: 'showLandmarks', label: 'Landmark Pins' },
  { key: 'showConflictPulses', label: 'Conflict Pulses' },
  { key: 'showLaneSplines', label: 'Lane Splines' },
  { key: 'showConflictZones', label: 'Conflict Zones' },
  { key: 'showTrails', label: 'Vehicle Trails' },
  { key: 'showBoundingBoxes', label: 'Bounding Boxes' },
];

interface DemandSliderRowProps {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (value: number) => void;
}

function DemandSliderRow({
  id,
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: DemandSliderRowProps) {
  const fillPct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <label
          htmlFor={id}
          className="text-xs font-medium text-[var(--ink-secondary)]"
        >
          {label}
        </label>
        <span className="metric-value rounded-[4px] bg-[var(--surface-panel)] px-1.5 py-0.5 font-mono text-[11px] font-medium text-[var(--ink-primary)]">
          {value} {unit}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ '--slider-fill': `${fillPct}%` } as React.CSSProperties}
        className="dss-slider"
      />
    </div>
  );
}

export function ControlRail({ isOpen, onToggle }: ControlRailProps) {
  const params = useSimStore((s) => s.params);
  const overlays = useSimStore((s) => s.overlays);
  const updateParams = useSimStore((s) => s.updateParams);
  const setOverlay = useSimStore((s) => s.setOverlay);

  const activeSpec = SCENARIOS[params.scenario];

  if (!isOpen) {
    return (
      <div
        data-hud-chrome
        className="fixed top-[60px] left-3 z-20"
      >
        <button
          type="button"
          onClick={onToggle}
          aria-label="Open simulation controls"
          title="Open Controls"
          className="hud-surface-strong flex h-10 w-10 cursor-pointer items-center justify-center rounded-[var(--radius-md)] text-[var(--ink-primary)] transition-colors duration-150 hover:border-[var(--border-strong)] hover:text-[var(--accent-primary-hover)]"
        >
          <SlidersHorizontal className="h-4 w-4" strokeWidth={1.75} />
        </button>
      </div>
    );
  }

  return (
    <aside
      data-hud-chrome
      aria-label="Simulation controls"
      className="hud-surface fixed top-[60px] left-3 z-20 flex max-h-[calc(100vh-132px)] w-[272px] flex-col rounded-[var(--radius-lg)]"
    >
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--border-subtle)] px-3 py-2.5">
        <div className="flex items-center gap-2">
          <SlidersHorizontal
            className="h-3.5 w-3.5 text-[var(--accent-primary)]"
            strokeWidth={1.75}
          />
          <h2 className="text-xs font-semibold tracking-[0.02em] text-[var(--ink-primary)] uppercase">
            Corridor Controls
          </h2>
        </div>
        <button
          type="button"
          onClick={onToggle}
          aria-label="Collapse controls panel"
          title="Collapse Controls"
          className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-[var(--radius-sm)] text-[var(--ink-secondary)] transition-colors duration-150 hover:bg-[var(--surface-control-hover)] hover:text-[var(--ink-primary)]"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.75} />
        </button>
      </div>

      {/* Scrollable Sections */}
      <div className="dss-scroll flex-1 overflow-y-auto px-3 py-3">
        {/* Section 1: Ground Mode */}
        <section className="space-y-2 pb-3">
          <div className="flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5 text-[var(--ink-muted)]" strokeWidth={1.75} />
            <h3 className="text-xs font-semibold text-[var(--ink-primary)]">
              World Ground Mode
            </h3>
          </div>
          <div
            role="group"
            aria-label="World ground mode"
            className="grid grid-cols-3 gap-1 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--surface-control)] p-0.5"
          >
            {GROUND_MODES.map((mode) => {
              const active = overlays.groundMode === mode.id;
              return (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => setOverlay('groundMode', mode.id)}
                  aria-pressed={active}
                  className={`h-7 cursor-pointer rounded-[5px] text-[11px] font-medium whitespace-nowrap transition-colors duration-150 ${
                    active
                      ? 'border border-[var(--border-accent)] bg-[var(--accent-primary-muted)] text-[var(--accent-primary-hover)]'
                      : 'border border-transparent text-[var(--ink-secondary)] hover:bg-[var(--surface-control-hover)] hover:text-[var(--ink-primary)]'
                  }`}
                >
                  {mode.label}
                </button>
              );
            })}
          </div>
        </section>

        {/* Section 2: Demand Calibration */}
        <section className="space-y-2.5 border-t border-[var(--border-subtle)] py-3">
          <h3 className="text-xs font-semibold text-[var(--ink-primary)]">
            Demand Calibration
          </h3>

          <DemandSliderRow
            id="slider-bus-headway"
            label="Bus Headway"
            value={params.busHeadwaySeconds}
            min={20}
            max={120}
            step={2}
            unit="s"
            onChange={(val) => updateParams({ busHeadwaySeconds: val })}
          />
          <DemandSliderRow
            id="slider-jeepney-rate"
            label="Jeepney Volume"
            value={params.jeepneyRatePerHour}
            min={20}
            max={240}
            step={10}
            unit="vph"
            onChange={(val) => updateParams({ jeepneyRatePerHour: val })}
          />
          <DemandSliderRow
            id="slider-tricycle-rate"
            label="Tricycle Volume"
            value={params.tricycleRatePerHour}
            min={40}
            max={400}
            step={10}
            unit="vph"
            onChange={(val) => updateParams({ tricycleRatePerHour: val })}
          />
          <DemandSliderRow
            id="slider-car-rate"
            label="Private Car"
            value={params.carRatePerHour}
            min={60}
            max={500}
            step={10}
            unit="vph"
            onChange={(val) => updateParams({ carRatePerHour: val })}
          />
          <DemandSliderRow
            id="slider-ped-rate"
            label="Pedestrians"
            value={params.pedestrianRatePerHour}
            min={30}
            max={300}
            step={10}
            unit="pph"
            onChange={(val) => updateParams({ pedestrianRatePerHour: val })}
          />
        </section>

        {/* Section 3: 3D Engineering Overlays */}
        <section className="space-y-2 border-t border-[var(--border-subtle)] py-3">
          <div className="flex items-center gap-1.5">
            <Eye className="h-3.5 w-3.5 text-[var(--ink-muted)]" strokeWidth={1.75} />
            <h3 className="text-xs font-semibold text-[var(--ink-primary)]">
              3D Engineering Overlays
            </h3>
          </div>
          <div className="space-y-1">
            {OVERLAY_ITEMS.map(({ key, label }) => {
              const checked = overlays[key];
              return (
                <button
                  key={key}
                  type="button"
                  role="switch"
                  aria-checked={checked}
                  onClick={() => setOverlay(key, !checked)}
                  className="flex w-full cursor-pointer items-center justify-between rounded-[var(--radius-sm)] px-2 py-1.5 text-left transition-colors duration-150 hover:bg-[var(--surface-control)]"
                >
                  <span className="text-xs text-[var(--ink-secondary)]">
                    {label}
                  </span>
                  <span
                    aria-hidden="true"
                    className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full border transition-colors duration-150 ${
                      checked
                        ? 'border-[var(--border-accent)] bg-[var(--accent-primary)]'
                        : 'border-[var(--border-strong)] bg-[var(--surface-panel)]'
                    }`}
                  >
                    <span
                      className={`inline-block h-2.5 w-2.5 rounded-full transition-transform duration-150 ${
                        checked
                          ? 'translate-x-3.5 bg-[var(--surface-canvas)]'
                          : 'translate-x-0.5 bg-[var(--ink-secondary)]'
                      }`}
                    />
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Section 4: Active Scenario Parameters */}
        <section className="space-y-2 border-t border-[var(--border-subtle)] pt-3">
          <h3 className="text-xs font-semibold text-[var(--ink-primary)]">
            {activeSpec.name}
          </h3>
          <p className="text-[11px] leading-[1.45] text-[var(--ink-secondary)]">
            {activeSpec.description}
          </p>
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            <span
              className={`rounded-[4px] border px-1.5 py-0.5 text-[11px] font-medium ${
                activeSpec.dedicatedBaysOnly
                  ? 'border-[var(--status-ok)]/35 bg-[var(--status-ok-muted)] text-[var(--status-ok)]'
                  : 'border-[var(--border-subtle)] bg-[var(--surface-panel)] text-[var(--ink-secondary)]'
              }`}
            >
              {activeSpec.dedicatedBaysOnly ? 'Dedicated Bays: On' : 'Curbside Loading'}
            </span>
            <span
              className={`rounded-[4px] border px-1.5 py-0.5 text-[11px] font-medium ${
                activeSpec.signalizedCrossings
                  ? 'border-[var(--border-accent)] bg-[var(--accent-primary-muted)] text-[var(--accent-primary-hover)]'
                  : 'border-[var(--border-subtle)] bg-[var(--surface-panel)] text-[var(--ink-secondary)]'
              }`}
            >
              {activeSpec.signalizedCrossings ? 'Signals: Actuated' : 'Unsignalized'}
            </span>
            <span
              className={`rounded-[4px] border px-1.5 py-0.5 text-[11px] font-medium ${
                activeSpec.hasPedestrianOverpass
                  ? 'border-[var(--status-ok)]/35 bg-[var(--status-ok-muted)] text-[var(--status-ok)]'
                  : 'border-[var(--border-subtle)] bg-[var(--surface-panel)] text-[var(--ink-secondary)]'
              }`}
            >
              {activeSpec.hasPedestrianOverpass ? 'Overpass: Built' : 'At-Grade Crossing'}
            </span>
            <span className="metric-value rounded-[4px] border border-[var(--border-subtle)] bg-[var(--surface-panel)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--ink-secondary)]">
              Max Dwell: {activeSpec.maxDwellSeconds === null ? 'Uncapped' : `${activeSpec.maxDwellSeconds}s`}
            </span>
          </div>
        </section>
      </div>
    </aside>
  );
}
