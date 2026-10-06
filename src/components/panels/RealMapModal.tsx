'use client';

import React from 'react';
import { X, MapPin, CheckCircle, AlertTriangle, ShieldCheck } from 'lucide-react';

interface RealMapModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function RealMapModal({ isOpen, onClose }: RealMapModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-[#131b2e] border border-blue-500/30 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-white/5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-500/20 border border-blue-500/40 flex items-center justify-center text-blue-400">
              <MapPin className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                Real Map Reference: Ceres Bus - Kabankalan Station
              </h3>
              <p className="text-xs text-gray-400">
                Pedro Zayco Sr. St., Kabankalan City, Negros Occidental
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-white rounded-lg bg-white/5 hover:bg-white/10 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto custom-scrollbar flex flex-col gap-5">
          {/* Map Layout Diagram & Ground Alignment */}
          <div className="bg-[#0b1120] border border-white/10 rounded-xl p-4 relative">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
                <CheckCircle className="w-3.5 h-3.5" /> 3D Digital Twin Synchronized with Google Maps
              </span>
              <span className="text-[10px] bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded">
                Pedro Zayco Sr. St. Corridor
              </span>
            </div>

            {/* Interactive Schematic representing Google Maps */}
            <div className="relative w-full h-64 bg-slate-900/90 rounded-lg border border-slate-800 p-3 overflow-hidden flex flex-col justify-between">
              {/* North side establishments */}
              <div className="flex justify-between items-start z-10">
                <div className="bg-slate-800/90 border border-orange-500/40 p-1.5 rounded text-[10px] text-orange-300">
                  🏬 A.M. Builders Depot
                </div>
                <div className="bg-slate-800/90 border border-emerald-500/40 p-1.5 rounded text-[10px] text-emerald-300">
                  🏢 Noceco Sub-office
                </div>
                <div className="bg-slate-800/90 border border-amber-500/40 p-1.5 rounded text-[10px] text-amber-300">
                  🎂 Bascon Cakes
                </div>
                <div className="bg-slate-800/90 border border-blue-500/40 p-1.5 rounded text-[10px] text-blue-300">
                  💎 Cebuana Lhuillier
                </div>
                <div className="bg-slate-800/90 border border-red-500/40 p-1.5 rounded text-[10px] text-red-300">
                  💊 Simonne&apos;s Pharmacy
                </div>
                <div className="bg-slate-800/90 border border-cyan-500/40 p-1.5 rounded text-[10px] text-cyan-300">
                  🪟 Modern Glass
                </div>
              </div>

              {/* Highway Road Surface */}
              <div className="my-auto py-2 px-4 bg-slate-800/95 border-y-2 border-dashed border-yellow-500/60 rounded flex flex-col justify-center relative">
                <div className="flex items-center justify-between text-xs text-gray-300 font-semibold mb-1">
                  <span>← To Kabankalan City Proper / Bacolod</span>
                  <span className="text-yellow-400 font-mono tracking-wider">PEDRO ZAYCO SR. ST. (4 LANES)</span>
                  <span>To Mabinay / Dumaguete →</span>
                </div>

                {/* Zebra Stripes Crosswalk 1 & 2 */}
                <div className="flex justify-around items-center py-1">
                  <div className="text-center">
                    <span className="inline-block bg-white text-black text-[9px] font-bold px-1.5 py-0.5 rounded shadow">
                      |||||| TAWIRAN 1 (Frontage)
                    </span>
                    <p className="text-[9px] text-amber-300 mt-0.5">🛑 Stop Line Enforced</p>
                  </div>
                  <div className="text-center">
                    <span className="inline-block bg-white text-black text-[9px] font-bold px-1.5 py-0.5 rounded shadow">
                      |||||| TAWIRAN 2 (Modern Glass)
                    </span>
                    <p className="text-[9px] text-amber-300 mt-0.5">🛑 Stop Line Enforced</p>
                  </div>
                </div>
              </div>

              {/* South side (Ceres Terminal Compound) */}
              <div className="flex justify-between items-end z-10">
                <div className="bg-amber-500/20 border border-amber-500/60 p-2 rounded-lg text-xs text-amber-300 flex items-center gap-2">
                  <span className="text-lg">🚌</span>
                  <div>
                    <p className="font-bold">Ceres Bus - Kabankalan Station</p>
                    <p className="text-[10px] text-gray-400">Terminal compound, bus ingress/egress & dispatch bays</p>
                  </div>
                </div>

                <div className="bg-sky-500/20 border border-sky-500/60 p-2 rounded-lg text-xs text-sky-300 flex items-center gap-2">
                  <span className="text-lg">🏪</span>
                  <div>
                    <p className="font-bold">Ceres Mart</p>
                    <p className="text-[10px] text-gray-400">Frontage convenience store & drop-off</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Traffic Rules Enforced for Vehicles */}
          <div>
            <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Mga Panuntunan sa Trapiko (&quot;Bawal sa Sasakyan sa Simulation&quot;)
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              <div className="bg-red-500/10 border border-red-500/30 p-3 rounded-xl flex gap-2.5">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <div>
                  <h5 className="text-xs font-bold text-red-300">1. Bawal Huminto sa Walking Lane (Crosswalk Keep-Clear)</h5>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    Kapag mabagal o barado ang trapiko sa unahan, obligado ang sasakyan na maghintay <strong>bago ang Stop Bar</strong>. Bawal pumasok kung maiipit lang sa gitna ng pedestrian zebra lines.
                  </p>
                </div>
              </div>

              <div className="bg-amber-500/10 border border-amber-500/30 p-3 rounded-xl flex gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <h5 className="text-xs font-bold text-amber-300">2. Bawal Magbaba/Magsakay sa Tapat ng Tawiran</h5>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    Ang mga bus, jeepney, at tricycle ay bawal mag-dwell sa loob ng 8 metro mula sa tawiran. Sa halip, sa designated Ceres Loading Bay lamang dapat magsakay at magbaba.
                  </p>
                </div>
              </div>

              <div className="bg-blue-500/10 border border-blue-500/30 p-3 rounded-xl flex gap-2.5">
                <CheckCircle className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                <div>
                  <h5 className="text-xs font-bold text-blue-300">3. Obligadong Yield sa Tumatawid na Pedestrian</h5>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    Kapag may pedestrian na tumatawid o naghihintay sa tawiran, awtomatikong nagpe-preno at humihinto ang sasakyan 2.5 metro bago ang tawiran (sa Stop Line).
                  </p>
                </div>
              </div>

              <div className="bg-emerald-500/10 border border-emerald-500/30 p-3 rounded-xl flex gap-2.5">
                <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <h5 className="text-xs font-bold text-emerald-300">4. Real-time Violation Monitoring</h5>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    Kung may sumuway at humarang sa tawiran, magkakaroon ito ng kumikislap na pulang marker at itatala sa &quot;Crosswalk Obstructions&quot; metric ng Kabankalan DSS.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-white/10 bg-white/5 flex justify-end">
          <button onClick={onClose} className="btn-primary text-xs px-4 py-1.5">
            Bumalik sa 3D Simulation
          </button>
        </div>
      </div>
    </div>
  );
}
