'use client';

import React, { useMemo } from 'react';
import * as THREE from 'three';
import { CorridorConfig } from '@/simulation/types';
import { useSimulationStore } from '@/store/simulationStore';

interface RoadProps {
  corridor: CorridorConfig;
}

// ─── DPWH Standard Dimensions (1:1 Metric Scale: 1 unit = 1 meter) ──────────
const CARRIAGEWAY_WIDTH = 6.70; // 2 lanes @ 3.35m
const SHOULDER_WIDTH = 1.50; // Paved shoulder each side
const TOTAL_ROADWAY_WIDTH = CARRIAGEWAY_WIDTH + SHOULDER_WIDTH * 2; // 9.70m

// Layering Elevations (Zero Z-Fighting)
const LAYER_1_ASPHALT = 0.04;
const LAYER_2_MARKING = 0.06;
const LAYER_2_STOPBAR = 0.062;

export default function Road({ corridor }: RoadProps) {
  const length = corridor.length;
  const showCenterlines = useSimulationStore((s) => s.showCenterlines ?? true);

  const roadShape = useMemo(() => {
    const shape = new THREE.Shape();
    const len = corridor.length;
    const FILLET = 5.0; // 5.0m arc fillets for realistic junction turns
    const HALF = TOTAL_ROADWAY_WIDTH / 2;

    // Collect north cuts
    const northCuts = (corridor.sideStreets || []).filter(s => s.side === 'north').sort((a,b) => a.x - b.x);
    
    // Start top-left
    shape.moveTo(-30, -HALF);
    
    for (const cut of northCuts) {
      const sideLen = cut.length || 35;
      const hw = cut.width / 2;
      shape.lineTo(cut.x - hw - FILLET, -HALF);
      shape.absarc(cut.x - hw - FILLET, -(HALF + FILLET), FILLET, Math.PI/2, 0, true);
      shape.lineTo(cut.x - hw, -(HALF + sideLen));
      shape.lineTo(cut.x + hw, -(HALF + sideLen));
      shape.lineTo(cut.x + hw, -(HALF + FILLET));
      shape.absarc(cut.x + hw + FILLET, -(HALF + FILLET), FILLET, Math.PI, Math.PI/2, true);
    }
    
    shape.lineTo(len + 30, -HALF);
    shape.lineTo(len + 30, HALF);
    
    const southCuts = [];
    if (corridor.sideStreets) {
      southCuts.push(...corridor.sideStreets.filter(s => s.side === 'south').map(s => ({x: s.x, width: s.width, length: s.length||35})));
    }
    if (corridor.terminalYard) {
      const y = corridor.terminalYard;
      if (y.gate1X !== undefined) southCuts.push({x: y.gate1X, width: y.gate1Width||12, length: y.gate1Z ? y.gate1Z - HALF : 12});
      if (y.gate2X !== undefined) southCuts.push({x: y.gate2X, width: y.gate2Width||12, length: y.gate2Z ? y.gate2Z - HALF : 12});
    }
    southCuts.sort((a,b) => b.x - a.x); // Right to left for bottom edge
    
    for (const cut of southCuts) {
      const sideLen = cut.length || 35;
      const hw = cut.width / 2;
      shape.lineTo(cut.x + hw + FILLET, HALF);
      shape.absarc(cut.x + hw + FILLET, HALF + FILLET, FILLET, -Math.PI/2, Math.PI, true);
      shape.lineTo(cut.x + hw, HALF + sideLen);
      shape.lineTo(cut.x - hw, HALF + sideLen);
      shape.lineTo(cut.x - hw, HALF + FILLET);
      shape.absarc(cut.x - hw - FILLET, HALF + FILLET, FILLET, 0, -Math.PI/2, true);
    }
    
    shape.lineTo(-30, HALF);
    shape.lineTo(-30, -HALF);
    
    return shape;
  }, [corridor]);

  return (
    <group>
      {/* ── Layer 1: Seamless Procedural Asphalt Pavement Ribbon (Y = 0.04) ── */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, LAYER_1_ASPHALT, 0]}
        receiveShadow
      >
        <shapeGeometry args={[roadShape]} />
        <meshStandardMaterial color="#1a202c" roughness={0.95} metalness={0.05} />
      </mesh>

      {/* Sub-base edge shadow under roadway pavement */}
      <mesh position={[0, LAYER_1_ASPHALT - 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <shapeGeometry args={[roadShape]} />
        <meshStandardMaterial color="#0f172a" roughness={1} />
      </mesh>

      {/* ── Layer 2: DPWH Pavement Markings (Y = 0.06) ── */}

      {/* 1. DPWH Broken Centerline (3.0m stripe, 6.0m gap = 9.0m cycle, 0.15m width) */}
      {showCenterlines &&
        Array.from({ length: Math.floor((length + 40) / 9) }).map((_, i) => {
          const posX = i * 9 - 15;
          // In front of Ceres Terminal compound (x in [88, 162]), replace with solid median
          if (corridor.terminalYard && posX >= 88 && posX <= 162) return null;

          return (
            <mesh
              key={`dpwh-centerline-${i}`}
              rotation={[-Math.PI / 2, 0, 0]}
              position={[posX + 1.5, LAYER_2_MARKING, 0]}
            >
              <planeGeometry args={[3.0, 0.15]} />
              <meshStandardMaterial color="#ffffff" roughness={0.3} />
            </mesh>
          );
        })}

      {/* 2. Solid Double Yellow Median Barrier opposite Terminal Compound (x in [88, 162]) */}
      {corridor.terminalYard && (
        <group>
          <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            position={[125, LAYER_2_MARKING, -0.10]}
          >
            <planeGeometry args={[74, 0.12]} />
            <meshStandardMaterial color="#f59e0b" roughness={0.3} />
          </mesh>
          <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            position={[125, LAYER_2_MARKING, 0.10]}
          >
            <planeGeometry args={[74, 0.12]} />
            <meshStandardMaterial color="#f59e0b" roughness={0.3} />
          </mesh>
        </group>
      )}

      {/* 3. Solid White Shoulder Edge Lines (0.15m width separating 3.35m lanes from 1.5m shoulders) */}
      {/* North Shoulder Edge (Z = -3.35m) */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[length / 2, LAYER_2_MARKING, -CARRIAGEWAY_WIDTH / 2]}
      >
        <planeGeometry args={[length + 60, 0.15]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.3} />
      </mesh>
      {/* South Shoulder Edge (Z = +3.35m) */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[length / 2, LAYER_2_MARKING, CARRIAGEWAY_WIDTH / 2]}
      >
        <planeGeometry args={[length + 60, 0.15]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.3} />
      </mesh>

      {/* 4. Loading Zone Painted Road Edge & Diagonal Yellow Hatchings */}
      {corridor.loadingZones.map((lz, lzIdx) => {
        const lzLength = lz.xEnd - lz.xStart;
        const lzX = (lz.xStart + lz.xEnd) / 2;
        const isNorth = lz.z < 0;
        const edgeZ = isNorth ? -CARRIAGEWAY_WIDTH / 2 - 0.8 : CARRIAGEWAY_WIDTH / 2 + 0.8;

        return (
          <group key={`lz-marking-${lzIdx}`}>
            {/* Yellow curb edge marking */}
            <mesh
              rotation={[-Math.PI / 2, 0, 0]}
              position={[lzX, LAYER_2_MARKING, isNorth ? -TOTAL_ROADWAY_WIDTH / 2 + 0.1 : TOTAL_ROADWAY_WIDTH / 2 - 0.1]}
            >
              <planeGeometry args={[lzLength, 0.20]} />
              <meshStandardMaterial color="#f59e0b" roughness={0.4} />
            </mesh>
            {/* Diagonal yellow hatch lines on loading bay */}
            {Array.from({ length: Math.floor(lzLength / 2.5) }).map((_, hIdx) => (
              <mesh
                key={`hatch-${lzIdx}-${hIdx}`}
                rotation={[-Math.PI / 2, 0, isNorth ? Math.PI / 4 : -Math.PI / 4]}
                position={[lz.xStart + hIdx * 2.5 + 1.25, LAYER_2_MARKING, edgeZ]}
              >
                <planeGeometry args={[1.8, 0.15]} />
                <meshStandardMaterial color="#f59e0b" roughness={0.4} />
              </mesh>
            ))}
          </group>
        );
      })}

      {/* ── Multi-Intersection Side Streets & Junction Fillet Polygons ── */}
      {corridor.sideStreets?.map((ss, idx) => {
        const angle = ss.angle ?? 0;
        const isNorth = ss.side === 'north';
        const stopZ = isNorth ? -TOTAL_ROADWAY_WIDTH / 2 - 1.2 : TOTAL_ROADWAY_WIDTH / 2 + 1.2;

        return (
          <group key={`side-street-${idx}`}>
            {/* Side street yellow centerline */}
            <mesh
              rotation={[-Math.PI / 2, 0, angle]}
              position={[ss.x, LAYER_2_MARKING, isNorth ? stopZ - (ss.length??35)/2 : stopZ + (ss.length??35)/2]}
            >
              <planeGeometry args={[0.15, ss.length ?? 35]} />
              <meshStandardMaterial color="#f59e0b" roughness={0.4} />
            </mesh>

            {/* Intersection Mouth Stop Bar (Layer 2: Y = 0.062) */}
            {ss.hasStopBar && (
              <mesh
                rotation={[-Math.PI / 2, 0, angle]}
                position={[ss.x, LAYER_2_STOPBAR, stopZ]}
              >
                <planeGeometry args={[ss.width * 0.9, 0.45]} />
                <meshStandardMaterial color="#ffffff" roughness={0.3} />
              </mesh>
            )}
          </group>
        );
      })}

      {/* ── Authentic Off-Street Ceres Terminal Compound & Two-Gate System ── */}
      {corridor.terminalYard && (
        <group key="terminal-compound-pavement">
          {/* Reinforced Concrete Staging & Circulation Apron (Layer 1: Y = 0.05) */}
          <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            position={[corridor.terminalYard.x, LAYER_1_ASPHALT, corridor.terminalYard.z]}
            receiveShadow
          >
            <planeGeometry
              args={[corridor.terminalYard.width, corridor.terminalYard.depth]}
            />
            <meshStandardMaterial color="#2d3444" roughness={0.88} metalness={0.12} />
          </mesh>

          {/* Sub-base shadow slab */}
          <mesh position={[corridor.terminalYard.x, LAYER_1_ASPHALT - 0.02, corridor.terminalYard.z]}>
            <boxGeometry
              args={[
                corridor.terminalYard.width + 1.0,
                0.03,
                corridor.terminalYard.depth + 1.0,
              ]}
            />
            <meshStandardMaterial color="#141822" roughness={1} />
          </mesh>

          {/* (Asphalt aprons are now merged into the unified ShapeGeometry) */}

          {/* Gate 1 Green Inbound Entrance Directional Marking (Layer 2: Y = 0.062) */}
          <mesh
            rotation={[-Math.PI / 2, 0, 0.12]}
            position={[
              corridor.terminalYard.gate1X ?? 151,
              LAYER_2_STOPBAR,
              corridor.terminalYard.gate1Z ?? 8.5,
            ]}
          >
            <planeGeometry args={[1.6, 4.0]} />
            <meshStandardMaterial color="#10b981" roughness={0.3} />
          </mesh>

          {/* Gate 2 Yellow Transverse Yield/Stop Bar (Layer 2: Y = 0.062) */}
          <mesh
            rotation={[-Math.PI / 2, 0, -0.15]}
            position={[
              (corridor.terminalYard.gate2X ?? 103) - 1.2,
              LAYER_2_STOPBAR,
              (corridor.terminalYard.gate2Z ?? 8.5) - 2.2,
            ]}
          >
            <planeGeometry
              args={[(corridor.terminalYard.gate2Width ?? 12) * 0.9, 0.45]}
            />
            <meshStandardMaterial color="#f59e0b" roughness={0.4} />
          </mesh>

          {/* ── Passenger Alighting Platform Bay inside Gate 1 (x: 142m, z: 18m) ── */}
          <group position={[142, LAYER_1_ASPHALT, 18.0]}>
            {/* Platform bay boundary outline */}
            <mesh rotation={[-Math.PI / 2, 0, 0.3]}>
              <planeGeometry args={[16, 4.5]} />
              <meshStandardMaterial color="#1a202c" roughness={0.95} />
            </mesh>
            {/* Raised passenger discharge curb platform (Layer 3: Y = 0.20) */}
            <mesh position={[2.5, 0.075, -2.8]} rotation={[0, -0.3, 0]}>
              <boxGeometry args={[16, 0.15, 2.2]} />
              <meshStandardMaterial color="#64748b" roughness={0.7} />
            </mesh>
            {/* Yellow striped curb edge for passenger safety */}
            <mesh position={[2.5, 0.152, -1.65]} rotation={[-Math.PI / 2, 0, 0.3]}>
              <planeGeometry args={[16, 0.22]} />
              <meshStandardMaterial color="#f59e0b" roughness={0.4} />
            </mesh>
          </group>

          {/* ── Internal One-Way Circulation Guide Markings ── */}
          {/* Platform to Rear Staging curve */}
          <mesh rotation={[-Math.PI / 2, 0, -0.55]} position={[134, LAYER_2_MARKING, 24]}>
            <planeGeometry args={[0.25, 9.0]} />
            <meshStandardMaterial color="#94a3b8" roughness={0.5} />
          </mesh>

          {/* ── Staging Yard Queue Bays (Slot 1 at x: 114m, Slot 2 at x: 128m) ── */}
          {corridor.terminalYard.stagingBays.map((bay, bIdx) => (
            <group
              key={`bay-slot-${bIdx}`}
              position={[bay.x, LAYER_2_MARKING, bay.z]}
              rotation={[0, -bay.heading, 0]}
            >
              {/* Stall rectangular perimeter */}
              <mesh rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[14.0, 3.8]} />
                <meshStandardMaterial color="#161c28" roughness={0.95} />
              </mesh>
              {/* Yellow stall border stripes */}
              <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 1.8]}>
                <planeGeometry args={[14.0, 0.18]} />
                <meshStandardMaterial color="#f59e0b" roughness={0.4} />
              </mesh>
              <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, -1.8]}>
                <planeGeometry args={[14.0, 0.18]} />
                <meshStandardMaterial color="#f59e0b" roughness={0.4} />
              </mesh>
              <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-6.9, 0.002, 0]}>
                <planeGeometry args={[0.18, 3.8]} />
                <meshStandardMaterial color="#f59e0b" roughness={0.4} />
              </mesh>
            </group>
          ))}
        </group>
      )}
    </group>
  );
}
