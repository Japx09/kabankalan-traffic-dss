'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { RoadNetworkGraph } from '@/gis/types';
import type { ConflictType } from '@/sim/types';
import { getLiveSimState, useSimStore } from '@/store/simStore';

interface PedestrianAndOverlayMeshesProps {
  graph: RoadNetworkGraph;
}

const MAX_PEDESTRIANS = 128;
const MAX_PULSES = 48;
const MAX_TRAIL_SEGMENTS = 2400;

/**
 * Animated 3D Pedestrians updated 100% imperatively from getLiveSimState()
 * across 3 instanced draw calls (legs, colored shirts, heads).
 * Automatically elevates pedestrians to Y = 5.65m when walking across the Scenario 2 overpass.
 */
function AnimatedPedestrians() {
  const legsRef = useRef<THREE.InstancedMesh>(null);
  const torsoRef = useRef<THREE.InstancedMesh>(null);
  const headRef = useRef<THREE.InstancedMesh>(null);

  const scratch = useMemo(
    () => ({
      obj: new THREE.Object3D(),
      color: new THREE.Color(),
    }),
    [],
  );

  // Pre-initialize instanceColor attribute so shader compiles with USE_INSTANCING_COLOR upfront
  useEffect(() => {
    const torso = torsoRef.current;
    if (!torso) return;
    const initColor = new THREE.Color('#38bdf8');
    for (let i = 0; i < MAX_PEDESTRIANS; i++) {
      torso.setColorAt(i, initColor);
    }
    if (torso.instanceColor) torso.instanceColor.needsUpdate = true;
    torso.count = 0;
    if (legsRef.current) legsRef.current.count = 0;
    if (headRef.current) headRef.current.count = 0;
  }, []);

  useFrame(({ clock }) => {
    const legs = legsRef.current;
    const torso = torsoRef.current;
    const head = headRef.current;
    if (!legs || !torso || !head) return;

    const peds = getLiveSimState().pedestrians;
    const count = Math.min(peds.length, MAX_PEDESTRIANS);
    const t = clock.elapsedTime;
    const { obj, color } = scratch;

    for (let i = 0; i < count; i++) {
      const p = peds[i];
      const baseY = p.usingOverpass
        ? 5.65
        : p.state === 'waiting'
          ? 0.16
          : 0.05;
      const isMoving = p.state === 'crossing' || p.state === 'in_conflict';
      const bob = isMoving ? Math.abs(Math.sin(t * 7.5 + i * 1.37)) * 0.075 : 0;
      const sway = isMoving ? Math.sin(t * 7.5 + i * 1.37) * 0.08 : 0;

      // Legs
      obj.position.set(p.position.x, baseY + 0.36 + bob * 0.4, p.position.z);
      obj.rotation.set(0, p.heading, sway * 0.5);
      obj.scale.set(1, 1, 1);
      obj.updateMatrix();
      legs.setMatrixAt(i, obj.matrix);

      // Shirt / Torso
      obj.position.set(p.position.x, baseY + 0.96 + bob, p.position.z);
      obj.rotation.set(0, p.heading, sway);
      obj.updateMatrix();
      torso.setMatrixAt(i, obj.matrix);

      if (p.state === 'in_conflict') {
        const flash = Math.sin(t * 18) > 0;
        color.set(flash ? '#ff2a1f' : '#fbbf24');
      } else {
        color.set(p.shirtColor || '#38bdf8');
      }
      torso.setColorAt(i, color);

      // Head
      obj.position.set(p.position.x, baseY + 1.46 + bob, p.position.z);
      obj.rotation.set(0, p.heading, 0);
      obj.updateMatrix();
      head.setMatrixAt(i, obj.matrix);
    }

    legs.count = count;
    torso.count = count;
    head.count = count;
    legs.instanceMatrix.needsUpdate = true;
    torso.instanceMatrix.needsUpdate = true;
    head.instanceMatrix.needsUpdate = true;
    if (torso.instanceColor) torso.instanceColor.needsUpdate = true;
  });

  return (
    <group name="pedestrians-layer">
      <instancedMesh
        ref={legsRef}
        args={[undefined, undefined, MAX_PEDESTRIANS]}
        frustumCulled={false}
        castShadow
      >
        <boxGeometry args={[0.3, 0.72, 0.24]} />
        <meshStandardMaterial color="#1e293b" roughness={0.85} />
      </instancedMesh>
      <instancedMesh
        ref={torsoRef}
        args={[undefined, undefined, MAX_PEDESTRIANS]}
        frustumCulled={false}
        castShadow
      >
        <boxGeometry args={[0.38, 0.58, 0.26]} />
        <meshStandardMaterial color="#ffffff" roughness={0.75} />
      </instancedMesh>
      <instancedMesh
        ref={headRef}
        args={[undefined, undefined, MAX_PEDESTRIANS]}
        frustumCulled={false}
        castShadow
      >
        <sphereGeometry args={[0.15, 8, 8]} />
        <meshStandardMaterial color="#d4a373" roughness={0.8} />
      </instancedMesh>
    </group>
  );
}

/**
 * Color-coded 3D lane centerlines + directional chevron arrows (3 draw calls total):
 * - Cyan (#38bdf8): arterial through lanes (priority 1)
 * - Amber (#f59e0b): turns, ingress, terminal lanes (priority 2 & 3)
 * - Violet (#a78bfa): side-street collector/local lanes (priority 4)
 */
function LaneSplinesOverlay({ graph }: { graph: RoadNetworkGraph }) {
  const lineGeos = useMemo(() => {
    const arterial: number[] = [];
    const terminalTurn: number[] = [];
    const sideStreet: number[] = [];
    const y = 0.14;

    for (const lane of graph.lanes) {
      const target =
        lane.priority === 1
          ? arterial
          : lane.priority === 4
            ? sideStreet
            : terminalTurn;

      const pts = lane.samples;
      if (pts.length < 2) continue;

      for (let i = 0; i < pts.length - 1; i++) {
        target.push(pts[i].x, y, pts[i].z, pts[i + 1].x, y, pts[i + 1].z);
      }

      // Direction chevron arrows every ~18m along each lane
      const arrowInterval = lane.length > 26 ? 18 : Math.max(8, lane.length * 0.45);
      let nextArrowS = Math.min(lane.length * 0.45, 8);
      for (let i = 1; i < pts.length - 1; i++) {
        const p = pts[i];
        if (p.s < nextArrowS) continue;
        nextArrowS = p.s + arrowInterval;

        const tipX = p.x + p.tx * 0.85;
        const tipZ = p.z + p.tz * 0.85;
        const backX = p.x - p.tx * 0.7;
        const backZ = p.z - p.tz * 0.7;
        const wing = 0.55;

        // Left & right chevron wings
        target.push(
          tipX, y, tipZ,
          backX + p.nx * wing, y, backZ + p.nz * wing,
          tipX, y, tipZ,
          backX - p.nx * wing, y, backZ - p.nz * wing,
        );
      }
    }

    const toGeo = (coords: number[]) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(coords, 3));
      g.computeBoundingSphere();
      return g;
    };

    return {
      arterial: toGeo(arterial),
      terminalTurn: toGeo(terminalTurn),
      sideStreet: toGeo(sideStreet),
    };
  }, [graph.lanes]);

  useEffect(() => {
    return () => {
      lineGeos.arterial.dispose();
      lineGeos.terminalTurn.dispose();
      lineGeos.sideStreet.dispose();
    };
  }, [lineGeos]);

  return (
    <group name="lane-splines-overlay">
      <lineSegments geometry={lineGeos.arterial}>
        <lineBasicMaterial color="#38bdf8" transparent opacity={0.85} />
      </lineSegments>
      <lineSegments geometry={lineGeos.terminalTurn}>
        <lineBasicMaterial color="#f59e0b" transparent opacity={0.88} />
      </lineSegments>
      <lineSegments geometry={lineGeos.sideStreet}>
        <lineBasicMaterial color="#a78bfa" transparent opacity={0.85} />
      </lineSegments>
    </group>
  );
}

/**
 * Translucent circular conflict zone pavement pads & perimeter rings at every graph.conflictZones.
 */
function ConflictZonesOverlay({ graph }: { graph: RoadNetworkGraph }) {
  return (
    <group name="conflict-zones-overlay">
      {graph.conflictZones.map((cz) => {
        const isCrossing = cz.kind === 'crossing';
        const color = isCrossing ? '#ef4444' : '#f59e0b';
        return (
          <group key={cz.id} position={[cz.center.x, 0.105, cz.center.z]}>
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
              <circleGeometry args={[cz.radius, 24]} />
              <meshBasicMaterial
                color={color}
                transparent
                opacity={0.22}
                depthWrite={false}
              />
            </mesh>
            <mesh position={[0, 0.008, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[cz.radius - 0.16, cz.radius, 24]} />
              <meshBasicMaterial
                color={color}
                transparent
                opacity={0.75}
                depthWrite={false}
              />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

/**
 * Speed-colored vehicle trajectory trails updated imperatively in 1 single draw call.
 */
function VehicleTrailsOverlay() {
  const lineRef = useRef<THREE.LineSegments>(null);
  const geometry = useMemo(() => {
    const pos = new Float32Array(MAX_TRAIL_SEGMENTS * 2 * 3);
    const col = new Float32Array(MAX_TRAIL_SEGMENTS * 2 * 3);
    const geom = new THREE.BufferGeometry();
    const posAttr = new THREE.BufferAttribute(pos, 3);
    const colAttr = new THREE.BufferAttribute(col, 3);
    posAttr.setUsage(THREE.DynamicDrawUsage);
    colAttr.setUsage(THREE.DynamicDrawUsage);
    geom.setAttribute('position', posAttr);
    geom.setAttribute('color', colAttr);
    geom.setDrawRange(0, 0);
    return geom;
  }, []);

  useEffect(() => {
    return () => {
      geometry.dispose();
    };
  }, [geometry]);

  const scratchColor = useMemo(() => new THREE.Color(), []);

  useFrame(() => {
    const line = lineRef.current;
    if (!line) return;
    const geom = line.geometry;
    const posAttr = geom.getAttribute('position') as THREE.BufferAttribute;
    const colAttr = geom.getAttribute('color') as THREE.BufferAttribute;
    const positions = posAttr.array as Float32Array;
    const colors = colAttr.array as Float32Array;

    const vehicles = getLiveSimState().vehicles;
    let segIdx = 0;
    const y = 0.13;

    for (let i = 0; i < vehicles.length; i++) {
      const v = vehicles[i];
      const trail = v.trail;
      if (trail.length < 2) continue;

      const ratio = v.desiredSpeed > 0.1 ? Math.min(1, v.speed / v.desiredSpeed) : 0;
      if (ratio > 0.6) {
        scratchColor.setHex(0x10b981); // emerald free-flow
      } else if (ratio > 0.25) {
        scratchColor.setHex(0xf59e0b); // amber congested
      } else {
        scratchColor.setHex(0xef4444); // red queued/stopped
      }

      for (let j = 0; j < trail.length - 1; j++) {
        if (segIdx >= MAX_TRAIL_SEGMENTS) break;
        const a = trail[j];
        const b = trail[j + 1];
        // Skip accidental long jump segments
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        if (dx * dx + dz * dz > 64) continue;

        const fade = 0.3 + 0.7 * ((j + 1) / trail.length);
        const base = segIdx * 6;
        positions[base] = a.x;
        positions[base + 1] = y;
        positions[base + 2] = a.z;
        positions[base + 3] = b.x;
        positions[base + 4] = y;
        positions[base + 5] = b.z;

        colors[base] = scratchColor.r * fade;
        colors[base + 1] = scratchColor.g * fade;
        colors[base + 2] = scratchColor.b * fade;
        colors[base + 3] = scratchColor.r * fade;
        colors[base + 4] = scratchColor.g * fade;
        colors[base + 5] = scratchColor.b * fade;
        segIdx++;
      }
      if (segIdx >= MAX_TRAIL_SEGMENTS) break;
    }

    geom.setDrawRange(0, segIdx * 2);
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
  });

  return (
    <lineSegments ref={lineRef} geometry={geometry} frustumCulled={false}>
      <lineBasicMaterial vertexColors transparent opacity={0.85} depthWrite={false} />
    </lineSegments>
  );
}

function conflictColorHex(type: ConflictType): number {
  switch (type) {
    case 'crossing':
    case 'vehicle_pedestrian':
      return 0xef4444; // Red
    case 'weaving':
      return 0xf97316; // Amber/Orange
    case 'rear_end':
      return 0xeab308; // Yellow
  }
}

/**
 * Animated 3D SSAM conflict warning pulse rings + floating warning beacons
 * driven imperatively from getLiveSimState().conflicts (2 draw calls total).
 */
function ConflictPulsesOverlay() {
  const ringRef = useRef<THREE.InstancedMesh>(null);
  const beaconRef = useRef<THREE.InstancedMesh>(null);

  const scratch = useMemo(
    () => ({
      obj: new THREE.Object3D(),
      color: new THREE.Color(),
    }),
    [],
  );

  useEffect(() => {
    const initColor = new THREE.Color('#ef4444');
    if (ringRef.current) {
      for (let i = 0; i < MAX_PULSES; i++) ringRef.current.setColorAt(i, initColor);
      if (ringRef.current.instanceColor) ringRef.current.instanceColor.needsUpdate = true;
      ringRef.current.count = 0;
    }
    if (beaconRef.current) {
      for (let i = 0; i < MAX_PULSES; i++) beaconRef.current.setColorAt(i, initColor);
      if (beaconRef.current.instanceColor) beaconRef.current.instanceColor.needsUpdate = true;
      beaconRef.current.count = 0;
    }
  }, []);

  useFrame(({ clock }) => {
    const rings = ringRef.current;
    const beacons = beaconRef.current;
    if (!rings || !beacons) return;

    const conflicts = getLiveSimState().conflicts;
    const count = Math.min(conflicts.length, MAX_PULSES);
    const t = clock.elapsedTime;
    const { obj, color } = scratch;

    for (let i = 0; i < count; i++) {
      const c = conflicts[i];
      const pulsePhase = (c.age * 1.4) % 1.0;
      const severityBoost = c.severity === 'critical' ? 1.35 : 1.0;
      const ringScale = (1.1 + pulsePhase * 3.8) * severityBoost;

      color.setHex(conflictColorHex(c.type));

      // Expanding pavement warning ring
      obj.position.set(c.location.x, 0.16, c.location.z);
      obj.rotation.set(-Math.PI / 2, 0, 0);
      obj.scale.set(ringScale, ringScale, 1);
      obj.updateMatrix();
      rings.setMatrixAt(i, obj.matrix);
      rings.setColorAt(i, color);

      // Floating rotating warning octahedron beacon
      const fadeScale = Math.max(0.15, 1 - c.age * 0.2) * severityBoost;
      const bobY = 2.9 + Math.sin(t * 5.5 + i) * 0.35;
      obj.position.set(c.location.x, bobY, c.location.z);
      obj.rotation.set(0, t * 2.6 + i, 0);
      obj.scale.set(0.58 * fadeScale, 0.78 * fadeScale, 0.58 * fadeScale);
      obj.updateMatrix();
      beacons.setMatrixAt(i, obj.matrix);
      beacons.setColorAt(i, color);
    }

    rings.count = count;
    beacons.count = count;
    rings.instanceMatrix.needsUpdate = true;
    beacons.instanceMatrix.needsUpdate = true;
    if (rings.instanceColor) rings.instanceColor.needsUpdate = true;
    if (beacons.instanceColor) beacons.instanceColor.needsUpdate = true;
  });

  return (
    <group name="conflict-pulses-overlay">
      <instancedMesh
        ref={ringRef}
        args={[undefined, undefined, MAX_PULSES]}
        frustumCulled={false}
      >
        <ringGeometry args={[0.72, 1.0, 28]} />
        <meshBasicMaterial
          color="#ffffff"
          transparent
          opacity={0.82}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </instancedMesh>
      <instancedMesh
        ref={beaconRef}
        args={[undefined, undefined, MAX_PULSES]}
        frustumCulled={false}
      >
        <octahedronGeometry args={[1, 0]} />
        <meshStandardMaterial
          color="#ffffff"
          emissive="#ffffff"
          emissiveIntensity={0.65}
          transparent
          opacity={0.9}
          roughness={0.3}
          toneMapped={false}
        />
      </instancedMesh>
    </group>
  );
}

/**
 * Combined Pedestrians + Toggleable 3D Engineering & SSAM Overlays layer.
 */
export function PedestrianAndOverlayMeshes({ graph }: PedestrianAndOverlayMeshesProps) {
  const showLaneSplines = useSimStore((s) => s.overlays.showLaneSplines);
  const showConflictZones = useSimStore((s) => s.overlays.showConflictZones);
  const showTrails = useSimStore((s) => s.overlays.showTrails);
  const showConflictPulses = useSimStore((s) => s.overlays.showConflictPulses);

  return (
    <group name="pedestrians-and-overlays">
      <AnimatedPedestrians />
      {showLaneSplines && <LaneSplinesOverlay graph={graph} />}
      {showConflictZones && <ConflictZonesOverlay graph={graph} />}
      {showTrails && <VehicleTrailsOverlay />}
      {showConflictPulses && <ConflictPulsesOverlay />}
    </group>
  );
}
