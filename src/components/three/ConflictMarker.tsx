'use client';

import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { ConflictEvent } from '@/simulation/types';

interface ConflictMarkerProps {
  conflict: ConflictEvent;
}

/** Helper to draw crisp, crash-proof CanvasTexture telemetry badge */
function createTelemetryBadge(mainText: string, subText: string): THREE.CanvasTexture {
  if (typeof document === 'undefined') {
    return new THREE.CanvasTexture(new OffscreenCanvas(256, 96) as unknown as HTMLCanvasElement);
  }
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    // Dark red background with crisp 1px border
    ctx.fillStyle = 'rgba(185, 28, 28, 0.92)';
    ctx.fillRect(0, 0, 256, 96);

    ctx.strokeStyle = 'rgba(254, 202, 202, 0.7)';
    ctx.lineWidth = 4;
    ctx.strokeRect(3, 3, 250, 90);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 34px ui-monospace, SFMono-Regular, monospace';
    ctx.fillText(mainText, 128, 38);

    ctx.fillStyle = '#fef08a';
    ctx.font = 'bold 20px ui-monospace, SFMono-Regular, monospace';
    ctx.fillText(subText, 128, 72);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

export default function ConflictMarker({ conflict }: ConflictMarkerProps) {
  const shockwaveRef = useRef<THREE.Mesh>(null);
  const pinRef = useRef<THREE.Mesh>(null);

  // Fade out smoothly over conflict lifetime (8 seconds)
  const opacity = Math.max(0, 1 - conflict.age / 8);

  // Dynamic telemetry texture
  const telemetryTex = useMemo(() => {
    const isTtc = conflict.ttc <= 1.5;
    const main = isTtc ? `TTC ${conflict.ttc.toFixed(1)}s` : `PET ${conflict.pet.toFixed(1)}s`;
    const sub = isTtc ? 'CRITICAL PROXIMITY' : 'CROSSING CONFLICT';
    return createTelemetryBadge(main, sub);
  }, [conflict.ttc, conflict.pet]);

  // Pulsing shockwave expansion
  useFrame(() => {
    if (shockwaveRef.current) {
      const pulse = 1 + (Date.now() * 0.003) % 1.5;
      shockwaveRef.current.scale.set(pulse, pulse, 1);
    }
    if (pinRef.current) {
      const bob = Math.sin(Date.now() * 0.005) * 0.15;
      pinRef.current.position.y = 3.5 + bob;
    }
  });

  return (
    <group position={[conflict.position.x, 0.062, conflict.position.z]}>
      {/* ── Road Surface Heat Spot: Outer Ambient Dissipation Disc (Layer 2.2) ── */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[2.8, 24]} />
        <meshBasicMaterial
          color="#f43f5e"
          transparent
          opacity={opacity * 0.25}
          depthWrite={false}
        />
      </mesh>

      {/* ── Middle Critical Heat Disc ── */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]}>
        <circleGeometry args={[1.7, 20]} />
        <meshBasicMaterial
          color="#ef4444"
          transparent
          opacity={opacity * 0.48}
          depthWrite={false}
        />
      </mesh>

      {/* ── Inner Core Epicenter ── */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
        <circleGeometry args={[0.8, 16]} />
        <meshBasicMaterial
          color="#f97316"
          transparent
          opacity={opacity * 0.8}
          depthWrite={false}
        />
      </mesh>

      {/* ── Concentric Shockwave Ring ── */}
      <mesh ref={shockwaveRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.003, 0]}>
        <ringGeometry args={[1.2, 1.45, 32]} />
        <meshBasicMaterial
          color="#f43f5e"
          transparent
          opacity={opacity * 0.85}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* ── Vertical 3D Laser Beacon Line ── */}
      <mesh position={[0, 1.75, 0]}>
        <cylinderGeometry args={[0.025, 0.025, 3.5, 4]} />
        <meshBasicMaterial color="#ef4444" transparent opacity={opacity * 0.75} />
      </mesh>

      {/* ── Floating 3D Octahedron Hazard Beacon ── */}
      <mesh ref={pinRef} position={[0, 3.5, 0]}>
        <octahedronGeometry args={[0.32, 0]} />
        <meshStandardMaterial
          color="#dc2626"
          emissive="#ef4444"
          emissiveIntensity={2.5}
          transparent
          opacity={opacity}
        />
      </mesh>

      {/* ── Floating Telemetry Tag (Monospace TTC / PET Badge) ── */}
      <group position={[0, 4.4, 0]}>
        <mesh>
          <planeGeometry args={[2.6, 1.0]} />
          <meshBasicMaterial map={telemetryTex} transparent opacity={opacity * 0.95} side={THREE.DoubleSide} />
        </mesh>
      </group>
    </group>
  );
}
