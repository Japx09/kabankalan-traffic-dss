'use client';

import React from 'react';
import { CorridorConfig } from '@/simulation/types';

import { useSimulationStore } from '@/store/simulationStore';

interface CrosswalkProps {
  corridor: CorridorConfig;
}

const TOTAL_ROADWAY_WIDTH = 9.70; // Carriageway + shoulders
const HALF_ROAD = TOTAL_ROADWAY_WIDTH / 2; // 4.85m
const LAYER_2_ZEBRA = 0.06;

export default function Crosswalk({ corridor }: CrosswalkProps) {
  const signalPhase = useSimulationStore((s) => s.simState.signalState.vehicularPhase);

  return (
    <group>
      {corridor.crosswalks.map((cw, idx) => {
        // DPWH standard: 0.45m stripe width, 0.45m gap = 0.90m cycle
        const stripeCount = Math.floor(TOTAL_ROADWAY_WIDTH / 0.90);
        return (
          <group key={`crosswalk-${idx}`}>
            {/* Layer 2: White Continental Zebra Stripes (Y = 0.062) */}
            {Array.from({ length: stripeCount }).map((_, i) => (
              <mesh
                key={`stripe-${idx}-${i}`}
                rotation={[-Math.PI / 2, 0, 0]}
                position={[
                  cw.x,
                  LAYER_2_ZEBRA,
                  -HALF_ROAD + 0.45 + i * 0.90,
                ]}
              >
                <planeGeometry args={[cw.width, 0.45]} />
                <meshStandardMaterial
                  color="#ffffff"
                  roughness={0.3}
                />
              </mesh>
            ))}

            {/* Signal Posts on North and South Sidewalk Buffers (Layer 4) */}
            {cw.signalized &&
              [-(HALF_ROAD + 2.1), HALF_ROAD + 2.1].map((poleZ, pIdx) => (
                <group key={`sig-pole-${idx}-${pIdx}`} position={[cw.x, 0.18, poleZ]}>
                  {/* Metal Post */}
                  <mesh position={[0, 1.8, 0]} castShadow>
                    <cylinderGeometry args={[0.08, 0.08, 3.6, 8]} />
                    <meshStandardMaterial color="#475569" metalness={0.7} />
                  </mesh>
                  {/* 3-Aspect Traffic Signal Head Housing */}
                  <mesh position={[0, 3.4, 0]}>
                    <boxGeometry args={[0.35, 0.9, 0.28]} />
                    <meshStandardMaterial color="#0f172a" roughness={0.5} />
                  </mesh>

                  {/* Red Light (Top) */}
                  <mesh position={[0, 3.65, poleZ > 0 ? -0.15 : 0.15]}>
                    <sphereGeometry args={[0.09, 12, 12]} />
                    <meshStandardMaterial
                      color={signalPhase === 'red' ? '#ef4444' : '#450a0a'}
                      emissive={signalPhase === 'red' ? '#ef4444' : '#000000'}
                      emissiveIntensity={signalPhase === 'red' ? 3.5 : 0}
                    />
                  </mesh>

                  {/* Yellow Light (Middle) */}
                  <mesh position={[0, 3.4, poleZ > 0 ? -0.15 : 0.15]}>
                    <sphereGeometry args={[0.09, 12, 12]} />
                    <meshStandardMaterial
                      color={signalPhase === 'yellow' ? '#f59e0b' : '#451a03'}
                      emissive={signalPhase === 'yellow' ? '#f59e0b' : '#000000'}
                      emissiveIntensity={signalPhase === 'yellow' ? 3.5 : 0}
                    />
                  </mesh>

                  {/* Green Light (Bottom) */}
                  <mesh position={[0, 3.15, poleZ > 0 ? -0.15 : 0.15]}>
                    <sphereGeometry args={[0.09, 12, 12]} />
                    <meshStandardMaterial
                      color={signalPhase === 'green' ? '#22c55e' : '#052e16'}
                      emissive={signalPhase === 'green' ? '#22c55e' : '#000000'}
                      emissiveIntensity={signalPhase === 'green' ? 3.5 : 0}
                    />
                  </mesh>
                </group>
              ))}
          </group>
        );
      })}
    </group>
  );
}
