'use client';

import React, { useState } from 'react';
import { HelpCircle, ChevronDown, ChevronUp, Layers } from 'lucide-react';

export default function OverlayLegend() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="absolute top-14 left-4 z-20 font-sans">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="cad-panel px-2.5 py-1 text-[10px] font-semibold flex items-center gap-1.5 text-zinc-300 hover:text-white transition-all shadow-lg border border-white/10"
      >
        <Layers className="w-3.5 h-3.5 text-blue-400" />
        <span>3D GIS Legend</span>
        {isOpen ? <ChevronUp className="w-3 h-3 text-zinc-400" /> : <ChevronDown className="w-3 h-3 text-zinc-400" />}
      </button>

      {isOpen && (
        <div className="mt-1.5 p-3 cad-panel shadow-2xl border border-white/15 w-64 text-[10px] text-zinc-300 space-y-2 select-text">
          <div className="font-bold text-white uppercase tracking-wider text-[9px] border-b border-white/10 pb-1 mb-1.5 flex justify-between">
            <span>Visual Elements Guide</span>
            <span className="text-zinc-500 font-mono">1:1 Metric</span>
          </div>

          <div>
            <div className="font-semibold text-zinc-200 mb-1">Vehicle Classification:</div>
            <div className="grid grid-cols-2 gap-1 text-[9px] font-mono">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2 rounded-xs bg-[#f59e0b]" />
                <span>Ceres Bus (12m)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2 rounded-xs bg-[#ea580c]" />
                <span>Jeepney PUJ (6.5m)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2 rounded-xs bg-[#ef4444]" />
                <span>Tricycle (2.2m)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2 rounded-xs bg-[#3b82f6]" />
                <span>Private Car (4.8m)</span>
              </div>
            </div>
          </div>

          <div className="border-t border-white/10 pt-1.5">
            <div className="font-semibold text-zinc-200 mb-1">GIS Simulation Overlays:</div>
            <div className="space-y-1 text-[9px]">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2 rounded-xs bg-rose-500/80" />
                <span>Conflict Heatspot (TTC ≤ 1.5s / PET ≤ 1.0s)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2 rounded-xs bg-cyan-400/80" />
                <span>AASHTO 6.5m Turning Swept Envelope</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2 rounded-xs bg-amber-400" />
                <span>DPWH Broken/Solid Road Centerlines</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2 rounded-xs bg-purple-500" />
                <span>Intersection Conflict Zone & Stop Bar</span>
              </div>
            </div>
          </div>

          <div className="border-t border-white/10 pt-1.5 text-[8px] text-zinc-500 font-mono leading-tight">
            Click on any vehicle in the 3D scene to inspect real-time maneuver state, IDM kinematics, and right-of-way arbitration.
          </div>
        </div>
      )}
    </div>
  );
}
