'use client';

import React from 'react';
import { useSimulationStore } from '@/store/simulationStore';
import { ConflictType } from '@/simulation/types';
import { getLOSColor } from '@/simulation/metrics';
import { SCENARIOS } from '@/simulation/corridors';
import { ArrowRight, ArrowDown, ArrowUp, Minus, BarChart3 } from 'lucide-react';

function DeltaArrow({ baseline, current }: { baseline: number; current: number }) {
  if (Math.abs(baseline - current) < 0.1) {
    return <Minus className="w-3 h-3 text-zinc-500" />;
  }
  // For conflicts and delay, lower is better
  if (current < baseline) {
    return <ArrowDown className="w-3 h-3 text-emerald-400" />;
  }
  return <ArrowUp className="w-3 h-3 text-rose-400" />;
}

function ComparisonRow({
  label,
  baseline,
  current,
  unit,
  lowerIsBetter = true,
}: {
  label: string;
  baseline: number;
  current: number;
  unit: string;
  lowerIsBetter?: boolean;
}) {
  const delta = current - baseline;
  const pctChange = baseline > 0 ? ((delta / baseline) * 100).toFixed(1) : '0.0';
  const improved = lowerIsBetter ? delta < 0 : delta > 0;

  return (
    <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center py-2 border-b border-white/5 last:border-0 text-[11px]">
      <span className="text-zinc-300 font-medium">{label}</span>
      <span className="font-mono text-zinc-400 text-right w-14">
        {baseline.toFixed(1)}{unit}
      </span>
      <ArrowRight className="w-3 h-3 text-zinc-600" />
      <span className={`font-mono text-right w-20 flex items-center justify-end gap-1 ${
        improved ? 'text-emerald-400 font-semibold' : delta === 0 ? 'text-zinc-400' : 'text-rose-400 font-semibold'
      }`}>
        <DeltaArrow baseline={baseline} current={current} />
        {current.toFixed(1)}{unit}
        <span className="text-[9px] font-mono text-zinc-400">({Number(pctChange) > 0 ? '+' : ''}{pctChange}%)</span>
      </span>
    </div>
  );
}

export default function ComparisonCards() {
  const baselineMetrics = useSimulationStore((s) => s.baselineMetrics);
  const currentMetrics = useSimulationStore((s) => s.simState.metrics);
  const params = useSimulationStore((s) => s.params);

  const scenarioName = SCENARIOS[params.scenario].name;

  if (!baselineMetrics) {
    return (
      <div className="cad-subcard p-4 text-center">
        <BarChart3 className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
        <p className="text-xs text-zinc-400 leading-relaxed">
          Run the <span className="text-amber-400 font-semibold">Baseline</span> scenario first, then click{' '}
          <span className="text-amber-400 font-semibold">&quot;Save as Baseline&quot;</span> to evaluate intervention scenario deltas.
        </p>
      </div>
    );
  }

  const baseTotal = Object.values(baselineMetrics.conflictCounts).reduce((a, b) => a + b, 0);
  const curTotal = Object.values(currentMetrics.conflictCounts).reduce((a, b) => a + b, 0);

  return (
    <div className="cad-subcard p-3">
      <h3 className="text-[11px] font-bold text-white flex items-center gap-1.5 mb-2.5 uppercase tracking-wide">
        <BarChart3 className="w-3.5 h-3.5 text-cyan-400" />
        Baseline vs. {scenarioName}
      </h3>

      <div className="mb-2">
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center pb-1.5 mb-1 border-b border-white/10 font-mono text-[9px] text-zinc-400 uppercase">
          <span>Performance Metric</span>
          <span className="text-right w-14">Base</span>
          <span className="w-3" />
          <span className="text-right w-20">Current</span>
        </div>

        <ComparisonRow
          label="Avg. Control Delay"
          baseline={baselineMetrics.averageDelay}
          current={currentMetrics.averageDelay}
          unit="s"
        />
        <ComparisonRow
          label="Queue Backup Length"
          baseline={baselineMetrics.averageQueueLength}
          current={currentMetrics.averageQueueLength}
          unit="m"
        />
        <ComparisonRow
          label="Critical Conflicts/Hr"
          baseline={baselineMetrics.criticalConflictsPerHour}
          current={currentMetrics.criticalConflictsPerHour}
          unit=""
        />
        <ComparisonRow
          label="Total Conflict Count"
          baseline={baseTotal}
          current={curTotal}
          unit=""
        />
        <ComparisonRow
          label="Veh-Ped Conflicts"
          baseline={baselineMetrics.conflictCounts[ConflictType.VehiclePedestrian]}
          current={currentMetrics.conflictCounts[ConflictType.VehiclePedestrian]}
          unit=""
        />
        <ComparisonRow
          label="Crosswalk Obstructions"
          baseline={baselineMetrics.crosswalkViolations ?? 0}
          current={currentMetrics.crosswalkViolations ?? 0}
          unit=""
        />
      </div>

      {/* LOS Comparison Box */}
      <div className="flex items-center justify-center gap-4 mt-3 py-2.5 bg-black/40 rounded border border-white/5 font-mono">
        <div className="text-center">
          <p className="text-[9px] text-zinc-400 uppercase mb-1">Baseline LOS</p>
          <span
            className="text-lg font-black px-2.5 py-0.5 rounded border"
            style={{
              color: getLOSColor(baselineMetrics.los),
              borderColor: getLOSColor(baselineMetrics.los) + '55',
              backgroundColor: getLOSColor(baselineMetrics.los) + '22',
            }}
          >
            {baselineMetrics.los}
          </span>
        </div>
        <ArrowRight className="w-4 h-4 text-zinc-500" />
        <div className="text-center">
          <p className="text-[9px] text-zinc-400 uppercase mb-1">Current LOS</p>
          <span
            className="text-lg font-black px-2.5 py-0.5 rounded border"
            style={{
              color: getLOSColor(currentMetrics.los),
              borderColor: getLOSColor(currentMetrics.los) + '55',
              backgroundColor: getLOSColor(currentMetrics.los) + '22',
            }}
          >
            {currentMetrics.los}
          </span>
        </div>
      </div>
    </div>
  );
}
