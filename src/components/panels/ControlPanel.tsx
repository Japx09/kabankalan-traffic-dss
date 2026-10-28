'use client';

import React, { useState } from 'react';
import { useSimulationStore } from '@/store/simulationStore';
import { VehicleType, LocationId } from '@/simulation/types';
import { CORRIDORS, SCENARIOS } from '@/simulation/corridors';
import RealMapModal from './RealMapModal';
import {
  MapPin,
  Play,
  Pause,
  RotateCcw,
  Bus,
  Truck,
  Bike,
  Car,
  Users,
  Timer,
  AlertTriangle,
  Save,
  Layers,
  Compass,
  Presentation,
  Sparkles,
  Shuffle,
  Activity,
  Waves,
} from 'lucide-react';

export default function ControlPanel() {
  const {
    params,
    isRunning,
    setVehicleInflow,
    setDwellTime,
    setPedestrianVolume,
    setJaywalkingProbability,
    setLocation,
    setScenario,
    setSpeedMultiplier,
    setBusHeadway,
    setSeed,
    setPlatoonCycle,
    setPlatoonReleaseDuration,
    applyTrafficPreset,
    isDefenseMode,
    toggleDefenseMode,
    startSimulation,
    pauseSimulation,
    resetSimulation,
    captureBaseline,
    baselineRecord,
    clearBaseline,
  } = useSimulationStore();

  const [showMapModal, setShowMapModal] = useState(false);

  const locations = Object.values(CORRIDORS);
  const scenarios = Object.values(SCENARIOS);

  return (
    <div className="flex flex-col gap-2.5 h-full overflow-y-auto pr-1 custom-scrollbar text-xs">
      {/* ── Playback & Speed Controls ── */}
      <div className="cad-subcard p-2.5">
        <button
          onClick={toggleDefenseMode}
          className={`w-full mb-2 py-1.5 px-2 rounded text-xs font-semibold flex items-center justify-center gap-1.5 border transition-all ${
            isDefenseMode
              ? 'bg-amber-500/25 text-amber-300 border-amber-500/60 shadow-lg animate-pulse'
              : 'bg-white/5 text-zinc-300 border-white/10 hover:bg-white/10 hover:text-white'
          }`}
          title="Toggle Clean View for Presentation"
        >
          <Presentation className="w-3.5 h-3.5 text-amber-400" />
          <span>{isDefenseMode ? 'Exit Presentation Mode' : 'Defense Mode'}</span>
        </button>

        <div className="flex gap-2 mb-2.5">
          {!isRunning ? (
            <button
              onClick={startSimulation}
              className="btn-primary flex-1 flex items-center justify-center gap-1.5 py-1.5 font-semibold text-xs tracking-wider"
            >
              <Play className="w-3.5 h-3.5 fill-current" /> RUN SIM
            </button>
          ) : (
            <button
              onClick={pauseSimulation}
              className="btn-warning flex-1 flex items-center justify-center gap-1.5 py-1.5 font-semibold text-xs tracking-wider"
            >
              <Pause className="w-3.5 h-3.5 fill-current" /> PAUSE
            </button>
          )}
          <button
            onClick={resetSimulation}
            className="btn-secondary flex items-center justify-center gap-1.5 px-3 py-1.5 text-zinc-300 hover:text-white"
            title="Reset Simulation"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Speed Multiplier Segmented Control */}
        <div className="grid grid-cols-4 gap-1 p-0.5 bg-black/40 rounded border border-white/5">
          {[1, 2, 5, 10].map((speed) => (
            <button
              key={speed}
              onClick={() => setSpeedMultiplier(speed)}
              className={`py-1 text-[11px] rounded font-mono font-medium transition-all ${
                params.speedMultiplier === speed
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
              }`}
            >
              {speed}×
            </button>
          ))}
        </div>
      </div>

      {/* ── Location / Corridor Selector ── */}
      <div className="cad-subcard p-2.5">
        <h3 className="text-[11px] font-semibold text-zinc-300 flex items-center gap-1.5 mb-2 uppercase tracking-wide">
          <MapPin className="w-3.5 h-3.5 text-emerald-400" /> Target Corridor
        </h3>
        <div className="flex flex-col gap-1.5">
          {locations.map((loc) => (
            <button
              key={loc.id}
              onClick={() => setLocation(loc.id)}
              className={`text-left p-2 rounded text-xs transition-all ${
                params.location === loc.id
                  ? 'bg-blue-600/20 border border-blue-500/60 text-blue-200 shadow-sm'
                  : 'bg-white/5 border border-white/5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200'
              }`}
            >
              <div className="font-semibold text-[11px]">{loc.name}</div>
              <p className="text-[10px] text-zinc-400 mt-0.5 line-clamp-1">{loc.description}</p>
            </button>
          ))}
        </div>

        {params.location === LocationId.CeresTerminal && (
          <button
            onClick={() => setShowMapModal(true)}
            className="w-full mt-2 py-1.5 px-2 text-[11px] bg-emerald-600/20 text-emerald-300 border border-emerald-500/40 rounded hover:bg-emerald-600/30 transition-all flex items-center justify-center gap-1.5 font-medium"
          >
            <Compass className="w-3.5 h-3.5 text-emerald-400" />
            <span>View GIS Ground Truth Map</span>
          </button>
        )}
      </div>

      {/* Real Map Modal */}
      <RealMapModal isOpen={showMapModal} onClose={() => setShowMapModal(false)} />

      {/* ── Scenario Selection ── */}
      <div className="cad-subcard p-2.5">
        <h3 className="text-[11px] font-semibold text-zinc-300 flex items-center gap-1.5 mb-2 uppercase tracking-wide">
          <Layers className="w-3.5 h-3.5 text-cyan-400" /> Intervention Scenario
        </h3>
        <div className="flex flex-col gap-1.5">
          {scenarios.map((sc) => (
            <button
              key={sc.id}
              onClick={() => setScenario(sc.id)}
              className={`text-left p-2 rounded text-xs transition-all ${
                params.scenario === sc.id
                  ? 'bg-cyan-600/20 border border-cyan-500/60 text-cyan-200 shadow-sm'
                  : 'bg-white/5 border border-white/5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200'
              }`}
            >
              <div className="font-semibold text-[11px]">{sc.name}</div>
              <p className="text-[10px] text-zinc-400 mt-0.5 line-clamp-1">{sc.description}</p>
            </button>
          ))}
        </div>

        <div className="flex gap-1.5 mt-2">
          <button
            onClick={captureBaseline}
            className="flex-1 py-1.5 text-[11px] bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded hover:bg-amber-500/30 transition-all flex items-center justify-center gap-1.5 font-medium"
            title="Save current configuration and metrics as baseline for comparison"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{baselineRecord ? 'Update Baseline' : 'Save as Baseline'}</span>
          </button>
          {baselineRecord && (
            <button
              onClick={clearBaseline}
              className="px-2 py-1.5 text-[10px] bg-white/5 hover:bg-rose-500/20 text-zinc-400 hover:text-rose-300 border border-white/10 rounded transition-all"
              title="Clear baseline"
            >
              Clear
            </button>
          )}
        </div>
        {baselineRecord && (
          <p className="text-[9px] font-mono text-zinc-400 mt-1 text-center">
            Baseline recorded at {baselineRecord.capturedAt} ({SCENARIOS[baselineRecord.params.scenario].name})
          </p>
        )}
      </div>

      {/* ── Reproducible Seed & Upstream Platoons ── */}
      <div className="cad-subcard p-2.5">
        <h3 className="text-[11px] font-semibold text-zinc-300 flex items-center gap-1.5 mb-2 uppercase tracking-wide">
          <Shuffle className="w-3.5 h-3.5 text-purple-400" /> Reproducibility & Platoons
        </h3>

        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] text-zinc-400">Random Seed (PRNG):</span>
          <div className="flex items-center gap-1">
            <input
              type="number"
              value={params.seed}
              onChange={(e) => setSeed(Number(e.target.value) || 1)}
              className="w-16 px-1.5 py-0.5 text-[11px] font-mono bg-black/60 border border-white/10 rounded text-right text-white"
            />
            <button
              onClick={() => setSeed(Math.floor(Math.random() * 90000) + 10000)}
              className="p-1 rounded bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white"
              title="Generate new random seed"
            >
              <Shuffle className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Upstream Platoon Cycle */}
        <div className="p-2 rounded bg-purple-500/5 border border-purple-500/20">
          <div className="flex justify-between items-center mb-1 text-[10px]">
            <span className="text-zinc-300 flex items-center gap-1 font-medium">
              <Waves className="w-3 h-3 text-purple-400" /> Upstream Platoon Cycle
            </span>
            <span className="font-mono text-purple-300 font-bold">{params.platoonCycle}s</span>
          </div>
          <input
            type="range"
            min={30}
            max={180}
            step={10}
            value={params.platoonCycle}
            onChange={(e) => setPlatoonCycle(Number(e.target.value))}
            className="sim-slider w-full"
          />
          <div className="flex justify-between text-[8px] text-zinc-500 mt-0.5 font-mono">
            <span>Cycle: {params.platoonCycle}s</span>
            <span>Release: {params.platoonReleaseDuration}s</span>
          </div>
        </div>
      </div>

      {/* ── Vehicle Inflow (veh/hr) with Direct Numeric Entry ── */}
      <div className="cad-subcard p-2.5">
        <h3 className="text-[11px] font-semibold text-zinc-300 flex items-center justify-between mb-2 uppercase tracking-wide">
          <span className="flex items-center gap-1.5">
            <Car className="w-3.5 h-3.5 text-sky-400" /> Traffic Demand (veh/hr)
          </span>
          <span className="text-[9px] text-zinc-500 font-mono font-normal flex items-center gap-1">
            <Sparkles className="w-2.5 h-2.5 text-amber-400" /> Calibrated
          </span>
        </h3>

        {/* Presets */}
        <div className="grid grid-cols-3 gap-1 mb-2.5 p-1 bg-black/40 rounded border border-white/5">
          {[
            { id: 'am_peak', label: 'AM Peak', time: '7:00-8:30' },
            { id: 'off_peak', label: 'Off-Peak', time: '11:00-1:00' },
            { id: 'pm_peak', label: 'PM Peak', time: '4:30-6:00' },
          ].map((p) => (
            <button
              key={p.id}
              onClick={() => applyTrafficPreset(p.id as 'am_peak' | 'off_peak' | 'pm_peak')}
              className="py-1 px-1 rounded text-center text-[10px] font-medium bg-white/5 hover:bg-blue-600/30 text-zinc-300 hover:text-white border border-white/5 transition-all"
            >
              <div>{p.label}</div>
              <div className="text-[8px] text-zinc-500 font-mono">{p.time}</div>
            </button>
          ))}
        </div>

        {/* Ceres Bus Headway */}
        <div className="mb-2.5 p-2 rounded bg-amber-500/5 border border-amber-500/20">
          <div className="flex justify-between items-center mb-1 text-[10px]">
            <span className="text-zinc-300 flex items-center gap-1 font-medium">
              <Bus className="w-3 h-3 text-amber-400" /> Bus Scheduled Headway
            </span>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={15}
                max={300}
                value={params.busHeadway}
                onChange={(e) => setBusHeadway(Number(e.target.value) || 15)}
                className="w-14 px-1 text-[10px] font-mono bg-black/60 border border-white/10 rounded text-right text-amber-300"
              />
              <span className="text-[10px] text-zinc-400 font-mono">s</span>
            </div>
          </div>
          <input
            type="range"
            min={20}
            max={180}
            step={5}
            value={params.busHeadway}
            onChange={(e) => setBusHeadway(Number(e.target.value))}
            className="sim-slider w-full"
          />
        </div>

        {/* Vehicle Volume Sliders + Numeric Inputs */}
        <div className="flex flex-col gap-2.5">
          {[
            { type: VehicleType.Tricycle, icon: Bike, label: 'Tricycles', max: 350 },
            { type: VehicleType.Jeepney, icon: Truck, label: 'Jeepneys (PUJ)', max: 250 },
            { type: VehicleType.Bus, icon: Bus, label: 'Buses (Ceres)', max: 120 },
            { type: VehicleType.PrivateCar, icon: Car, label: 'Private Cars', max: 350 },
          ].map(({ type, icon: Icon, label, max }) => (
            <div key={type}>
              <div className="flex justify-between items-center mb-1 text-[10px]">
                <span className="text-zinc-400 flex items-center gap-1">
                  <Icon className="w-3 h-3 text-zinc-300" /> {label}
                </span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={0}
                    max={max}
                    step={5}
                    value={params.vehicleInflow[type]}
                    onChange={(e) => setVehicleInflow(type, Math.max(0, Number(e.target.value) || 0))}
                    className="w-14 px-1 text-[10px] font-mono bg-black/60 border border-white/10 rounded text-right text-white"
                  />
                  <span className="text-[10px] text-zinc-400 font-mono">v/h</span>
                </div>
              </div>
              <input
                type="range"
                min={0}
                max={max}
                step={5}
                value={params.vehicleInflow[type]}
                onChange={(e) => setVehicleInflow(type, Number(e.target.value))}
                className="sim-slider w-full"
              />
            </div>
          ))}
        </div>
      </div>

      {/* ── Pedestrian & Paratransit Operations ── */}
      <div className="cad-subcard p-2.5">
        <h3 className="text-[11px] font-semibold text-zinc-300 flex items-center gap-1.5 mb-2.5 uppercase tracking-wide">
          <Users className="w-3.5 h-3.5 text-emerald-400" /> Pedestrian & Dwell
        </h3>

        <div className="flex flex-col gap-2.5">
          {/* Dwell Time */}
          <div>
            <div className="flex justify-between items-center mb-1 text-[10px]">
              <span className="text-zinc-400 flex items-center gap-1">
                <Timer className="w-3 h-3 text-zinc-300" /> Paratransit Mean Dwell
              </span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={5}
                  max={120}
                  step={5}
                  value={params.dwellTime}
                  onChange={(e) => setDwellTime(Math.max(5, Number(e.target.value) || 5))}
                  className="w-12 px-1 text-[10px] font-mono bg-black/60 border border-white/10 rounded text-right text-white"
                />
                <span className="text-[10px] text-zinc-400 font-mono">s</span>
              </div>
            </div>
            <input
              type="range"
              min={10}
              max={90}
              step={5}
              value={params.dwellTime}
              onChange={(e) => setDwellTime(Number(e.target.value))}
              className="sim-slider w-full"
            />
          </div>

          {/* Pedestrian Volume */}
          <div>
            <div className="flex justify-between items-center mb-1 text-[10px]">
              <span className="text-zinc-400 flex items-center gap-1">
                <Users className="w-3 h-3 text-zinc-300" /> Ped Volume (peds/min)
              </span>
              <input
                type="number"
                min={0}
                max={50}
                value={params.pedestrianVolume}
                onChange={(e) => setPedestrianVolume(Math.max(0, Number(e.target.value) || 0))}
                className="w-12 px-1 text-[10px] font-mono bg-black/60 border border-white/10 rounded text-right text-white"
              />
            </div>
            <input
              type="range"
              min={1}
              max={30}
              step={1}
              value={params.pedestrianVolume}
              onChange={(e) => setPedestrianVolume(Number(e.target.value))}
              className="sim-slider w-full"
            />
          </div>

          {/* Jaywalking Probability */}
          <div>
            <div className="flex justify-between items-center mb-1 text-[10px]">
              <span className="text-zinc-400 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3 text-amber-400" /> Mid-Block Crossing Rate
              </span>
              <span className="font-mono text-zinc-200 font-bold">{Math.round(params.jaywalkingProbability * 100)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={50}
              step={1}
              value={params.jaywalkingProbability * 100}
              onChange={(e) => setJaywalkingProbability(Number(e.target.value) / 100)}
              className="sim-slider w-full"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
