'use client';

import React, { useRef, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { OrbitControls } from '@react-three/drei';
import CorridorLayout from './CorridorLayout';
import Vehicle from './Vehicle';
import Pedestrian from './Pedestrian';
import ConflictMarker from './ConflictMarker';
import { useSimulationStore } from '@/store/simulationStore';

/** Inner scene component that runs the simulation loop */
function SimulationLoop() {
  const tick = useSimulationStore((s) => s.tick);
  const isRunning = useSimulationStore((s) => s.isRunning);

  useFrame((_, delta) => {
    if (isRunning) {
      const clampedDt = Math.min(delta, 0.05);
      tick(clampedDt);
    }
  });

  return null;
}

/** Controls camera position transitions based on selected preset (1:1 Metric Scale) */
function CameraPresetController() {
  const cameraPreset = useSimulationStore((s) => s.cameraPreset);
  const corridor = useSimulationStore((s) => s.corridor);
  const { camera } = useThree();
  const controlsRef = useRef<OrbitControlsImpl>(null);

  const centerX = corridor.length / 2;
  const firstCwX = corridor.crosswalks[0]?.x ?? 86;
  const loadingZoneX = corridor.loadingZones[0]?.xStart ?? 105;

  useEffect(() => {
    if (!controlsRef.current) return;
    const controls = controlsRef.current;

    switch (cameraPreset) {
      case 'topdown':
        camera.position.set(centerX, 150, 0.05);
        controls.target.set(centerX, 0, 0);
        break;
      case 'crosswalk':
        camera.position.set(firstCwX + 25, 22, 25);
        controls.target.set(firstCwX, 0, 0);
        break;
      case 'terminal':
        camera.position.set(loadingZoneX + 35, 28, 38);
        controls.target.set(loadingZoneX + 15, 0, 15);
        break;
      case 'isometric':
      default:
        camera.position.set(centerX + 65, 68, 68);
        controls.target.set(centerX, 0, 0);
        break;
    }
    controls.update();
  }, [cameraPreset, centerX, firstCwX, loadingZoneX, camera]);

  return (
    <OrbitControls
      ref={controlsRef}
      target={[centerX, 0, 0]}
      minPolarAngle={0.05}
      maxPolarAngle={Math.PI / 2.15}
      minDistance={15}
      maxDistance={350}
      enableDamping
      dampingFactor={0.06}
    />
  );
}

import { getConflictAreasForLocation, type ConflictAreaDefinition } from '@/simulation/conflictAreas';

/** Conflict Area Boundaries Overlay */
function ConflictAreasOverlay() {
  const corridor = useSimulationStore((s) => s.corridor);
  const showConflictAreas = useSimulationStore((s) => s.showConflictAreas);
  const areas = useMemo(() => getConflictAreasForLocation(corridor.id), [corridor.id]);

  if (!showConflictAreas) return null;

  return (
    <group>
      {areas.map((ca: ConflictAreaDefinition) => (
        <group key={ca.id} position={[ca.center.x, 0.055, ca.center.z]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[ca.radius - 0.25, ca.radius, 32]} />
            <meshBasicMaterial color="#a855f7" transparent opacity={0.45} side={THREE.DoubleSide} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[ca.radius, 32]} />
            <meshBasicMaterial color="#a855f7" transparent opacity={0.06} depthWrite={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Stop Line Holding Bars Overlay */
function StopBarsOverlay() {
  const corridor = useSimulationStore((s) => s.corridor);
  const showStopBars = useSimulationStore((s) => s.showStopBars);

  if (!showStopBars) return null;

  return (
    <group>
      {/* Signalized and priority stop bars at crosswalks */}
      {corridor.crosswalks.map((cw, i) => {
        const offset = cw.width / 2 + (cw.stopLineOffset ?? 2.5);
        return (
          <group key={`cw-stop-${i}`}>
            {/* Northbound stop bar */}
            <mesh position={[cw.x + offset, 0.06, -2.5]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[0.45, 6.0]} />
              <meshBasicMaterial color="#f8fafc" />
            </mesh>
            {/* Southbound stop bar */}
            <mesh position={[cw.x - offset, 0.06, 2.5]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[0.45, 6.0]} />
              <meshBasicMaterial color="#f8fafc" />
            </mesh>
          </group>
        );
      })}

      {/* Side street stop bars */}
      {corridor.sideStreets?.map((st) => {
        if (!st.hasStopBar) return null;
        const zPos = st.side === 'north' ? -4.85 - 2.0 : 4.85 + 2.0;
        return (
          <mesh key={`side-stop-${st.id || st.x}`} position={[st.x, 0.06, zPos]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[st.width, 0.45]} />
            <meshBasicMaterial color="#f8fafc" />
          </mesh>
        );
      })}
    </group>
  );
}

/** Renders all dynamic entities */
function Entities() {
  const vehicles = useSimulationStore((s) => s.simState.vehicles);
  const pedestrians = useSimulationStore((s) => s.simState.pedestrians);
  const conflicts = useSimulationStore((s) => s.simState.conflicts);
  const showConflictHeatmap = useSimulationStore((s) => s.showConflictHeatmap);
  const showVehicleTrails = useSimulationStore((s) => s.showVehicleTrails);

  return (
    <>
      <ConflictAreasOverlay />
      <StopBarsOverlay />
      {vehicles.map((v) => (
        <Vehicle key={v.id} data={v} showTrail={showVehicleTrails} />
      ))}
      {pedestrians.map((p) => (
        <Pedestrian key={p.id} data={p} />
      ))}
      {showConflictHeatmap &&
        conflicts.map((c) => <ConflictMarker key={c.id} conflict={c} />)}
    </>
  );
}

export default function Scene() {
  const corridor = useSimulationStore((s) => s.corridor);
  const centerX = corridor.length / 2;

  return (
    <Canvas
      shadows={{ type: THREE.PCFShadowMap }}
      camera={{
        position: [centerX + 65, 68, 68],
        fov: 40,
        near: 0.5,
        far: 1200,
      }}
      style={{ background: '#181d28' }}
      gl={{
        antialias: true,
        alpha: false,
        powerPreference: 'default',
        failIfMajorPerformanceCaveat: false,
      }}
    >
      {/* ── Realistic Natural Sunlight & Civil Engineering Atmosphere ── */}
      <hemisphereLight args={['#e2e8f0', '#334155', 0.65]} />
      <ambientLight intensity={0.4} />

      <directionalLight
        position={[centerX + 70, 110, 60]}
        intensity={1.5}
        color="#fffaf0"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-far={400}
        shadow-camera-left={-150}
        shadow-camera-right={150}
        shadow-camera-top={80}
        shadow-camera-bottom={-80}
        shadow-bias={-0.0004}
      />

      {/* Subtle fill light for roadway shadows */}
      <directionalLight position={[centerX - 50, 70, -50]} intensity={0.35} color="#cbd5e1" />

      {/* Atmospheric depth fog */}
      <fog attach="fog" args={['#181d28', 180, 550]} />

      {/* CAD Infinite Horizon Ground Grid */}
      <gridHelper
        args={[600, 120, '#475569', '#263143']}
        position={[centerX, -0.02, 0]}
      />

      {/* Camera & Controls */}
      <CameraPresetController />

      {/* Corridor layout (Terrain, curbs, sidewalks, markings & backdrops) */}
      <CorridorLayout corridor={corridor} />

      {/* Dynamic entities (Vehicles, Pedestrians, Conflict Heatspots) */}
      <Entities />

      {/* Simulation loop */}
      <SimulationLoop />
    </Canvas>
  );
}
