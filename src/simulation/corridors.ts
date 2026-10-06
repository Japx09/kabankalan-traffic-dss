import {
  CorridorConfig,
  LocationId,
  ScenarioId,
  ScenarioConfig,
} from './types';

// ─── Corridor Definitions ───────────────────────────────────────────────────

export const CORRIDORS: Record<LocationId, CorridorConfig> = {
  [LocationId.CeresTerminal]: {
    id: LocationId.CeresTerminal,
    name: 'Ceres Terminal (Pedro Zayco Sr. St.)',
    streetName: 'Guanzon St / Bacolod-South Rd',
    description: 'High Ceres bus flow, off-street compound egress, Pedro Zayco Sr. St intersection & commercial strip',
    length: 220,
    roadWidth: 14,
    sidewalkWidth: 3,
    lanes: [
      { centerZ: -5.25, direction: 1 },
      { centerZ: -1.75, direction: 1 },
      { centerZ: 1.75, direction: -1 },
      { centerZ: 5.25, direction: -1 },
    ],
    crosswalks: [
      { x: 86, width: 4, signalized: false, stopLineOffset: 2.5 },
      { x: 175, width: 4, signalized: false, stopLineOffset: 2.5 },
    ],
    loadingZones: [
      // Ceres Bus Terminal Frontage Ingress/Egress Loading Bay (South / positive Z)
      { xStart: 105, xEnd: 145, z: 8.5, isDedicated: false },
      // Opposite curb near Cebuana / Simonne's Pharmacy for tricycles/jeepneys (North / negative Z)
      { xStart: 110, xEnd: 135, z: -8.5, isDedicated: false },
    ],
    hasMedian: false,
    speedLimit: 8.33, // 30 km/h
    spawnScale: 1.2,
    sideStreets: [
      {
        id: 'pedro-zayco',
        name: 'Pedro Zayco Sr. St.',
        x: 64,
        width: 11,
        side: 'north',
        length: 38,
        angle: -0.15,
        hasStopBar: true,
      },
      {
        id: 'repollo',
        name: 'Repollo St Connector',
        x: 180,
        width: 9,
        side: 'south',
        length: 35,
        angle: 0.1,
        hasStopBar: false,
      },
    ],
    terminalYard: {
      x: 128,
      z: 24,
      width: 64,
      depth: 36,
      gate1X: 151,
      gate1Z: 7.5,
      gate1Width: 12,
      gate2X: 103,
      gate2Z: 7.5,
      gate2Width: 12,
      gateX: 103,
      gateZ: 7.5,
      gateWidth: 12,
      stagingBays: [
        { x: 114, z: 28, heading: -Math.PI / 2 }, // Queue Slot 1 (Next to dispatch to Gate 2)
        { x: 128, z: 28, heading: -Math.PI / 2 }, // Queue Slot 2 (Waiting queue)
      ],
    },
    landmarks: [
      {
        id: 'ceres-terminal',
        name: 'Ceres Bus - Kabankalan Station',
        category: 'terminal',
        position: { x: 148, z: 36 },
        dimensions: { width: 26, height: 5.5, depth: 10 },
        color: '#1e293b',
        roofColor: '#f59e0b',
        signText: 'CERES LINER TERMINAL',
        signColor: '#f59e0b',
      },
      {
        id: 'ceres-mart',
        name: 'Ceres Mart',
        category: 'convenience',
        position: { x: 92, z: 13.5 },
        dimensions: { width: 14, height: 4.2, depth: 7 },
        color: '#f8fafc',
        roofColor: '#0284c7',
        signText: 'CERES MART',
        signColor: '#0284c7',
      },
      {
        id: 'cebuana-lhuillier',
        name: 'Cebuana Lhuillier Pawnshop',
        category: 'commercial',
        position: { x: 108, z: -13.5 },
        dimensions: { width: 13, height: 4.5, depth: 7 },
        color: '#1e3a8a',
        roofColor: '#fbbf24',
        signText: 'CEBUANA LHUILLIER',
        signColor: '#fbbf24',
      },
      {
        id: 'simonnes-pharmacy',
        name: "Simonne's Pharmacy",
        category: 'pharmacy',
        position: { x: 126, z: -13.5 },
        dimensions: { width: 13, height: 4.2, depth: 7 },
        color: '#ffffff',
        roofColor: '#ef4444',
        signText: "SIMONNE'S PHARMACY",
        signColor: '#ef4444',
      },
      {
        id: 'modern-glass',
        name: 'Modern Glass',
        category: 'commercial',
        position: { x: 156, z: -13.5 },
        dimensions: { width: 15, height: 4.8, depth: 7 },
        color: '#334155',
        roofColor: '#38bdf8',
        signText: 'MODERN GLASS',
        signColor: '#38bdf8',
      },
      {
        id: 'noceco-sub-office',
        name: 'Noceco Sub-office',
        category: 'institution',
        position: { x: 80, z: -25 },
        dimensions: { width: 18, height: 5.2, depth: 12 },
        color: '#e2e8f0',
        roofColor: '#16a34a',
        signText: 'NOCECO SUB OFFICE',
        signColor: '#16a34a',
      },
      {
        id: 'am-builders-depot',
        name: 'A.M. Builders Depot',
        category: 'hardware',
        position: { x: 42, z: -16 },
        dimensions: { width: 22, height: 6.2, depth: 14 },
        color: '#1e293b',
        roofColor: '#ea580c',
        signText: 'A.M. BUILDERS DEPOT',
        signColor: '#ea580c',
      },
    ],
  },

  [LocationId.KCCFrontage]: {
    id: LocationId.KCCFrontage,
    name: 'KCC Frontage',
    streetName: 'Guanzon Street & Aquiles - Zayco Ave',
    description: 'School zone, Aquiles-Zayco Ave Y-fork junction, heavy student pedestrian crossing, tricycle/jeepney drop-offs',
    length: 180,
    roadWidth: 10,
    sidewalkWidth: 2.8,
    lanes: [
      { centerZ: -2.5, direction: 1 },
      { centerZ: 2.5, direction: -1 },
    ],
    crosswalks: [
      { x: 80, width: 4.5, signalized: false, stopLineOffset: 2.5 },
    ],
    loadingZones: [
      { xStart: 60, xEnd: 95, z: -5.5, isDedicated: false }, // KCC school drop-off
      { xStart: 95, xEnd: 125, z: 5.5, isDedicated: false }, // Commercial side
    ],
    hasMedian: false,
    speedLimit: 5.56, // 20 km/h (school zone)
    spawnScale: 0.9,
    sideStreets: [
      {
        id: 'aquiles-zayco',
        name: 'Aquiles - Zayco Ave (Y-Fork)',
        x: 135,
        width: 12,
        side: 'south',
        length: 50,
        angle: 0.42,
        hasStopBar: false,
      },
      {
        id: 'tayum-herrick',
        name: 'Tayum / Herrick St',
        x: 42,
        width: 9,
        side: 'north',
        length: 32,
        angle: 0,
        hasStopBar: true,
      },
    ],
    landmarks: [
      {
        id: 'kcc-campus',
        name: 'Kabankalan Catholic College',
        category: 'institution',
        position: { x: 90, z: -20 },
        dimensions: { width: 75, height: 12, depth: 26 },
        color: '#1e293b',
        roofColor: '#0284c7',
        signText: 'KABANKALAN CATHOLIC COLLEGE',
        signColor: '#0284c7',
      },
      {
        id: 'mcdonalds',
        name: "McDonald's Kabankalan",
        category: 'commercial',
        position: { x: 70, z: 18 },
        dimensions: { width: 20, height: 6.5, depth: 14 },
        color: '#7f1d1d',
        roofColor: '#eab308',
        signText: "MCDONALD'S",
        signColor: '#eab308',
      },
      {
        id: 'jollibee',
        name: 'Jollibee Kabankalan',
        category: 'commercial',
        position: { x: 100, z: 18 },
        dimensions: { width: 22, height: 6.5, depth: 14 },
        color: '#991b1b',
        roofColor: '#f59e0b',
        signText: 'JOLLIBEE',
        signColor: '#f59e0b',
      },
      {
        id: 'southgate-inn',
        name: 'Southgate Inn',
        category: 'commercial',
        position: { x: 42, z: 16 },
        dimensions: { width: 18, height: 8.5, depth: 14 },
        color: '#334155',
        roofColor: '#ec4899',
        signText: 'SOUTHGATE INN',
        signColor: '#ec4899',
      },
    ],
  },

  [LocationId.PublicMarket]: {
    id: LocationId.PublicMarket,
    name: 'Public Market',
    streetName: 'Tan Lorenzo St & Lirazan St',
    description: 'High density mixed-mode traffic, Lirazan St public terminal junction, informal curb loading, mid-block crossings',
    length: 160,
    roadWidth: 10,
    sidewalkWidth: 2.5,
    lanes: [
      { centerZ: -2.5, direction: 1 },
      { centerZ: 2.5, direction: -1 },
    ],
    crosswalks: [
      { x: 55, width: 3.5, signalized: false, stopLineOffset: 2.0 },
      { x: 80, width: 4.0, signalized: false, stopLineOffset: 2.0 },
    ],
    loadingZones: [
      { xStart: 25, xEnd: 55, z: 5.5, isDedicated: false },
      { xStart: 70, xEnd: 105, z: 5.5, isDedicated: false },
      { xStart: 50, xEnd: 85, z: -5.5, isDedicated: false },
    ],
    hasMedian: false,
    speedLimit: 5.56,
    spawnScale: 1.1,
    sideStreets: [
      {
        id: 'lirazan-north',
        name: 'Lirazan St (North Entrance)',
        x: 80,
        width: 10,
        side: 'north',
        length: 35,
        hasStopBar: true,
      },
      {
        id: 'lirazan-south',
        name: 'Lirazan St (Public Terminal)',
        x: 80,
        width: 12,
        side: 'south',
        length: 35,
        hasStopBar: true,
      },
    ],
    landmarks: [
      {
        id: 'public-market-hall',
        name: 'Kabankalan City Public Market',
        category: 'commercial',
        position: { x: 42, z: 22 },
        dimensions: { width: 48, height: 7.2, depth: 22 },
        color: '#334155',
        roofColor: '#ea580c',
        signText: 'KABANKALAN PUBLIC MARKET',
        signColor: '#ea580c',
      },
      {
        id: 'public-terminal',
        name: 'Kabankalan City Public Terminal',
        category: 'terminal',
        position: { x: 122, z: 22 },
        dimensions: { width: 50, height: 6.0, depth: 22 },
        color: '#1e293b',
        roofColor: '#0284c7',
        signText: 'PUBLIC TRANSPORT TERMINAL',
        signColor: '#0284c7',
      },
      {
        id: 'helsam-grocery',
        name: 'Helsam Grocery Store',
        category: 'commercial',
        position: { x: 80, z: -18 },
        dimensions: { width: 22, height: 5.5, depth: 14 },
        color: '#f8fafc',
        roofColor: '#16a34a',
        signText: 'HELSAM GROCERY',
        signColor: '#16a34a',
      },
    ],
  },
};

// ─── Scenario Definitions ───────────────────────────────────────────────────

export const SCENARIOS: Record<ScenarioId, ScenarioConfig> = {
  [ScenarioId.Baseline]: {
    id: ScenarioId.Baseline,
    name: 'Baseline',
    description: 'Current informal curb loading & random mid-block crossing',
    dedicatedBays: false,
    hasBarrier: false,
    maxDwellTime: null,
    signalizedCrossings: false,
    jaywalkingOverride: null,
  },

  [ScenarioId.DedicatedBay]: {
    id: ScenarioId.DedicatedBay,
    name: 'Dedicated Loading Bay + Barrier',
    description: 'Off-road bay with physical barrier / median island',
    dedicatedBays: true,
    hasBarrier: true,
    maxDwellTime: null,
    signalizedCrossings: false,
    jaywalkingOverride: 0.05, // barrier reduces jaywalking to 5%
  },

  [ScenarioId.StrictRegulation]: {
    id: ScenarioId.StrictRegulation,
    name: 'Strict Dwell Time + Ped Signal',
    description: 'Max 20s dwell time + signalized pedestrian crossing + barrier',
    dedicatedBays: true,
    hasBarrier: true,
    maxDwellTime: 20,
    signalizedCrossings: true,
    jaywalkingOverride: 0.02,
  },
};

/**
 * Apply scenario overrides to a corridor config.
 * Returns a new corridor config with scenario modifications.
 */
export function applyScenarioToCorridor(
  corridor: CorridorConfig,
  scenario: ScenarioConfig
): CorridorConfig {
  const modified = { ...corridor };

  if (scenario.dedicatedBays) {
    modified.loadingZones = corridor.loadingZones.map((lz) => ({
      ...lz,
      isDedicated: true,
    }));
  }

  if (scenario.hasBarrier) {
    modified.hasMedian = true;
  }

  if (scenario.signalizedCrossings) {
    modified.crosswalks = corridor.crosswalks.map((cw) => ({
      ...cw,
      signalized: true,
    }));
  }

  return modified;
}
