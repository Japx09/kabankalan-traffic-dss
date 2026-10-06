'use client';

import React, { useMemo } from 'react';
import { useSimulationStore } from '@/store/simulationStore';
import { generateExecutiveSummary } from '@/simulation/metrics';
import { CORRIDORS, SCENARIOS } from '@/simulation/corridors';
import { ConflictType } from '@/simulation/types';
import { FileText, Clipboard, CheckCircle, Download } from 'lucide-react';

export default function ReportPanel() {
  const baselineMetrics = useSimulationStore((s) => s.baselineMetrics);
  const currentMetrics = useSimulationStore((s) => s.simState.metrics);
  const simState = useSimulationStore((s) => s.simState);
  const params = useSimulationStore((s) => s.params);
  const [copied, setCopied] = React.useState(false);

  const locationName = CORRIDORS[params.location].name;
  const scenarioName = SCENARIOS[params.scenario].name;

  const summary = useMemo(() => {
    if (!baselineMetrics) return null;
    return generateExecutiveSummary(baselineMetrics, currentMetrics, locationName, scenarioName);
  }, [baselineMetrics, currentMetrics, locationName, scenarioName]);

  const handleCopy = async () => {
    if (summary) {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleExportCSV = () => {
    if (!baselineMetrics) return;

    // 1. Metric Summary CSV
    const rows = [
      ['Metric Parameter', 'Baseline Value', `Intervention (${scenarioName})`, 'Unit', 'Percentage Delta'],
      ['Average Control Delay', baselineMetrics.averageDelay.toFixed(2), currentMetrics.averageDelay.toFixed(2), 'sec/veh', `${(((currentMetrics.averageDelay - baselineMetrics.averageDelay) / Math.max(baselineMetrics.averageDelay, 0.1)) * 100).toFixed(1)}%`],
      ['HCM Level of Service (LOS)', baselineMetrics.los, currentMetrics.los, 'Grade', currentMetrics.los === baselineMetrics.los ? 'Unchanged' : `${baselineMetrics.los} -> ${currentMetrics.los}`],
      ['Average Queue Length', baselineMetrics.averageQueueLength.toFixed(2), currentMetrics.averageQueueLength.toFixed(2), 'meters', `${(((currentMetrics.averageQueueLength - baselineMetrics.averageQueueLength) / Math.max(baselineMetrics.averageQueueLength, 0.1)) * 100).toFixed(1)}%`],
      ['HCM Q95 Back-of-Queue', (baselineMetrics.q95QueueLength ?? baselineMetrics.averageQueueLength * 1.68).toFixed(2), (currentMetrics.q95QueueLength ?? currentMetrics.averageQueueLength * 1.68).toFixed(2), 'meters', `${(((currentMetrics.q95QueueLength - baselineMetrics.q95QueueLength) / Math.max(baselineMetrics.q95QueueLength, 0.1)) * 100).toFixed(1)}%`],
      ['Critical Conflict Rate', baselineMetrics.criticalConflictsPerHour.toFixed(2), currentMetrics.criticalConflictsPerHour.toFixed(2), 'conflicts/hr', `${(((currentMetrics.criticalConflictsPerHour - baselineMetrics.criticalConflictsPerHour) / Math.max(baselineMetrics.criticalConflictsPerHour, 0.1)) * 100).toFixed(1)}%`],
      ['Crosswalk Encroachments', baselineMetrics.crosswalkViolations.toString(), currentMetrics.crosswalkViolations.toString(), 'violations', `${currentMetrics.crosswalkViolations - baselineMetrics.crosswalkViolations}`],
      ['Vehicle-Pedestrian Conflicts', (baselineMetrics.conflictCounts[ConflictType.VehiclePedestrian] ?? 0).toString(), (currentMetrics.conflictCounts[ConflictType.VehiclePedestrian] ?? 0).toString(), 'events', ''],
      ['Crossing Conflicts', (baselineMetrics.conflictCounts[ConflictType.Crossing] ?? 0).toString(), (currentMetrics.conflictCounts[ConflictType.Crossing] ?? 0).toString(), 'events', ''],
      ['Rear-End Conflicts', (baselineMetrics.conflictCounts[ConflictType.RearEnd] ?? 0).toString(), (currentMetrics.conflictCounts[ConflictType.RearEnd] ?? 0).toString(), 'events', ''],
      ['Weaving Conflicts', (baselineMetrics.conflictCounts[ConflictType.Weaving] ?? 0).toString(), (currentMetrics.conflictCounts[ConflictType.Weaving] ?? 0).toString(), 'events', ''],
      ['Total Vehicles Processed', currentMetrics.vehiclesProcessed.toString(), currentMetrics.vehiclesProcessed.toString(), 'vehicles', 'Cumulative'],
      ['Total Pedestrians Processed', currentMetrics.pedestriansProcessed.toString(), currentMetrics.pedestriansProcessed.toString(), 'pedestrians', 'Cumulative'],
    ];

    const csvContent = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `kabankalan_dss_assessment_${params.location}_${params.scenario}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportConflictsLog = () => {
    if (!simState.allConflicts.length) return;

    const rows = [
      ['Conflict_ID', 'Conflict_Type', 'Timestamp_Seconds', 'TTC_Seconds', 'PET_Seconds', 'Position_X', 'Position_Z'],
      ...simState.allConflicts.map((c) => [
        c.id,
        c.type,
        c.time.toFixed(2),
        c.ttc.toFixed(2),
        isNaN(c.pet) ? 'N/A' : c.pet.toFixed(2),
        c.position.x.toFixed(2),
        c.position.z.toFixed(2),
      ]),
    ];

    const csvContent = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `ssam_conflict_log_${params.location}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (!summary) {
    return (
      <div className="cad-subcard p-4 text-center">
        <FileText className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
        <p className="text-xs text-zinc-400 leading-relaxed">
          Run and save a <span className="text-amber-400 font-semibold">Baseline scenario</span> to generate the official Civil Engineering Technical Assessment Report.
        </p>
      </div>
    );
  }

  return (
    <div className="cad-subcard p-3 flex flex-col h-full">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[11px] font-bold text-white flex items-center gap-1.5 uppercase tracking-wide">
          <FileText className="w-3.5 h-3.5 text-emerald-400" />
          Assessment Report
        </h3>
        <div className="flex items-center gap-1">
          <button
            onClick={handleExportCSV}
            className="text-[10px] font-mono flex items-center gap-1 text-emerald-300 hover:text-white px-2 py-0.5 rounded bg-emerald-600/20 border border-emerald-500/40 hover:bg-emerald-600/40 transition-colors"
            title="Download CSV Table for Thesis Chapter 4"
          >
            <Download className="w-3 h-3 text-emerald-400" /> Metrics CSV
          </button>
          <button
            onClick={handleExportConflictsLog}
            className="text-[10px] font-mono flex items-center gap-1 text-sky-300 hover:text-white px-2 py-0.5 rounded bg-sky-600/20 border border-sky-500/40 hover:bg-sky-600/40 transition-colors"
            title="Download Raw SSAM Conflict Log CSV"
          >
            <Download className="w-3 h-3 text-sky-400" /> SSAM CSV
          </button>
          <button
            onClick={handleCopy}
            className="text-[10px] font-mono flex items-center gap-1 text-zinc-400 hover:text-white px-2 py-0.5 rounded bg-white/5 border border-white/5 hover:bg-white/10 transition-colors"
          >
            {copied ? (
              <>
                <CheckCircle className="w-3 h-3 text-emerald-400" /> Copied
              </>
            ) : (
              <>
                <Clipboard className="w-3 h-3" /> Copy
              </>
            )}
          </button>
        </div>
      </div>

      <div className="bg-black/50 rounded p-3 text-[10px] text-zinc-300 leading-relaxed whitespace-pre-wrap flex-1 overflow-y-auto custom-scrollbar font-mono border border-white/5 selection:bg-blue-600 selection:text-white">
        {summary}
      </div>
    </div>
  );
}
