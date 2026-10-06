'use client';

import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { PedestrianState, Pedestrian as PedData } from '@/simulation/types';

interface PedestrianProps {
  data: PedData;
}

const STATE_COLORS: Record<PedestrianState, string> = {
  [PedestrianState.Waiting]: '#f8fafc',   // Casual white shirt / waiting
  [PedestrianState.Crossing]: '#38bdf8',  // Active crossing sky-blue
  [PedestrianState.InConflict]: '#ef4444',// Red conflict alert
  [PedestrianState.Completed]: '#10b981', // Green safe
};

export default function Pedestrian({ data }: PedestrianProps) {
  const groupRef = useRef<THREE.Group>(null);
  const leftLegRef = useRef<THREE.Mesh>(null);
  const rightLegRef = useRef<THREE.Mesh>(null);
  const leftArmRef = useRef<THREE.Mesh>(null);
  const rightArmRef = useRef<THREE.Mesh>(null);

  const isCrossing = data.state === PedestrianState.Crossing;
  const isInConflict = data.state === PedestrianState.InConflict;

  // Derive clothing color and heading
  const shirtColor = STATE_COLORS[data.state];
  const pantsColor = '#1e293b'; // Navy/charcoal trousers

  // Facing direction: 0 when moving in +Z direction, Math.PI when moving in -Z direction
  const heading = data.crossingDirection > 0 ? 0 : Math.PI;

  // Base Y elevation: 0.06 on road crosswalk, 0.18 on elevated concrete sidewalk
  const baseY = isCrossing || isInConflict ? 0.06 : 0.18;

  // Animated walking gait for biped figures (1:1 metric scale)
  useFrame(() => {
    if (!groupRef.current) return;

    if (isInConflict) {
      // Hesitation / Defensive backpedal animation
      const walkTime = Date.now() * 0.015; // Fast jittery time
      const legSwing = Math.sin(walkTime) * 0.15; // Small rigid steps
      const armSwing = Math.cos(walkTime) * 0.2;

      if (leftLegRef.current) leftLegRef.current.rotation.x = legSwing;
      if (rightLegRef.current) rightLegRef.current.rotation.x = -legSwing;
      if (leftArmRef.current) leftArmRef.current.rotation.x = armSwing - 0.4; // Arms raised defensively
      if (rightArmRef.current) rightArmRef.current.rotation.x = -armSwing - 0.4;

      groupRef.current.position.y = baseY + Math.abs(Math.sin(walkTime * 2)) * 0.02;
    } else if (isCrossing) {
      // Normal walking gait
      const walkTime = Date.now() * 0.008 * (data.speed / 1.2);
      const legSwing = Math.sin(walkTime) * 0.55;
      const armSwing = -legSwing * 0.6;

      if (leftLegRef.current) leftLegRef.current.rotation.x = legSwing;
      if (rightLegRef.current) rightLegRef.current.rotation.x = -legSwing;
      if (leftArmRef.current) leftArmRef.current.rotation.x = armSwing;
      if (rightArmRef.current) rightArmRef.current.rotation.x = -armSwing;

      // Vertical bounce
      groupRef.current.position.y = baseY + Math.abs(Math.sin(walkTime * 2)) * 0.05;
    } else {
      // Standing idle at holding curb
      if (leftLegRef.current) leftLegRef.current.rotation.x = 0;
      if (rightLegRef.current) rightLegRef.current.rotation.x = 0;
      if (leftArmRef.current) leftArmRef.current.rotation.x = 0;
      if (rightArmRef.current) rightArmRef.current.rotation.x = 0;
      groupRef.current.position.y = baseY;
    }
  });

  return (
    <group
      ref={groupRef}
      position={[data.position.x, baseY, data.position.z]}
      rotation={[0, heading, 0]}
    >
      {/* ── Head (1.60m) ── */}
      <mesh position={[0, 1.58, 0]} castShadow>
        <sphereGeometry args={[0.13, 12, 12]} />
        <meshStandardMaterial color="#fed7aa" roughness={0.6} />
      </mesh>

      {/* Hair / Cap */}
      <mesh position={[0, 1.64, -0.01]}>
        <sphereGeometry args={[0.134, 10, 10]} />
        <meshStandardMaterial color="#0f172a" roughness={0.9} />
      </mesh>

      {/* ── Torso / Shirt (0.85m to 1.45m) ── */}
      <mesh position={[0, 1.15, 0]} castShadow>
        <boxGeometry args={[0.42, 0.60, 0.24]} />
        <meshStandardMaterial color={shirtColor} roughness={0.6} />
      </mesh>

      {/* ── Arms ── */}
      {/* Left Arm */}
      <mesh ref={leftArmRef} position={[-0.26, 1.12, 0]} castShadow>
        <cylinderGeometry args={[0.05, 0.05, 0.55, 6]} />
        <meshStandardMaterial color={shirtColor} roughness={0.6} />
      </mesh>
      {/* Right Arm */}
      <mesh ref={rightArmRef} position={[0.26, 1.12, 0]} castShadow>
        <cylinderGeometry args={[0.05, 0.05, 0.55, 6]} />
        <meshStandardMaterial color={shirtColor} roughness={0.6} />
      </mesh>

      {/* ── Legs (0.10m to 0.85m) ── */}
      {/* Left Leg */}
      <mesh ref={leftLegRef} position={[-0.12, 0.48, 0]} castShadow>
        <boxGeometry args={[0.14, 0.70, 0.16]} />
        <meshStandardMaterial color={pantsColor} roughness={0.7} />
      </mesh>
      {/* Right Leg */}
      <mesh ref={rightLegRef} position={[0.12, 0.48, 0]} castShadow>
        <boxGeometry args={[0.14, 0.70, 0.16]} />
        <meshStandardMaterial color={pantsColor} roughness={0.7} />
      </mesh>

      {/* ── Shoes ── */}
      <mesh position={[-0.12, 0.05, 0.04]}>
        <boxGeometry args={[0.15, 0.09, 0.22]} />
        <meshStandardMaterial color="#020617" roughness={0.8} />
      </mesh>
      <mesh position={[0.12, 0.05, 0.04]}>
        <boxGeometry args={[0.15, 0.09, 0.22]} />
        <meshStandardMaterial color="#020617" roughness={0.8} />
      </mesh>

      {/* ── Conflict Hazard Ground Shockwave ── */}
      {isInConflict && (
        <group position={[0, 0.005, 0]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.6, 1.1, 24]} />
            <meshStandardMaterial
              color="#ef4444"
              emissive="#ef4444"
              emissiveIntensity={3}
              transparent
              opacity={0.85}
              side={THREE.DoubleSide}
            />
          </mesh>
        </group>
      )}
    </group>
  );
}
