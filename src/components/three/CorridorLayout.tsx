'use client';

import React, { useMemo } from 'react';
import Road from './Road';
import Sidewalk from './Sidewalk';
import Crosswalk from './Crosswalk';
import LoadingBay from './LoadingBay';
import RealWorldLandmarks from './RealWorldLandmarks';
import { CorridorConfig, LocationId } from '@/simulation/types';

interface CorridorLayoutProps {
  corridor: CorridorConfig;
}

interface Interval {
  start: number;
  end: number;
}

// ─── DPWH Standard Dimensions (1:1 Metric Scale) ────────────────────────────
const TOTAL_ROADWAY_WIDTH = 9.70; // Carriageway + 2 shoulders
const HALF_ROAD = TOTAL_ROADWAY_WIDTH / 2; // 4.85m
const SIDEWALK_WIDTH = 1.80; // Clear path
const CURB_WIDTH = 0.22;
const VERGE_Z_OFFSET = HALF_ROAD + SIDEWALK_WIDTH + CURB_WIDTH + 2.0; // 8.87m center of verge

// Layer Elevations
const LAYER_0_TERRAIN = 0.00;
const LAYER_4_VERGE = 0.01; // Slightly above ground
const LAYER_4_STRUCTURE = 0.20;

function computeGrassSegments(totalStart: number, totalEnd: number, cuts: Interval[]): Interval[] {
  const sorted = [...cuts]
    .filter((c) => c.end > totalStart && c.start < totalEnd)
    .sort((a, b) => a.start - b.start);

  const merged: Interval[] = [];
  for (const c of sorted) {
    if (!merged.length) {
      merged.push({ ...c });
    } else {
      const prev = merged[merged.length - 1];
      if (c.start <= prev.end + 0.1) {
        prev.end = Math.max(prev.end, c.end);
      } else {
        merged.push({ ...c });
      }
    }
  }

  const segments: Interval[] = [];
  let cur = totalStart;
  for (const cut of merged) {
    const cutStart = Math.max(totalStart, cut.start);
    const cutEnd = Math.min(totalEnd, cut.end);
    if (cutStart > cur + 1.2) {
      segments.push({ start: cur, end: cutStart });
    }
    cur = Math.max(cur, cutEnd);
  }
  if (cur < totalEnd - 1.2) {
    segments.push({ start: cur, end: totalEnd });
  }
  return segments;
}

/** ─── Ceres Terminal Contextual Backdrop (Authentic Two-Gate Compound) ─── */
function CeresTerminalBackdrop({ corridor }: { corridor: CorridorConfig }) {
  const fenceZ = HALF_ROAD + SIDEWALK_WIDTH + CURB_WIDTH + 0.3; // 7.17m

  const gate1X = corridor.terminalYard?.gate1X ?? 151;
  const gate1W = corridor.terminalYard?.gate1Width ?? 12;
  const gate1Min = gate1X - gate1W / 2;
  const gate1Max = gate1X + gate1W / 2;

  const gate2X = corridor.terminalYard?.gate2X ?? 103;
  const gate2W = corridor.terminalYard?.gate2Width ?? 12;
  const gate2Min = gate2X - gate2W / 2;
  const gate2Max = gate2X + gate2W / 2;

  const yard = corridor.terminalYard ?? { x: 128, z: 24, width: 64, depth: 36 };

  return (
    <group>
      {/* ── Highway Frontage Perimeter Fence (Strictly leaves Gate 1, Gate 2, Repollo clear) ── */}
      {Array.from({ length: Math.floor(corridor.length / 4) }).map((_, i) => {
        const px = i * 4 + 2;
        // Leave clear openings for Gate 2, Gate 1, and Repollo St
        if (px >= gate2Min - 2 && px <= gate2Max + 2) return null;
        if (px >= gate1Min - 2 && px <= gate1Max + 2) return null;
        if (px >= 172 && px <= 188) return null;

        return (
          <group key={`ceres-fence-${i}`} position={[px, LAYER_4_STRUCTURE, fenceZ]}>
            {/* Post */}
            <mesh position={[0, 0.7, 0]} castShadow>
              <cylinderGeometry args={[0.05, 0.05, 1.4, 6]} />
              <meshStandardMaterial color="#334155" metalness={0.7} />
            </mesh>
            {/* Horizontal rails */}
            <mesh position={[2, 0.5, 0]}>
              <boxGeometry args={[4, 0.04, 0.04]} />
              <meshStandardMaterial color="#475569" metalness={0.5} />
            </mesh>
            <mesh position={[2, 1.1, 0]}>
              <boxGeometry args={[4, 0.04, 0.04]} />
              <meshStandardMaterial color="#475569" metalness={0.5} />
            </mesh>
          </group>
        );
      })}

      {/* ── Gate 1: INGRESS / ENTRANCE Arch & Pillars (x: 151m) ── */}
      <group position={[0, LAYER_4_STRUCTURE, fenceZ]}>
        <mesh position={[gate1Min - 0.6, 2.4, 0]} castShadow>
          <boxGeometry args={[1.2, 4.8, 1.2]} />
          <meshStandardMaterial color="#1e3a8a" roughness={0.5} />
        </mesh>
        <mesh position={[gate1Max + 0.6, 2.4, 0]} castShadow>
          <boxGeometry args={[1.2, 4.8, 1.2]} />
          <meshStandardMaterial color="#1e3a8a" roughness={0.5} />
        </mesh>
        <mesh position={[gate1X, 4.5, 0]} castShadow>
          <boxGeometry args={[gate1W + 2.4, 0.8, 0.7]} />
          <meshStandardMaterial color="#10b981" roughness={0.4} />
        </mesh>
      </group>

      {/* ── Gate 2: EGRESS / EXIT Arch & Pillars (x: 103m) ── */}
      <group position={[0, LAYER_4_STRUCTURE, fenceZ]}>
        <mesh position={[gate2Min - 0.6, 2.4, 0]} castShadow>
          <boxGeometry args={[1.2, 4.8, 1.2]} />
          <meshStandardMaterial color="#1e3a8a" roughness={0.5} />
        </mesh>
        <mesh position={[gate2Max + 0.6, 2.4, 0]} castShadow>
          <boxGeometry args={[1.2, 4.8, 1.2]} />
          <meshStandardMaterial color="#1e3a8a" roughness={0.5} />
        </mesh>
        <mesh position={[gate2X, 4.5, 0]} castShadow>
          <boxGeometry args={[gate2W + 2.4, 0.8, 0.7]} />
          <meshStandardMaterial color="#f59e0b" roughness={0.4} />
        </mesh>
      </group>

      {/* ── Passenger Alighting Platform Canopy (inside Gate 1 at x: 142m, z: 18m) ── */}
      <group position={[142, LAYER_4_STRUCTURE, 18.0]}>
        {/* Canopy Roof */}
        <mesh position={[0, 4.2, -2.8]} castShadow>
          <boxGeometry args={[16.0, 0.25, 5.0]} />
          <meshStandardMaterial color="#0284c7" roughness={0.5} />
        </mesh>
        {/* Canopy Structural Steel Columns */}
        {[-7, 0, 7].map((px, i) => (
          <mesh key={`canopy-col-${i}`} position={[px, 2.1, -5.0]} castShadow>
            <cylinderGeometry args={[0.12, 0.12, 4.2, 8]} />
            <meshStandardMaterial color="#64748b" metalness={0.7} />
          </mesh>
        ))}
      </group>

      {/* ── Off-Street Staging Compound Security Perimeter Wall ── */}
      {/* West Wall */}
      <mesh
        position={[yard.x - yard.width / 2, LAYER_4_STRUCTURE + 1.2, yard.z]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[0.5, 2.4, yard.depth]} />
        <meshStandardMaterial color="#334155" roughness={0.8} />
      </mesh>
      {/* East Wall */}
      <mesh
        position={[yard.x + yard.width / 2, LAYER_4_STRUCTURE + 1.2, yard.z]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[0.5, 2.4, yard.depth]} />
        <meshStandardMaterial color="#334155" roughness={0.8} />
      </mesh>
      {/* South Rear Wall */}
      <mesh
        position={[yard.x, LAYER_4_STRUCTURE + 1.2, yard.z + yard.depth / 2]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[yard.width, 2.4, 0.5]} />
        <meshStandardMaterial color="#334155" roughness={0.8} />
      </mesh>
    </group>
  );
}

/** ─── KCC Frontage Contextual Backdrop (1:1 Metric Scale) ─── */
function KCCFrontageBackdrop({ corridor }: { corridor: CorridorConfig }) {
  const length = corridor.length;
  const northZ = -(HALF_ROAD + SIDEWALK_WIDTH + CURB_WIDTH + 0.3);

  return (
    <group>
      {/* ── KCC School Gate & Perimeter Wall ── */}
      <mesh position={[length * 0.22, LAYER_4_STRUCTURE + 1.2, northZ]} castShadow>
        <boxGeometry args={[length * 0.38, 2.4, 0.4]} />
        <meshStandardMaterial color="#334155" roughness={0.7} />
      </mesh>
      <mesh position={[length * 0.78, LAYER_4_STRUCTURE + 1.2, northZ]} castShadow>
        <boxGeometry args={[length * 0.38, 2.4, 0.4]} />
        <meshStandardMaterial color="#334155" roughness={0.7} />
      </mesh>

      {/* Grand Entrance Pillars */}
      <mesh position={[length * 0.46, LAYER_4_STRUCTURE + 2.0, northZ]} castShadow>
        <boxGeometry args={[1.2, 4.0, 1.2]} />
        <meshStandardMaterial color="#0284c7" roughness={0.5} />
      </mesh>
      <mesh position={[length * 0.54, LAYER_4_STRUCTURE + 2.0, northZ]} castShadow>
        <boxGeometry args={[1.2, 4.0, 1.2]} />
        <meshStandardMaterial color="#0284c7" roughness={0.5} />
      </mesh>
      <mesh position={[length * 0.5, LAYER_4_STRUCTURE + 3.8, northZ]} castShadow>
        <boxGeometry args={[15.0, 0.8, 0.5]} />
        <meshStandardMaterial color="#0369a1" roughness={0.4} />
      </mesh>

      {/* ── Student Pedestrian Sidewalk Safety Guardrails ── */}
      {Array.from({ length: Math.floor(corridor.length / 3) }).map((_, i) => {
        const gx = i * 3 + 1.5;
        if (gx >= 76 && gx <= 84) return null; // Gap for zebra crosswalk

        return (
          <group key={`kcc-guardrail-${i}`} position={[gx, LAYER_4_STRUCTURE, -(HALF_ROAD + 0.2)]}>
            <mesh position={[0, 0.5, 0]} castShadow>
              <cylinderGeometry args={[0.04, 0.04, 1.0, 6]} />
              <meshStandardMaterial color="#fbbf24" roughness={0.4} />
            </mesh>
            <mesh position={[1.5, 0.9, 0]}>
              <boxGeometry args={[3.0, 0.05, 0.05]} />
              <meshStandardMaterial color="#fbbf24" roughness={0.4} />
            </mesh>
            <mesh position={[1.5, 0.45, 0]}>
              <boxGeometry args={[3.0, 0.05, 0.05]} />
              <meshStandardMaterial color="#fbbf24" roughness={0.4} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

/** ─── Public Market Contextual Backdrop (1:1 Metric Scale) ─── */
function PublicMarketBackdrop({ corridor }: { corridor: CorridorConfig }) {
  const length = corridor.length;
  const northBuildingZ = -(HALF_ROAD + SIDEWALK_WIDTH + 10.0);
  const awningColors = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'];

  return (
    <group>
      {/* ── North Side Commercial Shophouses ── */}
      {Array.from({ length: 6 }).map((_, i) => {
        const bx = i * 26 + 18;
        const h = 8.5 + (i % 3) * 1.5;
        return (
          <group key={`mkt-north-bldg-${i}`} position={[bx, LAYER_4_STRUCTURE, northBuildingZ]}>
            <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
              <boxGeometry args={[24.0, h, 14.0]} />
              <meshStandardMaterial color="#1e293b" roughness={0.8} />
            </mesh>
            {/* Storefront windows */}
            <mesh position={[0, 1.8, 7.02]}>
              <planeGeometry args={[20.0, 2.5]} />
              <meshStandardMaterial color="#38bdf8" transparent opacity={0.5} roughness={0.1} />
            </mesh>
            {/* Storefront colorful cantilevered canopy */}
            <mesh position={[0, 3.4, 8.0]} rotation={[0.2, 0, 0]} castShadow>
              <boxGeometry args={[22.0, 0.15, 2.6]} />
              <meshStandardMaterial color={awningColors[i % awningColors.length]} roughness={0.6} />
            </mesh>
          </group>
        );
      })}

      {/* ── Sidewalk Vendor Stall Buffers along South Sidewalk ── */}
      {Array.from({ length: 10 }).map((_, i) => {
        const sx = i * 15 + 12;
        if (sx > length - 6) return null;
        if (sx >= 68 && sx <= 92) return null; // Clear opening for Lirazan St
        const color = awningColors[i % awningColors.length];

        return (
          <group key={`stall-${i}`} position={[sx, LAYER_4_STRUCTURE, HALF_ROAD + SIDEWALK_WIDTH + 1.2]}>
            <mesh position={[0, 1.3, 0]} castShadow>
              <boxGeometry args={[3.0, 2.6, 2.0]} />
              <meshStandardMaterial color="#334155" roughness={0.9} />
            </mesh>
            <mesh position={[0, 2.7, 0.15]} rotation={[-0.15, 0, 0]} castShadow>
              <boxGeometry args={[3.4, 0.1, 2.6]} />
              <meshStandardMaterial color={color} roughness={0.5} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

export default function CorridorLayout({ corridor }: CorridorLayoutProps) {
  const length = corridor.length;
  const corridorStart = -15;
  const corridorEnd = corridor.length + 15;

  // 1. Gather North Grass Exclusions (Side streets with clearance buffers)
  const northGrassCuts = useMemo(() => {
    const cuts: Interval[] = [];
    if (corridor.sideStreets) {
      for (const ss of corridor.sideStreets) {
        if (ss.side === 'north') {
          cuts.push({
            start: ss.x - ss.width / 2 - 3.0,
            end: ss.x + ss.width / 2 + 3.0,
          });
        }
      }
    }
    return cuts;
  }, [corridor.sideStreets]);

  // 2. Gather South Grass Exclusions (Terminal compound frontage, side streets)
  const southGrassCuts = useMemo(() => {
    const cuts: Interval[] = [];
    if (corridor.sideStreets) {
      for (const ss of corridor.sideStreets) {
        if (ss.side === 'south') {
          cuts.push({
            start: ss.x - ss.width / 2 - 3.0,
            end: ss.x + ss.width / 2 + 3.0,
          });
        }
      }
    }
    // Ceres Terminal Compound Frontage: concrete apron replaces all grass from x=88 to x=168
    if (corridor.terminalYard) {
      cuts.push({
        start: 88,
        end: 168,
      });
    }
    return cuts;
  }, [corridor.sideStreets, corridor.terminalYard]);

  const northGrassSegments = useMemo(
    () => computeGrassSegments(corridorStart, corridorEnd, northGrassCuts),
    [corridorStart, corridorEnd, northGrassCuts]
  );

  const southGrassSegments = useMemo(
    () => computeGrassSegments(corridorStart, corridorEnd, southGrassCuts),
    [corridorStart, corridorEnd, southGrassCuts]
  );

  return (
    <group>
      {/* ── Roadway & Pavement Elements (Layers 1 & 2) ── */}
      <Road corridor={corridor} />
      <Sidewalk corridor={corridor} />
      <Crosswalk corridor={corridor} />
      <LoadingBay corridor={corridor} />

      {/* ── Segmented Green Road Verges (Layer 4: Y = 0.01, strictly outside sidewalks) ── */}
      {/* North Verge Segments */}
      {northGrassSegments.map((seg, idx) => {
        const segLen = seg.end - seg.start;
        const segCenter = (seg.start + seg.end) / 2;

        return (
          <mesh
            key={`north-grass-${idx}`}
            rotation={[-Math.PI / 2, 0, 0]}
            position={[segCenter, LAYER_4_VERGE, -VERGE_Z_OFFSET]}
            receiveShadow
          >
            <planeGeometry args={[segLen, 4.0]} />
            <meshStandardMaterial color="#15803d" roughness={0.92} />
          </mesh>
        );
      })}

      {/* South Verge Segments */}
      {southGrassSegments.map((seg, idx) => {
        const segLen = seg.end - seg.start;
        const segCenter = (seg.start + seg.end) / 2;

        return (
          <mesh
            key={`south-grass-${idx}`}
            rotation={[-Math.PI / 2, 0, 0]}
            position={[segCenter, LAYER_4_VERGE, VERGE_Z_OFFSET]}
            receiveShadow
          >
            <planeGeometry args={[segLen, 4.0]} />
            <meshStandardMaterial color="#15803d" roughness={0.92} />
          </mesh>
        );
      })}

      {/* ── Real-World 3D Landmarks (Layer 4) ── */}
      <RealWorldLandmarks corridor={corridor} />

      {/* ── Specific Zone 3D Contextual Backdrops (Layer 4) ── */}
      {corridor.id === LocationId.CeresTerminal && (
        <CeresTerminalBackdrop corridor={corridor} />
      )}

      {corridor.id === LocationId.KCCFrontage && (
        <KCCFrontageBackdrop corridor={corridor} />
      )}

      {corridor.id === LocationId.PublicMarket && (
        <PublicMarketBackdrop corridor={corridor} />
      )}

      {/* ── Layer 0: Regional Ground Terrain Base (Y = 0.00) ── */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[length / 2, LAYER_0_TERRAIN, 0]}
        receiveShadow
      >
        <planeGeometry args={[length + 120, 200]} />
        <meshStandardMaterial color="#0f141c" roughness={0.98} />
      </mesh>
    </group>
  );
}
