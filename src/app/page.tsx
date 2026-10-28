'use client';

import React, { useState } from 'react';
import SimulationCanvas from '@/components/SimulationCanvas';
import ControlPanel from '@/components/panels/ControlPanel';
import MetricsPanel from '@/components/panels/MetricsPanel';
import ComparisonCards from '@/components/panels/ComparisonCards';
import ReportPanel from '@/components/panels/ReportPanel';
import DebugInspector from '@/components/panels/DebugInspector';
import OverlayLegend from '@/components/panels/OverlayLegend';
import { useSimulationStore } from '@/store/simulationStore';
import { CORRIDORS, SCENARIOS } from '@/simulation/corridors';
import {
  Activity,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Camera,
  Flame,
  Route,
  BarChart2,
  FileText,
  Radio,
  GitBranch,
  Maximize2,
  Presentation,
  Bug,
  ShieldAlert,
  Compass,
} from 'lucide-react';

export default function Home() {
  const params = useSimulationStore((s) => s.params);
  const isRunning = useSimulationStore((s) => s.isRunning);
  const simState = useSimulationStore((s) => s.simState);
  const isDefenseMode = useSimulationStore((s) => s.isDefenseMode);
  const toggleDefenseMode = useSimulationStore((s) => s.toggleDefenseMode);
  const isDebugMode = useSimulationStore((s) => s.isDebugMode);
  const toggleDebugMode = useSimulationStore((s) => s.toggleDebugMode);
  const cameraPreset = useSimulationStore((s) => s.cameraPreset);
  const setCameraPreset = useSimulationStore((s) => s.setCameraPreset);
  const showConflictHeatmap = useSimulationStore((s) => s.showConflictHeatmap);
  const setShowConflictHeatmap = useSimulationStore((s) => s.setShowConflictHeatmap);
  const showVehicleTrails = useSimulationStore((s) => s.showVehicleTrails);
  const setShowVehicleTrails = useSimulationStore((s) => s.setShowVehicleTrails);
  const showCenterlines = useSimulationStore((s) => s.showCenterlines);
  const setShowCenterlines = useSimulationStore((s) => s.setShowCenterlines);
  const showSweptEnvelopes = useSimulationStore((s) => s.showSweptEnvelopes);
  const setShowSweptEnvelopes = useSimulationStore((s) => s.setShowSweptEnvelopes);
  const showConflictAreas = useSimulationStore((s) => s.showConflictAreas);
  const setShowConflictAreas = useSimulationStore((s) => s.setShowConflictAreas);
  const showStopBars = useSimulationStore((s) => s.showStopBars);
  const setShowStopBars = useSimulationStore((s) => s.setShowStopBars);

  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [rightTab, setRightTab] = useState<'metrics' | 'comparison' | 'report'>('metrics');

  const startSimulation = useSimulationStore((s) => s.startSimulation);

  React.useEffect(() => {
    startSimulation();
  }, [startSimulation]);

  const locationConfig = CORRIDORS[params.location];
  const scenarioConfig = SCENARIOS[params.scenario];

  const formatSimTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="relative h-screen w-screen flex flex-col bg-[#0c1017] overflow-hidden select-none">
      {/* ── Enterprise Civil Engineering Top Bar ── */}
      <header className="h-11 flex items-center justify-between px-4 border-b border-white/10 bg-[#111622]/95 backdrop-blur-md z-30 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-6 h-6 rounded bg-blue-600/20 border border-blue-500/40 text-blue-400">
            <Activity className="w-3.5 h-3.5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xs font-bold text-white tracking-wide uppercase">
                Kabankalan City DSS
              </h1>
              <span className="text-[9px] px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-300 font-mono border border-zinc-700">
                PTV Vissim / SSAM Analytical Twin
              </span>
            </div>
            <p className="text-[9px] text-zinc-400 font-mono">
              3D Traffic Microsimulation & Paratransit Safety Decision Support System
            </p>
          </div>
        </div>

        {/* Status Indicators */}
        <div className="flex items-center gap-3 text-xs font-mono">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-zinc-900/80 border border-zinc-800">
            <span className="text-zinc-500 text-[10px]">CORRIDOR:</span>
            <span className="font-semibold text-emerald-400">{locationConfig.name}</span>
          </div>

          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-zinc-900/80 border border-zinc-800">
            <span className="text-zinc-500 text-[10px]">SCENARIO:</span>
            <span className="font-semibold text-sky-400">{scenarioConfig.name}</span>
          </div>

          <div className="flex items-center gap-2 px-2 py-0.5 rounded bg-zinc-900/80 border border-zinc-800">
            <span className="text-zinc-500 text-[10px]">TIME:</span>
            <span className="font-bold text-white font-mono">{formatSimTime(simState.simTime)}</span>
            <span className={`w-2 h-2 rounded-full ${isRunning ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'}`} />
            <span className="text-[10px] text-zinc-400">{isRunning ? 'RUN' : 'PAUSED'}</span>
          </div>

          {/* Traffic Signal Phase Indicator */}
          {scenarioConfig.signalizedCrossings && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-zinc-900/80 border border-zinc-800">
              <span className="text-zinc-500 text-[10px]">SIGNAL:</span>
              <span
                className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase font-mono ${
                  simState.signalState.vehicularPhase === 'red'
                    ? 'bg-rose-500/20 text-rose-400 border border-rose-500/50'
                    : simState.signalState.vehicularPhase === 'yellow'
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/50'
                    : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50'
                }`}
              >
                {simState.signalState.vehicularPhase}
              </span>
            </div>
          )}

          {/* Faults / Overlaps Count */}
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-zinc-900/80 border border-zinc-800">
            <span className="text-zinc-500 text-[10px]">FAULTS:</span>
            <span className={simState.allFaults.length > 0 ? 'text-rose-400 font-bold' : 'text-emerald-400 font-bold'}>
              {simState.allFaults.length}
            </span>
          </div>

          {/* Seed indicator */}
          <div className="hidden lg:flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-900/80 border border-zinc-800 text-[10px] text-zinc-400">
            <span>SEED:</span>
            <span className="text-purple-300 font-bold">{params.seed}</span>
          </div>

          {/* Debug Mode Toggle */}
          <button
            onClick={toggleDebugMode}
            className={`px-2 py-0.5 rounded text-[11px] font-semibold flex items-center gap-1 transition-all ${
              isDebugMode
                ? 'bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-500/30'
                : 'bg-white/5 text-zinc-300 hover:text-white hover:bg-white/10 border border-white/10'
            }`}
            title="Toggle Debug Inspector and Diagnostics"
          >
            <Bug className="w-3.5 h-3.5" />
            <span>Debug</span>
          </button>

          {/* Defense Presentation Mode Toggle */}
          <button
            onClick={toggleDefenseMode}
            className={`px-2.5 py-0.5 rounded text-[11px] font-semibold flex items-center gap-1.5 transition-all ${
              isDefenseMode
                ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/30'
                : 'bg-white/5 text-zinc-300 hover:text-white hover:bg-white/10 border border-white/10'
            }`}
            title="Toggle Fullscreen Clean View for Thesis Presentation"
          >
            <Presentation className="w-3.5 h-3.5" />
            <span>{isDefenseMode ? 'Exit Defense' : 'Defense Mode'}</span>
          </button>
        </div>
      </header>

      {/* ── Viewport Area ── */}
      <main className="relative flex-1 w-full h-full overflow-hidden">
        {/* Full-bleed 3D Canvas */}
        <div className="absolute inset-0 w-full h-full z-0">
          <SimulationCanvas />
        </div>

        {/* 3D GIS Legend */}
        {!isDefenseMode && <OverlayLegend />}

        {/* Debug Inspector Floating Card */}
        <DebugInspector />

        {/* Defense Mode Floating Banner */}
        {isDefenseMode && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 px-4 py-1.5 rounded-full bg-slate-950/85 border border-amber-500/40 backdrop-blur-md shadow-2xl text-xs font-mono">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span className="font-semibold text-white tracking-wide">
              THESIS DEFENSE PRESENTATION MODE — {locationConfig.name} ({scenarioConfig.name})
            </span>
            <span className="text-zinc-400">|</span>
            <span className="text-amber-300 font-bold">
              Delay: {simState.metrics.controlDelay.toFixed(1)}s (LOS {simState.metrics.los})
            </span>
            <span className="text-zinc-400">|</span>
            <span className="text-rose-300 font-bold">
              Conflicts: {simState.metrics.criticalConflictsPerHour.toFixed(1)}/h
            </span>
            <button
              onClick={toggleDefenseMode}
              className="text-[10px] px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-amber-300 ml-2"
            >
              Exit
            </button>
          </div>
        )}

        {/* ── Floating Left HUD Overlay (Controls) ── */}
        <div
          className={`absolute left-3 top-3 bottom-3 w-[310px] z-20 flex flex-col transition-all duration-300 pointer-events-auto ${
            leftOpen && !isDefenseMode ? 'translate-x-0 opacity-100' : '-translate-x-[330px] opacity-0 pointer-events-none'
          }`}
        >
          <div className="cad-panel flex-1 flex flex-col p-3 overflow-hidden shadow-2xl border border-white/10">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10">
              <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-200">
                <Radio className="w-3.5 h-3.5 text-blue-400" />
                <span>Simulation Parameters</span>
              </div>
              <button
                onClick={() => setLeftOpen(false)}
                className="p-1 rounded text-zinc-400 hover:text-white hover:bg-white/10 transition-all"
                title="Collapse Panel"
              >
                <PanelLeftClose className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar pr-0.5">
              <ControlPanel />
            </div>
          </div>
        </div>

        {/* Left Toggle Button (when collapsed) */}
        {!leftOpen && !isDefenseMode && (
          <button
            onClick={() => setLeftOpen(true)}
            className="absolute left-3 top-3 z-20 px-3 py-1.5 cad-panel flex items-center gap-1.5 text-xs font-semibold text-zinc-200 hover:text-white hover:border-white/30 transition-all shadow-lg"
          >
            <PanelLeftOpen className="w-4 h-4 text-blue-400" />
            <span>Controls</span>
          </button>
        )}

        {/* ── Floating Right HUD Overlay (Metrics & Assessment) ── */}
        <div
          className={`absolute right-3 top-3 bottom-3 w-[360px] z-20 flex flex-col transition-all duration-300 pointer-events-auto ${
            rightOpen && !isDefenseMode ? 'translate-x-0 opacity-100' : 'translate-x-[380px] opacity-0 pointer-events-none'
          }`}
        >
          <div className="cad-panel flex-1 flex flex-col p-3 overflow-hidden shadow-2xl border border-white/10">
            {/* Header & Tabs */}
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setRightTab('metrics')}
                  className={`px-2 py-1 rounded text-[11px] font-semibold flex items-center gap-1 transition-all ${
                    rightTab === 'metrics'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
                  }`}
                >
                  <Activity className="w-3 h-3" />
                  <span>Telemetry</span>
                </button>
                <button
                  onClick={() => setRightTab('comparison')}
                  className={`px-2 py-1 rounded text-[11px] font-semibold flex items-center gap-1 transition-all ${
                    rightTab === 'comparison'
                      ? 'bg-cyan-600 text-white shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
                  }`}
                >
                  <BarChart2 className="w-3 h-3" />
                  <span>Scenario Delta</span>
                </button>
                <button
                  onClick={() => setRightTab('report')}
                  className={`px-2 py-1 rounded text-[11px] font-semibold flex items-center gap-1 transition-all ${
                    rightTab === 'report'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
                  }`}
                >
                  <FileText className="w-3 h-3" />
                  <span>Report</span>
                </button>
              </div>

              <button
                onClick={() => setRightOpen(false)}
                className="p-1 rounded text-zinc-400 hover:text-white hover:bg-white/10 transition-all ml-1"
                title="Collapse Panel"
              >
                <PanelRightClose className="w-4 h-4" />
              </button>
            </div>

            {/* Tab Contents */}
            <div className="flex-1 overflow-y-auto custom-scrollbar pr-0.5">
              {rightTab === 'metrics' && <MetricsPanel />}
              {rightTab === 'comparison' && <ComparisonCards />}
              {rightTab === 'report' && <ReportPanel />}
            </div>
          </div>
        </div>

        {/* Right Toggle Button (when collapsed) */}
        {!rightOpen && !isDefenseMode && (
          <button
            onClick={() => setRightOpen(true)}
            className="absolute right-3 top-3 z-20 px-3 py-1.5 cad-panel flex items-center gap-1.5 text-xs font-semibold text-zinc-200 hover:text-white hover:border-white/30 transition-all shadow-lg"
          >
            <span>Telemetry</span>
            <PanelRightOpen className="w-4 h-4 text-emerald-400" />
          </button>
        )}

        {/* ── Floating CAD Viewport Toolbar (Bottom Center) ── */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-3 py-1.5 cad-panel shadow-2xl border border-white/15 max-w-[95vw] overflow-x-auto">
          <div className="flex items-center gap-1 text-[11px] text-zinc-400 border-r border-white/10 pr-2 mr-1 shrink-0">
            <Camera className="w-3.5 h-3.5 text-blue-400" />
            <span className="font-semibold text-zinc-300">Camera</span>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {[
              { id: 'isometric', label: '3D Isometric' },
              { id: 'topdown', label: 'Top-Down CAD' },
              { id: 'crosswalk', label: 'Crosswalk Zoom' },
              { id: 'terminal', label: 'Loading Bay' },
            ].map((p) => (
              <button
                key={p.id}
                onClick={() => setCameraPreset(p.id as typeof cameraPreset)}
                className={`px-2.5 py-1 text-[10px] rounded font-medium transition-all ${
                  cameraPreset === p.id
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="h-4 w-[1px] bg-white/10 mx-1 shrink-0" />

          {/* GIS Layer Toggles */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => setShowConflictHeatmap(!showConflictHeatmap)}
              className={`px-2 py-1 text-[10px] rounded font-medium flex items-center gap-1 transition-all ${
                showConflictHeatmap
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                  : 'bg-white/5 text-zinc-500 hover:bg-white/10'
              }`}
              title="Toggle Dynamic Road Surface Conflict Heatmap"
            >
              <Flame className="w-3 h-3" />
              <span>Heatmap</span>
            </button>

            <button
              onClick={() => setShowVehicleTrails(!showVehicleTrails)}
              className={`px-2 py-1 text-[10px] rounded font-medium flex items-center gap-1 transition-all ${
                showVehicleTrails
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'bg-white/5 text-zinc-500 hover:bg-white/10'
              }`}
              title="Toggle Vehicle Trajectory Motion Trails"
            >
              <Route className="w-3 h-3" />
              <span>Trails</span>
            </button>

            <button
              onClick={() => setShowCenterlines(!showCenterlines)}
              className={`px-2 py-1 text-[10px] rounded font-medium flex items-center gap-1 transition-all ${
                showCenterlines
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'bg-white/5 text-zinc-500 hover:bg-white/10'
              }`}
              title="Toggle DPWH Road Centerlines"
            >
              <GitBranch className="w-3 h-3" />
              <span>Centerlines</span>
            </button>

            <button
              onClick={() => setShowSweptEnvelopes(!showSweptEnvelopes)}
              className={`px-2 py-1 text-[10px] rounded font-medium flex items-center gap-1 transition-all ${
                showSweptEnvelopes
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'bg-white/5 text-zinc-500 hover:bg-white/10'
              }`}
              title="Toggle AASHTO 6.5m Bus Turning Swept Path Envelopes"
            >
              <Maximize2 className="w-3 h-3" />
              <span>Swept Path</span>
            </button>

            <button
              onClick={() => setShowConflictAreas(!showConflictAreas)}
              className={`px-2 py-1 text-[10px] rounded font-medium flex items-center gap-1 transition-all ${
                showConflictAreas
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                  : 'bg-white/5 text-zinc-500 hover:bg-white/10'
              }`}
              title="Toggle Intersection Conflict Areas"
            >
              <span>Conflict Areas</span>
            </button>

            <button
              onClick={() => setShowStopBars(!showStopBars)}
              className={`px-2 py-1 text-[10px] rounded font-medium flex items-center gap-1 transition-all ${
                showStopBars
                  ? 'bg-zinc-200/20 text-zinc-200 border border-white/40'
                  : 'bg-white/5 text-zinc-500 hover:bg-white/10'
              }`}
              title="Toggle Stop Bars"
            >
              <span>Stop Bars</span>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
