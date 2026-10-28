'use client';

import React, { useMemo, useState } from 'react';
import { useSimulationStore } from '@/store/simulationStore';
import { generateExecutiveSummary } from '@/simulation/metrics';
import { CORRIDORS, SCENARIOS } from '@/simulation/corridors';
import { ConflictType } from '@/simulation/types';
import { FileText, Clipboard, CheckCircle, Download, FileSpreadsheet, Eye } from 'lucide-react';

export default function ReportPanel() {
  const baselineRecord = useSimulationStore((s) => s.baselineRecord);
  const currentMetrics = useSimulationStore((s) => s.simState.metrics);
  const simState = useSimulationStore((s) => s.simState);
  const params = useSimulationStore((s) => s.params);
  const [copied, setCopied] = useState(false);
  const [showFullPreview, setShowFullPreview] = useState(false);

  const locationName = CORRIDORS[params.location].name;
  const scenarioName = SCENARIOS[params.scenario].name;

  const baselineMetrics = baselineRecord?.metrics;

  const summary = useMemo(() => {
    if (!baselineMetrics) return null;
    return generateExecutiveSummary(baselineMetrics, currentMetrics, locationName, scenarioName, params.seed);
  }, [baselineMetrics, currentMetrics, locationName, scenarioName, params.seed]);

  const handleCopy = async () => {
    if (summary) {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleExportCSV = () => {
    if (!baselineMetrics) return;

    const rows = [
      ['Report Title', 'Kabankalan City 3D Traffic Microsimulation Comparative Assessment Report'],
      ['Corridor Facility', locationName],
      ['Evaluated Scenario', scenarioName],
      ['Deterministic Seed', params.seed.toString()],
      ['Simulation Duration', `${simState.simTime.toFixed(1)} seconds`],
      ['Methodology', 'Fixed Timestep 0.05s, SSAM-Inspired Analytical Safety Model, Empirical Q95'],
      [],
      ['Metric Parameter', 'Baseline Value', `Intervention (${scenarioName})`, 'Unit', 'Percentage Delta', 'Engineering Definition'],
      ['Average Control Delay', baselineMetrics.controlDelay.toFixed(2), currentMetrics.controlDelay.toFixed(2), 'sec/veh', `${(((currentMetrics.controlDelay - baselineMetrics.controlDelay) / Math.max(baselineMetrics.controlDelay, 0.1)) * 100).toFixed(1)}%`, 'HCM 2010 stopped + deceleration/acceleration delay'],
      ['Average Stopped Delay', baselineMetrics.stoppedDelay.toFixed(2), currentMetrics.stoppedDelay.toFixed(2), 'sec/veh', `${(((currentMetrics.stoppedDelay - baselineMetrics.stoppedDelay) / Math.max(baselineMetrics.stoppedDelay, 0.1)) * 100).toFixed(1)}%`, 'Duration spent with speed < 0.3 m/s'],
      ['HCM Level of Service (LOS)', baselineMetrics.los, currentMetrics.los, 'Grade', currentMetrics.los === baselineMetrics.los ? 'Unchanged' : `${baselineMetrics.los} -> ${currentMetrics.los}`, 'HCM 2010 Facility Grade Threshold'],
      ['Average Queue Length (Meters)', baselineMetrics.averageQueueLength.toFixed(2), currentMetrics.averageQueueLength.toFixed(2), 'meters', `${(((currentMetrics.averageQueueLength - baselineMetrics.averageQueueLength) / Math.max(baselineMetrics.averageQueueLength, 0.1)) * 100).toFixed(1)}%`, 'Mean vehicle footprint + gap under speed < 0.5 m/s'],
      ['Average Queue Length (Vehicles)', baselineMetrics.averageQueueVehicles.toFixed(1), currentMetrics.averageQueueVehicles.toFixed(1), 'vehicles', `${(((currentMetrics.averageQueueVehicles - baselineMetrics.averageQueueVehicles) / Math.max(baselineMetrics.averageQueueVehicles, 0.1)) * 100).toFixed(1)}%`, 'Average discrete queued vehicles'],
      ['Empirical Q95 Back-of-Queue', baselineMetrics.q95QueueLength.toFixed(2), currentMetrics.q95QueueLength.toFixed(2), 'meters', `${(((currentMetrics.q95QueueLength - baselineMetrics.q95QueueLength) / Math.max(baselineMetrics.q95QueueLength, 0.1)) * 100).toFixed(1)}%`, '95th percentile from discrete 1.0s periodic observations'],
      ['Empirical Q95 Vehicles', baselineMetrics.q95QueueVehicles.toString(), currentMetrics.q95QueueVehicles.toString(), 'vehicles', `${currentMetrics.q95QueueVehicles - baselineMetrics.q95QueueVehicles}`, 'Discrete 95th percentile queued vehicles'],
      ['Queue Sample Population', baselineMetrics.queueSampleCount.toString(), currentMetrics.queueSampleCount.toString(), 'samples', 'N/A', 'Count of periodic 1.0s queue measurements'],
      ['Critical Conflict Rate', baselineMetrics.criticalConflictsPerHour.toFixed(2), currentMetrics.criticalConflictsPerHour.toFixed(2), 'conflicts/hr', `${(((currentMetrics.criticalConflictsPerHour - baselineMetrics.criticalConflictsPerHour) / Math.max(baselineMetrics.criticalConflictsPerHour, 0.1)) * 100).toFixed(1)}%`, 'TTC <= 1.5s or PET <= 1.0s deduplicated encounters'],
      ['Vehicle-Pedestrian Conflicts', (baselineMetrics.conflictCounts[ConflictType.VehiclePedestrian] ?? 0).toString(), (currentMetrics.conflictCounts[ConflictType.VehiclePedestrian] ?? 0).toString(), 'events', '', 'Pedestrian crossing trajectory conflicts'],
      ['Crossing Conflicts', (baselineMetrics.conflictCounts[ConflictType.Crossing] ?? 0).toString(), (currentMetrics.conflictCounts[ConflictType.Crossing] ?? 0).toString(), 'events', '', 'Intersecting angle > 60 deg vehicle paths'],
      ['Rear-End Conflicts', (baselineMetrics.conflictCounts[ConflictType.RearEnd] ?? 0).toString(), (currentMetrics.conflictCounts[ConflictType.RearEnd] ?? 0).toString(), 'events', '', 'Same path longitudinal headway deceleration'],
      ['Weaving Conflicts', (baselineMetrics.conflictCounts[ConflictType.Weaving] ?? 0).toString(), (currentMetrics.conflictCounts[ConflictType.Weaving] ?? 0).toString(), 'events', '', 'Merging lateral angle < 60 deg conflicts'],
      ['Crosswalk Encroachments', baselineMetrics.crosswalkViolations.toString(), currentMetrics.crosswalkViolations.toString(), 'violations', `${currentMetrics.crosswalkViolations - baselineMetrics.crosswalkViolations}`, 'Vehicles stationary inside pedestrian crosswalk'],
      ['Simulation Faults Recorded', baselineMetrics.simulationFaults.toString(), currentMetrics.simulationFaults.toString(), 'faults', `${currentMetrics.simulationFaults - baselineMetrics.simulationFaults}`, 'Physical mesh bounding box overlaps'],
      ['Vehicles Processed', currentMetrics.vehiclesProcessed.toString(), currentMetrics.vehiclesProcessed.toString(), 'vehicles', 'Cumulative', 'Total completed trips'],
      ['Pedestrians Processed', currentMetrics.pedestriansProcessed.toString(), currentMetrics.pedestriansProcessed.toString(), 'pedestrians', 'Cumulative', 'Total completed street crossings'],
      ['Unmet Inflow Demand', currentMetrics.unmetDemand.toString(), currentMetrics.unmetDemand.toString(), 'vehicles', 'Cumulative', 'Vehicles waiting due to entry gate spillback'],
    ];

    const csvContent = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `kabankalan_dss_assessment_${params.location}_${params.scenario}_seed${params.seed}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportConflictsLog = () => {
    if (!simState.allConflicts.length) return;

    const rows = [
      ['Conflict_ID', 'Conflict_Type', 'Timestamp_Sec', 'TTC_Sec', 'PET_Sec', 'Entity1_ID', 'Entity2_ID', 'Position_X', 'Position_Z'],
      ...simState.allConflicts.map((c) => [
        c.id,
        c.type,
        c.time.toFixed(2),
        c.ttc.toFixed(2),
        isNaN(c.pet) ? 'N/A' : c.pet.toFixed(2),
        c.entity1Id ?? 'N/A',
        c.entity2Id ?? 'N/A',
        c.position.x.toFixed(2),
        c.position.z.toFixed(2),
      ]),
    ];

    const csvContent = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `ssam_conflict_log_${params.location}_seed${params.seed}.csv`);
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
          Run and save a <span className="text-amber-400 font-semibold">Baseline scenario</span> first to generate the official Civil Engineering Technical Assessment Report.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 h-full overflow-y-auto pr-1 custom-scrollbar text-xs">
      <div className="cad-subcard p-2.5">
        <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10">
          <h3 className="text-[11px] font-bold text-white flex items-center gap-1.5 uppercase tracking-wide">
            <FileText className="w-3.5 h-3.5 text-emerald-400" />
            Technical Assessment Report
          </h3>
          <span className="text-[9px] font-mono text-zinc-400">Seed: {params.seed}</span>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-1.5 mb-2">
          <button
            onClick={handleCopy}
            className="py-1.5 px-2 bg-white/5 hover:bg-white/10 text-zinc-200 border border-white/10 rounded flex items-center justify-center gap-1.5 font-medium transition-all"
          >
            {copied ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> : <Clipboard className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied' : 'Copy Text'}</span>
          </button>
          <button
            onClick={() => setShowFullPreview(!showFullPreview)}
            className="py-1.5 px-2 bg-white/5 hover:bg-white/10 text-zinc-200 border border-white/10 rounded flex items-center justify-center gap-1.5 font-medium transition-all"
          >
            <Eye className="w-3.5 h-3.5 text-sky-400" />
            <span>{showFullPreview ? 'Hide Preview' : 'Preview Report'}</span>
          </button>
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <button
            onClick={handleExportCSV}
            className="py-1.5 px-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 rounded flex items-center justify-center gap-1.5 font-medium transition-all"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Metrics CSV</span>
          </button>
          <button
            onClick={handleExportConflictsLog}
            className="py-1.5 px-2 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/40 rounded flex items-center justify-center gap-1.5 font-medium transition-all"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Conflict Log ({simState.allConflicts.length})</span>
          </button>
        </div>
      </div>

      {/* Report Preview */}
      <div className="cad-subcard p-2.5">
        <p className="text-[10px] text-zinc-400 mb-1.5 uppercase font-medium tracking-wide flex items-center justify-between">
          <span>Executive Summary Preview</span>
          <span className="text-[8px] font-mono text-zinc-500">Plaintext Monospace</span>
        </p>
        <pre className="p-2 rounded bg-black/50 border border-white/5 text-[9px] font-mono text-zinc-300 overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-[360px] custom-scrollbar">
          {summary}
        </pre>
      </div>
    </div>
  );
}
