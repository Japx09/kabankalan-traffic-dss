'use client';

import React, { useMemo } from 'react';
import * as THREE from 'three';
import { CorridorConfig } from '@/simulation/types';

interface SidewalkProps {
  corridor: CorridorConfig;
}

interface Interval {
  start: number;
  end: number;
}

// ─── DPWH Standard Dimensions (1:1 Metric Scale) ────────────────────────────
const TOTAL_ROADWAY_WIDTH = 9.70; // 6.70m carriageway + 2 x 1.50m shoulders
const HALF_ROAD = TOTAL_ROADWAY_WIDTH / 2; // 4.85m
const SIDEWALK_WIDTH = 1.80; // Exactly 1.80m clear pedestrian path
const CURB_HEIGHT = 0.15; // Standard 150mm barrier curb
const CURB_WIDTH = 0.22; // 220mm curb footing width

// Layer Elevation
const LAYER_1_ASPHALT = 0.04;

const extrudeSettings = {
  depth: CURB_HEIGHT,
  bevelEnabled: true,
  bevelSegments: 2,
  steps: 1,
  bevelSize: 0.02,
  bevelThickness: 0.02,
};

function createSidewalkShape(start: number, end: number, isNorth: boolean, hasLeftCut: boolean, hasRightCut: boolean) {
  const SIDEWALK = SIDEWALK_WIDTH + CURB_WIDTH; // 2.02m
  const R = SIDEWALK; // full rounded tip for the cut ends
  const shape = new THREE.Shape();

  if (isNorth) {
    shape.moveTo(start + (hasLeftCut ? R : 0), -(HALF_ROAD + SIDEWALK));
    shape.lineTo(end - (hasRightCut ? R : 0), -(HALF_ROAD + SIDEWALK));
    if (hasRightCut) {
      shape.absarc(end - R, -(HALF_ROAD + R), R, Math.PI/2, 0, true);
    } else {
      shape.lineTo(end, -HALF_ROAD);
    }
    shape.lineTo(start + (hasLeftCut ? R : 0), -HALF_ROAD);
    if (hasLeftCut) {
      shape.absarc(start + R, -(HALF_ROAD + R), R, Math.PI, Math.PI/2, true);
    } else {
      shape.lineTo(start, -(HALF_ROAD + SIDEWALK));
    }
  } else {
    shape.moveTo(start + (hasLeftCut ? R : 0), HALF_ROAD);
    shape.lineTo(end - (hasRightCut ? R : 0), HALF_ROAD);
    if (hasRightCut) {
      shape.absarc(end - R, HALF_ROAD + R, R, -Math.PI/2, 0, false);
    } else {
      shape.lineTo(end, HALF_ROAD + SIDEWALK);
    }
    shape.lineTo(start + (hasLeftCut ? R : 0), HALF_ROAD + SIDEWALK);
    if (hasLeftCut) {
      shape.absarc(start + R, HALF_ROAD + R, R, Math.PI, -Math.PI/2, false);
    } else {
      shape.lineTo(start, HALF_ROAD);
    }
  }
  return shape;
}

/**
 * Computes non-overlapping contiguous sidewalk segments by carving out driveway and side-street curb cuts.
 */
function computeSidewalkSegments(totalStart: number, totalEnd: number, cuts: Interval[]): Interval[] {
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
    if (cutStart > cur + 0.8) {
      segments.push({ start: cur, end: cutStart });
    }
    cur = Math.max(cur, cutEnd);
  }
  if (cur < totalEnd - 0.8) {
    segments.push({ start: cur, end: totalEnd });
  }
  return segments;
}

export default function Sidewalk({ corridor }: SidewalkProps) {
  const corridorStart = -15;
  const corridorEnd = corridor.length + 15;

  const northCuts = useMemo(() => {
    const cuts: Interval[] = [];
    if (corridor.sideStreets) {
      for (const ss of corridor.sideStreets) {
        if (ss.side === 'north') {
          cuts.push({
            start: ss.x - ss.width / 2 - 5.0,
            end: ss.x + ss.width / 2 + 5.0,
          });
        }
      }
    }
    return cuts;
  }, [corridor.sideStreets]);

  // 2. Gather South Cuts (Ceres Gate 1, Ceres Gate 2, Repollo St, Lirazan St)
  const southCuts = useMemo(() => {
    const cuts: Interval[] = [];
    if (corridor.sideStreets) {
      for (const ss of corridor.sideStreets) {
        if (ss.side === 'south') {
          cuts.push({
            start: ss.x - ss.width / 2 - 5.0,
            end: ss.x + ss.width / 2 + 5.0,
          });
        }
      }
    }
    if (corridor.terminalYard) {
      const y = corridor.terminalYard;
      if (y.gate1X !== undefined) {
        cuts.push({
          start: y.gate1X - (y.gate1Width ?? 12) / 2 - 5.0,
          end: y.gate1X + (y.gate1Width ?? 12) / 2 + 5.0,
        });
      }
      if (y.gate2X !== undefined) {
        cuts.push({
          start: y.gate2X - (y.gate2Width ?? 12) / 2 - 5.0,
          end: y.gate2X + (y.gate2Width ?? 12) / 2 + 5.0,
        });
      }
      if (y.gateX !== undefined && y.gate1X === undefined && y.gate2X === undefined) {
        cuts.push({
          start: y.gateX - (y.gateWidth ?? 12) / 2 - 5.0,
          end: y.gateX + (y.gateWidth ?? 12) / 2 + 5.0,
        });
      }
    }
    return cuts;
  }, [corridor.sideStreets, corridor.terminalYard]);

  const northSegments = useMemo(
    () => computeSidewalkSegments(corridorStart, corridorEnd, northCuts),
    [corridorStart, corridorEnd, northCuts]
  );

  const southSegments = useMemo(
    () => computeSidewalkSegments(corridorStart, corridorEnd, southCuts),
    [corridorStart, corridorEnd, southCuts]
  );

  return (
    <group>
      {/* ── Top Sidewalk (North / negative Z) ── */}
      {northSegments.map((seg, idx) => {
        const hasLeftCut = seg.start > corridorStart + 1;
        const hasRightCut = seg.end < corridorEnd - 1;
        const shape = createSidewalkShape(seg.start, seg.end, true, hasLeftCut, hasRightCut);

        return (
          <mesh
            key={`north-seg-${idx}`}
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, LAYER_1_ASPHALT, 0]}
            receiveShadow
            castShadow
          >
            <extrudeGeometry args={[shape, extrudeSettings]} />
            <meshStandardMaterial attach="material-0" color="#94a3b8" roughness={0.7} />
            <meshStandardMaterial attach="material-1" color="#64748b" roughness={0.85} />
          </mesh>
        );
      })}

      {/* ── Bottom Sidewalk (South / positive Z) ── */}
      {southSegments.map((seg, idx) => {
        const hasLeftCut = seg.start > corridorStart + 1;
        const hasRightCut = seg.end < corridorEnd - 1;
        const shape = createSidewalkShape(seg.start, seg.end, false, hasLeftCut, hasRightCut);

        return (
          <mesh
            key={`south-seg-${idx}`}
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, LAYER_1_ASPHALT, 0]}
            receiveShadow
            castShadow
          >
            <extrudeGeometry args={[shape, extrudeSettings]} />
            <meshStandardMaterial attach="material-0" color="#94a3b8" roughness={0.7} />
            <meshStandardMaterial attach="material-1" color="#64748b" roughness={0.85} />
          </mesh>
        );
      })}

      {/* Tactile Paving Warning Mats at Crosswalk Curb Ramps (Layer 3: Y = 0.205) */}
      {corridor.crosswalks.map((cw, idx) => (
        <group key={`tactile-${idx}`}>
          {/* North tactile pad */}
          <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            position={[cw.x, LAYER_1_ASPHALT + CURB_HEIGHT + 0.005, -(HALF_ROAD + CURB_WIDTH + 0.6)]}
          >
            <planeGeometry args={[cw.width * 0.8, 1.2]} />
            <meshStandardMaterial color="#eab308" roughness={0.6} />
          </mesh>
          {/* South tactile pad */}
          <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            position={[cw.x, LAYER_1_ASPHALT + CURB_HEIGHT + 0.005, HALF_ROAD + CURB_WIDTH + 0.6]}
          >
            <planeGeometry args={[cw.width * 0.8, 1.2]} />
            <meshStandardMaterial color="#eab308" roughness={0.6} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
