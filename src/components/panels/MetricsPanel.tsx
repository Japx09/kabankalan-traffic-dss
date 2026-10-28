'use client';

import React from 'react';
import { useSimulationStore } from '@/store/simulationStore';
import { ConflictType, LevelOfService } from '@/simulation/types';
import { getLOSColor } from '@/simulation/metrics';
import {
  Shield,
  AlertTriangle,
  Clock,
  Activity,
  Users,
  Zap,
  TrendingUp,
  Ban,
  Layers,
  HelpCircle,
  Car,
  AlertCircle,
} from 'lucide-react';

function MetricCard({
  icon: Icon,
  label,
  value,
  unit,
  color,
  sublabel,
  badge,
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  label: string;
  value: string | number;
  unit?: string;
  color: string;
  sublabel?: string;
  badge?: string;
}) {
  return (
    <div className="cad-subcard p-2.5">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[10px] text-zinc-400 flex items-center gap-1.5 uppercase font-medium tracking-wide">
              <Icon className="w-3 h-3" style={{ color }} />
              {label}
            </p>
            {badge && (
              <span className="text-[8px] font-mono px-1 py-0.2 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                {badge}
              </span>
            )}
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl font-bold font-mono tracking-tight" style={{ color }}>{value}</span>
            {unit && <span className="text-[10px] font-mono text-zinc-400">{unit}</span>}
          </div>
          {sublabel && <p className="text-[9px] text-zinc-500 mt-0.5 font-mono leading-tight">{sublabel}</p>}
        </div>
      </div>
    </div>
  );
}

function LOSBadge({ los, controlDelay }: { los: LevelOfService; controlDelay: number }) {
  const color = getLOSColor(los);
  return (
    <div className="cad-subcard p-2.5">
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[10px] text-zinc-400 flex items-center gap-1.5 uppercase font-medium tracking-wide">
          <TrendingUp className="w-3 h-3" style={{ color }} />
          HCM Level of Service (LOS)
        </p>
        <span className="text-[8px] font-mono text-zinc-500">Exhibit 18-4 / 19-1</span>
      </div>
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded flex items-center justify-center text-xl font-mono font-black shadow-inner"
          style={{ backgroundColor: color + '22', color, border: `1.5px solid ${color}` }}
        >
          {los}
        </div>
        <div className="text-[10px] text-zinc-300 font-mono leading-snug">
          <div className="font-semibold" style={{ color }}>
            {los === 'A' && 'LOS A — Free Flow'}
            {los === 'B' && 'LOS B — Stable Flow'}
            {los === 'C' && 'LOS C — Stable Flow'}
            {los === 'D' && 'LOS D — Approaching Unstable'}
            {los === 'E' && 'LOS E — Capacity Flow'}
            {los === 'F' && 'LOS F — Forced Breakdown'}
          </div>
          <p className="text-[9px] text-zinc-400 mt-0.5">
            Avg Control Delay: <span className="font-bold text-white">{controlDelay.toFixed(2)}s</span>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function MetricsPanel() {
  const metrics = useSimulationStore((s) => s.simState.metrics);
  const simTime = useSimulationStore((s) => s.simState.simTime);

  const isWarmup = simTime < 30;

  return (
    <div className="flex flex-col gap-2 h-full overflow-y-auto pr-1 custom-scrollbar text-xs">
      {/* Warmup Notification */}
      {isWarmup && (
        <div className="p-2 rounded bg-amber-500/10 border border-amber-500/30 text-[10px] text-amber-300 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
          <span>Warm-up Period Active ({simTime.toFixed(0)}s / 30s): Metrics stabilizing to steady-state.</span>
        </div>
      )}

      {/* ── Operational Delay Assessment ── */}
      <div className="cad-subcard p-2 border-l-2 border-l-sky-500 bg-sky-500/5">
        <h3 className="text-[11px] font-bold text-white flex items-center justify-between uppercase tracking-wide">
          <span className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-sky-400" />
            Operational Delay (HCM 2010)
          </span>
          <span className="text-[8px] font-mono text-zinc-400">Simulated</span>
        </h3>
      </div>

      <LOSBadge los={metrics.los} controlDelay={metrics.controlDelay} />

      <div className="grid grid-cols-2 gap-1.5">
        <MetricCard
          icon={Clock}
          label="Control Delay"
          value={metrics.controlDelay.toFixed(1)}
          unit="s/veh"
          color="#38bdf8"
          sublabel="Decel + Yield + Stop"
          badge="HCM Metric"
        />
        <MetricCard
          icon={Clock}
          label="Stopped Delay"
          value={metrics.stoppedDelay.toFixed(1)}
          unit="s/veh"
          color="#fbbf24"
          sublabel="Speed < 0.3 m/s"
          badge="Queue Only"
        />
      </div>

      {/* ── Queue Length Metrics (Empirical Percentile) ── */}
      <div className="cad-subcard p-2 border-l-2 border-l-purple-500 bg-purple-500/5 mt-1">
        <h3 className="text-[11px] font-bold text-white flex items-center justify-between uppercase tracking-wide">
          <span className="flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-purple-400" />
            Queue Distribution
          </span>
          <span className="text-[8px] font-mono text-zinc-400">1.0s Periodic</span>
        </h3>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <MetricCard
          icon={Layers}
          label="Mean Queue"
          value={metrics.averageQueueLength.toFixed(1)}
          unit="m"
          color="#a855f7"
          sublabel={`~${metrics.averageQueueVehicles.toFixed(0)} vehicles`}
        />
        <MetricCard
          icon={Layers}
          label="Empirical Q95"
          value={metrics.q95QueueLength.toFixed(1)}
          unit="m"
          color="#c084fc"
          sublabel={`95th %ile (${metrics.q95QueueVehicles} veh)`}
          badge={`N=${metrics.queueSampleCount}`}
        />
      </div>

      {/* ── Safety Performance Assessment (SSAM-Inspired) ── */}
      <div className="cad-subcard p-2 border-l-2 border-l-rose-500 bg-rose-500/5 mt-1">
        <h3 className="text-[11px] font-bold text-white flex items-center justify-between uppercase tracking-wide">
          <span className="flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-rose-400" />
            Safety Engine (SSAM-Inspired)
          </span>
          <span className="text-[8px] font-mono text-zinc-400">Deduplicated</span>
        </h3>
      </div>

      <MetricCard
        icon={Zap}
        label="Critical Conflict Rate"
        value={metrics.criticalConflictsPerHour.toFixed(1)}
        unit="conflicts/hr"
        color="#f43f5e"
        sublabel="TTC ≤ 1.5s or PET ≤ 1.0s (1 per encounter)"
        badge="Encounter Min"
      />

      <div className="cad-subcard p-2.5">
        <p className="text-[10px] text-zinc-400 mb-2 uppercase font-medium tracking-wide flex items-center justify-between">
          <span>Deduplicated Encounters by Type</span>
          <span className="text-[9px] text-zinc-500 font-mono">Total: {Object.values(metrics.conflictCounts).reduce((a, b) => a + b, 0)}</span>
        </p>
        <div className="grid grid-cols-2 gap-1.5">
          <div className="p-2 rounded bg-black/40 border border-white/5">
            <span className="text-[10px] text-zinc-400">Veh-Pedestrian:</span>
            <div className="text-base font-bold font-mono text-rose-400">
              {metrics.conflictCounts[ConflictType.VehiclePedestrian] ?? 0}
            </div>
          </div>
          <div className="p-2 rounded bg-black/40 border border-white/5">
            <span className="text-[10px] text-zinc-400">Crossing:</span>
            <div className="text-base font-bold font-mono text-orange-400">
              {metrics.conflictCounts[ConflictType.Crossing] ?? 0}
            </div>
          </div>
          <div className="p-2 rounded bg-black/40 border border-white/5">
            <span className="text-[10px] text-zinc-400">Rear-End:</span>
            <div className="text-base font-bold font-mono text-amber-400">
              {metrics.conflictCounts[ConflictType.RearEnd] ?? 0}
            </div>
          </div>
          <div className="p-2 rounded bg-black/40 border border-white/5">
            <span className="text-[10px] text-zinc-400">Weaving:</span>
            <div className="text-base font-bold font-mono text-sky-400">
              {metrics.conflictCounts[ConflictType.Weaving] ?? 0}
            </div>
          </div>
        </div>
      </div>

      {/* Simulation Faults & Crosswalk Violations */}
      <div className="grid grid-cols-2 gap-1.5">
        <MetricCard
          icon={AlertTriangle}
          label="Simulation Faults"
          value={metrics.simulationFaults}
          unit="overlaps"
          color={metrics.simulationFaults > 0 ? '#f43f5e' : '#10b981'}
          sublabel="Physical mesh overlaps"
          badge="Diagnostic"
        />
        <MetricCard
          icon={Ban}
          label="Crosswalk Blocks"
          value={metrics.crosswalkViolations}
          unit="violations"
          color="#f59e0b"
          sublabel="Encroached crosswalks"
        />
      </div>

      {/* ── Throughput & Demand Telemetry ── */}
      <div className="cad-subcard p-2.5 mt-1">
        <p className="text-[10px] text-zinc-400 mb-2 uppercase font-medium tracking-wide">
          Throughput & Unmet Demand
        </p>
        <div className="grid grid-cols-3 gap-1 text-center font-mono">
          <div className="p-1.5 rounded bg-black/30 border border-white/5">
            <div className="text-xs font-bold text-emerald-400">{metrics.vehiclesProcessed}</div>
            <div className="text-[8px] text-zinc-400">Completed Veh</div>
          </div>
          <div className="p-1.5 rounded bg-black/30 border border-white/5">
            <div className="text-xs font-bold text-sky-400">{metrics.pedestriansProcessed}</div>
            <div className="text-[8px] text-zinc-400">Crossed Peds</div>
          </div>
          <div className="p-1.5 rounded bg-black/30 border border-white/5">
            <div className="text-xs font-bold text-amber-400">{metrics.pendingQueuedVehicles}</div>
            <div className="text-[8px] text-zinc-400">Pending Gate</div>
          </div>
        </div>
      </div>
    </div>
  );
}
