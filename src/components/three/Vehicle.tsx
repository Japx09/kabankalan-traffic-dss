'use client';

import React, { useRef, useMemo } from 'react';
import * as THREE from 'three';
import { VehicleType, VehicleState, VEHICLE_DIMENSIONS, Vehicle as VehicleData } from '@/simulation/types';
import { useSimulationStore } from '@/store/simulationStore';

interface VehicleProps {
  data: VehicleData;
  showTrail?: boolean;
}

/** Realistic Wheel Primitive */
function Wheel({
  radius,
  width,
  position,
}: {
  radius: number;
  width: number;
  position: [number, number, number];
}) {
  return (
    <group position={position}>
      {/* Rubber Tire */}
      <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[radius, radius, width, 16]} />
        <meshStandardMaterial color="#0f172a" roughness={0.9} />
      </mesh>
      {/* Steel Hubcap */}
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[radius * 0.55, radius * 0.55, width + 0.005, 12]} />
        <meshStandardMaterial color="#cbd5e1" metalness={0.7} roughness={0.3} />
      </mesh>
    </group>
  );
}

/** ─── Ceres Coach Bus 3D Model (1:1 Metric Scale: 12.0m x 2.5m x 3.4m) ─── */
function CeresBusModel({
  dims,
  isBraking,
}: {
  dims: { length: number; width: number; height: number };
  isBraking: boolean;
}) {
  const l = dims.length; // 12.0m
  const w = dims.width;  // 2.5m
  const h = dims.height; // 3.4m
  const wheelR = 0.50;   // 1.0m diameter wheels
  const wheelW = 0.32;

  return (
    <group>
      {/* Main Yellow Coach Body */}
      <mesh position={[0, h * 0.52, 0]} castShadow receiveShadow>
        <boxGeometry args={[l, h * 0.82, w]} />
        <meshStandardMaterial color="#f59e0b" roughness={0.35} metalness={0.15} />
      </mesh>

      {/* Signature Ceres Emerald Green Livery Stripe */}
      <mesh position={[0, h * 0.36, 0]}>
        <boxGeometry args={[l + 0.02, h * 0.14, w + 0.03]} />
        <meshStandardMaterial color="#15803d" roughness={0.4} />
      </mesh>

      {/* Aerodynamic Sloping Front Windshield */}
      <mesh position={[l * 0.46, h * 0.65, 0]} rotation={[0, 0, -0.22]}>
        <boxGeometry args={[0.12, h * 0.45, w * 0.92]} />
        <meshStandardMaterial color="#0f172a" roughness={0.1} metalness={0.8} />
      </mesh>

      {/* Side Panoramic Tinted Window Ribbon */}
      <mesh position={[-l * 0.04, h * 0.66, 0]}>
        <boxGeometry args={[l * 0.82, h * 0.36, w + 0.03]} />
        <meshStandardMaterial color="#1e293b" roughness={0.1} metalness={0.6} transparent opacity={0.85} />
      </mesh>

      {/* Destination Marquee Box */}
      <mesh position={[l * 0.44, h * 0.92, 0]}>
        <boxGeometry args={[0.5, 0.4, w * 0.7]} />
        <meshStandardMaterial color="#0284c7" roughness={0.3} />
      </mesh>

      {/* Roof-mounted Dual HVAC Unit */}
      <mesh position={[-l * 0.05, h * 1.01, 0]} castShadow>
        <boxGeometry args={[l * 0.35, 0.35, w * 0.65]} />
        <meshStandardMaterial color="#e2e8f0" roughness={0.5} />
      </mesh>

      {/* 6 Wheels with Realistic Dual Rear Axles */}
      {/* Front Axle (Steer) */}
      <Wheel radius={wheelR} width={wheelW} position={[l * 0.32, wheelR, w * 0.5]} />
      <Wheel radius={wheelR} width={wheelW} position={[l * 0.32, wheelR, -w * 0.5]} />
      {/* Rear Dual Axles */}
      <Wheel radius={wheelR} width={wheelW} position={[-l * 0.24, wheelR, w * 0.5]} />
      <Wheel radius={wheelR} width={wheelW} position={[-l * 0.24, wheelR, -w * 0.5]} />
      <Wheel radius={wheelR} width={wheelW} position={[-l * 0.36, wheelR, w * 0.5]} />
      <Wheel radius={wheelR} width={wheelW} position={[-l * 0.36, wheelR, -w * 0.5]} />

      {/* Front Headlights */}
      <mesh position={[l * 0.505, h * 0.26, w * 0.35]}>
        <boxGeometry args={[0.06, 0.25, 0.3]} />
        <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={1.5} />
      </mesh>
      <mesh position={[l * 0.505, h * 0.26, -w * 0.35]}>
        <boxGeometry args={[0.06, 0.25, 0.3]} />
        <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={1.5} />
      </mesh>

      {/* Rear LED Brake Lights */}
      <mesh position={[-l * 0.505, h * 0.3, w * 0.36]}>
        <boxGeometry args={[0.06, 0.45, 0.2]} />
        <meshStandardMaterial
          color={isBraking ? '#ef4444' : '#991b1b'}
          emissive={isBraking ? '#ef4444' : '#7f1d1d'}
          emissiveIntensity={isBraking ? 3 : 0.6}
        />
      </mesh>
      <mesh position={[-l * 0.505, h * 0.3, -w * 0.36]}>
        <boxGeometry args={[0.06, 0.45, 0.2]} />
        <meshStandardMaterial
          color={isBraking ? '#ef4444' : '#991b1b'}
          emissive={isBraking ? '#ef4444' : '#7f1d1d'}
          emissiveIntensity={isBraking ? 3 : 0.6}
        />
      </mesh>
    </group>
  );
}

/** ─── Philippine Jeepney (PUJ) 3D Model (1:1 Metric: 6.5m x 1.8m x 2.3m) ─── */
function JeepneyModel({
  dims,
  isBraking,
}: {
  dims: { length: number; width: number; height: number };
  isBraking: boolean;
}) {
  const l = dims.length; // 6.5m
  const w = dims.width;  // 1.8m
  const h = dims.height; // 2.3m
  const wheelR = 0.38;
  const wheelW = 0.26;

  return (
    <group>
      {/* Front Engine Hood */}
      <mesh position={[l * 0.34, h * 0.38, 0]} castShadow receiveShadow>
        <boxGeometry args={[l * 0.32, h * 0.52, w * 0.82]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.7} roughness={0.3} />
      </mesh>

      {/* Vertical Chrome Grille */}
      <mesh position={[l * 0.505, h * 0.36, 0]}>
        <boxGeometry args={[0.06, h * 0.42, w * 0.65]} />
        <meshStandardMaterial color="#e2e8f0" metalness={0.9} roughness={0.2} />
      </mesh>
      {/* Front Chrome Bumper */}
      <mesh position={[l * 0.52, h * 0.15, 0]}>
        <boxGeometry args={[0.15, 0.22, w * 0.95]} />
        <meshStandardMaterial color="#cbd5e1" metalness={0.9} roughness={0.2} />
      </mesh>

      {/* Passenger Body & Driver Cabin */}
      <mesh position={[-l * 0.08, h * 0.5, 0]} castShadow receiveShadow>
        <boxGeometry args={[l * 0.68, h * 0.68, w]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.65} roughness={0.35} />
      </mesh>

      {/* Red/Yellow Side Decorative Stripe */}
      <mesh position={[-l * 0.08, h * 0.35, 0]}>
        <boxGeometry args={[l * 0.685, 0.16, w + 0.02]} />
        <meshStandardMaterial color="#dc2626" roughness={0.4} />
      </mesh>

      {/* Open Rear Boarding Bay & Step Plate */}
      <mesh position={[-l * 0.43, h * 0.2, 0]}>
        <boxGeometry args={[0.26, 0.1, w * 0.75]} />
        <meshStandardMaterial color="#475569" metalness={0.8} />
      </mesh>

      {/* Roof Tubular Luggage Rack */}
      <mesh position={[-l * 0.06, h * 0.9, 0]} castShadow>
        <boxGeometry args={[l * 0.72, 0.15, w * 0.9]} />
        <meshStandardMaterial color="#cbd5e1" metalness={0.85} roughness={0.3} />
      </mesh>

      {/* 4 Wheels */}
      <Wheel radius={wheelR} width={wheelW} position={[l * 0.3, wheelR, w * 0.46]} />
      <Wheel radius={wheelR} width={wheelW} position={[l * 0.3, wheelR, -w * 0.46]} />
      <Wheel radius={wheelR} width={wheelW} position={[-l * 0.26, wheelR, w * 0.46]} />
      <Wheel radius={wheelR} width={wheelW} position={[-l * 0.26, wheelR, -w * 0.46]} />

      {/* Brake Lights */}
      <mesh position={[-l * 0.425, h * 0.32, w * 0.42]}>
        <boxGeometry args={[0.06, 0.26, 0.16]} />
        <meshStandardMaterial
          color={isBraking ? '#ef4444' : '#7f1d1d'}
          emissive={isBraking ? '#ef4444' : '#450a0a'}
          emissiveIntensity={isBraking ? 3 : 0.5}
        />
      </mesh>
      <mesh position={[-l * 0.425, h * 0.32, -w * 0.42]}>
        <boxGeometry args={[0.06, 0.26, 0.16]} />
        <meshStandardMaterial
          color={isBraking ? '#ef4444' : '#7f1d1d'}
          emissive={isBraking ? '#ef4444' : '#450a0a'}
          emissiveIntensity={isBraking ? 3 : 0.5}
        />
      </mesh>
    </group>
  );
}

/** ─── Philippine Asymmetric Tricycle 3D Model (1:1 Metric: 2.2m x 1.4m x 1.8m) ─── */
function TricycleModel({
  isBraking,
}: {
  isBraking: boolean;
}) {
  const wheelR = 0.30;
  const wheelW = 0.16;

  return (
    <group>
      {/* ── Motorcycle Chassis (Left / Negative Z side) ── */}
      <group position={[0, 0, -0.4]}>
        {/* Motorcycle Frame & Engine */}
        <mesh position={[0, 0.45, 0]} castShadow>
          <boxGeometry args={[1.4, 0.5, 0.28]} />
          <meshStandardMaterial color="#1e293b" metalness={0.7} />
        </mesh>
        {/* Gas Tank (Blue) */}
        <mesh position={[0.25, 0.65, 0]} castShadow>
          <boxGeometry args={[0.65, 0.26, 0.26]} />
          <meshStandardMaterial color="#2563eb" roughness={0.4} />
        </mesh>
        {/* Driver Saddle */}
        <mesh position={[-0.2, 0.62, 0]}>
          <boxGeometry args={[0.55, 0.15, 0.25]} />
          <meshStandardMaterial color="#020617" roughness={0.8} />
        </mesh>
        {/* Handlebars */}
        <mesh position={[0.5, 0.82, 0]}>
          <boxGeometry args={[0.08, 0.08, 0.65]} />
          <meshStandardMaterial color="#cbd5e1" metalness={0.8} />
        </mesh>
        {/* Headlamp */}
        <mesh position={[0.68, 0.78, 0]}>
          <cylinderGeometry args={[0.1, 0.1, 0.08, 12]} />
          <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={1.2} />
        </mesh>
        {/* Front & Rear Motorcycle Wheels */}
        <Wheel radius={wheelR} width={wheelW} position={[0.65, wheelR, 0]} />
        <Wheel radius={wheelR} width={wheelW} position={[-0.55, wheelR, 0]} />
      </group>

      {/* ── Passenger Sidecar (Right / Positive Z side) ── */}
      <group position={[0, 0, 0.45]}>
        {/* Sidecar Passenger Cabin Box */}
        <mesh position={[0, 0.48, 0]} castShadow receiveShadow>
          <boxGeometry args={[1.5, 0.65, 0.8]} />
          <meshStandardMaterial color="#38bdf8" roughness={0.4} />
        </mesh>
        {/* Sidecar Roof Canopy */}
        <mesh position={[-0.05, 1.15, 0]} castShadow>
          <boxGeometry args={[1.6, 0.08, 0.9]} />
          <meshStandardMaterial color="#0284c7" roughness={0.5} />
        </mesh>
        {/* Sidecar Roof Pillars */}
        {[-0.6, 0.6].map((px, idx) => (
          <mesh key={`sc-post-${idx}`} position={[px, 0.82, 0.38]}>
            <cylinderGeometry args={[0.02, 0.02, 0.65, 6]} />
            <meshStandardMaterial color="#cbd5e1" metalness={0.8} />
          </mesh>
        ))}
        {/* Third Wheel on Outer Sidecar Hub */}
        <Wheel radius={wheelR} width={wheelW} position={[0, wheelR, 0.46]} />
        {/* Sidecar Fender */}
        <mesh position={[0, wheelR + 0.12, 0.46]}>
          <boxGeometry args={[0.7, 0.08, 0.22]} />
          <meshStandardMaterial color="#0284c7" />
        </mesh>
      </group>

      {/* Rear Small Brake Light */}
      <mesh position={[-0.75, 0.45, -0.4]}>
        <boxGeometry args={[0.04, 0.14, 0.14]} />
        <meshStandardMaterial
          color={isBraking ? '#ef4444' : '#7f1d1d'}
          emissive={isBraking ? '#ef4444' : '#300'}
          emissiveIntensity={isBraking ? 2.5 : 0.4}
        />
      </mesh>
    </group>
  );
}

/** ─── Private Car (Sedan) 3D Model (1:1 Metric: 4.8m x 1.8m x 1.5m) ─── */
function PrivateCarModel({
  dims,
  isBraking,
}: {
  dims: { length: number; width: number; height: number };
  isBraking: boolean;
}) {
  const l = dims.length; // 4.8m
  const w = dims.width;  // 1.8m
  const h = dims.height; // 1.5m
  const wheelR = 0.33;
  const wheelW = 0.22;

  return (
    <group>
      {/* Lower Body */}
      <mesh position={[0, h * 0.38, 0]} castShadow receiveShadow>
        <boxGeometry args={[l, h * 0.48, w]} />
        <meshStandardMaterial color="#475569" roughness={0.35} metalness={0.5} />
      </mesh>
      {/* Cabin Greenhouse */}
      <mesh position={[-l * 0.06, h * 0.72, 0]} castShadow>
        <boxGeometry args={[l * 0.55, h * 0.44, w * 0.88]} />
        <meshStandardMaterial color="#1e293b" roughness={0.15} metalness={0.8} />
      </mesh>
      {/* Windshield */}
      <mesh position={[l * 0.18, h * 0.7, 0]} rotation={[0, 0, -0.45]}>
        <boxGeometry args={[0.06, h * 0.4, w * 0.84]} />
        <meshStandardMaterial color="#38bdf8" roughness={0.1} transparent opacity={0.7} />
      </mesh>
      {/* 4 Wheels */}
      <Wheel radius={wheelR} width={wheelW} position={[l * 0.3, wheelR, w * 0.45]} />
      <Wheel radius={wheelR} width={wheelW} position={[l * 0.3, wheelR, -w * 0.45]} />
      <Wheel radius={wheelR} width={wheelW} position={[-l * 0.28, wheelR, w * 0.45]} />
      <Wheel radius={wheelR} width={wheelW} position={[-l * 0.28, wheelR, -w * 0.45]} />
      {/* Headlights */}
      <mesh position={[l * 0.505, h * 0.35, w * 0.3]}>
        <boxGeometry args={[0.06, 0.18, 0.24]} />
        <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={1.5} />
      </mesh>
      <mesh position={[l * 0.505, h * 0.35, -w * 0.3]}>
        <boxGeometry args={[0.06, 0.18, 0.24]} />
        <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={1.5} />
      </mesh>
      {/* Brake lights */}
      <mesh position={[-l * 0.505, h * 0.38, w * 0.3]}>
        <boxGeometry args={[0.06, 0.2, 0.2]} />
        <meshStandardMaterial
          color={isBraking ? '#ef4444' : '#7f1d1d'}
          emissive={isBraking ? '#ef4444' : '#300'}
          emissiveIntensity={isBraking ? 3 : 0.5}
        />
      </mesh>
      <mesh position={[-l * 0.505, h * 0.38, -w * 0.3]}>
        <boxGeometry args={[0.06, 0.2, 0.2]} />
        <meshStandardMaterial
          color={isBraking ? '#ef4444' : '#7f1d1d'}
          emissive={isBraking ? '#ef4444' : '#300'}
          emissiveIntensity={isBraking ? 3 : 0.5}
        />
      </mesh>
    </group>
  );
}

export default function Vehicle({ data, showTrail = true }: VehicleProps) {
  const groupRef = useRef<THREE.Group>(null);
  const dims = VEHICLE_DIMENSIONS[data.type];
  const isDwelling = data.state === VehicleState.Dwelling;
  const isBraking = data.state === VehicleState.Braking;
  const showSweptEnvelopes = useSimulationStore((s) => s.showSweptEnvelopes);

  // Breadcrumb motion trail points (drawn relative to vehicle)
  const trailSegments = useMemo(() => {
    if (!showTrail || data.speed < 0.5) return [];
    const pts: number[] = [];
    for (let i = 1; i <= 4; i++) {
      pts.push(i * 2.2);
    }
    return pts;
  }, [showTrail, data.speed]);

  // AASHTO Swept Path Envelope ground projection
  const isBus = data.type === VehicleType.Bus;
  const isSweptActive =
    isBus &&
    showSweptEnvelopes &&
    (data.isWideTurningBus ||
      data.terminalPhase === 'egress' ||
      data.terminalPhase === 'inbound' ||
      Math.abs(Math.sin(data.heading)) > 0.08);

  const sweptWidth = data.sweptWidth || 6.5;
  const selectedVehicleId = useSimulationStore((s) => s.selectedVehicleId);
  const setSelectedVehicleId = useSimulationStore((s) => s.setSelectedVehicleId);
  const isSelected = selectedVehicleId === data.id;

  return (
    <group
      ref={groupRef}
      position={[data.position.x, 0.05, data.position.z]}
      rotation={[0, -data.heading, 0]}
      onClick={(e) => {
        e.stopPropagation();
        setSelectedVehicleId(data.id);
      }}
    >
      {/* ── Selection Ring when Inspected in Debug Mode ── */}
      {isSelected && (
        <group position={[0, 0.02, 0]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[dims.length * 0.52, dims.length * 0.52 + 0.45, 32]} />
            <meshBasicMaterial color="#06b6d4" transparent opacity={0.85} side={THREE.DoubleSide} />
          </mesh>
        </group>
      )}

      {/* ── AASHTO Bus Dynamic Swept Path Envelope (Layer 2.1: Y = 0.012 relative to vehicle) ── */}
      {isSweptActive && (
        <group position={[0, 0.012, 0]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[dims.length + 3.0, sweptWidth]} />
            <meshBasicMaterial
              color="#06b6d4"
              transparent
              opacity={0.32}
              depthWrite={false}
              side={THREE.DoubleSide}
            />
          </mesh>
          {/* Swept Envelope Outline Contour */}
          <lineSegments rotation={[-Math.PI / 2, 0, 0]}>
            <edgesGeometry args={[new THREE.PlaneGeometry(dims.length + 3.0, sweptWidth)]} />
            <lineBasicMaterial color="#22d3ee" transparent opacity={0.75} linewidth={2} />
          </lineSegments>
        </group>
      )}

      {/* Distinct 3D Model based on vehicle type */}
      {data.type === VehicleType.Bus && (
        <CeresBusModel dims={dims} isBraking={isBraking} />
      )}
      {data.type === VehicleType.Jeepney && (
        <JeepneyModel dims={dims} isBraking={isBraking} />
      )}
      {data.type === VehicleType.Tricycle && (
        <TricycleModel isBraking={isBraking} />
      )}
      {data.type === VehicleType.PrivateCar && (
        <PrivateCarModel dims={dims} isBraking={isBraking} />
      )}

      {/* Dynamic Motion Breadcrumb Trail (suppressed for parked standby buses) */}
      {!data.isParkedStandby &&
        trailSegments.map((dist, idx) => (
          <mesh
            key={`trail-${idx}`}
            rotation={[-Math.PI / 2, 0, 0]}
            position={[-dims.length * 0.5 - dist, 0.015, 0]}
          >
            <circleGeometry args={[0.35, 12]} />
            <meshBasicMaterial
              color="#38bdf8"
              transparent
              opacity={0.35 - idx * 0.08}
              depthWrite={false}
            />
          </mesh>
        ))}

      {/* Paratransit Active Dwell/Loading Status Indicator (suppressed for parked standby buses) */}
      {isDwelling && !data.isParkedStandby && (
        <group position={[0, dims.height + 0.5, 0]}>
          <mesh>
            <sphereGeometry args={[0.3, 12, 12]} />
            <meshStandardMaterial color="#10b981" emissive="#10b981" emissiveIntensity={2.5} />
          </mesh>
          <mesh position={[0, -0.2, 0]}>
            <cylinderGeometry args={[0.03, 0.03, 0.4, 6]} />
            <meshBasicMaterial color="#10b981" />
          </mesh>
        </group>
      )}

      {/* Crosswalk Obstruction Violation Marker ("Bawal huminto sa tawiran") */}
      {data.isEncroachingCrosswalk && (
        <group position={[0, dims.height + 0.8, 0]}>
          <mesh>
            <cylinderGeometry args={[0.6, 0.6, 0.15, 16]} />
            <meshStandardMaterial color="#dc2626" emissive="#ef4444" emissiveIntensity={3} />
          </mesh>
        </group>
      )}

      {/* ── Conflict Hazard Ground Shockwave ── */}
      {data.isInConflict && (
        <group position={[0, 0.015, 0]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[dims.width / 2 + 0.3, dims.width / 2 + 0.9, 24]} />
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
