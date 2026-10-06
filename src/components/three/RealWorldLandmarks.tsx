'use client';

import React, { useMemo } from 'react';
import * as THREE from 'three';
import { CorridorConfig, LandmarkConfig } from '@/simulation/types';

interface RealWorldLandmarksProps {
  corridor: CorridorConfig;
}

/**
 * Creates a crash-proof, zero-worker CanvasTexture for 3D signage.
 * Guaranteed 60 FPS, SSR-safe, no external font file dependencies.
 */
function createSignTexture(
  mainText: string,
  bgColor: string,
  textColor: string,
  subText?: string,
  width = 512,
  height = 128,
): THREE.CanvasTexture {
  if (typeof document === 'undefined') {
    return new THREE.CanvasTexture(new OffscreenCanvas(width, height) as unknown as HTMLCanvasElement);
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 6;
    ctx.strokeRect(4, 4, width - 8, height - 8);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = textColor;
    ctx.font = subText ? 'bold 36px Arial, sans-serif' : 'bold 44px Arial, sans-serif';
    ctx.fillText(mainText, width / 2, subText ? height * 0.42 : height * 0.5);

    if (subText) {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = '22px Arial, sans-serif';
      ctx.fillText(subText, width / 2, height * 0.78);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

export default function RealWorldLandmarks({ corridor }: RealWorldLandmarksProps) {
  const scale = 1.0;
  const landmarks = useMemo(() => corridor.landmarks || [], [corridor.landmarks]);

  // Memoize textures so they are created once and reused
  const streetSignTexture = useMemo(() => {
    return createSignTexture(
      corridor.streetName || corridor.name.toUpperCase(),
      '#1e3a8a',
      '#ffffff',
      'KABANKALAN CITY ARTERIAL CORRIDOR',
      512,
      140,
    );
  }, [corridor.streetName, corridor.name]);

  const landmarkTextures = useMemo(() => {
    const map = new Map<string, THREE.CanvasTexture>();
    for (const lm of landmarks) {
      if (lm.signText) {
        map.set(
          lm.id,
          createSignTexture(
            lm.signText,
            lm.signColor || '#1e293b',
            '#ffffff',
            lm.category.toUpperCase(),
            512,
            128,
          ),
        );
      }
    }
    return map;
  }, [landmarks]);

  return (
    <group>
      {/* ── Street Name Overhead Sign (Safely located on sidewalk curb verge, clear of all roadway branches) ── */}
      {corridor.streetName && (
        <group position={[48 * scale, 0, -((corridor.roadWidth / 2) + corridor.sidewalkWidth + 0.8) * scale]}>
          {/* Sign Post */}
          <mesh position={[0, 2.5 * scale, 0]} castShadow>
            <cylinderGeometry args={[0.08 * scale, 0.08 * scale, 5 * scale, 8]} />
            <meshStandardMaterial color="#475569" metalness={0.7} />
          </mesh>
          {/* Sign Board */}
          <group position={[0, 4.5 * scale, 0]}>
            <mesh castShadow>
              <boxGeometry args={[6.5 * scale, 1.6 * scale, 0.15 * scale]} />
              <meshStandardMaterial color="#1e3a8a" roughness={0.3} />
            </mesh>
            {/* Front Label Plane */}
            <mesh position={[0, 0, 0.09 * scale]}>
              <planeGeometry args={[6.3 * scale, 1.4 * scale]} />
              <meshBasicMaterial map={streetSignTexture} transparent />
            </mesh>
            {/* Back Label Plane */}
            <mesh position={[0, 0, -0.09 * scale]} rotation={[0, Math.PI, 0]}>
              <planeGeometry args={[6.3 * scale, 1.4 * scale]} />
              <meshBasicMaterial map={streetSignTexture} transparent />
            </mesh>
          </group>
        </group>
      )}

      {/* ── Landmark Buildings ── */}
      {landmarks.map((lm: LandmarkConfig) => {
        const posX = lm.position.x * scale;
        const posZ = lm.position.z * scale;
        const w = lm.dimensions.width * scale;
        const h = lm.dimensions.height * scale;
        const d = lm.dimensions.depth * scale;
        const isTerminal = lm.id === 'ceres-terminal';
        const signTex = landmarkTextures.get(lm.id);

        return (
          <group key={lm.id} position={[posX, 0, posZ]}>
            {/* Main Building Volume */}
            <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
              <boxGeometry args={[w, h, d]} />
              <meshStandardMaterial color={lm.color} roughness={0.8} />
            </mesh>

            {/* Roof / Parapet */}
            <mesh position={[0, h + 0.15 * scale, 0]} castShadow>
              <boxGeometry args={[w + 0.4 * scale, 0.3 * scale, d + 0.4 * scale]} />
              <meshStandardMaterial color={lm.roofColor || '#334155'} roughness={0.6} />
            </mesh>

            {/* Storefront Glass / Windows */}
            <mesh position={[0, h * 0.35, lm.position.z > 0 ? -d / 2 - 0.02 : d / 2 + 0.02]}>
              <boxGeometry args={[w * 0.85, h * 0.45, 0.05 * scale]} />
              <meshStandardMaterial
                color="#0284c7"
                roughness={0.1}
                metalness={0.8}
                transparent
                opacity={0.6}
              />
            </mesh>

            {/* Facade Brand Signboard */}
            {signTex && (
              <group position={[0, h * 0.78, lm.position.z > 0 ? -d / 2 - 0.12 * scale : d / 2 + 0.12 * scale]}>
                <mesh castShadow>
                  <boxGeometry args={[w * 0.8, 1.1 * scale, 0.1 * scale]} />
                  <meshStandardMaterial color={lm.signColor || '#1e293b'} roughness={0.4} />
                </mesh>
                <mesh position={[0, 0, lm.position.z > 0 ? -0.06 * scale : 0.06 * scale]} rotation={[0, lm.position.z > 0 ? Math.PI : 0, 0]}>
                  <planeGeometry args={[w * 0.78, 1.0 * scale]} />
                  <meshBasicMaterial map={signTex} transparent />
                </mesh>
              </group>
            )}

            {/* Special Depot Canopy for Ceres Bus Terminal Compound */}
            {isTerminal && (
              <group>
                {/* Depot Bay Canopy Cantilever */}
                <mesh position={[0, h * 0.7, -d / 2 - 3.5 * scale]} castShadow>
                  <boxGeometry args={[w * 0.95, 0.25 * scale, 7 * scale]} />
                  <meshStandardMaterial color="#f59e0b" roughness={0.5} />
                </mesh>
                {/* Canopy Structural Pillars */}
                {[-w * 0.42, 0, w * 0.42].map((px, i) => (
                  <mesh key={`pillar-${i}`} position={[px, (h * 0.7) / 2, -d / 2 - 6.8 * scale]} castShadow>
                    <cylinderGeometry args={[0.12 * scale, 0.12 * scale, h * 0.7, 8]} />
                    <meshStandardMaterial color="#475569" metalness={0.6} />
                  </mesh>
                ))}
              </group>
            )}
          </group>
        );
      })}
    </group>
  );
}
