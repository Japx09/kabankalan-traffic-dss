'use client';

import React, { useEffect, useState, useSyncExternalStore } from 'react';
import dynamic from 'next/dynamic';
import { useSimStore } from '@/store/simStore';
import { TopBar } from '@/components/TopBar';
import { ControlRail } from '@/components/ControlRail';
import { TelemetryDrawer } from '@/components/TelemetryDrawer';
import { BottomCameraDock } from '@/components/BottomCameraDock';
import { VehicleInspectorCard } from '@/components/VehicleInspectorCard';
import { PrintReportSheet } from '@/components/PrintReportSheet';

function subscribeViewport(callback: () => void) {
  window.addEventListener('resize', callback);
  return () => window.removeEventListener('resize', callback);
}

function getIsWideViewport(): boolean {
  return window.innerWidth >= 1280;
}

const GameSimulationCanvas = dynamic(
  () => import('@/scene3d/GameSimulationCanvas'),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center bg-[var(--surface-canvas)]">
        <div className="hud-surface flex flex-col items-center gap-3 rounded-[var(--radius-lg)] px-6 py-4">
          <div className="h-2 w-40 overflow-hidden rounded-full bg-[var(--surface-control)]">
            <div className="h-full w-1/2 animate-pulse rounded-full bg-[var(--accent-primary)]" />
          </div>
          <span className="font-mono text-xs text-[var(--ink-secondary)]">
            Initializing Ceres Corridor 3D Microsimulation...
          </span>
        </div>
      </div>
    ),
  }
);

export default function HomePage() {
  // SSR-safe responsive viewport detection: open left rail by default on >= 1280px, collapsed below
  const isWideViewport = useSyncExternalStore(
    subscribeViewport,
    getIsWideViewport,
    () => false
  );

  const isDefenseMode = useSimStore((s) => s.isDefenseMode);
  const toggleRunning = useSimStore((s) => s.toggleRunning);
  const setCameraPreset = useSimStore((s) => s.setCameraPreset);
  const toggleDefenseMode = useSimStore((s) => s.toggleDefenseMode);
  const selectVehicle = useSimStore((s) => s.selectVehicle);

  // Manual drawer overrides scoped to current Defense Mode state so entering/exiting Defense Mode auto-resets cleanly
  const [panelOverride, setPanelOverride] = useState<{
    forDefense: boolean;
    left: boolean | null;
    right: boolean | null;
  }>({ forDefense: false, left: null, right: null });

  const defaultLeftOpen = isDefenseMode ? false : isWideViewport;
  const defaultRightOpen = isDefenseMode ? false : true;

  const leftRailOpen =
    panelOverride.forDefense === isDefenseMode && panelOverride.left !== null
      ? panelOverride.left
      : defaultLeftOpen;

  const rightDrawerOpen =
    panelOverride.forDefense === isDefenseMode && panelOverride.right !== null
      ? panelOverride.right
      : defaultRightOpen;

  const handleToggleLeftRail = () => {
    setPanelOverride((prev) => ({
      forDefense: isDefenseMode,
      left: !leftRailOpen,
      right: prev.forDefense === isDefenseMode ? prev.right : null,
    }));
  };

  const handleToggleRightDrawer = () => {
    setPanelOverride((prev) => ({
      forDefense: isDefenseMode,
      left: prev.forDefense === isDefenseMode ? prev.left : null,
      right: !rightDrawerOpen,
    }));
  };

  // Global keyboard shortcuts for live engineering operation & thesis defense
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      switch (event.key) {
        case ' ':
          event.preventDefault();
          toggleRunning();
          break;
        case '1':
          setCameraPreset('isometric');
          break;
        case '2':
          setCameraPreset('gates');
          break;
        case '3':
          setCameraPreset('junction');
          break;
        case '4':
          setCameraPreset('topdown');
          break;
        case 'd':
        case 'D':
          toggleDefenseMode();
          break;
        case 'Escape':
          selectVehicle(null);
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleRunning, setCameraPreset, toggleDefenseMode, selectVehicle]);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[var(--surface-canvas)]">
      {/* Full-Bleed 3D Simulation Viewport */}
      <div className="fixed inset-0 z-0 h-screen w-screen print:hidden">
        <GameSimulationCanvas />
      </div>

      {/* Operate-Mode Engineering HUD Chrome */}
      <TopBar />

      <ControlRail
        isOpen={leftRailOpen}
        onToggle={handleToggleLeftRail}
      />

      <TelemetryDrawer
        isOpen={rightDrawerOpen}
        onToggle={handleToggleRightDrawer}
      />

      <VehicleInspectorCard />

      <BottomCameraDock
        leftRailOpen={leftRailOpen}
        rightDrawerOpen={rightDrawerOpen}
        onToggleLeftRail={handleToggleLeftRail}
        onToggleRightDrawer={handleToggleRightDrawer}
      />

      {/* A4 Print-Only Thesis Chapter 4 Report Sheet */}
      <PrintReportSheet />
    </main>
  );
}
