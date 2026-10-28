import { LocationId, VehicleType } from './types';

export type MovementType = 'through' | 'right_turn' | 'left_turn' | 'merge' | 'egress' | 'ingress';

export interface RouteConflictApproach {
  routeId: string;
  entryDistance: number;      // Distance along route entering conflict zone (meters)
  exitDistance: number;       // Distance along route exiting conflict zone (meters)
  stopBarDistance: number;    // Holding / yield line position along route
  priority: number;           // 1 = Highest (Through corridor), 2 = High, 3 = Medium (Left turn), 4 = Low (Minor egress)
  movementType: MovementType;
  requiredGapSeconds: number; // Gap in seconds required to enter
  receivingRouteId?: string;  // Route receiving downstream traffic
  receivingDistanceStart?: number; // Where receiving lane starts
  receivingDistanceEnd?: number;   // Where receiving lane ends
}

export interface ConflictAreaDefinition {
  id: string;
  name: string;
  corridorId: LocationId;
  center: { x: number; z: number };
  radius: number;
  approaches: Record<string, RouteConflictApproach>;
}

export const CONFLICT_AREAS: Record<string, ConflictAreaDefinition> = {
  // ─── 1. Ceres Terminal Corridor Conflict Areas ────────────────────────────
  CA_CERES_PEDRO_ZAYCO: {
    id: 'CA_CERES_PEDRO_ZAYCO',
    name: 'Guanzon St / Pedro Zayco Sr. St T-Junction',
    corridorId: LocationId.CeresTerminal,
    center: { x: 64, z: -2 },
    radius: 20,
    approaches: {
      ceres_hw_nb: {
        routeId: 'ceres_hw_nb',
        entryDistance: 135,
        exitDistance: 175,
        stopBarDistance: 133,
        priority: 1,
        movementType: 'through',
        requiredGapSeconds: 2.0,
      },
      ceres_hw_sb: {
        routeId: 'ceres_hw_sb',
        entryDistance: 45,
        exitDistance: 85,
        stopBarDistance: 43,
        priority: 1,
        movementType: 'through',
        requiredGapSeconds: 2.0,
      },
      ceres_egress_north: {
        routeId: 'ceres_egress_north',
        entryDistance: 32, // Wide turn cutting across centerline toward Bacolod
        exitDistance: 65,
        stopBarDistance: 30,
        priority: 2,
        movementType: 'left_turn',
        requiredGapSeconds: 4.5, // 12m Bus wide swept envelope
        receivingRouteId: 'ceres_hw_nb',
        receivingDistanceStart: 165,
        receivingDistanceEnd: 195,
      },
      ceres_pedro_zayco_in: {
        routeId: 'ceres_pedro_zayco_in',
        entryDistance: 48,
        exitDistance: 70,
        stopBarDistance: 46,
        priority: 3,
        movementType: 'left_turn',
        requiredGapSeconds: 3.5,
        receivingRouteId: 'ceres_pedro_zayco_in',
        receivingDistanceStart: 70,
        receivingDistanceEnd: 100,
      },
      ceres_pedro_zayco_out_sb: {
        routeId: 'ceres_pedro_zayco_out_sb',
        entryDistance: 22,
        exitDistance: 48,
        stopBarDistance: 20, // Stop line on Pedro Zayco Sr. St
        priority: 4,
        movementType: 'right_turn',
        requiredGapSeconds: 4.0, // Must yield to oncoming buses and through highway
        receivingRouteId: 'ceres_hw_sb',
        receivingDistanceStart: 85,
        receivingDistanceEnd: 120,
      },
    },
  },

  CA_CERES_GATE2_EGRESS: {
    id: 'CA_CERES_GATE2_EGRESS',
    name: 'Ceres Terminal Gate 2 Egress Apron',
    corridorId: LocationId.CeresTerminal,
    center: { x: 103, z: 6 },
    radius: 16,
    approaches: {
      ceres_hw_sb: {
        routeId: 'ceres_hw_sb',
        entryDistance: 85,
        exitDistance: 120,
        stopBarDistance: 83,
        priority: 1,
        movementType: 'through',
        requiredGapSeconds: 2.0,
      },
      ceres_hw_nb: {
        routeId: 'ceres_hw_nb',
        entryDistance: 95,
        exitDistance: 135,
        stopBarDistance: 93,
        priority: 1,
        movementType: 'through',
        requiredGapSeconds: 2.5,
      },
      ceres_egress_north: {
        routeId: 'ceres_egress_north',
        entryDistance: 22,
        exitDistance: 40,
        stopBarDistance: 21,
        priority: 2,
        movementType: 'left_turn',
        requiredGapSeconds: 4.5,
        receivingRouteId: 'ceres_hw_nb',
        receivingDistanceStart: 125,
        receivingDistanceEnd: 155,
      },
      ceres_egress_south: {
        routeId: 'ceres_egress_south',
        entryDistance: 22,
        exitDistance: 38,
        stopBarDistance: 21,
        priority: 2,
        movementType: 'right_turn',
        requiredGapSeconds: 3.5,
        receivingRouteId: 'ceres_hw_sb',
        receivingDistanceStart: 125,
        receivingDistanceEnd: 155,
      },
    },
  },

  CA_CERES_GATE1_INGRESS: {
    id: 'CA_CERES_GATE1_INGRESS',
    name: 'Ceres Terminal Gate 1 Ingress Throat',
    corridorId: LocationId.CeresTerminal,
    center: { x: 148, z: 6 },
    radius: 14,
    approaches: {
      ceres_hw_sb: {
        routeId: 'ceres_hw_sb',
        entryDistance: 135,
        exitDistance: 165,
        stopBarDistance: 133,
        priority: 1,
        movementType: 'through',
        requiredGapSeconds: 2.0,
      },
      ceres_ingress_gate1: {
        routeId: 'ceres_ingress_gate1',
        entryDistance: 138,
        exitDistance: 158,
        stopBarDistance: 136,
        priority: 2,
        movementType: 'right_turn',
        requiredGapSeconds: 3.0,
        receivingRouteId: 'ceres_ingress_gate1',
        receivingDistanceStart: 158,
        receivingDistanceEnd: 190,
      },
    },
  },

  // ─── 2. KCC Frontage Conflict Areas ───────────────────────────────────────
  CA_KCC_AQUILES_ZAYCO: {
    id: 'CA_KCC_AQUILES_ZAYCO',
    name: 'National Hwy / Aquiles-Zayco Ave Y-Fork',
    corridorId: LocationId.KCCFrontage,
    center: { x: 105, z: 0 },
    radius: 18,
    approaches: {
      kcc_hw_wb: {
        routeId: 'kcc_hw_wb',
        entryDistance: 85,
        exitDistance: 125,
        stopBarDistance: 83,
        priority: 1,
        movementType: 'through',
        requiredGapSeconds: 2.0,
      },
      kcc_hw_eb: {
        routeId: 'kcc_hw_eb',
        entryDistance: 85,
        exitDistance: 125,
        stopBarDistance: 83,
        priority: 1,
        movementType: 'through',
        requiredGapSeconds: 2.0,
      },
      kcc_aquiles_zayco_branch: {
        routeId: 'kcc_aquiles_zayco_branch',
        entryDistance: 95,
        exitDistance: 125,
        stopBarDistance: 92,
        priority: 3,
        movementType: 'left_turn',
        requiredGapSeconds: 3.5,
      },
      kcc_student_dropoff: {
        routeId: 'kcc_student_dropoff',
        entryDistance: 65,
        exitDistance: 95,
        stopBarDistance: 63,
        priority: 2,
        movementType: 'ingress',
        requiredGapSeconds: 2.5,
      },
    },
  },

  // ─── 3. Public Market Conflict Areas ──────────────────────────────────────
  CA_MARKET_LIRAZAN: {
    id: 'CA_MARKET_LIRAZAN',
    name: 'Guanzon St / Lirazan St Market Intersection',
    corridorId: LocationId.PublicMarket,
    center: { x: 80, z: 0 },
    radius: 18,
    approaches: {
      market_corridor_eb: {
        routeId: 'market_corridor_eb',
        entryDistance: 60,
        exitDistance: 100,
        stopBarDistance: 58,
        priority: 1,
        movementType: 'through',
        requiredGapSeconds: 2.0,
      },
      market_corridor_wb: {
        routeId: 'market_corridor_wb',
        entryDistance: 60,
        exitDistance: 100,
        stopBarDistance: 58,
        priority: 1,
        movementType: 'through',
        requiredGapSeconds: 2.0,
      },
      market_lirazan_nb: {
        routeId: 'market_lirazan_nb',
        entryDistance: 10,
        exitDistance: 32,
        stopBarDistance: 8,
        priority: 3,
        movementType: 'left_turn',
        requiredGapSeconds: 3.5,
      },
      market_loading_curb_eb: {
        routeId: 'market_loading_curb_eb',
        entryDistance: 30,
        exitDistance: 60,
        stopBarDistance: 28,
        priority: 2,
        movementType: 'ingress',
        requiredGapSeconds: 2.5,
      },
    },
  },
};

/**
 * Get all conflict areas for a specific corridor location.
 */
export function getConflictAreasForLocation(locationId: LocationId): ConflictAreaDefinition[] {
  return Object.values(CONFLICT_AREAS).filter((ca) => ca.corridorId === locationId);
}
