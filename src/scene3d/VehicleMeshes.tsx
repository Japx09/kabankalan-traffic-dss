'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import {
  VEHICLE_DIMENSIONS,
  type SimVehicleType,
  type VehicleAgent,
} from '@/sim/types';
import { getLiveSimState, useSimStore } from '@/store/simStore';

const ROAD_SURFACE_Y = 0.048;

const JEEPNEY_PALETTE = ['#dc2626', '#2563eb', '#0d9488', '#15803d', '#ea580c'] as const;
const TRICYCLE_PALETTE = ['#1d4ed8', '#dc2626', '#eab308', '#16a34a', '#ea580c'] as const;
const CAR_PALETTE = ['#f1f5f9', '#94a3b8', '#1e3a5f', '#b91c1c', '#334155', '#d6c7a9'] as const;

interface VehicleRosterItem {
  readonly id: string;
  readonly type: SimVehicleType;
  readonly colorVariant: number;
}

interface VehicleRig {
  group: THREE.Group | null;
  brakeMat: THREE.MeshStandardMaterial;
  leftBlinkerMat: THREE.MeshStandardMaterial;
  rightBlinkerMat: THREE.MeshStandardMaterial;
  initialized: boolean;
}

interface SharedMaterials {
  tire: THREE.MeshStandardMaterial;
  rim: THREE.MeshStandardMaterial;
  glass: THREE.MeshPhysicalMaterial;
  headlight: THREE.MeshStandardMaterial;
  chrome: THREE.MeshPhysicalMaterial;
  darkTrim: THREE.MeshStandardMaterial;
  ceresYellow: THREE.MeshPhysicalMaterial;
  ceresWhite: THREE.MeshPhysicalMaterial;
  ceresStripe: THREE.MeshStandardMaterial;
  riderSkin: THREE.MeshStandardMaterial;
  riderShirt: THREE.MeshStandardMaterial;
}

function createSharedVehicleMaterials(): SharedMaterials {
  return {
    tire: new THREE.MeshStandardMaterial({ color: '#14171c', roughness: 0.88, metalness: 0.05 }),
    rim: new THREE.MeshStandardMaterial({ color: '#cbd5e1', roughness: 0.25, metalness: 0.85 }),
    glass: new THREE.MeshPhysicalMaterial({
      color: '#101d2c',
      roughness: 0.06,
      metalness: 0.18,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05,
      envMapIntensity: 1.65,
    }),
    headlight: new THREE.MeshStandardMaterial({
      color: '#fffbeb',
      emissive: '#fef3c7',
      emissiveIntensity: 1.4,
      roughness: 0.2,
    }),
    chrome: new THREE.MeshPhysicalMaterial({
      color: '#e2e8f0',
      roughness: 0.16,
      metalness: 0.9,
      clearcoat: 0.5,
      envMapIntensity: 1.4,
    }),
    darkTrim: new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.72 }),
    ceresYellow: new THREE.MeshPhysicalMaterial({
      color: '#f5b800',
      roughness: 0.3,
      metalness: 0.16,
      clearcoat: 0.78,
      clearcoatRoughness: 0.16,
      envMapIntensity: 1.2,
    }),
    ceresWhite: new THREE.MeshPhysicalMaterial({
      color: '#f8fafc',
      roughness: 0.34,
      metalness: 0.08,
      clearcoat: 0.7,
      clearcoatRoughness: 0.18,
      envMapIntensity: 1.15,
    }),
    ceresStripe: new THREE.MeshStandardMaterial({ color: '#b91c1c', roughness: 0.42 }),
    riderSkin: new THREE.MeshStandardMaterial({ color: '#d4a373', roughness: 0.8 }),
    riderShirt: new THREE.MeshStandardMaterial({ color: '#0284c7', roughness: 0.85 }),
  };
}

/**
 * Reusable wheel assembly rotated along the X-axis (axle).
 */
function WheelPair({
  xSpan,
  y,
  z,
  radius,
  width,
  shared,
}: {
  xSpan: number;
  y: number;
  z: number;
  radius: number;
  width: number;
  shared: SharedMaterials;
}) {
  return (
    <>
      {([-1, 1] as const).map((side) => (
        <group key={side} position={[side * xSpan, y, z]} rotation={[0, 0, Math.PI * 0.5]}>
          <mesh material={shared.tire} castShadow>
            <cylinderGeometry args={[radius, radius, width, 12]} />
          </mesh>
          <mesh material={shared.rim}>
            <cylinderGeometry args={[radius * 0.52, radius * 0.52, width + 0.02, 10]} />
          </mesh>
        </group>
      ))}
    </>
  );
}

/**
 * Iconic Negros Occidental Ceres Liner Bus (12.0m x 2.5m x 3.4m), facing +Z forward.
 */
function CeresBusBody({
  shared,
  brakeMat,
  leftBlinkerMat,
  rightBlinkerMat,
}: {
  shared: SharedMaterials;
  brakeMat: THREE.MeshStandardMaterial;
  leftBlinkerMat: THREE.MeshStandardMaterial;
  rightBlinkerMat: THREE.MeshStandardMaterial;
}) {
  const { length: L, width: W, height: H } = VEHICLE_DIMENSIONS.bus;
  const halfL = L * 0.5;
  const halfW = W * 0.5;

  return (
    <group>
      {/* Lower golden-yellow Ceres body */}
      <mesh position={[0, 1.08, 0]} material={shared.ceresYellow} castShadow receiveShadow>
        <boxGeometry args={[W - 0.04, 1.36, L - 0.12]} />
      </mesh>
      {/* Upper white cabin & roofline */}
      <mesh position={[0, 2.48, -0.05]} material={shared.ceresWhite} castShadow receiveShadow>
        <boxGeometry args={[W - 0.06, 1.48, L - 0.24]} />
      </mesh>
      {/* Signature crimson beltline stripe */}
      <mesh position={[0, 1.72, 0]} material={shared.ceresStripe}>
        <boxGeometry args={[W - 0.01, 0.14, L - 0.14]} />
      </mesh>
      {/* Front & rear dark bumpers */}
      <mesh position={[0, 0.52, halfL - 0.04]} material={shared.darkTrim}>
        <boxGeometry args={[W - 0.02, 0.34, 0.16]} />
      </mesh>
      <mesh position={[0, 0.52, -halfL + 0.04]} material={shared.darkTrim}>
        <boxGeometry args={[W - 0.02, 0.34, 0.16]} />
      </mesh>

      {/* Panoramic tinted front windshield (+Z) */}
      <mesh position={[0, 2.24, halfL - 0.08]} rotation={[-0.08, 0, 0]} material={shared.glass}>
        <boxGeometry args={[W - 0.22, 1.28, 0.12]} />
      </mesh>
      {/* Rear window */}
      <mesh position={[0, 2.38, -halfL + 0.11]} material={shared.glass}>
        <boxGeometry args={[W - 0.34, 0.92, 0.08]} />
      </mesh>
      {/* Continuous tinted side passenger window bands */}
      <mesh position={[halfW - 0.01, 2.34, -0.1]} material={shared.glass}>
        <boxGeometry args={[0.06, 0.98, L - 1.5]} />
      </mesh>
      <mesh position={[-(halfW - 0.01), 2.34, -0.1]} material={shared.glass}>
        <boxGeometry args={[0.06, 0.98, L - 1.5]} />
      </mesh>

      {/* Roof-mounted HVAC condenser pod */}
      <mesh position={[0, H - 0.08, -0.4]} material={shared.ceresWhite} castShadow>
        <boxGeometry args={[1.65, 0.3, 4.4]} />
      </mesh>
      <mesh position={[0, H - 0.04, -0.4]} material={shared.darkTrim}>
        <boxGeometry args={[1.35, 0.24, 3.8]} />
      </mesh>

      {/* Front headlights (+Z) */}
      <mesh position={[halfW - 0.34, 0.88, halfL - 0.04]} material={shared.headlight}>
        <boxGeometry args={[0.42, 0.22, 0.08]} />
      </mesh>
      <mesh position={[-(halfW - 0.34), 0.88, halfL - 0.04]} material={shared.headlight}>
        <boxGeometry args={[0.42, 0.22, 0.08]} />
      </mesh>

      {/* Dynamic Rear Red Brake Lights (-Z) */}
      <mesh position={[halfW - 0.34, 1.02, -halfL + 0.03]} material={brakeMat}>
        <boxGeometry args={[0.46, 0.28, 0.08]} />
      </mesh>
      <mesh position={[-(halfW - 0.34), 1.02, -halfL + 0.03]} material={brakeMat}>
        <boxGeometry args={[0.46, 0.28, 0.08]} />
      </mesh>
      {/* High-mount center brake light */}
      <mesh position={[0, 3.06, -halfL + 0.08]} material={brakeMat}>
        <boxGeometry args={[0.65, 0.1, 0.08]} />
      </mesh>

      {/* Left (+X) & Right (-X) amber turn signal blinkers (front + rear) */}
      <mesh position={[halfW - 0.14, 0.88, halfL - 0.04]} material={leftBlinkerMat}>
        <boxGeometry args={[0.18, 0.2, 0.1]} />
      </mesh>
      <mesh position={[halfW - 0.14, 1.02, -halfL + 0.03]} material={leftBlinkerMat}>
        <boxGeometry args={[0.18, 0.26, 0.1]} />
      </mesh>
      <mesh position={[-(halfW - 0.14), 0.88, halfL - 0.04]} material={rightBlinkerMat}>
        <boxGeometry args={[0.18, 0.2, 0.1]} />
      </mesh>
      <mesh position={[-(halfW - 0.14), 1.02, -halfL + 0.03]} material={rightBlinkerMat}>
        <boxGeometry args={[0.18, 0.26, 0.1]} />
      </mesh>

      {/* 3 axles (steer front + dual rear) */}
      <WheelPair xSpan={halfW - 0.16} y={0.5} z={3.45} radius={0.5} width={0.3} shared={shared} />
      <WheelPair xSpan={halfW - 0.18} y={0.5} z={-2.55} radius={0.5} width={0.44} shared={shared} />
      <WheelPair xSpan={halfW - 0.18} y={0.5} z={-3.75} radius={0.5} width={0.36} shared={shared} />
    </group>
  );
}

/**
 * Philippine Jeepney (6.5m x 1.85m x 2.3m), facing +Z forward.
 */
function JeepneyBody({
  colorVariant,
  shared,
  brakeMat,
  leftBlinkerMat,
  rightBlinkerMat,
}: {
  colorVariant: number;
  shared: SharedMaterials;
  brakeMat: THREE.MeshStandardMaterial;
  leftBlinkerMat: THREE.MeshStandardMaterial;
  rightBlinkerMat: THREE.MeshStandardMaterial;
}) {
  const { length: L, width: W, height: H } = VEHICLE_DIMENSIONS.jeepney;
  const halfL = L * 0.5;
  const halfW = W * 0.5;
  const liveryColor = JEEPNEY_PALETTE[colorVariant % JEEPNEY_PALETTE.length];

  return (
    <group>
      {/* Protruding front engine hood (+Z) */}
      <mesh position={[0, 0.96, halfL - 1.02]} material={shared.chrome} castShadow receiveShadow>
        <boxGeometry args={[W - 0.28, 0.82, 1.85]} />
      </mesh>
      {/* Vertical stainless radiator grille & chrome front bumper */}
      <mesh position={[0, 0.95, halfL - 0.08]} material={shared.chrome}>
        <boxGeometry args={[W - 0.34, 0.72, 0.08]} />
      </mesh>
      <mesh position={[0, 0.48, halfL - 0.02]} material={shared.chrome} castShadow>
        <boxGeometry args={[W, 0.2, 0.16]} />
      </mesh>

      {/* Lower colorful painted jeepney passenger body */}
      <mesh position={[0, 0.92, -0.78]} castShadow receiveShadow>
        <boxGeometry args={[W - 0.04, 0.96, L - 1.9]} />
        <meshPhysicalMaterial
          color={liveryColor}
          roughness={0.3}
          metalness={0.22}
          clearcoat={0.75}
          clearcoatRoughness={0.18}
          envMapIntensity={1.2}
        />
      </mesh>
      {/* Stainless upper beltline stripe */}
      <mesh position={[0, 1.38, -0.78]} material={shared.chrome}>
        <boxGeometry args={[W, 0.12, L - 1.88]} />
      </mesh>

      {/* Angled front windshield */}
      <mesh position={[0, 1.72, halfL - 1.88]} rotation={[-0.22, 0, 0]} material={shared.glass}>
        <boxGeometry args={[W - 0.18, 0.72, 0.08]} />
      </mesh>

      {/* Open-sided passenger bay vertical pillars */}
      {[-2.85, -1.65, -0.45, 0.75, 1.3].map((pz) => (
        <React.Fragment key={pz}>
          <mesh position={[halfW - 0.08, 1.78, pz]} material={shared.chrome}>
            <boxGeometry args={[0.07, 0.78, 0.08]} />
          </mesh>
          <mesh position={[-(halfW - 0.08), 1.78, pz]} material={shared.chrome}>
            <boxGeometry args={[0.07, 0.78, 0.08]} />
          </mesh>
        </React.Fragment>
      ))}
      {/* Interior bench seats (visible through open windows) */}
      <mesh position={[halfW - 0.28, 0.98, -1.0]} material={shared.darkTrim}>
        <boxGeometry args={[0.35, 0.25, 3.8]} />
      </mesh>
      <mesh position={[-(halfW - 0.28), 0.98, -1.0]} material={shared.darkTrim}>
        <boxGeometry args={[0.35, 0.25, 3.8]} />
      </mesh>

      {/* Extended overhanging roof + luggage rail */}
      <mesh position={[0, H - 0.12, -0.68]} castShadow receiveShadow>
        <boxGeometry args={[W + 0.06, 0.16, L - 1.55]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.45} />
      </mesh>
      <mesh position={[0, H, -0.95]} material={shared.chrome}>
        <boxGeometry args={[W - 0.35, 0.08, L - 2.4]} />
      </mesh>

      {/* Round classic headlights */}
      <mesh position={[halfW - 0.34, 0.94, halfL - 0.04]} material={shared.headlight}>
        <boxGeometry args={[0.24, 0.22, 0.08]} />
      </mesh>
      <mesh position={[-(halfW - 0.34), 0.94, halfL - 0.04]} material={shared.headlight}>
        <boxGeometry args={[0.24, 0.22, 0.08]} />
      </mesh>

      {/* Dynamic Rear Red Brake Lights & Blinkers */}
      <mesh position={[halfW - 0.22, 0.78, -halfL + 0.08]} material={brakeMat}>
        <boxGeometry args={[0.28, 0.22, 0.08]} />
      </mesh>
      <mesh position={[-(halfW - 0.22), 0.78, -halfL + 0.08]} material={brakeMat}>
        <boxGeometry args={[0.28, 0.22, 0.08]} />
      </mesh>
      <mesh position={[halfW - 0.1, 0.78, -halfL + 0.08]} material={leftBlinkerMat}>
        <boxGeometry args={[0.14, 0.2, 0.08]} />
      </mesh>
      <mesh position={[-(halfW - 0.1), 0.78, -halfL + 0.08]} material={rightBlinkerMat}>
        <boxGeometry args={[0.14, 0.2, 0.08]} />
      </mesh>

      <WheelPair xSpan={halfW - 0.12} y={0.38} z={1.9} radius={0.38} width={0.24} shared={shared} />
      <WheelPair xSpan={halfW - 0.12} y={0.38} z={-1.9} radius={0.38} width={0.26} shared={shared} />
    </group>
  );
}

/**
 * Philippine Motorized Tricycle (2.3m x 1.4m x 1.8m), facing +Z forward.
 * Motorcycle on local +X (left/driver side), covered passenger sidecar on local -X (right/curb side).
 */
function TricycleBody({
  colorVariant,
  shared,
  brakeMat,
  leftBlinkerMat,
  rightBlinkerMat,
}: {
  colorVariant: number;
  shared: SharedMaterials;
  brakeMat: THREE.MeshStandardMaterial;
  leftBlinkerMat: THREE.MeshStandardMaterial;
  rightBlinkerMat: THREE.MeshStandardMaterial;
}) {
  const canopyColor = TRICYCLE_PALETTE[colorVariant % TRICYCLE_PALETTE.length];

  return (
    <group>
      {/* Motorcycle chassis (+X side) */}
      <mesh position={[0.38, 0.66, 0.05]} material={shared.darkTrim} castShadow>
        <boxGeometry args={[0.3, 0.44, 1.55]} />
      </mesh>
      {/* Handlebars */}
      <mesh position={[0.38, 1.05, 0.62]} material={shared.chrome}>
        <boxGeometry args={[0.62, 0.06, 0.08]} />
      </mesh>
      {/* Motorcycle headlight */}
      <mesh position={[0.38, 0.94, 0.88]} material={shared.headlight}>
        <boxGeometry args={[0.18, 0.18, 0.1]} />
      </mesh>
      {/* Driver torso & helmet */}
      <mesh position={[0.38, 1.18, -0.05]} material={shared.riderShirt} castShadow>
        <boxGeometry args={[0.36, 0.56, 0.34]} />
      </mesh>
      <mesh position={[0.38, 1.58, -0.02]} material={shared.riderSkin} castShadow>
        <sphereGeometry args={[0.14, 8, 8]} />
      </mesh>
      {/* Motorcycle front & rear wheels */}
      <mesh position={[0.38, 0.3, 0.72]} rotation={[0, 0, Math.PI * 0.5]} material={shared.tire} castShadow>
        <cylinderGeometry args={[0.3, 0.3, 0.13, 10]} />
      </mesh>
      <mesh position={[0.38, 0.3, -0.68]} rotation={[0, 0, Math.PI * 0.5]} material={shared.tire} castShadow>
        <cylinderGeometry args={[0.3, 0.3, 0.14, 10]} />
      </mesh>

      {/* Passenger Sidecar Cab (-X curb side!) */}
      <mesh position={[-0.26, 0.66, -0.04]} castShadow receiveShadow>
        <boxGeometry args={[0.78, 0.72, 1.62]} />
        <meshPhysicalMaterial
          color={canopyColor}
          roughness={0.34}
          metalness={0.16}
          clearcoat={0.6}
          clearcoatRoughness={0.22}
        />
      </mesh>
      {/* Sidecar front windshield */}
      <mesh position={[-0.26, 1.26, 0.68]} rotation={[-0.18, 0, 0]} material={shared.glass}>
        <boxGeometry args={[0.72, 0.54, 0.06]} />
      </mesh>
      {/* Sidecar stainless roof support struts */}
      <mesh position={[-0.6, 1.32, -0.72]} material={shared.chrome}>
        <boxGeometry args={[0.05, 0.78, 0.05]} />
      </mesh>
      <mesh position={[0.1, 1.32, -0.72]} material={shared.chrome}>
        <boxGeometry args={[0.05, 0.78, 0.05]} />
      </mesh>
      {/* Full overhead canopy covering sidecar & driver */}
      <mesh position={[-0.04, 1.72, -0.04]} castShadow receiveShadow>
        <boxGeometry args={[1.28, 0.12, 1.78]} />
        <meshStandardMaterial color={canopyColor} roughness={0.48} />
      </mesh>
      {/* Sidecar outer wheel */}
      <mesh position={[-0.66, 0.26, -0.22]} rotation={[0, 0, Math.PI * 0.5]} material={shared.tire} castShadow>
        <cylinderGeometry args={[0.26, 0.26, 0.13, 10]} />
      </mesh>

      {/* Dynamic Brake Lights & Blinkers */}
      <mesh position={[0.38, 0.72, -0.82]} material={brakeMat}>
        <boxGeometry args={[0.16, 0.14, 0.08]} />
      </mesh>
      <mesh position={[-0.45, 0.68, -0.86]} material={brakeMat}>
        <boxGeometry args={[0.2, 0.14, 0.08]} />
      </mesh>
      <mesh position={[0.52, 0.72, -0.82]} material={leftBlinkerMat}>
        <boxGeometry args={[0.1, 0.12, 0.08]} />
      </mesh>
      <mesh position={[-0.6, 0.68, -0.86]} material={rightBlinkerMat}>
        <boxGeometry args={[0.1, 0.12, 0.08]} />
      </mesh>
    </group>
  );
}

/**
 * Private Modern Sedan / Compact SUV (4.7m x 1.85m x 1.55m), facing +Z forward.
 */
function PrivateCarBody({
  colorVariant,
  shared,
  brakeMat,
  leftBlinkerMat,
  rightBlinkerMat,
}: {
  colorVariant: number;
  shared: SharedMaterials;
  brakeMat: THREE.MeshStandardMaterial;
  leftBlinkerMat: THREE.MeshStandardMaterial;
  rightBlinkerMat: THREE.MeshStandardMaterial;
}) {
  const { length: L, width: W } = VEHICLE_DIMENSIONS.car;
  const halfL = L * 0.5;
  const halfW = W * 0.5;
  const paintColor = CAR_PALETTE[colorVariant % CAR_PALETTE.length];

  return (
    <group>
      {/* Lower sculpted chassis */}
      <mesh position={[0, 0.62, 0]} castShadow receiveShadow>
        <boxGeometry args={[W - 0.04, 0.66, L - 0.14]} />
        <meshPhysicalMaterial
          color={paintColor}
          roughness={0.26}
          metalness={0.32}
          clearcoat={0.85}
          clearcoatRoughness={0.14}
          envMapIntensity={1.3}
        />
      </mesh>
      {/* Upper greenhouse cabin */}
      <mesh position={[0, 1.18, -0.22]} castShadow receiveShadow>
        <boxGeometry args={[W - 0.28, 0.56, L * 0.52]} />
        <meshPhysicalMaterial
          color={paintColor}
          roughness={0.26}
          metalness={0.32}
          clearcoat={0.85}
          clearcoatRoughness={0.14}
          envMapIntensity={1.3}
        />
      </mesh>
      {/* Front & rear dark tinted windshields */}
      <mesh position={[0, 1.16, 0.96]} rotation={[-0.45, 0, 0]} material={shared.glass}>
        <boxGeometry args={[W - 0.34, 0.56, 0.08]} />
      </mesh>
      <mesh position={[0, 1.16, -1.36]} rotation={[0.42, 0, 0]} material={shared.glass}>
        <boxGeometry args={[W - 0.36, 0.52, 0.08]} />
      </mesh>
      {/* Side windows */}
      <mesh position={[halfW - 0.13, 1.18, -0.2]} material={shared.glass}>
        <boxGeometry args={[0.05, 0.44, L * 0.46]} />
      </mesh>
      <mesh position={[-(halfW - 0.13), 1.18, -0.2]} material={shared.glass}>
        <boxGeometry args={[0.05, 0.44, L * 0.46]} />
      </mesh>
      {/* Front grille */}
      <mesh position={[0, 0.56, halfL - 0.05]} material={shared.darkTrim}>
        <boxGeometry args={[0.92, 0.26, 0.08]} />
      </mesh>

      {/* Headlights */}
      <mesh position={[halfW - 0.28, 0.66, halfL - 0.05]} material={shared.headlight}>
        <boxGeometry args={[0.36, 0.16, 0.08]} />
      </mesh>
      <mesh position={[-(halfW - 0.28), 0.66, halfL - 0.05]} material={shared.headlight}>
        <boxGeometry args={[0.36, 0.16, 0.08]} />
      </mesh>

      {/* Dynamic Rear Red Brake Lights */}
      <mesh position={[halfW - 0.32, 0.72, -halfL + 0.05]} material={brakeMat}>
        <boxGeometry args={[0.42, 0.16, 0.08]} />
      </mesh>
      <mesh position={[-(halfW - 0.32), 0.72, -halfL + 0.05]} material={brakeMat}>
        <boxGeometry args={[0.42, 0.16, 0.08]} />
      </mesh>

      {/* Left (+X) & Right (-X) amber turn blinkers */}
      <mesh position={[halfW - 0.1, 0.66, halfL - 0.05]} material={leftBlinkerMat}>
        <boxGeometry args={[0.12, 0.14, 0.08]} />
      </mesh>
      <mesh position={[halfW - 0.1, 0.72, -halfL + 0.05]} material={leftBlinkerMat}>
        <boxGeometry args={[0.12, 0.16, 0.08]} />
      </mesh>
      <mesh position={[-(halfW - 0.1), 0.66, halfL - 0.05]} material={rightBlinkerMat}>
        <boxGeometry args={[0.12, 0.14, 0.08]} />
      </mesh>
      <mesh position={[-(halfW - 0.1), 0.72, -halfL + 0.05]} material={rightBlinkerMat}>
        <boxGeometry args={[0.12, 0.16, 0.08]} />
      </mesh>

      <WheelPair xSpan={halfW - 0.1} y={0.34} z={1.38} radius={0.34} width={0.22} shared={shared} />
      <WheelPair xSpan={halfW - 0.1} y={0.34} z={-1.35} radius={0.34} width={0.22} shared={shared} />
    </group>
  );
}

interface VehicleInstanceProps {
  item: VehicleRosterItem;
  isSelected: boolean;
  showBoundingBox: boolean;
  shared: SharedMaterials;
  rigsRef: React.MutableRefObject<Map<string, VehicleRig>>;
  onSelect: (id: string) => void;
}

const VehicleInstance = React.memo(function VehicleInstance({
  item,
  isSelected,
  showBoundingBox,
  shared,
  rigsRef,
  onSelect,
}: VehicleInstanceProps) {
  const groupRef = useRef<THREE.Group>(null);
  const dims = VEHICLE_DIMENSIONS[item.type];

  const dynamicMats = useMemo(() => {
    return {
      brakeMat: new THREE.MeshStandardMaterial({
        color: '#7f1d1d',
        emissive: '#ff1e1e',
        emissiveIntensity: 0.14,
        roughness: 0.25,
        toneMapped: false,
      }),
      leftBlinkerMat: new THREE.MeshStandardMaterial({
        color: '#78350f',
        emissive: '#f59e0b',
        emissiveIntensity: 0.0,
        roughness: 0.3,
        toneMapped: false,
      }),
      rightBlinkerMat: new THREE.MeshStandardMaterial({
        color: '#78350f',
        emissive: '#f59e0b',
        emissiveIntensity: 0.0,
        roughness: 0.3,
        toneMapped: false,
      }),
    };
  }, []);

  useEffect(() => {
    const rig: VehicleRig = {
      group: groupRef.current,
      brakeMat: dynamicMats.brakeMat,
      leftBlinkerMat: dynamicMats.leftBlinkerMat,
      rightBlinkerMat: dynamicMats.rightBlinkerMat,
      initialized: false,
    };
    const rigs = rigsRef.current;
    rigs.set(item.id, rig);

    // Snap immediately to current live physics pose so newly spawned vehicles never pop at (0,0,0)
    const liveVehicle = getLiveSimState().vehicles.find((v) => v.id === item.id);
    if (liveVehicle && groupRef.current) {
      groupRef.current.position.set(liveVehicle.position.x, ROAD_SURFACE_Y, liveVehicle.position.z);
      groupRef.current.rotation.set(0, liveVehicle.heading, 0);
      rig.initialized = true;
    }

    return () => {
      rigs.delete(item.id);
      dynamicMats.brakeMat.dispose();
      dynamicMats.leftBlinkerMat.dispose();
      dynamicMats.rightBlinkerMat.dispose();
    };
  }, [item.id, dynamicMats, rigsRef]);

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onSelect(item.id);
  };

  const handlePointerOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (typeof document !== 'undefined') document.body.style.cursor = 'pointer';
  };

  const handlePointerOut = () => {
    if (typeof document !== 'undefined') document.body.style.cursor = 'auto';
  };

  const ringRadius = Math.hypot(dims.length, dims.width) * 0.52;

  return (
    <group
      ref={groupRef}
      name={`vehicle-${item.id}`}
      onClick={handleClick}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
    >
      {/* Slightly expanded transparent click hitbox for effortless 3D selection */}
      <mesh position={[0, dims.height * 0.5 + 0.3, 0]}>
        <boxGeometry args={[dims.width + 1.6, dims.height + 1.2, dims.length + 1.6]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {item.type === 'bus' && (
        <CeresBusBody
          shared={shared}
          brakeMat={dynamicMats.brakeMat}
          leftBlinkerMat={dynamicMats.leftBlinkerMat}
          rightBlinkerMat={dynamicMats.rightBlinkerMat}
        />
      )}
      {item.type === 'jeepney' && (
        <JeepneyBody
          colorVariant={item.colorVariant}
          shared={shared}
          brakeMat={dynamicMats.brakeMat}
          leftBlinkerMat={dynamicMats.leftBlinkerMat}
          rightBlinkerMat={dynamicMats.rightBlinkerMat}
        />
      )}
      {item.type === 'tricycle' && (
        <TricycleBody
          colorVariant={item.colorVariant}
          shared={shared}
          brakeMat={dynamicMats.brakeMat}
          leftBlinkerMat={dynamicMats.leftBlinkerMat}
          rightBlinkerMat={dynamicMats.rightBlinkerMat}
        />
      )}
      {item.type === 'car' && (
        <PrivateCarBody
          colorVariant={item.colorVariant}
          shared={shared}
          brakeMat={dynamicMats.brakeMat}
          leftBlinkerMat={dynamicMats.leftBlinkerMat}
          rightBlinkerMat={dynamicMats.rightBlinkerMat}
        />
      )}

      {/* Glowing cyan selection ring under selected vehicle */}
      {isSelected && (
        <mesh position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[ringRadius * 0.86, ringRadius, 32]} />
          <meshBasicMaterial
            color="#22d3ee"
            transparent
            opacity={0.9}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      )}

      {/* Optional DPWH 1:1 wireframe bounding box overlay */}
      {(showBoundingBox || isSelected) && (
        <mesh position={[0, dims.height * 0.5, 0]}>
          <boxGeometry args={[dims.width, dims.height, dims.length]} />
          <meshBasicMaterial
            color={isSelected ? '#22d3ee' : '#38bdf8'}
            wireframe
            transparent
            opacity={isSelected ? 0.75 : 0.4}
          />
        </mesh>
      )}
    </group>
  );
});

/**
 * Renders all active 3D vehicles at butter-smooth 60 FPS by mutating Three.js transforms
 * and brake/turn-signal lights imperatively inside a single useFrame loop.
 * React only re-renders when a vehicle actually spawns or exits the corridor.
 */
export function VehicleMeshes() {
  const selectedVehicleId = useSimStore((s) => s.selectedVehicleId);
  const showBoundingBoxes = useSimStore((s) => s.overlays.showBoundingBoxes);
  const selectVehicle = useSimStore((s) => s.selectVehicle);

  const shared = useMemo(() => createSharedVehicleMaterials(), []);
  useEffect(() => {
    return () => {
      Object.values(shared).forEach((m) => m.dispose());
    };
  }, [shared]);

  const rigsRef = useRef<Map<string, VehicleRig>>(new Map());
  const rosterKeyRef = useRef<string>('');
  const [roster, setRoster] = useState<VehicleRosterItem[]>(() =>
    getLiveSimState().vehicles.map((v) => ({
      id: v.id,
      type: v.type,
      colorVariant: v.colorVariant,
    })),
  );

  useFrame(({ clock }, delta) => {
    const vehicles: readonly VehicleAgent[] = getLiveSimState().vehicles;

    // Lightweight roster sync ONLY when vehicle IDs change (spawn / exit / reset)
    let key = '';
    for (let i = 0; i < vehicles.length; i++) {
      key += vehicles[i].id + ',';
    }
    if (key !== rosterKeyRef.current) {
      rosterKeyRef.current = key;
      setRoster(
        vehicles.map((v) => ({
          id: v.id,
          type: v.type,
          colorVariant: v.colorVariant,
        })),
      );
    }

    const dt = Math.min(delta, 0.05);
    const smoothAlpha = 1 - Math.exp(-20 * dt);
    const blinkerOn = Math.sin(clock.elapsedTime * 15) > 0;
    const rigs = rigsRef.current;

    for (let i = 0; i < vehicles.length; i++) {
      const v = vehicles[i];
      const rig = rigs.get(v.id);
      if (!rig || !rig.group) continue;

      if (!rig.initialized) {
        rig.group.position.set(v.position.x, ROAD_SURFACE_Y, v.position.z);
        rig.group.rotation.set(0, v.heading, 0);
        rig.initialized = true;
      } else {
        // Snap if teleported > 6m (e.g. reset), otherwise smoothly damp
        const dx = v.position.x - rig.group.position.x;
        const dz = v.position.z - rig.group.position.z;
        if (dx * dx + dz * dz > 36) {
          rig.group.position.set(v.position.x, ROAD_SURFACE_Y, v.position.z);
          rig.group.rotation.y = v.heading;
        } else {
          rig.group.position.x += dx * smoothAlpha;
          rig.group.position.y = ROAD_SURFACE_Y;
          rig.group.position.z += dz * smoothAlpha;

          // Shortest-angle heading interpolation across -PI..PI wrap boundary
          const dAngle = Math.atan2(
            Math.sin(v.heading - rig.group.rotation.y),
            Math.cos(v.heading - rig.group.rotation.y),
          );
          rig.group.rotation.y += dAngle * smoothAlpha;
        }
      }

      // Dynamic glowing red brake lights
      if (v.isBrakingLightOn) {
        rig.brakeMat.emissiveIntensity = 3.2;
        rig.brakeMat.color.setHex(0xff3b30);
      } else {
        rig.brakeMat.emissiveIntensity = 0.14;
        rig.brakeMat.color.setHex(0x7f1d1d);
      }

      // Dynamic amber left / right turn blinkers
      const leftOn = v.turnSignal === 'left' && blinkerOn;
      const rightOn = v.turnSignal === 'right' && blinkerOn;
      rig.leftBlinkerMat.emissiveIntensity = leftOn ? 3.2 : 0.0;
      rig.leftBlinkerMat.color.setHex(leftOn ? 0xfbbf24 : 0x78350f);
      rig.rightBlinkerMat.emissiveIntensity = rightOn ? 3.2 : 0.0;
      rig.rightBlinkerMat.color.setHex(rightOn ? 0xfbbf24 : 0x78350f);
    }
  });

  return (
    <group name="vehicles-layer">
      {roster.map((item) => (
        <VehicleInstance
          key={item.id}
          item={item}
          isSelected={item.id === selectedVehicleId}
          showBoundingBox={showBoundingBoxes}
          shared={shared}
          rigsRef={rigsRef}
          onSelect={selectVehicle}
        />
      ))}
    </group>
  );
}
