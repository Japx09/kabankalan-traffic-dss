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
} from 'lucide-react';

function MetricCard({
  icon: Icon,
  label,
  value,
  unit,
  color,
  sublabel,
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  label: string;
  value: string | number;
  unit?: string;
  color: string;
  sublabel?: string;
}) {
  return (
    <div className="cad-subcard p-2.5">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-[10px] text-zinc-400 mb-1 flex items-center gap-1.5 uppercase font-medium tracking-wide">
            <Icon className="w-3 h-3" style={{ color }} />
            {label}
          </p>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl font-bold font-mono tracking-tight" style={{ color }}>{value}</span>
            {unit && <span className="text-[10px] font-mono text-zinc-400">{unit}</span>}
          </div>
          {sublabel && <p className="text-[9px] text-zinc-500 mt-0.5 font-mono">{sublabel}</p>}
        </div>
      </div>
    </div>
  );
}

function LOSBadge({ los }: { los: LevelOfService }) {
  const color = getLOSColor(los);
  return (
    <div className="cad-subcard p-2.5">
      <p className="text-[10px] text-zinc-400 mb-1.5 flex items-center gap-1.5 uppercase font-medium tracking-wide">
        <TrendingUp className="w-3 h-3" style={{ color }} />
        Highway Capacity Manual (HCM) LOS
      </p>
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded flex items-center justify-center text-xl font-mono font-black"
          style={{ backgroundColor: color + '22', color, border: `1.5px solid ${color}` }}
        >
          {los}
        </div>
        <div className="text-[10px] text-zinc-300 font-mono">
          {los === 'A' && 'LOS A — Free Flow (Delay < 10s)'}
          {los === 'B' && 'LOS B — Stable Flow (Delay 10-20s)'}
          {los === 'C' && 'LOS C — Stable Flow (Delay 20-35s)'}
          {los === 'D' && 'LOS D — Approaching Unstable (35-55s)'}
          {los === 'E' && 'LOS E — Capacity Flow (Delay 55-80s)'}
          {los === 'F' && 'LOS F — Forced Breakdown (> 80s)'}
        </div>
      </div>
    </div>
  );
}

export default function MetricsPanel() {
  const metrics = useSimulationStore((s) => s.simState.metrics);

  return (
    <div className="flex flex-col gap-2 h-full overflow-y-auto pr-1 custom-scrollbar text-xs">
      {/* ── Safety Performance Assessment ── */}
      <div className="cad-subcard p-2 border-l-2 border-l-rose-500 bg-rose-500/5">
        <h3 className="text-[11px] font-bold text-white flex items-center gap-1.5 uppercase tracking-wide">
          <Shield className="w-3.5 h-3.5 text-rose-400" />
          Surrogate Safety Assessment (SSAM)
        </h3>
      </div>

      <MetricCard
        icon={Zap}
        label="Critical Conflict Rate"
        value={metrics.criticalConflictsPerHour.toFixed(1)}
        unit="conflicts/hr"
        color="#f43f5e"
        sublabel="Threshold: TTC ≤ 1.5s or PET ≤ 1.0s"
      />

      <MetricCard
        icon={Ban}
        label="Crosswalk Obstructions"
        value={metrics.crosswalkViolations}
        unit="stopped veh"
        color={metrics.crosswalkViolations > 0 ? '#ef4444' : '#10b981'}
        sublabel={
          metrics.crosswalkViolations > 0
            ? 'Crosswalk encroachment violation detected'
            : 'Keep-Clear Rule enforced (0 blocked)'
        }
      />

      <MetricCard
        icon={AlertTriangle}
        label="Vehicle-Pedestrian Conflicts"
        value={metrics.conflictCounts[ConflictType.VehiclePedestrian] ?? 0}
        unit="events"
        color="#f59e0b"
        sublabel="Pedestrian yielding & crosswalk interactions"
      />

      <div className="grid grid-cols-2 gap-1.5">
        <div className="cad-subcard p-2">
          <p className="text-[9px] text-zinc-400 uppercase font-mono">Crossing (θ &gt; 85°)</p>
          <div className="text-base font-bold font-mono text-rose-400 mt-0.5">
            {metrics.conflictCounts[ConflictType.Crossing] ?? 0}
            <span className="text-[9px] text-zinc-500 font-normal ml-1">events</span>
          </div>
          <p className="text-[8px] text-zinc-500 mt-0.5">Wide turn / egress cuts</p>
        </div>

        <div className="cad-subcard p-2">
          <p className="text-[9px] text-zinc-400 uppercase font-mono">Rear-End (θ &lt; 30°)</p>
          <div className="text-base font-bold font-mono text-cyan-400 mt-0.5">
            {metrics.conflictCounts[ConflictType.RearEnd] ?? 0}
            <span className="text-[9px] text-zinc-500 font-normal ml-1">events</span>
          </div>
          <p className="text-[8px] text-zinc-500 mt-0.5">Platoon car-following</p>
        </div>
      </div>

      <MetricCard
        icon={Activity}
        label="Weaving Conflicts (30° ≤ θ ≤ 85°)"
        value={metrics.conflictCounts[ConflictType.Weaving] ?? 0}
        unit="events"
        color="#38bdf8"
        sublabel="Curb merges, alighting bay maneuvers"
      />

      {/* ── Operational Efficiency Metrics ── */}
      <div className="cad-subcard p-2 border-l-2 border-l-blue-500 bg-blue-500/5 mt-1">
        <h3 className="text-[11px] font-bold text-white flex items-center gap-1.5 uppercase tracking-wide">
          <Activity className="w-3.5 h-3.5 text-blue-400" />
          Operational Performance
        </h3>
      </div>

      <LOSBadge los={metrics.los} />

      <MetricCard
        icon={Clock}
        label="Average Control Delay"
        value={metrics.averageDelay.toFixed(1)}
        unit="sec/veh"
        color="#3b82f6"
        sublabel="Delay induced by paratransit dwell & queues"
      />

      <div className="grid grid-cols-2 gap-1.5">
        <div className="cad-subcard p-2">
          <p className="text-[9px] text-zinc-400 uppercase font-mono">Mean Queue</p>
          <div className="text-base font-bold font-mono text-cyan-400 mt-0.5">
            {metrics.averageQueueLength.toFixed(1)}
            <span className="text-[9px] text-zinc-500 font-normal ml-1">m</span>
          </div>
          <p className="text-[8px] text-zinc-500 mt-0.5">Average standing backup</p>
        </div>

        <div className="cad-subcard p-2 border border-cyan-500/30 bg-cyan-500/5">
          <p className="text-[9px] text-cyan-300 uppercase font-mono font-bold">HCM Q₉₅ Queue</p>
          <div className="text-base font-bold font-mono text-white mt-0.5">
            {(metrics.q95QueueLength ?? metrics.averageQueueLength * 1.68).toFixed(1)}
            <span className="text-[9px] text-cyan-300 font-normal ml-1">m</span>
          </div>
          <p className="text-[8px] text-zinc-400 mt-0.5">95th-percentile back-of-queue</p>
        </div>
      </div>

      {/* ── Corridor Throughput ── */}
      <div className="cad-subcard p-2.5 border-l-2 border-l-emerald-500 bg-emerald-500/5 mt-1">
        <h3 className="text-[11px] font-bold text-white flex items-center gap-1.5 mb-2 uppercase tracking-wide">
          <Users className="w-3.5 h-3.5 text-emerald-400" />
          Corridor Volume & Throughput
        </h3>
        <div className="grid grid-cols-2 gap-2 text-[10px]">
          <div className="p-1.5 bg-black/30 rounded border border-white/5">
            <p className="text-zinc-400">Active Vehicles</p>
            <p className="text-white font-bold font-mono text-sm">{metrics.activeVehicles}</p>
          </div>
          <div className="p-1.5 bg-black/30 rounded border border-white/5">
            <p className="text-zinc-400">Active Pedestrians</p>
            <p className="text-white font-bold font-mono text-sm">{metrics.activePedestrians}</p>
          </div>
          <div className="p-1.5 bg-black/30 rounded border border-white/5">
            <p className="text-zinc-400">Vehicles Processed</p>
            <p className="text-white font-bold font-mono text-sm">{metrics.vehiclesProcessed}</p>
          </div>
          <div className="p-1.5 bg-black/30 rounded border border-white/5">
            <p className="text-zinc-400">Pedestrians Processed</p>
            <p className="text-white font-bold font-mono text-sm">{metrics.pedestriansProcessed}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
