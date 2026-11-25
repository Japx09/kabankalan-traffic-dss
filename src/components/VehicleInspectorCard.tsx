'use client';

import React from 'react';
import { Crosshair, Video, X } from 'lucide-react';
import { useSimStore } from '@/store/simStore';
import {
  TERMINAL_PHASE_LABEL,
  VEHICLE_STATE_LABEL,
  VEHICLE_TYPE_LABEL,
} from './hudUtils';

export function VehicleInspectorCard() {
  const selectedVehicleId = useSimStore((s) => s.selectedVehicleId);
  const followSelectedVehicle = useSimStore((s) => s.followSelectedVehicle);
  const vehicles = useSimStore((s) => s.simState.vehicles);
  const selectVehicle = useSimStore((s) => s.selectVehicle);
  const setFollowSelectedVehicle = useSimStore((s) => s.setFollowSelectedVehicle);

  if (!selectedVehicleId) return null;

  const vehicle = vehicles.find((v) => v.id === selectedVehicleId) ?? null;

  return (
    <section
      data-hud-chrome
      aria-label="Selected vehicle telemetry inspector"
      className="hud-surface-strong fixed bottom-[62px] left-1/2 z-20 w-[min(560px,calc(100vw-24px))] -translate-x-1/2 rounded-[var(--radius-lg)] px-3 py-2.5"
    >
      {!vehicle ? (
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-[var(--ink-secondary)]">
            <Crosshair className="h-3.5 w-3.5 text-[var(--ink-muted)]" strokeWidth={1.75} />
            <span className="metric-value font-mono text-[var(--ink-primary)]">
              {selectedVehicleId}
            </span>
            <span>Exited Corridor</span>
          </div>
          <button
            type="button"
            onClick={() => selectVehicle(null)}
            aria-label="Close vehicle inspector"
            className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-[var(--radius-sm)] text-[var(--ink-secondary)] hover:bg-[var(--surface-control-hover)] hover:text-[var(--ink-primary)]"
          >
            <X className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Header Row */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="metric-value rounded-[4px] border border-[var(--border-accent)] bg-[var(--accent-primary-muted)] px-1.5 py-0.5 font-mono text-xs font-semibold text-[var(--accent-primary-hover)]">
                {vehicle.id}
              </span>
              <span className="text-xs font-semibold text-[var(--ink-primary)]">
                {VEHICLE_TYPE_LABEL[vehicle.type]}
              </span>
              <span className="rounded-[4px] border border-[var(--border-subtle)] bg-[var(--surface-panel)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--ink-secondary)]">
                {VEHICLE_STATE_LABEL[vehicle.state]}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setFollowSelectedVehicle(!followSelectedVehicle)}
                aria-pressed={followSelectedVehicle}
                className={`flex h-6 cursor-pointer items-center gap-1 rounded-[var(--radius-sm)] border px-2 text-[11px] font-medium transition-colors duration-150 ${
                  followSelectedVehicle
                    ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)] text-[var(--surface-canvas)]'
                    : 'border-[var(--border-subtle)] bg-[var(--surface-control)] text-[var(--ink-primary)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-control-hover)]'
                }`}
              >
                <Video className="h-3 w-3" strokeWidth={1.75} />
                <span>Follow Cam</span>
              </button>
              <button
                type="button"
                onClick={() => selectVehicle(null)}
                aria-label="Close vehicle inspector"
                title="Close (Esc)"
                className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-[var(--radius-sm)] border border-transparent text-[var(--ink-secondary)] transition-colors duration-150 hover:bg-[var(--surface-control-hover)] hover:text-[var(--ink-primary)]"
              >
                <X className="h-3.5 w-3.5" strokeWidth={1.75} />
              </button>
            </div>
          </div>

          {/* Live Kinematic & Coordination Readout */}
          <div className="grid grid-cols-3 gap-x-3 gap-y-1.5 border-t border-[var(--border-subtle)] pt-2 text-[11px] sm:grid-cols-6">
            <div>
              <div className="text-[var(--ink-muted)]">Speed</div>
              <div className="metric-value font-mono font-semibold text-[var(--ink-primary)]">
                {(vehicle.speed * 3.6).toFixed(1)} km/h
              </div>
            </div>
            <div className="min-w-0">
              <div className="text-[var(--ink-muted)]">Lane</div>
              <div
                title={vehicle.laneId}
                className="metric-value truncate font-mono font-medium text-[var(--ink-primary)]"
              >
                {vehicle.laneId}
              </div>
            </div>
            <div className="min-w-0">
              <div className="text-[var(--ink-muted)]">Leader / Gap</div>
              <div className="metric-value truncate font-mono font-medium text-[var(--ink-primary)]">
                {vehicle.leaderVehicleId
                  ? `${vehicle.leaderVehicleId} (${vehicle.leaderGapMeters?.toFixed(1) ?? '—'}m)`
                  : 'Free'}
              </div>
            </div>
            <div>
              <div className="text-[var(--ink-muted)]">Lat Offset</div>
              <div className="metric-value font-mono font-medium text-[var(--ink-primary)]">
                {vehicle.lateralOffset >= 0 ? '+' : ''}
                {vehicle.lateralOffset.toFixed(2)}m
              </div>
            </div>
            <div className="min-w-0">
              <div className="text-[var(--ink-muted)]">Phase</div>
              <div className="truncate font-medium text-[var(--ink-primary)]">
                {TERMINAL_PHASE_LABEL[vehicle.terminalPhase]}
              </div>
            </div>
            <div className="min-w-0">
              <div className="text-[var(--ink-muted)]">Yielding</div>
              <div
                title={vehicle.yieldingReason ?? 'None'}
                className="truncate font-medium text-[var(--ink-secondary)]"
              >
                {vehicle.yieldingReason ?? 'None'}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
