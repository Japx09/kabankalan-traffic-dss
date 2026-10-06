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
    applyTrafficPreset,
    isDefenseMode,
    toggleDefenseMode,
    startSimulation,
    pauseSimulation,
    resetSimulation,
    captureBaseline,
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
          title="Toggle Fullscreen Clean Presentation Mode for Thesis Defense"
        >
          <Presentation className="w-3.5 h-3.5 text-amber-400" />
          <span>{isDefenseMode ? 'Exit Defense Mode' : 'Defense Presentation Mode'}</span>
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

        {/* Real Map Modal Button for Ceres Terminal */}
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

        <button
          onClick={captureBaseline}
          className="w-full mt-2 py-1.5 text-[11px] bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded hover:bg-amber-500/30 transition-all flex items-center justify-center gap-1.5 font-medium"
        >
          <Save className="w-3.5 h-3.5" />
          <span>Save Current as Baseline</span>
        </button>
      </div>

      {/* ── Vehicle Inflow Sliders (veh/hr) ── */}
      <div className="cad-subcard p-2.5">
        <h3 className="text-[11px] font-semibold text-zinc-300 flex items-center justify-between mb-2 uppercase tracking-wide">
          <span className="flex items-center gap-1.5">
            <Car className="w-3.5 h-3.5 text-sky-400" /> Traffic Demand (veh/hr)
          </span>
          <span className="text-[9px] text-zinc-500 font-mono font-normal flex items-center gap-1">
            <Sparkles className="w-2.5 h-2.5 text-amber-400" /> LGU Counts
          </span>
        </h3>

        {/* Volume Calibration Presets */}
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
              title={`Calibrate corridor to Kabankalan ${p.label} count`}
            >
              <div>{p.label}</div>
              <div className="text-[8px] text-zinc-500 font-mono">{p.time}</div>
            </button>
          ))}
        </div>

        {/* Ceres Bus Headway Slider */}
        <div className="mb-2.5 p-2 rounded bg-amber-500/5 border border-amber-500/20">
          <div className="flex justify-between items-center mb-1 text-[10px]">
            <span className="text-zinc-300 flex items-center gap-1 font-medium">
              <Bus className="w-3 h-3 text-amber-400" /> Ceres Dispatch Headway
            </span>
            <span className="font-mono text-amber-300 font-bold">{params.busHeadway}s</span>
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
          <div className="flex justify-between text-[8px] text-zinc-500 mt-0.5 font-mono">
            <span>20s (Peak Queue)</span>
            <span>60s (Nominal)</span>
            <span>180s (Low Freq)</span>
          </div>
        </div>
        <div className="flex flex-col gap-2.5">
          {[
            { type: VehicleType.Tricycle, icon: Bike, label: 'Tricycles', max: 300 },
            { type: VehicleType.Jeepney, icon: Truck, label: 'Jeepneys (PUJ)', max: 200 },
            { type: VehicleType.Bus, icon: Bus, label: 'Buses (Ceres)', max: 100 },
            { type: VehicleType.PrivateCar, icon: Car, label: 'Private Cars', max: 300 },
          ].map(({ type, icon: Icon, label, max }) => (
            <div key={type}>
              <div className="flex justify-between items-center mb-1 text-[10px]">
                <span className="text-zinc-400 flex items-center gap-1">
                  <Icon className="w-3 h-3 text-zinc-300" /> {label}
                </span>
                <span className="font-mono text-zinc-200 font-bold">{params.vehicleInflow[type]}</span>
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
                <Timer className="w-3 h-3 text-zinc-300" /> Paratransit Dwell Mean
              </span>
              <span className="font-mono text-zinc-200 font-bold">{params.dwellTime}s</span>
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
              <span className="font-mono text-zinc-200 font-bold">{params.pedestrianVolume}</span>
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
                <AlertTriangle className="w-3 h-3 text-amber-400" /> Mid-Block Crossing %
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
