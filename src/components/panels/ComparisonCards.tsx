'use client';

import React from 'react';
import { useSimulationStore } from '@/store/simulationStore';
import { ConflictType } from '@/simulation/types';
import { SCENARIOS, CORRIDORS } from '@/simulation/corridors';
import { ArrowRight, ArrowDown, ArrowUp, Minus, BarChart3, AlertTriangle, CheckCircle2 } from 'lucide-react';

function DeltaArrow({ baseline, current, lowerIsBetter = true }: { baseline: number; current: number; lowerIsBetter?: boolean }) {
  if (Math.abs(baseline - current) < 0.05) {
    return <Minus className="w-3 h-3 text-zinc-500" />;
  }
  const improved = lowerIsBetter ? current < baseline : current > baseline;
  if (improved) {
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

  let pctDisplay = '0.0%';
  if (baseline === 0) {
    if (current === 0) {
      pctDisplay = '0.0%';
    } else {
      pctDisplay = `+${current.toFixed(1)} (new)`;
    }
  } else {
    const pct = ((delta / baseline) * 100).toFixed(1);
    pctDisplay = `${delta > 0 ? '+' : ''}${pct}%`;
  }

  const improved = lowerIsBetter ? delta < -0.05 : delta > 0.05;
  const unchanged = Math.abs(delta) <= 0.05;

  return (
    <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center py-2 border-b border-white/5 last:border-0 text-[11px]">
      <span className="text-zinc-300 font-medium">{label}</span>
      <span className="font-mono text-zinc-400 text-right w-14">
        {baseline.toFixed(1)}{unit}
      </span>
      <ArrowRight className="w-3 h-3 text-zinc-600" />
      <span
        className={`font-mono text-right w-24 flex items-center justify-end gap-1 ${
          unchanged
            ? 'text-zinc-400'
            : improved
            ? 'text-emerald-400 font-semibold'
            : 'text-rose-400 font-semibold'
        }`}
      >
        <DeltaArrow baseline={baseline} current={current} lowerIsBetter={lowerIsBetter} />
        {current.toFixed(1)}{unit}
        <span className="text-[9px] font-mono text-zinc-400">({pctDisplay})</span>
      </span>
    </div>
  );
}

export default function ComparisonCards() {
  const baselineRecord = useSimulationStore((s) => s.baselineRecord);
  const currentMetrics = useSimulationStore((s) => s.simState.metrics);
  const params = useSimulationStore((s) => s.params);

  if (!baselineRecord) {
    return (
      <div className="cad-subcard p-4 text-center">
        <BarChart3 className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
        <p className="text-xs text-zinc-400 leading-relaxed">
          Run the <span className="text-amber-400 font-semibold">Baseline</span> scenario first, then click{' '}
          <span className="text-amber-400 font-semibold">&quot;Save as Baseline&quot;</span> in the Controls panel to evaluate intervention scenario deltas.
        </p>
      </div>
    );
  }

  const baseMetrics = baselineRecord.metrics;
  const baseScenarioName = SCENARIOS[baselineRecord.params.scenario].name;
  const curScenarioName = SCENARIOS[params.scenario].name;

  // Comparability validation check
  const isCorridorMismatch = baselineRecord.params.location !== params.location;
  const isSeedMismatch = baselineRecord.params.seed !== params.seed;

  const baseTotalConflicts = Object.values(baseMetrics.conflictCounts).reduce((a, b) => a + b, 0);
  const curTotalConflicts = Object.values(currentMetrics.conflictCounts).reduce((a, b) => a + b, 0);

  return (
    <div className="cad-subcard p-3">
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10">
        <h3 className="text-[11px] font-bold text-white flex items-center gap-1.5 uppercase tracking-wide">
          <BarChart3 className="w-3.5 h-3.5 text-cyan-400" />
          {baseScenarioName} vs. {curScenarioName}
        </h3>
        <span className="text-[9px] font-mono text-zinc-400">Recorded: {baselineRecord.capturedAt}</span>
      </div>

      {/* Fairness & Comparability Warnings */}
      {isCorridorMismatch && (
        <div className="p-2 mb-2 rounded bg-rose-500/10 border border-rose-500/30 text-[10px] text-rose-300 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>
            Corridor Mismatch: Baseline is on &quot;{CORRIDORS[baselineRecord.params.location].name}&quot;, current run is on &quot;{CORRIDORS[params.location].name}&quot;.
          </span>
        </div>
      )}

      {isSeedMismatch && !isCorridorMismatch && (
        <div className="p-1.5 mb-2 rounded bg-amber-500/10 border border-amber-500/30 text-[9px] text-amber-300 flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
          <span>Notice: PRNG seed differs (Baseline: {baselineRecord.params.seed}, Current: {params.seed}).</span>
        </div>
      )}

      {/* Performance Delta Table */}
      <div className="mb-2">
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center pb-1.5 mb-1 border-b border-white/10 font-mono text-[9px] text-zinc-400 uppercase">
          <span>Performance Metric</span>
          <span className="text-right w-14">Base</span>
          <span className="w-3" />
          <span className="text-right w-24">Intervention</span>
        </div>

        <ComparisonRow
          label="Avg Control Delay"
          baseline={baseMetrics.controlDelay}
          current={currentMetrics.controlDelay}
          unit="s"
          lowerIsBetter={true}
        />

        <ComparisonRow
          label="Avg Stopped Delay"
          baseline={baseMetrics.stoppedDelay}
          current={currentMetrics.stoppedDelay}
          unit="s"
          lowerIsBetter={true}
        />

        <ComparisonRow
          label="Empirical Q95 Queue"
          baseline={baseMetrics.q95QueueLength}
          current={currentMetrics.q95QueueLength}
          unit="m"
          lowerIsBetter={true}
        />

        <ComparisonRow
          label="Critical Conflict Rate"
          baseline={baseMetrics.criticalConflictsPerHour}
          current={currentMetrics.criticalConflictsPerHour}
          unit="/h"
          lowerIsBetter={true}
        />

        <ComparisonRow
          label="Total Conflicts"
          baseline={baseTotalConflicts}
          current={curTotalConflicts}
          unit=""
          lowerIsBetter={true}
        />

        <ComparisonRow
          label="Crosswalk Blocks"
          baseline={baseMetrics.crosswalkViolations}
          current={currentMetrics.crosswalkViolations}
          unit=""
          lowerIsBetter={true}
        />

        <ComparisonRow
          label="Simulation Faults"
          baseline={baseMetrics.simulationFaults}
          current={currentMetrics.simulationFaults}
          unit=""
          lowerIsBetter={true}
        />
      </div>

      <div className="p-2 rounded bg-black/40 border border-white/5 text-[10px] text-zinc-400 font-mono leading-relaxed">
        <div className="flex items-center gap-1.5 text-zinc-300 font-semibold mb-1">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          <span>Audit Conclusion</span>
        </div>
        Level of Service: <span className="font-bold text-white">{baseMetrics.los}</span> &rarr; <span className="font-bold text-emerald-400">{currentMetrics.los}</span>.
        {currentMetrics.controlDelay < baseMetrics.controlDelay
          ? ` Intervention yields ${(baseMetrics.controlDelay - currentMetrics.controlDelay).toFixed(1)}s delay reduction.`
          : ' Baseline demonstrates lower or equivalent control delay.'}
      </div>
    </div>
  );
}
