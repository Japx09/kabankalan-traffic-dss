'use client';

import React, { type ComponentRef, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { CameraPresetId } from '@/sim/types';
import { getLiveSimState, useSimStore } from '@/store/simStore';
import { CeresWorldMesh } from './CeresWorldMesh';
import { VehicleMeshes } from './VehicleMeshes';
import { PedestrianAndOverlayMeshes } from './PedestrianAndOverlayMeshes';

interface CameraPose {
  readonly position: readonly [number, number, number];
  readonly target: readonly [number, number, number];
}

const CAMERA_PRESETS: Readonly<Record<CameraPresetId, CameraPose>> = {
  // Classic Cities: Skylines 3/4 overview of Ceres Terminal, National Rd & Pedro Zayco
  isometric: {
    position: [122, 90, 90],
    target: [12, 0, -10],
  },
  // Close-up angled framing of Ceres Gate 1 (Ingress), Gate 2 (Egress) & bus staging yard
  gates: {
    position: [74, 34, 42],
    target: [14, 1.5, 2],
  },
  // Focused view of Pedro Zayco Sr. St. T-junction & National Road median break
  junction: {
    position: [-74, 44, -12],
    target: [-14, 1, -64],
  },
  // High top-down CAD / Satellite 1:1 alignment verification view
  topdown: {
    position: [16, 265, -5.2],
    target: [16, 0, -6],
  },
};

/**
 * Advances simulation physics before visual scene layers read getLiveSimState()
 * on the same animation frame (priority -1 ensures zero 1-frame render lag).
 */
function SimulationTickController() {
  useFrame((_, delta) => {
    const store = useSimStore.getState();
    if (store.isRunning) {
      store.step(Math.min(delta, 0.05));
    }
  }, -1);

  return null;
}

/**
 * Smooth OrbitControls + Camera Preset transitions + Follow Selected Vehicle chase cam.
 */
function CameraRig() {
  const controlsRef = useRef<ComponentRef<typeof OrbitControls>>(null);
  const { camera } = useThree();

  const cameraPreset = useSimStore((s) => s.cameraPreset);
  const cameraPresetNonce = useSimStore((s) => s.cameraPresetNonce);
  const selectedVehicleId = useSimStore((s) => s.selectedVehicleId);
  const followSelectedVehicle = useSimStore((s) => s.followSelectedVehicle);

  const isTransitioningRef = useRef<boolean>(true);
  const goalPosRef = useRef<THREE.Vector3>(
    new THREE.Vector3(...CAMERA_PRESETS.isometric.position),
  );
  const goalTargetRef = useRef<THREE.Vector3>(
    new THREE.Vector3(...CAMERA_PRESETS.isometric.target),
  );

  const scratch = useMemo(
    () => ({
      chasePos: new THREE.Vector3(),
      chaseTarget: new THREE.Vector3(),
    }),
    [],
  );

  // Trigger smooth camera glide whenever preset or nonce changes
  useEffect(() => {
    const pose = CAMERA_PRESETS[cameraPreset];
    goalPosRef.current.set(pose.position[0], pose.position[1], pose.position[2]);
    goalTargetRef.current.set(pose.target[0], pose.target[1], pose.target[2]);
    isTransitioningRef.current = true;
  }, [cameraPreset, cameraPresetNonce]);

  useFrame((_, delta) => {
    const controls = controlsRef.current;
    if (!controls) return;
    const dt = Math.min(delta, 0.05);

    // 1. Follow Selected Vehicle chase / 3/4 camera mode
    if (followSelectedVehicle && selectedVehicleId) {
      const live = getLiveSimState();
      const vehicle = live.vehicles.find((v) => v.id === selectedVehicleId);
      if (vehicle) {
        const backDist = vehicle.type === 'bus' ? 24 : 16;
        const height = vehicle.type === 'bus' ? 14 : 10.5;
        const sideOffset = vehicle.type === 'bus' ? 7.5 : 5.5;

        const fx = Math.sin(vehicle.heading);
        const fz = Math.cos(vehicle.heading);
        const rx = fz;
        const rz = -fx;

        scratch.chaseTarget.set(
          vehicle.position.x + fx * 4.0,
          1.4,
          vehicle.position.z + fz * 4.0,
        );
        scratch.chasePos.set(
          vehicle.position.x - fx * backDist + rx * sideOffset,
          height,
          vehicle.position.z - fz * backDist + rz * sideOffset,
        );

        const dampPos = 1 - Math.exp(-4.8 * dt);
        const dampTarget = 1 - Math.exp(-7.5 * dt);
        camera.position.lerp(scratch.chasePos, dampPos);
        controls.target.lerp(scratch.chaseTarget, dampTarget);
        controls.update();
        isTransitioningRef.current = false;
        return;
      }
    }

    // 2. Smooth preset camera transition (cancels automatically once arrived or on user drag)
    if (isTransitioningRef.current) {
      const alpha = 1 - Math.exp(-5.5 * dt);
      camera.position.lerp(goalPosRef.current, alpha);
      controls.target.lerp(goalTargetRef.current, alpha);
      controls.update();

      const posDone = camera.position.distanceToSquared(goalPosRef.current) < 0.04;
      const tgtDone = controls.target.distanceToSquared(goalTargetRef.current) < 0.04;
      if (posDone && tgtDone) {
        camera.position.copy(goalPosRef.current);
        controls.target.copy(goalTargetRef.current);
        controls.update();
        isTransitioningRef.current = false;
      }
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={0.075}
      screenSpacePanning={false}
      minDistance={12}
      maxDistance={460}
      maxPolarAngle={Math.PI * 0.475}
      minPolarAngle={0.04}
      target={[
        CAMERA_PRESETS.isometric.target[0],
        CAMERA_PRESETS.isometric.target[1],
        CAMERA_PRESETS.isometric.target[2],
      ]}
      onStart={() => {
        isTransitioningRef.current = false;
      }}
    />
  );
}

/**
 * Full-bleed React Three Fiber 3D Game-Simulator Canvas for Kabankalan City
 * Ceres Bus Terminal Corridor Traffic Microsimulation.
 */
export function GameSimulationCanvas() {
  const graph = useSimStore((s) => s.simState.graph);
  const selectVehicle = useSimStore((s) => s.selectVehicle);

  return (
    <div className="relative h-full w-full overflow-hidden select-none">
      <Canvas
        shadows="percentage"
        dpr={[1, 2]}
        camera={{
          fov: 42,
          near: 0.5,
          far: 1400,
          position: [
            CAMERA_PRESETS.isometric.position[0],
            CAMERA_PRESETS.isometric.position[1],
            CAMERA_PRESETS.isometric.position[2],
          ],
        }}
        gl={{
          antialias: true,
          powerPreference: 'high-performance',
        }}
        onPointerMissed={() => selectVehicle(null)}
      >
        <SimulationTickController />
        <CameraRig />
        <CeresWorldMesh graph={graph} />
        <VehicleMeshes />
        <PedestrianAndOverlayMeshes graph={graph} />
      </Canvas>
    </div>
  );
}
export default GameSimulationCanvas;
