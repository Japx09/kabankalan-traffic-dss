'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type {
  BuildingFootprint,
  Crosswalk,
  GateStructure,
  RoadNetworkGraph,
} from '@/gis/types';
import type { SatelliteTileSpec } from '@/gis/projection';
import { SCENARIOS, type GroundMode } from '@/sim/types';
import { getLiveSimState, useSimStore } from '@/store/simStore';
import {
  buildCrosswalkStripesGeometry,
  buildDashedLineGeometry,
  buildExtrudedPolygon,
  buildExtrudedRibbonGeometry,
  buildLoadingZonesGeometry,
  buildMedianNoseCapsGeometry,
  buildRibbonGeometry,
  buildSolidLineGeometry,
  buildStagingBaysGeometry,
  createAsphaltTexture,
  createGateSignTexture,
  createTerrainTexture,
  mergeSafeGeometries,
  subtractIntervals,
} from './roadGeometry';

interface CeresWorldMeshProps {
  graph: RoadNetworkGraph;
}

/**
 * Loads a single georeferenced z=18 ESRI World Imagery tile at exact local metric bounds.
 */
function SatelliteTilePlane({ tile }: { tile: SatelliteTileSpec }) {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    let disposed = false;
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    let loadedTex: THREE.Texture | null = null;

    loader.load(
      tile.url,
      (tex) => {
        if (disposed) {
          tex.dispose();
          return;
        }
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 4;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.magFilter = THREE.LinearFilter;
        loadedTex = tex;
        setTexture(tex);
      },
      undefined,
      () => {
        // Offline or CORS fallback: leave subtle neutral tile surface
      },
    );

    return () => {
      disposed = true;
      if (loadedTex) loadedTex.dispose();
    };
  }, [tile.url]);

  return (
    <mesh
      position={[tile.boundsLocal.centerX, 0.0, tile.boundsLocal.centerZ]}
      rotation={[-Math.PI / 2, 0, 0]}
      receiveShadow
    >
      <planeGeometry args={[tile.boundsLocal.width + 0.08, tile.boundsLocal.depth + 0.08]} />
      <meshStandardMaterial
        map={texture ?? undefined}
        color={texture ? '#ffffff' : '#58685c'}
        roughness={0.95}
        metalness={0.0}
      />
    </mesh>
  );
}

/**
 * Wide-span Ceres Gate 1 (INGRESS) or Gate 2 (EGRESS) overhead clearance gantry.
 * Pillars are placed strictly outside the 10.6m clear span (zero bus clipping).
 */
function CeresGateGantry({
  gate,
  isCad,
}: {
  gate: GateStructure;
  isCad: boolean;
}) {
  const signTex = useMemo(() => {
    const isGate1 = gate.id === 'gate_1_ingress';
    return createGateSignTexture(
      'CERES BUS TERMINAL — KABANKALAN',
      isGate1 ? 'GATE 1 · BUS ENTRANCE (INGRESS)' : 'GATE 2 · BUS EXIT (EGRESS)',
      isGate1 ? '#16a34a' : '#dc2626',
    );
  }, [gate.id]);

  useEffect(() => {
    return () => {
      signTex?.dispose();
    };
  }, [signTex]);

  const halfSpan = gate.clearSpanWidth * 0.5 + 0.42;
  const beamCenterY = gate.clearHeight + 0.48;
  const totalWidth = halfSpan * 2 + 0.7;
  const pillarColor = isCad ? '#223854' : '#e2e8f0';
  const steelColor = isCad ? '#38bdf8' : '#166534';
  const accentColor = gate.id === 'gate_1_ingress' ? '#22c55e' : '#ef4444';

  return (
    <group position={[gate.center.x, 0, gate.center.z]} rotation={[0, gate.heading, 0]}>
      {/* Left & right heavy reinforced concrete plinths + steel box columns */}
      {([-1, 1] as const).map((side) => (
        <group key={side} position={[side * halfSpan, 0, 0]}>
          {/* Yellow/black safety bumper plinth */}
          <mesh position={[0, 0.55, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.82, 1.1, 0.82]} />
            <meshStandardMaterial color={isCad ? '#1d324d' : '#facc15'} roughness={0.65} />
          </mesh>
          {/* Main vertical column */}
          <mesh position={[0, gate.clearHeight * 0.5 + 0.45, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.56, gate.clearHeight + 0.2, 0.56]} />
            <meshStandardMaterial color={pillarColor} roughness={0.55} metalness={0.2} />
          </mesh>
          {/* Green steel capital */}
          <mesh position={[0, gate.clearHeight + 0.45, 0]} castShadow>
            <boxGeometry args={[0.72, 0.96, 0.72]} />
            <meshStandardMaterial color={steelColor} roughness={0.45} metalness={0.35} />
          </mesh>
        </group>
      ))}

      {/* Overhead structural box truss spanning clear above 5.2m */}
      <mesh position={[0, beamCenterY, 0]} castShadow receiveShadow>
        <boxGeometry args={[totalWidth, 0.96, 0.68]} />
        <meshStandardMaterial color={steelColor} roughness={0.45} metalness={0.35} />
      </mesh>

      {/* Front & rear illuminated Ceres signage fascia boards */}
      <mesh position={[0, beamCenterY + 0.08, 0.37]}>
        <planeGeometry args={[gate.clearSpanWidth - 0.6, 1.35]} />
        <meshStandardMaterial
          map={signTex ?? undefined}
          color={signTex ? '#ffffff' : '#f5b800'}
          roughness={0.4}
        />
      </mesh>
      <mesh position={[0, beamCenterY + 0.08, -0.37]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[gate.clearSpanWidth - 0.6, 1.35]} />
        <meshStandardMaterial
          map={signTex ?? undefined}
          color={signTex ? '#ffffff' : '#f5b800'}
          roughness={0.4}
        />
      </mesh>

      {/* Directional clearance LED strip */}
      <mesh position={[0, gate.clearHeight + 0.04, 0]}>
        <boxGeometry args={[gate.clearSpanWidth - 1.2, 0.09, 0.72]} />
        <meshStandardMaterial
          color={accentColor}
          emissive={accentColor}
          emissiveIntensity={1.2}
          roughness={0.3}
        />
      </mesh>
    </group>
  );
}

/**
 * Recognizable Ceres Bus Terminal green-roofed passenger shed with open steel columns,
 * raised concrete boarding platform, yellow safety edge, and passenger benches.
 */
function CeresTerminalShed({
  building,
  isCad,
}: {
  building: BuildingFootprint;
  isCad: boolean;
}) {
  const { width, depth, height } = building;
  const colCount = 6;
  const colPositionsZ = useMemo(() => {
    const out: number[] = [];
    for (let i = 0; i < colCount; i++) {
      const t = i / (colCount - 1) - 0.5;
      out.push(t * (width - 2.2));
    }
    return out;
  }, [width]);

  const roofColor = isCad ? '#14332a' : building.roofColor;
  const platformColor = isCad ? '#1a2a40' : '#d6dbe0';
  const fasciaColor = isCad ? '#38bdf8' : '#f5b800';
  const columnColor = isCad ? '#475569' : '#e2e8f0';

  return (
    <group
      position={[building.center.x, 0, building.center.z]}
      rotation={[0, building.heading, 0]}
    >
      {/* Raised concrete passenger boarding platform */}
      <mesh position={[0, 0.18, 0]} castShadow receiveShadow>
        <boxGeometry args={[depth - 0.6, 0.36, width - 0.4]} />
        <meshStandardMaterial color={platformColor} roughness={0.85} />
      </mesh>

      {/* Yellow platform safety edge stripes on both bus-boarding sides */}
      <mesh position={[depth * 0.5 - 0.42, 0.365, 0]}>
        <boxGeometry args={[0.26, 0.02, width - 0.5]} />
        <meshStandardMaterial color="#facc15" roughness={0.6} />
      </mesh>
      <mesh position={[-(depth * 0.5 - 0.42), 0.365, 0]}>
        <boxGeometry args={[0.26, 0.02, width - 0.5]} />
        <meshStandardMaterial color="#facc15" roughness={0.6} />
      </mesh>

      {/* Central low ticketing / dispatch kiosk core inside shed */}
      <mesh position={[0, 1.75, -width * 0.22]} castShadow receiveShadow>
        <boxGeometry args={[3.6, 2.8, 5.4]} />
        <meshStandardMaterial color={isCad ? '#1c3048' : '#f1f5f9'} roughness={0.75} />
      </mesh>
      <mesh position={[0, 2.2, -width * 0.22]}>
        <boxGeometry args={[3.72, 0.85, 4.6]} />
        <meshStandardMaterial color="#1e293b" roughness={0.25} metalness={0.4} />
      </mesh>

      {/* Waiting passenger benches */}
      {[-3.0, 2.5, 7.2].map((bz) => (
        <mesh key={bz} position={[0, 0.62, bz]} castShadow receiveShadow>
          <boxGeometry args={[1.3, 0.48, 3.2]} />
          <meshStandardMaterial color={isCad ? '#2b4464' : '#15803d'} roughness={0.65} />
        </mesh>
      ))}

      {/* Open architectural steel columns along left and right edges */}
      {colPositionsZ.map((cz, idx) => (
        <React.Fragment key={idx}>
          <mesh position={[depth * 0.4, height * 0.42, cz]} castShadow>
            <boxGeometry args={[0.32, height * 0.84, 0.32]} />
            <meshStandardMaterial color={columnColor} roughness={0.5} metalness={0.35} />
          </mesh>
          <mesh position={[-depth * 0.4, height * 0.42, cz]} castShadow>
            <boxGeometry args={[0.32, height * 0.84, 0.32]} />
            <meshStandardMaterial color={columnColor} roughness={0.5} metalness={0.35} />
          </mesh>
          {/* Steel roof cross-truss beam */}
          <mesh position={[0, height * 0.83, cz]} castShadow>
            <boxGeometry args={[depth * 0.88, 0.26, 0.24]} />
            <meshStandardMaterial color="#334155" roughness={0.5} metalness={0.45} />
          </mesh>
        </React.Fragment>
      ))}

      {/* Iconic corrugated green pitched canopy roof (two sloped eaves) */}
      <mesh
        position={[depth * 0.27, height * 0.91, 0]}
        rotation={[0, 0, -0.17]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[depth * 0.58, 0.22, width + 1.4]} />
        <meshStandardMaterial color={roofColor} roughness={0.55} metalness={0.22} />
      </mesh>
      <mesh
        position={[-depth * 0.27, height * 0.91, 0]}
        rotation={[0, 0, 0.17]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[depth * 0.58, 0.22, width + 1.4]} />
        <meshStandardMaterial color={roofColor} roughness={0.55} metalness={0.22} />
      </mesh>
      {/* Ridge ventilator monitor along canopy crest */}
      <mesh position={[0, height + 0.16, 0]} castShadow>
        <boxGeometry args={[1.4, 0.42, width + 0.6]} />
        <meshStandardMaterial color={isCad ? '#1e4d3f' : '#166534'} roughness={0.5} metalness={0.25} />
      </mesh>

      {/* Golden-yellow Ceres eave fascia beams along both long sides */}
      <mesh position={[depth * 0.54, height * 0.81, 0]} castShadow>
        <boxGeometry args={[0.18, 0.62, width + 1.2]} />
        <meshStandardMaterial color={fasciaColor} roughness={0.45} />
      </mesh>
      <mesh position={[-depth * 0.54, height * 0.81, 0]} castShadow>
        <boxGeometry args={[0.18, 0.62, width + 1.2]} />
        <meshStandardMaterial color={fasciaColor} roughness={0.45} />
      </mesh>
    </group>
  );
}

/**
 * Stylized Cities: Skylines architectural massing for Kabankalan commercial,
 * civic, hotel, terminal-admin, and residential footprints.
 */
function StylizedBuilding({
  building,
  isCad,
}: {
  building: BuildingFootprint;
  isCad: boolean;
}) {
  const { width, depth, height, roofStyle, side } = building;
  const frontDir = side === 'SW' ? 1 : -1;
  const frontX = frontDir * (depth * 0.5);
  const floors = Math.max(1, Math.min(4, Math.round(height / 3.1)));

  const wallColor = isCad ? '#16253b' : building.facadeColor;
  const roofColor = isCad ? '#223a57' : building.roofColor;
  const accentColor = isCad ? '#38bdf8' : building.accentColor ?? building.roofColor;
  const windowColor = isCad ? '#0c192b' : '#26384d';

  // Extruded triangular gable roof geometry built once per gable building
  const gableGeo = useMemo(() => {
    if (roofStyle !== 'gable') return null;
    const ridgeH = Math.min(2.6, depth * 0.18);
    const halfD = depth * 0.54;
    const shape = new THREE.Shape();
    shape.moveTo(-halfD, 0);
    shape.lineTo(halfD, 0);
    shape.lineTo(0, ridgeH);
    shape.closePath();
    const geom = new THREE.ExtrudeGeometry(shape, {
      depth: width + 0.8,
      bevelEnabled: false,
    });
    geom.translate(0, 0, -(width + 0.8) * 0.5);
    geom.computeVertexNormals();
    return geom;
  }, [roofStyle, depth, width]);

  useEffect(() => {
    return () => {
      gableGeo?.dispose();
    };
  }, [gableGeo]);

  return (
    <group
      position={[building.center.x, 0, building.center.z]}
      rotation={[0, building.heading, 0]}
    >
      {/* Main architectural facade volume */}
      <mesh position={[0, height * 0.5, 0]} castShadow receiveShadow>
        <boxGeometry args={[depth, height, width]} />
        <meshStandardMaterial color={wallColor} roughness={0.82} metalness={0.04} />
      </mesh>

      {/* Subtle architectural plinth/base trim */}
      <mesh position={[0, 0.25, 0]} receiveShadow>
        <boxGeometry args={[depth + 0.22, 0.5, width + 0.22]} />
        <meshStandardMaterial color={isCad ? '#1f3552' : '#94a3b8'} roughness={0.9} />
      </mesh>

      {/* Floor window bands along road-facing facade */}
      {Array.from({ length: floors }).map((_, fl) => {
        const wy = 1.65 + fl * (height - 1.4) / Math.max(floors, 1);
        if (wy > height - 0.6) return null;
        return (
          <mesh key={fl} position={[frontX + frontDir * 0.05, wy, 0]}>
            <boxGeometry args={[0.08, fl === 0 ? 1.45 : 1.05, width * 0.82]} />
            <meshStandardMaterial
              color={windowColor}
              roughness={0.2}
              metalness={0.45}
              emissive={isCad ? '#0ea5e9' : '#1e293b'}
              emissiveIntensity={isCad ? 0.35 : 0.08}
            />
          </mesh>
        );
      })}

      {/* Commercial / civic / hotel road-facing storefront awning & accent fascia */}
      {building.category !== 'residential' && (
        <>
          <mesh
            position={[frontX + frontDir * 0.72, 2.85, 0]}
            rotation={[0, 0, frontDir * -0.18]}
            castShadow
          >
            <boxGeometry args={[1.55, 0.16, width * 0.88]} />
            <meshStandardMaterial color={accentColor} roughness={0.55} />
          </mesh>
          {/* Upper signage fascia band */}
          <mesh position={[frontX + frontDir * 0.09, height - 0.55, 0]}>
            <boxGeometry args={[0.14, 0.62, width * 0.92]} />
            <meshStandardMaterial color={accentColor} roughness={0.5} />
          </mesh>
        </>
      )}

      {/* Roof massing per roofStyle */}
      {roofStyle === 'gable' && gableGeo && (
        <mesh geometry={gableGeo} position={[0, height, 0]} castShadow receiveShadow>
          <meshStandardMaterial color={roofColor} roughness={0.68} metalness={0.14} />
        </mesh>
      )}

      {roofStyle === 'hip' && (
        <mesh
          position={[0, height + 1.15, 0]}
          rotation={[0, Math.PI * 0.25, 0]}
          scale={[depth * 0.78, 1, width * 0.78]}
          castShadow
          receiveShadow
        >
          <cylinderGeometry args={[0.28, 1.0, 2.3, 4]} />
          <meshStandardMaterial color={roofColor} roughness={0.68} metalness={0.14} />
        </mesh>
      )}

      {roofStyle === 'flat' && (
        <group position={[0, height, 0]}>
          {/* Parapet rim */}
          <mesh position={[0, 0.28, 0]} castShadow receiveShadow>
            <boxGeometry args={[depth + 0.24, 0.56, width + 0.24]} />
            <meshStandardMaterial color={roofColor} roughness={0.75} />
          </mesh>
          {/* Recessed roof membrane */}
          <mesh position={[0, 0.42, 0]} receiveShadow>
            <boxGeometry args={[depth - 0.7, 0.12, width - 0.7]} />
            <meshStandardMaterial color={isCad ? '#0f1c2e' : '#64748b'} roughness={0.9} />
          </mesh>
          {/* Rooftop HVAC mechanical penthouse / unit */}
          <mesh position={[-frontDir * depth * 0.14, 0.95, width * 0.12]} castShadow>
            <boxGeometry args={[Math.min(3.2, depth * 0.28), 1.0, Math.min(3.8, width * 0.26)]} />
            <meshStandardMaterial color={isCad ? '#243b57' : '#cbd5e1'} roughness={0.7} />
          </mesh>
        </group>
      )}
    </group>
  );
}

/**
 * Scenario 2 Pedestrian Overpass spanning National Road cleanly above cw_ceres_frontage
 * with 5.4m clear height above carriageway and switchback stairs on both sidewalks.
 */
function PedestrianOverpass({
  crosswalk,
  isCad,
}: {
  crosswalk: Crosswalk;
  isCad: boolean;
}) {
  const heading = Math.atan2(crosswalk.tangent.x, crosswalk.tangent.z);
  const deckHalfSpan = crosswalk.length * 0.5 + 2.4; // spans ±9.4m onto both sidewalks
  const pierX = crosswalk.length * 0.5 + 1.35; // ±8.35m on sidewalk, outside curbs
  const deckY = 5.52; // underside 5.40m, top walk surface 5.65m

  const steelColor = isCad ? '#38bdf8' : '#0f766e';
  const deckColor = isCad ? '#1d324c' : '#cbd5e1';
  const canopyColor = isCad ? '#153a4d' : '#14b8a6';
  const trimColor = isCad ? '#67e8f9' : '#f5b800';

  return (
    <group position={[crosswalk.center.x, 0, crosswalk.center.z]} rotation={[0, heading, 0]}>
      {/* Main concrete-steel bridge deck (bottom = 5.40m, top = 5.65m) */}
      <mesh position={[0, deckY, 0]} castShadow receiveShadow>
        <boxGeometry args={[deckHalfSpan * 2, 0.25, 2.75]} />
        <meshStandardMaterial color={deckColor} roughness={0.78} />
      </mesh>

      {/* Side steel girder beams & safety railings */}
      {([-1.32, 1.32] as const).map((rz) => (
        <group key={rz}>
          <mesh position={[0, deckY + 0.15, rz]} castShadow>
            <boxGeometry args={[deckHalfSpan * 2, 0.42, 0.14]} />
            <meshStandardMaterial color={steelColor} roughness={0.45} metalness={0.35} />
          </mesh>
          <mesh position={[0, deckY + 0.95, rz]}>
            <boxGeometry args={[deckHalfSpan * 2, 0.08, 0.08]} />
            <meshStandardMaterial color={trimColor} roughness={0.4} metalness={0.4} />
          </mesh>
          {/* Vertical balustrade posts */}
          {[-8, -5.5, -3, -0.5, 2, 4.5, 7].map((px) => (
            <mesh key={px} position={[px, deckY + 1.25, rz]} castShadow>
              <boxGeometry args={[0.12, 2.3, 0.12]} />
              <meshStandardMaterial color={steelColor} roughness={0.45} metalness={0.35} />
            </mesh>
          ))}
        </group>
      ))}

      {/* Overhead sun & rain canopy roof */}
      <mesh position={[0, deckY + 2.48, 0]} castShadow receiveShadow>
        <boxGeometry args={[deckHalfSpan * 2 + 0.5, 0.18, 3.35]} />
        <meshStandardMaterial color={canopyColor} roughness={0.5} metalness={0.25} />
      </mesh>
      <mesh position={[0, deckY + 2.38, 1.66]}>
        <boxGeometry args={[deckHalfSpan * 2 + 0.5, 0.18, 0.08]} />
        <meshStandardMaterial color={trimColor} roughness={0.45} />
      </mesh>
      <mesh position={[0, deckY + 2.38, -1.66]}>
        <boxGeometry args={[deckHalfSpan * 2 + 0.5, 0.18, 0.08]} />
        <meshStandardMaterial color={trimColor} roughness={0.45} />
      </mesh>

      {/* Twin concrete-steel support piers & descending access staircases on both sidewalks */}
      {([-1, 1] as const).map((side) => (
        <group key={side}>
          {/* Twin vertical piers on sidewalk */}
          <mesh position={[side * pierX, deckY * 0.5, -1.0]} castShadow receiveShadow>
            <boxGeometry args={[0.52, deckY, 0.52]} />
            <meshStandardMaterial color={isCad ? '#243a56' : '#94a3b8'} roughness={0.75} />
          </mesh>
          <mesh position={[side * pierX, deckY * 0.5, 1.0]} castShadow receiveShadow>
            <boxGeometry args={[0.52, deckY, 0.52]} />
            <meshStandardMaterial color={isCad ? '#243a56' : '#94a3b8'} roughness={0.75} />
          </mesh>
          {/* Stair landing platform */}
          <mesh position={[side * (pierX + 0.55), deckY, 0]} castShadow receiveShadow>
            <boxGeometry args={[2.1, 0.25, 2.75]} />
            <meshStandardMaterial color={deckColor} roughness={0.8} />
          </mesh>
          {/* Sloped staircase flight descending cleanly from landing (z=1.35, y=5.52) to sidewalk (z=9.95, y=0.16) */}
          <mesh
            position={[side * (pierX + 0.55), 2.84, 5.65]}
            rotation={[0.557, 0, 0]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[1.95, 0.28, 10.13]} />
            <meshStandardMaterial color={deckColor} roughness={0.82} />
          </mesh>
          {/* Stair handrails */}
          <mesh
            position={[side * (pierX + 1.48), 3.65, 5.65]}
            rotation={[0.557, 0, 0]}
          >
            <boxGeometry args={[0.08, 0.1, 10.13]} />
            <meshStandardMaterial color={trimColor} roughness={0.4} />
          </mesh>
          <mesh
            position={[side * (pierX - 0.38), 3.65, 5.65]}
            rotation={[0.557, 0, 0]}
          >
            <boxGeometry args={[0.08, 0.1, 10.13]} />
            <meshStandardMaterial color={trimColor} roughness={0.4} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/**
 * Scenario 2 actuated 3D Traffic Signal Poles with live Green/Yellow/Red
 * emissive lamps updated imperatively inside useFrame from getLiveSimState().signalState.
 */
function SignalizedCrosswalkPoles({
  crosswalks,
}: {
  crosswalks: readonly Crosswalk[];
}) {
  const mats = useMemo(
    () => ({
      red: new THREE.MeshStandardMaterial({
        color: '#451212',
        emissive: '#ff2a1f',
        emissiveIntensity: 0.1,
        toneMapped: false,
      }),
      yellow: new THREE.MeshStandardMaterial({
        color: '#45380d',
        emissive: '#f59e0b',
        emissiveIntensity: 0.1,
        toneMapped: false,
      }),
      green: new THREE.MeshStandardMaterial({
        color: '#22c55e',
        emissive: '#22c55e',
        emissiveIntensity: 2.8,
        toneMapped: false,
      }),
      walk: new THREE.MeshStandardMaterial({
        color: '#34d399',
        emissive: '#10b981',
        emissiveIntensity: 0.08,
        toneMapped: false,
      }),
      dontWalk: new THREE.MeshStandardMaterial({
        color: '#fb7185',
        emissive: '#f43f5e',
        emissiveIntensity: 2.2,
        toneMapped: false,
      }),
    }),
    [],
  );

  const matsRef = useRef(mats);

  useEffect(() => {
    matsRef.current = mats;
    return () => {
      Object.values(mats).forEach((m) => m.dispose());
    };
  }, [mats]);

  useFrame(({ clock }) => {
    const m = matsRef.current;
    const sig = getLiveSimState().signalState;
    const isRed = sig.vehicularPhase === 'red';
    const isYellow = sig.vehicularPhase === 'yellow';
    const isGreen = sig.vehicularPhase === 'green';
    const flash = Math.sin(clock.elapsedTime * 8) > 0;
    const isWalk = sig.pedestrianPhase === 'walk';
    const isFlashing = sig.pedestrianPhase === 'flashing';

    m.red.emissiveIntensity = isRed ? 3.2 : 0.08;
    m.red.color.set(isRed ? '#ff3b30' : '#451212');

    m.yellow.emissiveIntensity = isYellow ? 3.2 : 0.08;
    m.yellow.color.set(isYellow ? '#ffcc00' : '#45380d');

    m.green.emissiveIntensity = isGreen ? 3.2 : 0.08;
    m.green.color.set(isGreen ? '#22c55e' : '#0d3b1e');

    m.walk.emissiveIntensity = isWalk || (isFlashing && flash) ? 2.8 : 0.06;
    m.dontWalk.emissiveIntensity = !isWalk && !isFlashing ? 2.5 : 0.06;
  });

  const activeCrosswalks = useMemo(
    () => crosswalks.filter((cw) => cw.signalizedInScenario2),
    [crosswalks],
  );

  return (
    <group>
      {activeCrosswalks.map((cw) => {
        const heading = Math.atan2(cw.tangent.x, cw.tangent.z);
        const poleOffset = cw.length * 0.5 + 1.1;
        return (
          <group
            key={cw.id}
            position={[cw.center.x, 0, cw.center.z]}
            rotation={[0, heading, 0]}
          >
            {([-1, 1] as const).map((side) => {
              const armDir = -side;
              const zShift = side * 2.5;
              return (
                <group key={side} position={[side * poleOffset, 0, zShift]}>
                  {/* Galvanized vertical mast */}
                  <mesh position={[0, 3.1, 0]} castShadow>
                    <cylinderGeometry args={[0.11, 0.15, 6.2, 10]} />
                    <meshStandardMaterial color="#475569" roughness={0.45} metalness={0.65} />
                  </mesh>
                  {/* Cantilever horizontal arm over carriageway */}
                  <mesh
                    position={[armDir * 2.6, 5.85, 0]}
                    rotation={[0, 0, Math.PI * 0.5]}
                    castShadow
                  >
                    <cylinderGeometry args={[0.08, 0.1, 5.2, 8]} />
                    <meshStandardMaterial color="#475569" roughness={0.45} metalness={0.65} />
                  </mesh>

                  {/* Overhead vehicular signal head */}
                  <group position={[armDir * 3.8, 5.55, 0]}>
                    <mesh castShadow>
                      <boxGeometry args={[0.42, 1.12, 0.42]} />
                      <meshStandardMaterial color="#111827" roughness={0.5} />
                    </mesh>
                    {([-0.22, 0.22] as const).map((lz) => (
                      <group key={lz} position={[0, 0, lz]}>
                        <mesh position={[0, 0.32, 0]} material={mats.red}>
                          <sphereGeometry args={[0.11, 10, 10]} />
                        </mesh>
                        <mesh position={[0, 0, 0]} material={mats.yellow}>
                          <sphereGeometry args={[0.11, 10, 10]} />
                        </mesh>
                        <mesh position={[0, -0.32, 0]} material={mats.green}>
                          <sphereGeometry args={[0.11, 10, 10]} />
                        </mesh>
                      </group>
                    ))}
                  </group>

                  {/* Pedestrian Walk / Don't Walk head mounted at 2.75m */}
                  <group position={[armDir * 0.28, 2.75, 0]}>
                    <mesh>
                      <boxGeometry args={[0.3, 0.52, 0.28]} />
                      <meshStandardMaterial color="#111827" roughness={0.55} />
                    </mesh>
                    <mesh position={[armDir * 0.16, 0.12, 0]} material={mats.dontWalk}>
                      <boxGeometry args={[0.04, 0.16, 0.16]} />
                    </mesh>
                    <mesh position={[armDir * 0.16, -0.12, 0]} material={mats.walk}>
                      <boxGeometry args={[0.04, 0.16, 0.16]} />
                    </mesh>
                  </group>
                </group>
              );
            })}
          </group>
        );
      })}
    </group>
  );
}

/**
 * Instanced stylized tropical trees (shade trees, palms, ornamentals) — 3 draw calls total.
 */
function InstancedTrees({
  graph,
  isCad,
}: {
  graph: RoadNetworkGraph;
  isCad: boolean;
}) {
  const trunkRef = useRef<THREE.InstancedMesh>(null);
  const canopyRef = useRef<THREE.InstancedMesh>(null);
  const upperCanopyRef = useRef<THREE.InstancedMesh>(null);

  const count = graph.trees.length;

  useEffect(() => {
    if (!trunkRef.current || !canopyRef.current || !upperCanopyRef.current) return;
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();

    graph.trees.forEach((tree, i) => {
      const trunkH = tree.species === 'palm' ? tree.height * 0.78 : tree.height * 0.42;
      const trunkR = tree.species === 'palm' ? 0.22 : 0.3;

      dummy.position.set(tree.position.x, trunkH * 0.5, tree.position.z);
      dummy.rotation.set(0, i * 1.17, 0);
      dummy.scale.set(trunkR, trunkH, trunkR);
      dummy.updateMatrix();
      trunkRef.current!.setMatrixAt(i, dummy.matrix);

      // Lower lush foliage tier
      const r = tree.canopyRadius * (tree.species === 'palm' ? 0.85 : 1.0);
      const cy = tree.species === 'palm' ? tree.height * 0.84 : tree.height * 0.62;
      const sy = tree.species === 'palm' ? r * 0.38 : r * 0.72;
      dummy.position.set(tree.position.x, cy, tree.position.z);
      dummy.scale.set(r, sy, r);
      dummy.updateMatrix();
      canopyRef.current!.setMatrixAt(i, dummy.matrix);

      // Upper foliage crown puff
      dummy.position.set(tree.position.x, cy + sy * 0.65, tree.position.z);
      dummy.scale.set(r * 0.68, sy * 0.65, r * 0.68);
      dummy.updateMatrix();
      upperCanopyRef.current!.setMatrixAt(i, dummy.matrix);

      if (isCad) {
        color.set('#1b4540');
      } else if (tree.species === 'palm') {
        color.set('#3d7a3c');
      } else if (tree.species === 'ornamental') {
        color.set('#4c8d45');
      } else {
        color.set(i % 2 === 0 ? '#2f6e38' : '#3a7d3e');
      }
      canopyRef.current!.setColorAt(i, color);
      upperCanopyRef.current!.setColorAt(i, color.clone().offsetHSL(0.01, 0.04, 0.06));
    });

    trunkRef.current.instanceMatrix.needsUpdate = true;
    canopyRef.current.instanceMatrix.needsUpdate = true;
    upperCanopyRef.current.instanceMatrix.needsUpdate = true;
    if (canopyRef.current.instanceColor) canopyRef.current.instanceColor.needsUpdate = true;
    if (upperCanopyRef.current.instanceColor) {
      upperCanopyRef.current.instanceColor.needsUpdate = true;
    }
  }, [graph.trees, isCad]);

  if (count === 0) return null;

  return (
    <group>
      <instancedMesh ref={trunkRef} args={[undefined, undefined, count]} castShadow>
        <cylinderGeometry args={[0.7, 1.0, 1.0, 7]} />
        <meshStandardMaterial color={isCad ? '#23364d' : '#6b4c35'} roughness={0.92} />
      </instancedMesh>
      <instancedMesh ref={canopyRef} args={[undefined, undefined, count]} castShadow receiveShadow>
        <dodecahedronGeometry args={[1.0, 1]} />
        <meshStandardMaterial color="#ffffff" roughness={0.85} />
      </instancedMesh>
      <instancedMesh ref={upperCanopyRef} args={[undefined, undefined, count]} castShadow>
        <dodecahedronGeometry args={[1.0, 1]} />
        <meshStandardMaterial color="#ffffff" roughness={0.82} />
      </instancedMesh>
    </group>
  );
}

/**
 * Instanced curved-arm cobra-head streetlights along corridor sidewalks — 3 draw calls total.
 */
function InstancedStreetlights({
  graph,
  isCad,
}: {
  graph: RoadNetworkGraph;
  isCad: boolean;
}) {
  const poleRef = useRef<THREE.InstancedMesh>(null);
  const armRef = useRef<THREE.InstancedMesh>(null);
  const lampRef = useRef<THREE.InstancedMesh>(null);

  const count = graph.streetlights.length;

  useEffect(() => {
    if (!poleRef.current || !armRef.current || !lampRef.current) return;
    const dummy = new THREE.Object3D();

    graph.streetlights.forEach((sl, i) => {
      const armHeading = Math.atan2(sl.armDirection.x, sl.armDirection.z);

      // Tapered vertical galvanized pole
      dummy.position.set(sl.position.x, sl.height * 0.5, sl.position.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, sl.height, 1);
      dummy.updateMatrix();
      poleRef.current!.setMatrixAt(i, dummy.matrix);

      // Cantilever horizontal arm reaching over road edge
      const armLen = 2.1;
      dummy.position.set(
        sl.position.x + sl.armDirection.x * (armLen * 0.5),
        sl.height - 0.12,
        sl.position.z + sl.armDirection.z * (armLen * 0.5),
      );
      dummy.rotation.set(0, armHeading, 0);
      dummy.scale.set(1, 1, armLen);
      dummy.updateMatrix();
      armRef.current!.setMatrixAt(i, dummy.matrix);

      // Cobra-head LED luminaire
      dummy.position.set(
        sl.position.x + sl.armDirection.x * (armLen - 0.1),
        sl.height - 0.24,
        sl.position.z + sl.armDirection.z * (armLen - 0.1),
      );
      dummy.rotation.set(0, armHeading, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      lampRef.current!.setMatrixAt(i, dummy.matrix);
    });

    poleRef.current.instanceMatrix.needsUpdate = true;
    armRef.current.instanceMatrix.needsUpdate = true;
    lampRef.current.instanceMatrix.needsUpdate = true;
  }, [graph.streetlights]);

  if (count === 0) return null;

  return (
    <group>
      <instancedMesh ref={poleRef} args={[undefined, undefined, count]} castShadow>
        <cylinderGeometry args={[0.07, 0.12, 1.0, 7]} />
        <meshStandardMaterial color={isCad ? '#334e6e' : '#64748b'} roughness={0.45} metalness={0.65} />
      </instancedMesh>
      <instancedMesh ref={armRef} args={[undefined, undefined, count]}>
        <boxGeometry args={[0.09, 0.09, 1.0]} />
        <meshStandardMaterial color={isCad ? '#334e6e' : '#64748b'} roughness={0.45} metalness={0.65} />
      </instancedMesh>
      <instancedMesh ref={lampRef} args={[undefined, undefined, count]}>
        <boxGeometry args={[0.32, 0.12, 0.65]} />
        <meshStandardMaterial
          color={isCad ? '#38bdf8' : '#fef3c7'}
          emissive={isCad ? '#38bdf8' : '#fde68a'}
          emissiveIntensity={isCad ? 1.1 : 0.45}
          roughness={0.3}
        />
      </instancedMesh>
    </group>
  );
}

/**
 * Atmosphere & lighting rig calibrated per GroundMode ('game' | 'satellite' | 'cad').
 */
function WorldAtmosphere({ groundMode }: { groundMode: GroundMode }) {
  if (groundMode === 'cad') {
    return (
      <>
        <color attach="background" args={['#09101a']} />
        <fog attach="fog" args={['#09101a', 260, 780]} />
        <hemisphereLight args={['#7dd3fc', '#0b1526', 0.9]} />
        <directionalLight position={[110, 150, 90]} intensity={1.15} color="#bae6fd" />
        <directionalLight position={[-100, 90, -80]} intensity={0.45} color="#38bdf8" />
      </>
    );
  }

  if (groundMode === 'satellite') {
    return (
      <>
        <color attach="background" args={['#d8e7f3']} />
        <fog attach="fog" args={['#d8e7f3', 360, 950]} />
        <hemisphereLight args={['#f0f7ff', '#7a8a78', 1.15]} />
        <directionalLight
          position={[115, 165, 85]}
          intensity={1.65}
          color="#fffaf0"
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-170}
          shadow-camera-right={170}
          shadow-camera-top={170}
          shadow-camera-bottom={-170}
          shadow-camera-near={20}
          shadow-camera-far={440}
          shadow-bias={-0.0004}
          shadow-normalBias={0.04}
        />
      </>
    );
  }

  // 'game': crisp Cities: Skylines warm daylight
  return (
    <>
      <color attach="background" args={['#b5daf2']} />
      <fog attach="fog" args={['#c9e3f2', 200, 640]} />
      <hemisphereLight args={['#e6f4ff', '#4b6844', 0.95]} />
      <directionalLight
        position={[115, 145, 88]}
        intensity={2.15}
        color="#fff4e0"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-170}
        shadow-camera-right={170}
        shadow-camera-top={170}
        shadow-camera-bottom={-170}
        shadow-camera-near={20}
        shadow-camera-far={440}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
      />
      <directionalLight position={[-110, 80, -90]} intensity={0.48} color="#bfdbfe" />
    </>
  );
}

/**
 * Complete Single-Source-of-Truth 3D World for Kabankalan City Ceres Bus Terminal Corridor.
 * Every road, cutout sidewalk, segmented median, marking, terminal structure, landmark,
 * tree, streetlight, and satellite tile is driven directly from `RoadNetworkGraph`.
 */
export function CeresWorldMesh({ graph }: CeresWorldMeshProps) {
  const groundMode = useSimStore((s) => s.overlays.groundMode);
  const showLandmarks = useSimStore((s) => s.overlays.showLandmarks);
  const scenarioId = useSimStore((s) => s.params.scenario);
  const scenario = SCENARIOS[scenarioId];

  const isSatellite = groundMode === 'satellite';
  const isCad = groundMode === 'cad';

  // Procedural textures (created once, disposed cleanly)
  const textures = useMemo(() => {
    const asphalt = createAsphaltTexture();
    const terrain = createTerrainTexture();
    return { asphalt, terrain };
  }, []);

  useEffect(() => {
    return () => {
      textures.asphalt?.dispose();
      textures.terrain?.dispose();
    };
  }, [textures]);

  // Build all procedural road, sidewalk, median, marking, and yard BufferGeometries from `graph`
  const geometries = useMemo(() => {
    const arterialAsphaltParts: THREE.BufferGeometry[] = [];
    const sideRoadAsphaltParts: THREE.BufferGeometry[] = [];
    const sidewalkParts: THREE.BufferGeometry[] = [];
    const medianParts: THREE.BufferGeometry[] = [];
    const medianNoseParts: THREE.BufferGeometry[] = [];
    const whiteMarkingParts: THREE.BufferGeometry[] = [];
    const yellowMarkingParts: THREE.BufferGeometry[] = [];
    const yardPadParts: THREE.BufferGeometry[] = [];

    for (const seg of graph.roadSegments) {
      const halfW = seg.carriagewayWidth * 0.5;
      const isArterial = seg.roadClass === 'arterial';
      const isDriveway = seg.roadClass === 'driveway';

      // 1. Carriageway asphalt (layered by road class so junctions have ZERO z-fighting!)
      const asphaltY = isArterial ? 0.048 : isDriveway ? 0.045 : 0.042;
      const ribbon = buildRibbonGeometry(seg.samples, -halfW, halfW, asphaltY);
      if (isArterial) {
        arterialAsphaltParts.push(ribbon);
      } else {
        sideRoadAsphaltParts.push(ribbon);
      }

      // 2. Raised beveled/extruded concrete sidewalks — skipping ALL cutouts!
      if (seg.sidewalkWidthLeft > 0) {
        const keptLeft = subtractIntervals(seg.length, seg.sidewalkLeftCutouts);
        sidewalkParts.push(
          buildExtrudedRibbonGeometry(
            seg.samples,
            halfW,
            halfW + seg.sidewalkWidthLeft,
            0.015,
            0.16,
            keptLeft,
          ),
        );
      }
      if (seg.sidewalkWidthRight > 0) {
        const keptRight = subtractIntervals(seg.length, seg.sidewalkRightCutouts);
        sidewalkParts.push(
          buildExtrudedRibbonGeometry(
            seg.samples,
            -halfW - seg.sidewalkWidthRight,
            -halfW,
            0.015,
            0.16,
            keptRight,
          ),
        );
      }

      // 3. Segmented raised center median + yellow safety nose caps — skipping ALL medianBreaks!
      if (seg.medianWidth > 0) {
        const halfMed = seg.medianWidth * 0.5;
        const keptMed = subtractIntervals(seg.length, seg.medianBreaks);
        medianParts.push(
          buildExtrudedRibbonGeometry(seg.samples, -halfMed, halfMed, 0.04, 0.22, keptMed),
        );
        medianNoseParts.push(
          buildMedianNoseCapsGeometry(seg.samples, halfMed, 0.04, 0.22, keptMed),
        );
      }

      // 4. White dashed lane dividers & arterial curb edge lines
      for (const offset of seg.laneDividerOffsets) {
        whiteMarkingParts.push(
          buildDashedLineGeometry(seg.samples, offset, 3.0, 4.5, 0.14, 0.068, seg.medianBreaks),
        );
      }
      if (isArterial) {
        whiteMarkingParts.push(
          buildSolidLineGeometry(
            seg.samples,
            halfW - 0.18,
            0.14,
            0.068,
            seg.sidewalkLeftCutouts,
          ),
        );
        whiteMarkingParts.push(
          buildSolidLineGeometry(
            seg.samples,
            -(halfW - 0.18),
            0.14,
            0.068,
            seg.sidewalkRightCutouts,
          ),
        );
      }

      // 5. Yellow dashed centerlines on 2-lane undivided collector/local roads
      if (seg.hasCenterDashedLine) {
        const mergedCuts = [...seg.sidewalkLeftCutouts, ...seg.sidewalkRightCutouts];
        yellowMarkingParts.push(
          buildDashedLineGeometry(seg.samples, 0, 2.6, 3.4, 0.14, 0.066, mergedCuts),
        );
      }
    }

    // 6. Curb-to-curb zebra crosswalks & stop bars
    whiteMarkingParts.push(buildCrosswalkStripesGeometry(graph.crosswalks, graph, 0.07));

    // 7. Ceres yard concrete slab, staging bay stalls & internal alighting/staging zones
    for (const pad of graph.yardPads) {
      yardPadParts.push(buildExtrudedPolygon(pad.polygon, 0.036, 0.0));
    }
    yellowMarkingParts.push(buildStagingBaysGeometry(graph.stagingBays, 0.069));
    yellowMarkingParts.push(buildLoadingZonesGeometry(graph, ['alighting', 'staging'], 0.069));

    // 8. Dedicated curbside PUV loading bays (highlighted cleanly in Scenarios 1 & 2)
    const dedicatedCurbBaysGeo = buildLoadingZonesGeometry(graph, ['curbside'], 0.072);

    return {
      arterialAsphaltGeo: mergeSafeGeometries(arterialAsphaltParts),
      sideRoadAsphaltGeo: mergeSafeGeometries(sideRoadAsphaltParts),
      sidewalksGeo: mergeSafeGeometries(sidewalkParts),
      mediansGeo: mergeSafeGeometries(medianParts),
      medianNoseGeo: mergeSafeGeometries(medianNoseParts),
      whiteMarkingsGeo: mergeSafeGeometries(whiteMarkingParts),
      yellowMarkingsGeo: mergeSafeGeometries(yellowMarkingParts),
      yardPadGeo: mergeSafeGeometries(yardPadParts),
      dedicatedCurbBaysGeo,
    };
  }, [graph]);

  useEffect(() => {
    return () => {
      Object.values(geometries).forEach((g) => g.dispose());
    };
  }, [geometries]);

  const ceresFrontageCw = useMemo(
    () => graph.crosswalks.find((cw) => cw.id === 'cw_ceres_frontage') ?? null,
    [graph.crosswalks],
  );

  const landmarkBuildings = useMemo(
    () => graph.buildings.filter((b) => b.landmark),
    [graph.buildings],
  );

  const roadOpacity = isSatellite ? 0.72 : 1.0;

  return (
    <group name="ceres-world">
      <WorldAtmosphere groundMode={groundMode} />

      {/* 1. GROUND LAYER (Game Terrain / 1:1 ESRI Satellite Tiles / Dark CAD Grid) */}
      {groundMode === 'game' && (
        <mesh position={[20, -0.08, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[1400, 1400]} />
          <meshStandardMaterial
            map={textures.terrain ?? undefined}
            color={textures.terrain ? '#ffffff' : '#58784b'}
            roughness={0.96}
            metalness={0.0}
          />
        </mesh>
      )}

      {groundMode === 'satellite' && (
        <group name="satellite-mosaic">
          {/* Neutral backdrop outside satellite tile bounds */}
          <mesh position={[15, -0.1, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <planeGeometry args={[1600, 1600]} />
            <meshStandardMaterial color="#586959" roughness={0.98} />
          </mesh>
          {graph.satelliteCoverage.tiles.map((tile) => (
            <SatelliteTilePlane key={`${tile.z}-${tile.x}-${tile.y}`} tile={tile} />
          ))}
        </group>
      )}

      {groundMode === 'cad' && (
        <group name="cad-ground">
          <mesh position={[20, -0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[1400, 1400]} />
            <meshStandardMaterial color="#0a1220" roughness={0.95} />
          </mesh>
          <gridHelper args={[600, 60, '#1e3a5f', '#122238']} position={[20, 0.014, 0]} />
          <gridHelper args={[600, 12, '#2d588a', '#1b3554']} position={[20, 0.017, 0]} />
        </group>
      )}

      {/* 2. CERES CONCRETE YARD PAD */}
      <mesh geometry={geometries.yardPadGeo} receiveShadow>
        <meshStandardMaterial
          color={isCad ? '#142033' : '#b7bec6'}
          roughness={0.88}
          transparent={isSatellite}
          opacity={isSatellite ? 0.62 : 1.0}
        />
      </mesh>

      {/* 3. PROCEDURAL ASPHALT CARRIAGEWAYS */}
      <mesh geometry={geometries.arterialAsphaltGeo} receiveShadow>
        <meshStandardMaterial
          map={isCad ? undefined : textures.asphalt ?? undefined}
          color={isCad ? '#1a293f' : '#4a525e'}
          roughness={0.86}
          metalness={0.02}
          transparent={isSatellite}
          opacity={roadOpacity}
          depthWrite={!isSatellite}
        />
      </mesh>
      <mesh geometry={geometries.sideRoadAsphaltGeo} receiveShadow>
        <meshStandardMaterial
          map={isCad ? undefined : textures.asphalt ?? undefined}
          color={isCad ? '#162336' : '#535b67'}
          roughness={0.88}
          metalness={0.02}
          transparent={isSatellite}
          opacity={roadOpacity}
          depthWrite={!isSatellite}
        />
      </mesh>

      {/* 4. RAISED CONCRETE SIDEWALKS & SEGMENTED CENTER MEDIANS (ZERO CUTOUT BLOCKING!) */}
      <mesh geometry={geometries.sidewalksGeo} castShadow receiveShadow>
        <meshStandardMaterial
          color={isCad ? '#223650' : '#cfd5dc'}
          roughness={0.85}
          transparent={isSatellite}
          opacity={isSatellite ? 0.8 : 1.0}
        />
      </mesh>
      <mesh geometry={geometries.mediansGeo} castShadow receiveShadow>
        <meshStandardMaterial color={isCad ? '#2a4566' : '#d8dee4'} roughness={0.78} />
      </mesh>
      <mesh geometry={geometries.medianNoseGeo} castShadow receiveShadow>
        <meshStandardMaterial color="#f5b800" roughness={0.62} />
      </mesh>

      {/* 5. PAVEMENT MARKINGS (polygonOffset prevents any z-fighting) */}
      <mesh geometry={geometries.whiteMarkingsGeo}>
        <meshStandardMaterial
          color={isCad ? '#dbeafe' : '#f8fafc'}
          roughness={0.6}
          polygonOffset
          polygonOffsetFactor={-2}
          polygonOffsetUnits={-2}
        />
      </mesh>
      <mesh geometry={geometries.yellowMarkingsGeo}>
        <meshStandardMaterial
          color="#facc15"
          roughness={0.55}
          polygonOffset
          polygonOffsetFactor={-2}
          polygonOffsetUnits={-2}
        />
      </mesh>

      {/* Dedicated PUV Loading Bay highlights in Scenarios 1 & 2 */}
      {scenario.dedicatedBaysOnly && (
        <mesh geometry={geometries.dedicatedCurbBaysGeo}>
          <meshStandardMaterial
            color="#10b981"
            emissive="#10b981"
            emissiveIntensity={isCad ? 0.8 : 0.25}
            roughness={0.5}
            polygonOffset
            polygonOffsetFactor={-3}
            polygonOffsetUnits={-3}
          />
        </mesh>
      )}

      {/* 6. CERES PERIMETER WALLS & GATE 1 / GATE 2 GANTRIES */}
      <group name="ceres-perimeter-walls">
        {graph.perimeterWalls.map((wall) => {
          const dx = wall.end.x - wall.start.x;
          const dz = wall.end.z - wall.start.z;
          const len = Math.hypot(dx, dz);
          if (len < 0.2) return null;
          const cx = (wall.start.x + wall.end.x) * 0.5;
          const cz = (wall.start.z + wall.end.z) * 0.5;
          const heading = Math.atan2(dx, dz);
          return (
            <group key={wall.id} position={[cx, 0, cz]} rotation={[0, heading, 0]}>
              <mesh position={[0, wall.height * 0.5, 0]} castShadow receiveShadow>
                <boxGeometry args={[wall.thickness, wall.height, len]} />
                <meshStandardMaterial color={isCad ? '#243a54' : '#e6e4dc'} roughness={0.85} />
              </mesh>
              <mesh position={[0, wall.height + 0.08, 0]} castShadow>
                <boxGeometry args={[wall.thickness + 0.14, 0.16, len + 0.1]} />
                <meshStandardMaterial color={isCad ? '#38bdf8' : '#166534'} roughness={0.6} />
              </mesh>
            </group>
          );
        })}
      </group>

      {graph.gateStructures.map((gate) => (
        <CeresGateGantry key={gate.id} gate={gate} isCad={isCad} />
      ))}

      {/* 7. SCENARIO 2 INFRASTRUCTURE: PEDESTRIAN OVERPASS & LIVE TRAFFIC SIGNALS */}
      {scenario.hasPedestrianOverpass && ceresFrontageCw && (
        <PedestrianOverpass crosswalk={ceresFrontageCw} isCad={isCad} />
      )}
      {scenario.signalizedCrossings && (
        <SignalizedCrosswalkPoles crosswalks={graph.crosswalks} />
      )}

      {/* 8. ALL 32 STYLIZED KABANKALAN BUILDINGS & LANDMARKS */}
      <group name="kabankalan-buildings">
        {graph.buildings.map((b) =>
          b.id === 'ceres_terminal_shed' ? (
            <CeresTerminalShed key={b.id} building={b} isCad={isCad} />
          ) : (
            <StylizedBuilding key={b.id} building={b} isCad={isCad} />
          ),
        )}
      </group>

      {/* 9. INSTANCED TROPICAL TREES & STREETLIGHTS */}
      <InstancedTrees graph={graph} isCad={isCad} />
      <InstancedStreetlights graph={graph} isCad={isCad} />

      {/* 10. TOGGLEABLE FLOATING LANDMARK PINS (Native WebGL Canvas Sprites — zero DOM HUD bleed) */}
      {showLandmarks && (
        <group name="landmark-pins">
          {landmarkBuildings.map((b) => (
            <LandmarkSprite
              key={b.id}
              label={b.label}
              accentColor={b.accentColor ?? '#38bdf8'}
              position={[b.center.x, b.height + 3.4, b.center.z]}
            />
          ))}
          <LandmarkSprite
            label="Pedro Zayco Sr. St."
            accentColor="#38bdf8"
            position={[-2, 5.2, -82]}
            isStreet
          />
        </group>
      )}
    </group>
  );
}

interface LandmarkSpriteProps {
  label: string;
  accentColor: string;
  position: [number, number, number];
  isStreet?: boolean;
}

function createLandmarkSpriteTexture(
  label: string,
  accentColor: string,
  isStreet: boolean,
): { texture: THREE.CanvasTexture; aspect: number } | null {
  if (typeof document === 'undefined') return null;

  const fontSize = 30;
  const padX = 24;
  const height = 58;
  const measureCanvas = document.createElement('canvas');
  const mCtx = measureCanvas.getContext('2d');
  if (!mCtx) return null;

  mCtx.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  const textWidth = Math.ceil(mCtx.measureText(label).width);
  const width = Math.max(140, textWidth + padX * 2 + 16);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const r = height / 2;
  ctx.beginPath();
  ctx.roundRect(2, 2, width - 4, height - 4, r - 2);
  ctx.fillStyle = isStreet ? 'rgba(12, 34, 58, 0.88)' : 'rgba(9, 13, 20, 0.86)';
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = isStreet ? 'rgba(125, 211, 252, 0.6)' : 'rgba(255, 255, 255, 0.25)';
  ctx.stroke();

  // Accent indicator dot
  ctx.beginPath();
  ctx.arc(22, height / 2, 6, 0, Math.PI * 2);
  ctx.fillStyle = accentColor;
  ctx.fill();

  // Label text
  ctx.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  ctx.fillStyle = isStreet ? '#e0f2fe' : '#f8fafc';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 38, height / 2 + 1);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;

  return { texture, aspect: width / height };
}

function LandmarkSprite({ label, accentColor, position, isStreet = false }: LandmarkSpriteProps) {
  const spriteData = useMemo(
    () => createLandmarkSpriteTexture(label, accentColor, isStreet),
    [label, accentColor, isStreet],
  );

  useEffect(() => {
    return () => {
      spriteData?.texture.dispose();
    };
  }, [spriteData]);

  if (!spriteData) return null;

  const worldHeight = isStreet ? 3.0 : 3.2;
  const worldWidth = worldHeight * spriteData.aspect;

  return (
    <sprite position={position} scale={[worldWidth, worldHeight, 1]} renderOrder={12}>
      <spriteMaterial
        map={spriteData.texture}
        transparent
        depthTest={true}
        depthWrite={false}
        sizeAttenuation={true}
      />
    </sprite>
  );
}
