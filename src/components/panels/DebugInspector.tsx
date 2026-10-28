'use client';

import React from 'react';
import { useSimulationStore } from '@/store/simulationStore';
import { VehicleType, ManeuverState } from '@/simulation/types';
import {
  Bug,
  X,
  Radio,
  Clock,
  Compass,
  AlertTriangle,
  Layers,
  Activity,
  Shield,
  Gauge,
  Info,
} from 'lucide-react';

export default function DebugInspector() {
  const isDebugMode = useSimulationStore((s) => s.isDebugMode);
  const toggleDebugMode = useSimulationStore((s) => s.toggleDebugMode);
  const selectedVehicleId = useSimulationStore((s) => s.selectedVehicleId);
  const setSelectedVehicleId = useSimulationStore((s) => s.setSelectedVehicleId);
  const vehicles = useSimulationStore((s) => s.simState.vehicles);
  const simState = useSimulationStore((s) => s.simState);

  if (!isDebugMode) return null;

  const selectedVehicle = vehicles.find((v) => v.id === selectedVehicleId) || vehicles[0];

  return (
    <div className="absolute bottom-16 right-4 z-40 w-[380px] cad-panel shadow-2xl border border-cyan-500/40 p-3 max-h-[85vh] overflow-y-auto custom-scrollbar select-text">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-cyan-500/20">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
            <Bug className="w-3.5 h-3.5" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Microsimulation Debug Inspector
            </h3>
            <span className="text-[9px] text-cyan-400 font-mono">Fixed Timestep Physics: 20 Hz (0.05s)</span>
          </div>
        </div>
        <button
          onClick={toggleDebugMode}
          className="p-1 rounded text-zinc-400 hover:text-white hover:bg-white/10"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Vehicle Selector */}
      <div className="mb-2.5">
        <label className="text-[10px] text-zinc-400 uppercase font-medium mb-1 block">
          Inspected Vehicle Entity:
        </label>
        <select
          value={selectedVehicle?.id || ''}
          onChange={(e) => setSelectedVehicleId(e.target.value)}
          className="w-full bg-black/60 border border-white/10 rounded px-2 py-1 text-xs text-white font-mono"
        >
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              [{v.type.toUpperCase()}] {v.id} — State: {v.maneuverState} ({v.speed.toFixed(1)} m/s)
            </option>
          ))}
        </select>
      </div>

      {selectedVehicle ? (
        <div className="flex flex-col gap-2 font-mono text-[11px]">
          {/* Status & Maneuver State */}
          <div className="p-2 rounded bg-black/40 border border-white/5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-zinc-400">Maneuver State:</span>
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                  selectedVehicle.maneuverState === ManeuverState.Yield
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : selectedVehicle.maneuverState === ManeuverState.Turn
                    ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                    : selectedVehicle.maneuverState === ManeuverState.Approach
                    ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                    : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                }`}
              >
                {selectedVehicle.maneuverState}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-1.5 text-[10px]">
              <div>
                <span className="text-zinc-500">Speed:</span>{' '}
                <span className="text-white font-bold">{selectedVehicle.speed.toFixed(2)} m/s</span>{' '}
                <span className="text-zinc-400">({(selectedVehicle.speed * 3.6).toFixed(1)} km/h)</span>
              </div>
              <div>
                <span className="text-zinc-500">Step Δs:</span>{' '}
                <span className="text-cyan-300 font-bold font-mono">
                  {(selectedVehicle.deltaDistance ?? 0).toFixed(3)} m
                </span>
              </div>
              <div>
                <span className="text-zinc-500">Req. Accel:</span>{' '}
                <span className={(selectedVehicle.requestedAcc ?? 0) < -0.5 ? 'text-amber-400 font-bold' : 'text-zinc-300'}>
                  {(selectedVehicle.requestedAcc ?? 0).toFixed(2)} m/s²
                </span>
              </div>
              <div>
                <span className="text-zinc-500">Appl. Accel:</span>{' '}
                <span className={(selectedVehicle.appliedAcc ?? 0) < -0.5 ? 'text-rose-400 font-bold' : 'text-emerald-400 font-bold'}>
                  {(selectedVehicle.appliedAcc ?? 0).toFixed(2)} m/s²
                </span>
              </div>
            </div>
          </div>

          {/* Conflict & Right-of-Way Arbitration */}
          <div className="p-2 rounded bg-black/40 border border-white/5">
            <div className="text-[10px] text-zinc-400 uppercase font-semibold mb-1 flex items-center gap-1">
              <Shield className="w-3 h-3 text-amber-400" />
              Conflict & Right-of-Way Arbitration
            </div>

            <div className="space-y-1 text-[10px]">
              <div>
                <span className="text-zinc-500">Yielding Reason:</span>{' '}
                <span className={selectedVehicle.isYielding ? 'text-amber-300 font-bold' : 'text-zinc-400'}>
                  {selectedVehicle.yieldingReason || 'None (Clear Right-of-Way)'}
                </span>
              </div>
              {selectedVehicle.conflictingVehicleId && (
                <div>
                  <span className="text-zinc-500">Conflicting Vehicle:</span>{' '}
                  <span className="text-rose-400 font-bold">{selectedVehicle.conflictingVehicleId}</span>
                </div>
              )}
              {selectedVehicle.leaderVehicleId && (
                <div>
                  <span className="text-zinc-500">Leader Followed:</span>{' '}
                  <span className="text-sky-400 font-bold">{selectedVehicle.leaderVehicleId}</span>
                </div>
              )}
              {selectedVehicle.targetConflictAreaId && (
                <div>
                  <span className="text-zinc-500">Target Conflict Area:</span>{' '}
                  <span className="text-purple-300">{selectedVehicle.targetConflictAreaId}</span>
                </div>
              )}
              {selectedVehicle.targetStopDistance !== undefined && (
                <div>
                  <span className="text-zinc-500">Dist to Stop Line:</span>{' '}
                  <span className="text-amber-300 font-mono">{selectedVehicle.targetStopDistance.toFixed(2)}m</span>
                </div>
              )}
              {selectedVehicle.predictedGap !== undefined && (
                <div>
                  <span className="text-zinc-500">Predicted Gap:</span>{' '}
                  <span className="text-white font-mono">{selectedVehicle.predictedGap.toFixed(2)}s</span>
                </div>
              )}
              <div>
                <span className="text-zinc-500">Nearby Monitored:</span>{' '}
                <span className="text-zinc-300">
                  {selectedVehicle.detectedNearbyVehicleIds && selectedVehicle.detectedNearbyVehicleIds.length > 0
                    ? selectedVehicle.detectedNearbyVehicleIds.slice(0, 5).join(', ') + (selectedVehicle.detectedNearbyVehicleIds.length > 5 ? '...' : '')
                    : 'None in 45m surveillance'}
                </span>
              </div>
            </div>
          </div>

          {/* Route & Geometry */}
          <div className="p-2 rounded bg-black/40 border border-white/5 text-[10px]">
            <div className="text-[10px] text-zinc-400 uppercase font-semibold mb-1 flex items-center gap-1">
              <Compass className="w-3 h-3 text-cyan-400" />
              Route & Geometry
            </div>
            <div className="space-y-0.5">
              <div>
                <span className="text-zinc-500">Assigned Route:</span>{' '}
                <span className="text-white">{selectedVehicle.routeId}</span>
              </div>
              <div>
                <span className="text-zinc-500">Distance Along Route:</span>{' '}
                <span className="text-white">{(selectedVehicle.distanceAlongRoute ?? 0).toFixed(1)} m</span>
              </div>
              <div>
                <span className="text-zinc-500">Position 2D:</span>{' '}
                <span className="text-white">
                  X={selectedVehicle.position.x.toFixed(1)}m, Z={selectedVehicle.position.z.toFixed(1)}m
                </span>
              </div>
              <div>
                <span className="text-zinc-500">Swept Width:</span>{' '}
                <span className="text-white">{(selectedVehicle.sweptWidth ?? 2.5).toFixed(1)} m</span>
              </div>
            </div>
          </div>

          {/* Delay Metrics */}
          <div className="p-2 rounded bg-black/40 border border-white/5 text-[10px]">
            <div className="text-[10px] text-zinc-400 uppercase font-semibold mb-1 flex items-center gap-1">
              <Clock className="w-3 h-3 text-sky-400" />
              Individual Vehicle Delay
            </div>
            <div className="grid grid-cols-3 gap-1 text-center">
              <div>
                <div className="text-zinc-500 text-[9px]">Control</div>
                <div className="font-bold text-sky-300">{selectedVehicle.controlDelay.toFixed(1)}s</div>
              </div>
              <div>
                <div className="text-zinc-500 text-[9px]">Stopped</div>
                <div className="font-bold text-amber-300">{selectedVehicle.stoppedDelay.toFixed(1)}s</div>
              </div>
              <div>
                <div className="text-zinc-500 text-[9px]">Total</div>
                <div className="font-bold text-white">{selectedVehicle.accumulatedDelay.toFixed(1)}s</div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-3 text-center text-zinc-500 text-xs">No active vehicle in corridor.</div>
      )}

      {/* Simulation Engine Diagnostics */}
      <div className="mt-2.5 pt-2 border-t border-white/10 font-mono text-[9px] text-zinc-400 flex items-center justify-between">
        <div>
          Active Faults:{' '}
          <span className={simState.faults.length > 0 ? 'text-rose-400 font-bold' : 'text-emerald-400 font-bold'}>
            {simState.faults.length}
          </span>
        </div>
        <div>Pending Entry: <span className="text-white">{simState.arrivalManager ? Object.values(simState.arrivalManager.pendingQueues).flat().length : 0}</span></div>
        <div>Signal: <span className="text-emerald-400 uppercase">{simState.signalState?.vehicularPhase || 'GREEN'}</span></div>
      </div>
    </div>
  );
}
