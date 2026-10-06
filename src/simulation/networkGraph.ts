import { LocationId } from './types';

export type NodeType =
  | 'entry_exit'
  | 'intersection'
  | 'gate_ingress'
  | 'gate_egress'
  | 'alighting_platform'
  | 'staging_bay'
  | 'internal_loop'
  | 'side_road_end';

export interface GraphNode {
  id: string;
  name: string;
  x: number;
  z: number;
  type: NodeType;
  description?: string;
}

export interface GraphSegment {
  id: string;
  name: string;
  fromNodeId: string;
  toNodeId: string;
  /** Carriageway width in meters (excluding shoulders) */
  carriagewayWidth: number;
  /** Paved shoulder width in meters (each side) */
  shoulderWidth: number;
  /** Total paved roadway width */
  totalWidth: number;
  lanes: number;
  speedLimitKph: number;
  surface: 'asphalt' | 'reinforced_concrete';
  hasCenterline?: boolean;
  hasShoulderLines?: boolean;
  hasStopBar?: boolean;
  isCompoundInternal?: boolean;
}

export interface JunctionPolygon {
  id: string;
  nodeId: string;
  name: string;
  /** 2D vertices [x, z] defining the continuous asphalt junction footprint */
  vertices: Array<[number, number]>;
  surface: 'asphalt' | 'reinforced_concrete';
  elevation: number; // Layer 1: Y = 0.05
}

export interface CorridorNetworkGraph {
  locationId: LocationId;
  name: string;
  description: string;
  nodes: Record<string, GraphNode>;
  segments: GraphSegment[];
  junctions: JunctionPolygon[];
}

// ─── DPWH Standard Dimensions ───────────────────────────────────────────────
// National Highway: 3.35m per lane (6.70m carriageway) + 1.50m paved shoulders = 9.70m
const DPWH_HIGHWAY_CARRIAGEWAY = 6.70;
const DPWH_HIGHWAY_SHOULDER = 1.50;
const DPWH_HIGHWAY_TOTAL = DPWH_HIGHWAY_CARRIAGEWAY + DPWH_HIGHWAY_SHOULDER * 2; // 9.70m

// Secondary Feeder Street: 3.00m per lane (6.00m carriageway)
const DPWH_FEEDER_CARRIAGEWAY = 6.00;

// ─── Network Graph 1: Ceres Bus Terminal Vicinity ───────────────────────────

export const CERES_TERMINAL_GRAPH: CorridorNetworkGraph = {
  locationId: LocationId.CeresTerminal,
  name: 'Guanzon St / Bacolod–South Road & Pedro Zayco Sr. St Corridor',
  description: 'DPWH National Highway transit corridor with two-gate Ceres Bus Station compound',
  nodes: {
    // 1. Highway Mainline Nodes
    N_HW_SB_ENTRY: {
      id: 'N_HW_SB_ENTRY',
      name: 'Guanzon St Southbound Entry (from Bacolod/Hinigaran)',
      x: 0,
      z: 1.675,
      type: 'entry_exit',
    },
    N_PEDRO_ZAYCO_JCT: {
      id: 'N_PEDRO_ZAYCO_JCT',
      name: 'Guanzon St / Pedro Zayco Sr. St T-Junction',
      x: 64,
      z: 0,
      type: 'intersection',
    },
    N_GATE2_EGRESS_JCT: {
      id: 'N_GATE2_EGRESS_JCT',
      name: 'Guanzon St / Gate 2 Egress Throat',
      x: 103,
      z: 4.85, // Edge of paved shoulder
      type: 'gate_egress',
    },
    N_GATE1_INGRESS_JCT: {
      id: 'N_GATE1_INGRESS_JCT',
      name: 'Guanzon St / Gate 1 Ingress Throat',
      x: 151,
      z: 4.85,
      type: 'gate_ingress',
    },
    N_REPOLLO_JCT: {
      id: 'N_REPOLLO_JCT',
      name: 'Guanzon St / Repollo St Connector',
      x: 180,
      z: 4.85,
      type: 'intersection',
    },
    N_HW_NB_ENTRY: {
      id: 'N_HW_NB_ENTRY',
      name: 'Guanzon St Northbound Entry (from Ilog/Kabankalan CBD)',
      x: 220,
      z: -1.675,
      type: 'entry_exit',
    },

    // 2. Secondary Feeder Road Nodes
    N_ZAYCO_NORTH_END: {
      id: 'N_ZAYCO_NORTH_END',
      name: 'Pedro Zayco Sr. St Northwest Boundary',
      x: 64,
      z: -35,
      type: 'side_road_end',
    },
    N_REPOLLO_SOUTH_END: {
      id: 'N_REPOLLO_SOUTH_END',
      name: 'Repollo St South Boundary',
      x: 180,
      z: 35,
      type: 'side_road_end',
    },

    // 3. Ceres Terminal Off-Street Compound Internal Nodes
    N_GATE1_APRON: {
      id: 'N_GATE1_APRON',
      name: 'Gate 1 Entrance Driveway Apron',
      x: 151,
      z: 8.5,
      type: 'gate_ingress',
    },
    N_ALIGHTING_BAY: {
      id: 'N_ALIGHTING_BAY',
      name: 'Passenger Alighting Platform Apron',
      x: 142,
      z: 18.0,
      type: 'alighting_platform',
    },
    N_INTERNAL_LOOP_CURVE: {
      id: 'N_INTERNAL_LOOP_CURVE',
      name: 'Compound Internal Return Loop Curve',
      x: 120,
      z: 31.0,
      type: 'internal_loop',
    },
    N_STAGING_BAY_1: {
      id: 'N_STAGING_BAY_1',
      name: 'Staging Yard Queue Slot 1 (Head of Departure Queue)',
      x: 114,
      z: 28.0,
      type: 'staging_bay',
    },
    N_STAGING_BAY_2: {
      id: 'N_STAGING_BAY_2',
      name: 'Staging Yard Queue Slot 2 (Waiting Queue)',
      x: 128,
      z: 28.0,
      type: 'staging_bay',
    },
    N_GATE2_APRON: {
      id: 'N_GATE2_APRON',
      name: 'Gate 2 Exit Driveway Apron & Yield Holding Threshold',
      x: 103,
      z: 8.5,
      type: 'gate_egress',
    },
  },
  segments: [
    // Guanzon St Mainline Segments (DPWH Standard: 6.70m carriageway, 1.50m shoulders, total 9.70m)
    {
      id: 'SEG_HW_0_ZAYCO',
      name: 'Guanzon St: Highway Entry to Pedro Zayco T-Jct',
      fromNodeId: 'N_HW_SB_ENTRY',
      toNodeId: 'N_PEDRO_ZAYCO_JCT',
      carriagewayWidth: DPWH_HIGHWAY_CARRIAGEWAY,
      shoulderWidth: DPWH_HIGHWAY_SHOULDER,
      totalWidth: DPWH_HIGHWAY_TOTAL,
      lanes: 2,
      speedLimitKph: 50,
      surface: 'asphalt',
      hasCenterline: true,
      hasShoulderLines: true,
    },
    {
      id: 'SEG_HW_ZAYCO_GATE2',
      name: 'Guanzon St: Pedro Zayco to Gate 2 Egress',
      fromNodeId: 'N_PEDRO_ZAYCO_JCT',
      toNodeId: 'N_GATE2_EGRESS_JCT',
      carriagewayWidth: DPWH_HIGHWAY_CARRIAGEWAY,
      shoulderWidth: DPWH_HIGHWAY_SHOULDER,
      totalWidth: DPWH_HIGHWAY_TOTAL,
      lanes: 2,
      speedLimitKph: 45,
      surface: 'asphalt',
      hasCenterline: true,
      hasShoulderLines: true,
    },
    {
      id: 'SEG_HW_GATE2_GATE1',
      name: 'Guanzon St: Terminal Frontage (Gate 2 to Gate 1)',
      fromNodeId: 'N_GATE2_EGRESS_JCT',
      toNodeId: 'N_GATE1_INGRESS_JCT',
      carriagewayWidth: DPWH_HIGHWAY_CARRIAGEWAY,
      shoulderWidth: DPWH_HIGHWAY_SHOULDER,
      totalWidth: DPWH_HIGHWAY_TOTAL,
      lanes: 2,
      speedLimitKph: 40,
      surface: 'asphalt',
      hasCenterline: true,
      hasShoulderLines: true,
    },
    {
      id: 'SEG_HW_GATE1_REPOLLO',
      name: 'Guanzon St: Gate 1 to Repollo St',
      fromNodeId: 'N_GATE1_INGRESS_JCT',
      toNodeId: 'N_REPOLLO_JCT',
      carriagewayWidth: DPWH_HIGHWAY_CARRIAGEWAY,
      shoulderWidth: DPWH_HIGHWAY_SHOULDER,
      totalWidth: DPWH_HIGHWAY_TOTAL,
      lanes: 2,
      speedLimitKph: 45,
      surface: 'asphalt',
      hasCenterline: true,
      hasShoulderLines: true,
    },
    {
      id: 'SEG_HW_REPOLLO_END',
      name: 'Guanzon St: Repollo St to Highway End',
      fromNodeId: 'N_REPOLLO_JCT',
      toNodeId: 'N_HW_NB_ENTRY',
      carriagewayWidth: DPWH_HIGHWAY_CARRIAGEWAY,
      shoulderWidth: DPWH_HIGHWAY_SHOULDER,
      totalWidth: DPWH_HIGHWAY_TOTAL,
      lanes: 2,
      speedLimitKph: 50,
      surface: 'asphalt',
      hasCenterline: true,
      hasShoulderLines: true,
    },

    // Side Streets
    {
      id: 'SEG_PEDRO_ZAYCO',
      name: 'Pedro Zayco Sr. St Branch',
      fromNodeId: 'N_ZAYCO_NORTH_END',
      toNodeId: 'N_PEDRO_ZAYCO_JCT',
      carriagewayWidth: DPWH_FEEDER_CARRIAGEWAY,
      shoulderWidth: 0.5,
      totalWidth: 7.0,
      lanes: 2,
      speedLimitKph: 30,
      surface: 'asphalt',
      hasCenterline: true,
      hasStopBar: true,
    },
    {
      id: 'SEG_REPOLLO',
      name: 'Repollo St Connector Branch',
      fromNodeId: 'N_REPOLLO_JCT',
      toNodeId: 'N_REPOLLO_SOUTH_END',
      carriagewayWidth: DPWH_FEEDER_CARRIAGEWAY,
      shoulderWidth: 0.5,
      totalWidth: 7.0,
      lanes: 2,
      speedLimitKph: 30,
      surface: 'asphalt',
      hasCenterline: true,
      hasStopBar: false,
    },

    // Ceres Terminal Compound Internal Circulatory Driveways
    {
      id: 'SEG_GATE1_INGRESS_DRIVEWAY',
      name: 'Gate 1 Ingress Apron to Alighting Platform',
      fromNodeId: 'N_GATE1_APRON',
      toNodeId: 'N_ALIGHTING_BAY',
      carriagewayWidth: 10.0,
      shoulderWidth: 0,
      totalWidth: 10.0,
      lanes: 1,
      speedLimitKph: 15,
      surface: 'reinforced_concrete',
      isCompoundInternal: true,
    },
    {
      id: 'SEG_ALIGHT_TO_STAGING_LOOP',
      name: 'Alighting Platform to Rear Staging Yard Loop',
      fromNodeId: 'N_ALIGHTING_BAY',
      toNodeId: 'N_INTERNAL_LOOP_CURVE',
      carriagewayWidth: 8.0,
      shoulderWidth: 0,
      totalWidth: 8.0,
      lanes: 1,
      speedLimitKph: 15,
      surface: 'reinforced_concrete',
      isCompoundInternal: true,
    },
    {
      id: 'SEG_LOOP_TO_STAGING_BAYS',
      name: 'Internal Return Loop to Staging Bay 1 & 2',
      fromNodeId: 'N_INTERNAL_LOOP_CURVE',
      toNodeId: 'N_STAGING_BAY_1',
      carriagewayWidth: 12.0,
      shoulderWidth: 0,
      totalWidth: 12.0,
      lanes: 2,
      speedLimitKph: 15,
      surface: 'reinforced_concrete',
      isCompoundInternal: true,
    },
    {
      id: 'SEG_STAGING_TO_GATE2',
      name: 'Staging Yard Queue to Gate 2 Egress Apron',
      fromNodeId: 'N_STAGING_BAY_1',
      toNodeId: 'N_GATE2_APRON',
      carriagewayWidth: 9.0,
      shoulderWidth: 0,
      totalWidth: 9.0,
      lanes: 1,
      speedLimitKph: 20,
      surface: 'reinforced_concrete',
      isCompoundInternal: true,
    },
  ],
  junctions: [
    // 1. Pedro Zayco T-Junction Seamless Asphalt Polygon
    {
      id: 'JCT_PEDRO_ZAYCO',
      nodeId: 'N_PEDRO_ZAYCO_JCT',
      name: 'Pedro Zayco T-Junction Fillet Patch',
      vertices: [
        [57.0, -4.85],
        [57.0, -12.0],
        [71.0, -12.0],
        [71.0, -4.85],
        [71.0, 4.85],
        [57.0, 4.85],
      ],
      surface: 'asphalt',
      elevation: 0.05,
    },
    // 2. Gate 2 Egress Throat Cut
    {
      id: 'JCT_GATE2',
      nodeId: 'N_GATE2_EGRESS_JCT',
      name: 'Gate 2 Egress Apron Cut',
      vertices: [
        [96.0, 4.85],
        [96.0, 9.5],
        [110.0, 9.5],
        [110.0, 4.85],
      ],
      surface: 'asphalt',
      elevation: 0.05,
    },
    // 3. Gate 1 Ingress Throat Cut
    {
      id: 'JCT_GATE1',
      nodeId: 'N_GATE1_INGRESS_JCT',
      name: 'Gate 1 Ingress Apron Cut',
      vertices: [
        [144.0, 4.85],
        [144.0, 9.5],
        [158.0, 9.5],
        [158.0, 4.85],
      ],
      surface: 'asphalt',
      elevation: 0.05,
    },
    // 4. Repollo St T-Junction Cut
    {
      id: 'JCT_REPOLLO',
      nodeId: 'N_REPOLLO_JCT',
      name: 'Repollo St Connector Junction Cut',
      vertices: [
        [174.0, 4.85],
        [174.0, 12.0],
        [186.0, 12.0],
        [186.0, 4.85],
      ],
      surface: 'asphalt',
      elevation: 0.05,
    },
  ],
};

// ─── Network Graph Registry ──────────────────────────────────────────────────

export const NETWORK_GRAPHS: Record<LocationId, CorridorNetworkGraph> = {
  [LocationId.CeresTerminal]: CERES_TERMINAL_GRAPH,
  [LocationId.KCCFrontage]: {
    ...CERES_TERMINAL_GRAPH,
    locationId: LocationId.KCCFrontage,
    name: 'Guanzon St / KCC School Zone & Aquiles-Zayco Ave Corridor',
  },
  [LocationId.PublicMarket]: {
    ...CERES_TERMINAL_GRAPH,
    locationId: LocationId.PublicMarket,
    name: 'Tan Lorenzo St & Lirazan St Public Terminal Corridor',
  },
};
