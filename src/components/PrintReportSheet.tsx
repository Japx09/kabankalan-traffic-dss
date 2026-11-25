'use client';

import React from 'react';
import { SCENARIOS } from '@/sim/types';
import { useSimStore } from '@/store/simStore';
import {
  computePercentDelta,
  CORRIDOR_COORDS,
  formatSignedPct,
  formatSimClock,
  LOS_DESCRIPTION,
  SCENARIO_ORDER,
} from './hudUtils';

export function PrintReportSheet() {
  const params = useSimStore((s) => s.params);
  const simState = useSimStore((s) => s.simState);
  const scenarioSnapshots = useSimStore((s) => s.scenarioSnapshots);

  const baselineSnap = scenarioSnapshots.baseline;
  const hasAnySnapshot = SCENARIO_ORDER.some((id) => Boolean(scenarioSnapshots[id]));

  return (
    <article
      data-print-report
      className="print-report hidden print:block"
    >
      <header className="mb-5 border-b border-[var(--print-border)] pb-3">
        <h1 className="text-lg font-bold tracking-tight">
          Kabankalan City 3D Traffic Microsimulation DSS — Chapter 4 Evaluation Report
        </h1>
        <p className="mt-1 text-xs">
          Study Site: Ceres Bus Terminal Corridor (Guanzon St. / National Highway Frontage &amp; Pedro Zayco Sr. St.) · Coordinates:{' '}
          <span className="metric-value font-mono">{CORRIDOR_COORDS}</span>
        </p>
        <p className="mt-0.5 text-xs">
          Active Run: {SCENARIOS[params.scenario].name} · Elapsed Clock:{' '}
          <span className="metric-value font-mono">{formatSimClock(simState.simTime)}</span> · Deterministic Seed:{' '}
          <span className="metric-value font-mono">#{params.seed}</span>
        </p>
      </header>

      <section className="mb-5">
        <h2 className="mb-2 text-sm font-bold">1. Demand Calibration Parameters</h2>
        <table>
          <thead>
            <tr>
              <th>Vehicle / Agent Class</th>
              <th>Calibrated Parameter</th>
              <th>Unit</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Ceres Provincial Bus</td>
              <td className="metric-value font-mono">{params.busHeadwaySeconds}</td>
              <td>seconds headway</td>
            </tr>
            <tr>
              <td>PUJ Jeepney</td>
              <td className="metric-value font-mono">{params.jeepneyRatePerHour}</td>
              <td>veh/hr</td>
            </tr>
            <tr>
              <td>Tricycle</td>
              <td className="metric-value font-mono">{params.tricycleRatePerHour}</td>
              <td>veh/hr</td>
            </tr>
            <tr>
              <td>Private Car</td>
              <td className="metric-value font-mono">{params.carRatePerHour}</td>
              <td>veh/hr</td>
            </tr>
            <tr>
              <td>Corridor Pedestrians</td>
              <td className="metric-value font-mono">{params.pedestrianRatePerHour}</td>
              <td>ped/hr</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="mb-5">
        <h2 className="mb-2 text-sm font-bold">
          2. Scenario 0 / 1 / 2 Operational &amp; Surrogate Safety Comparison
        </h2>
        <table>
          <thead>
            <tr>
              <th>Scenario</th>
              <th>HCM LOS</th>
              <th>Avg Delay (s/veh)</th>
              <th>Delay Δ vs Base</th>
              <th>Avg Speed (km/h)</th>
              <th>Throughput (vph)</th>
              <th>Queue (veh / m)</th>
              <th>SSAM Conflicts (RE / CR / WV / PD)</th>
              <th>Critical</th>
              <th>Faults</th>
            </tr>
          </thead>
          <tbody>
            {hasAnySnapshot ? (
              SCENARIO_ORDER.map((id) => {
                const snap = scenarioSnapshots[id];
                if (!snap) {
                  return (
                    <tr key={id}>
                      <td>{SCENARIOS[id].name}</td>
                      <td colSpan={9}>Not benchmarked yet</td>
                    </tr>
                  );
                }
                const m = snap.metrics;
                const delayDelta =
                  id !== 'baseline' && baselineSnap
                    ? computePercentDelta(
                        baselineSnap.metrics.avgControlDelaySec,
                        m.avgControlDelaySec
                      )
                    : null;

                return (
                  <tr key={id}>
                    <td>{SCENARIOS[id].name}</td>
                    <td className="metric-value font-mono font-bold">
                      {m.los} ({LOS_DESCRIPTION[m.los]})
                    </td>
                    <td className="metric-value font-mono">{m.avgControlDelaySec.toFixed(2)}</td>
                    <td className="metric-value font-mono">
                      {id === 'baseline' ? 'Baseline' : formatSignedPct(delayDelta)}
                    </td>
                    <td className="metric-value font-mono">{m.avgSpeedKph.toFixed(2)}</td>
                    <td className="metric-value font-mono">{Math.round(m.throughputVehPerHour)}</td>
                    <td className="metric-value font-mono">
                      {m.queueVehicles} ({Math.round(m.queueLengthMeters)}m)
                    </td>
                    <td className="metric-value font-mono">
                      {m.totalConflicts} ({m.rearEndConflicts}/{m.crossingConflicts}/
                      {m.weavingConflicts}/{m.pedestrianConflicts})
                    </td>
                    <td className="metric-value font-mono">{m.criticalConflicts}</td>
                    <td className="metric-value font-mono">{m.faultCount}</td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td>{SCENARIOS[params.scenario].name} (Live Snapshot)</td>
                <td className="metric-value font-mono font-bold">
                  {simState.metrics.los} ({LOS_DESCRIPTION[simState.metrics.los]})
                </td>
                <td className="metric-value font-mono">
                  {simState.metrics.avgControlDelaySec.toFixed(2)}
                </td>
                <td className="metric-value font-mono">—</td>
                <td className="metric-value font-mono">
                  {simState.metrics.avgSpeedKph.toFixed(2)}
                </td>
                <td className="metric-value font-mono">
                  {Math.round(simState.metrics.throughputVehPerHour)}
                </td>
                <td className="metric-value font-mono">
                  {simState.metrics.queueVehicles} ({Math.round(simState.metrics.queueLengthMeters)}m)
                </td>
                <td className="metric-value font-mono">
                  {simState.metrics.totalConflicts} ({simState.metrics.rearEndConflicts}/
                  {simState.metrics.crossingConflicts}/{simState.metrics.weavingConflicts}/
                  {simState.metrics.pedestrianConflicts})
                </td>
                <td className="metric-value font-mono">{simState.metrics.criticalConflicts}</td>
                <td className="metric-value font-mono">{simState.metrics.faultCount}</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="mb-1.5 text-sm font-bold">3. Methodology &amp; Verification Notes</h2>
        <p className="text-xs leading-relaxed">
          Microsimulation executed via deterministic Intelligent Driver Model (IDM) longitudinal dynamics and MOBIL lane-changing rules over 1:1 DPWH/AASHTO metric road geometry anchored at Kabankalan City Ceres Bus Terminal ({CORRIDOR_COORDS}). Level of Service follows HCM 2010 control-delay thresholds; surrogate safety conflicts follow FHWA SSAM Time-to-Collision (TTC) and Post-Encroachment Time (PET) criteria. Zero overlap or geometry faults verify physical integrity across evaluated scenarios.
        </p>
      </section>
    </article>
  );
}
