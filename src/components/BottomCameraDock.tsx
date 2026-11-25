'use client';

import React from 'react';
import {
  Activity,
  Camera,
  SlidersHorizontal,
} from 'lucide-react';
import type { CameraPresetId } from '@/sim/types';
import { useSimStore } from '@/store/simStore';

interface BottomCameraDockProps {
  leftRailOpen: boolean;
  rightDrawerOpen: boolean;
  onToggleLeftRail: () => void;
  onToggleRightDrawer: () => void;
}

const CAMERA_ITEMS: readonly { id: CameraPresetId; label: string; keyHint: string }[] = [
  { id: 'isometric', label: 'Isometric', keyHint: '1' },
  { id: 'gates', label: 'Gates 1 & 2', keyHint: '2' },
  { id: 'junction', label: 'Pedro Zayco', keyHint: '3' },
  { id: 'topdown', label: 'Top-Down CAD', keyHint: '4' },
];

export function BottomCameraDock({
  leftRailOpen,
  rightDrawerOpen,
  onToggleLeftRail,
  onToggleRightDrawer,
}: BottomCameraDockProps) {
  const cameraPreset = useSimStore((s) => s.cameraPreset);
  const followSelectedVehicle = useSimStore((s) => s.followSelectedVehicle);
  const setCameraPreset = useSimStore((s) => s.setCameraPreset);

  return (
    <div
      data-hud-chrome
      className="fixed bottom-3 left-1/2 z-20 max-w-[min(620px,calc(100vw-24px))] -translate-x-1/2"
    >
      <div className="hud-surface-strong flex flex-nowrap items-center gap-1 rounded-full px-1.5 py-1">
        {/* Controls Rail Toggle */}
        <button
          type="button"
          onClick={onToggleLeftRail}
          aria-pressed={leftRailOpen}
          aria-label="Toggle controls rail"
          title="Toggle Corridor Controls"
          className={`flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border transition-colors duration-150 ${
            leftRailOpen
              ? 'border-[var(--border-accent)] bg-[var(--accent-primary-muted)] text-[var(--accent-primary-hover)]'
              : 'border-transparent text-[var(--ink-secondary)] hover:bg-[var(--surface-control-hover)] hover:text-[var(--ink-primary)]'
          }`}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={1.75} />
        </button>

        <span aria-hidden="true" className="h-4 w-px shrink-0 bg-[var(--border-subtle)]" />

        {/* Camera Presets */}
        <nav aria-label="Camera presets" className="flex flex-nowrap items-center gap-0.5">
          <span
            aria-hidden="true"
            className="hidden items-center px-1.5 text-[var(--ink-muted)] sm:inline-flex"
          >
            <Camera className="h-3.5 w-3.5" strokeWidth={1.75} />
          </span>
          {CAMERA_ITEMS.map((item) => {
            const active = cameraPreset === item.id && !followSelectedVehicle;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setCameraPreset(item.id)}
                aria-pressed={active}
                title={`${item.label} view (Key ${item.keyHint})`}
                className={`flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-xs font-medium whitespace-nowrap transition-colors duration-150 ${
                  active
                    ? 'border-[var(--border-accent)] bg-[var(--accent-primary-muted)] text-[var(--accent-primary-hover)]'
                    : 'border-transparent text-[var(--ink-secondary)] hover:bg-[var(--surface-control-hover)] hover:text-[var(--ink-primary)]'
                }`}
              >
                <span>{item.label}</span>
                <kbd className="metric-value hidden rounded bg-[var(--surface-panel)] px-1 font-mono text-[11px] text-[var(--ink-muted)] sm:inline">
                  {item.keyHint}
                </kbd>
              </button>
            );
          })}
        </nav>

        <span aria-hidden="true" className="h-4 w-px shrink-0 bg-[var(--border-subtle)]" />

        {/* Telemetry Drawer Toggle */}
        <button
          type="button"
          onClick={onToggleRightDrawer}
          aria-pressed={rightDrawerOpen}
          aria-label="Toggle telemetry drawer"
          title="Toggle Telemetry & Reports"
          className={`flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border transition-colors duration-150 ${
            rightDrawerOpen
              ? 'border-[var(--border-accent)] bg-[var(--accent-primary-muted)] text-[var(--accent-primary-hover)]'
              : 'border-transparent text-[var(--ink-secondary)] hover:bg-[var(--surface-control-hover)] hover:text-[var(--ink-primary)]'
          }`}
        >
          <Activity className="h-3.5 w-3.5" strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );
}
