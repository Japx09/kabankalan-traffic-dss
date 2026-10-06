'use client';

import React from 'react';
import { CorridorConfig } from '@/simulation/types';

interface LoadingBayProps {
  corridor: CorridorConfig;
}

export default function LoadingBay({ corridor }: LoadingBayProps) {
  return (
    <group>
      {corridor.loadingZones.map((lz, idx) => {
        const bayLength = lz.xEnd - lz.xStart;
        const centerX = (lz.xStart + lz.xEnd) / 2;
        const bayZ = lz.z;
        const bayWidth = 3.0; // 3.0m paratransit dwell bay

        return (
          <group key={`bay-${idx}`}>
            {/* Bay pavement ribbon (Layer 1: Y = 0.052) */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[centerX, 0.052, bayZ]} receiveShadow>
              <planeGeometry args={[bayLength, bayWidth]} />
              <meshStandardMaterial
                color={lz.isDedicated ? '#334155' : '#1e2430'}
                roughness={0.88}
              />
            </mesh>

            {/* Bay border markings (Layer 2: Y = 0.062) */}
            {lz.isDedicated && (
              <>
                {/* Front delimiter line */}
                <mesh rotation={[-Math.PI / 2, 0, 0]} position={[lz.xStart, 0.062, bayZ]}>
                  <planeGeometry args={[0.15, bayWidth]} />
                  <meshStandardMaterial color="#f59e0b" roughness={0.4} />
                </mesh>
                {/* Back delimiter line */}
                <mesh rotation={[-Math.PI / 2, 0, 0]} position={[lz.xEnd, 0.062, bayZ]}>
                  <planeGeometry args={[0.15, bayWidth]} />
                  <meshStandardMaterial color="#f59e0b" roughness={0.4} />
                </mesh>
                {/* Yellow longitudinal bay boundary */}
                <mesh rotation={[-Math.PI / 2, 0, 0]} position={[centerX, 0.062, bayZ]}>
                  <planeGeometry args={[bayLength * 0.8, 0.25]} />
                  <meshStandardMaterial color="#f59e0b" roughness={0.4} />
                </mesh>
              </>
            )}

            {/* Physical steel barrier bollards for formal dedicated bays (Layer 4: Y = 0.20) */}
            {lz.isDedicated &&
              Array.from({ length: Math.floor(bayLength / 3.0) + 1 }).map((_, i) => (
                <mesh
                  key={`bollard-${idx}-${i}`}
                  position={[
                    lz.xStart + i * 3.0,
                    0.45,
                    bayZ - (bayZ > 0 ? -1 : 1) * (bayWidth / 2 + 0.3),
                  ]}
                  castShadow
                >
                  <cylinderGeometry args={[0.08, 0.08, 0.9, 12]} />
                  <meshStandardMaterial color="#f59e0b" metalness={0.6} roughness={0.3} />
                </mesh>
              ))}
          </group>
        );
      })}
    </group>
  );
}
