import { LocationId, VehicleType } from './types';

export interface RoutePoint {
  x: number;
  z: number;
  heading: number; // radians
  distance: number;
  curvature: number;
}

export interface YieldPoint {
  distanceAlongRoute: number;
  yieldsToRouteIds: string[];
  checkLocation: [number, number];
  priorityArrivalThreshold: number; // seconds
}

export interface RouteDefinition {
  id: string;
  locationId: LocationId;
  name: string;
  waypoints: Array<[number, number]>;
  allowedVehicles?: VehicleType[];
  weight: number;
  length: number;
  samples: RoutePoint[];
  yieldPoints?: YieldPoint[];
  isWideTurningBus?: boolean;
  isInternalTerminalRoute?: boolean;
}

export interface PedestrianDesireLine {
  id: string;
  locationId: LocationId;
  name: string;
  waypoints: Array<[number, number]>;
  weight: number;
  length: number;
  samples: Array<{ x: number; z: number; heading: number }>;
}

// ─── Mathematical Spline Sampling ───────────────────────────────────────────

/** Cubic Catmull-Rom interpolation for 2D points */
function catmullRom2D(
  p0: [number, number],
  p1: [number, number],
  p2: [number, number],
  p3: [number, number],
  t: number
): [number, number] {
  const t2 = t * t;
  const t3 = t2 * t;

  const x =
    0.5 *
    (2 * p1[0] +
      (-p0[0] + p2[0]) * t +
      (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
      (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);

  const z =
    0.5 *
    (2 * p1[1] +
      (-p0[1] + p2[1]) * t +
      (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
      (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);

  return [x, z];
}

/** Pre-sample a waypoint path into arc-length parametrized points */
function buildSampledRoute(
  rawPoints: Array<[number, number]>,
  sampleDensity = 1.0 // 1 sample per meter
): { samples: RoutePoint[]; totalLength: number } {
  if (rawPoints.length < 2) {
    const p = rawPoints[0] || [0, 0];
    return {
      samples: [{ x: p[0], z: p[1], heading: 0, distance: 0, curvature: 0 }],
      totalLength: 0,
    };
  }

  // Duplicate endpoints for Catmull-Rom boundary conditions
  const pts: Array<[number, number]> = [
    rawPoints[0],
    ...rawPoints,
    rawPoints[rawPoints.length - 1],
  ];

  const rawDense: Array<{ x: number; z: number }> = [];
  for (let i = 1; i < pts.length - 2; i++) {
    const p0 = pts[i - 1];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2];
    const segDist = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const steps = Math.max(8, Math.ceil(segDist * sampleDensity * 3));

    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const [x, z] = catmullRom2D(p0, p1, p2, p3, t);
      rawDense.push({ x, z });
    }
  }
  rawDense.push({ x: rawPoints[rawPoints.length - 1][0], z: rawPoints[rawPoints.length - 1][1] });

  // Calculate cumulative distances
  const samples: RoutePoint[] = [];
  let accumDist = 0;

  for (let i = 0; i < rawDense.length; i++) {
    if (i > 0) {
      accumDist += Math.hypot(
        rawDense[i].x - rawDense[i - 1].x,
        rawDense[i].z - rawDense[i - 1].z
      );
    }
    const next = rawDense[Math.min(i + 1, rawDense.length - 1)];
    const prev = rawDense[Math.max(i - 1, 0)];
    const dx = next.x - prev.x;
    const dz = next.z - prev.z;
    const heading = Math.atan2(dz, dx);

    samples.push({
      x: rawDense[i].x,
      z: rawDense[i].z,
      heading,
      distance: accumDist,
      curvature: 0,
    });
  }

  return { samples, totalLength: accumDist };
}

// ─── Network Routes for Location 1: Ceres Bus Terminal ────────────────────────

const CERES_RAW_ROUTES: Array<Omit<RouteDefinition, 'samples' | 'length'>> = [
  // 1. Through Northbound Highway (National Road / Guanzon St towards Hinigaran/Bacolod)
  {
    id: 'ceres_hw_nb',
    locationId: LocationId.CeresTerminal,
    name: 'Guanzon St (Bacolod-South Rd) Northbound Through',
    waypoints: [
      [220, -2.5],
      [150, -2.5],
      [100, -2.5],
      [50, -2.5],
      [0, -2.5],
    ],
    weight: 45,
  },
  // 2. Through Southbound Highway (National Road towards Ilog/Cauayan)
  {
    id: 'ceres_hw_sb',
    locationId: LocationId.CeresTerminal,
    name: 'Guanzon St Southbound Through',
    waypoints: [
      [0, 2.5],
      [50, 2.5],
      [100, 2.5],
      [150, 2.5],
      [220, 2.5],
    ],
    weight: 45,
  },
  // 3. Ceres Bus INGRESS — Highway to Gate 1 Entrance & Alighting Platform
  {
    id: 'ceres_ingress_gate1',
    locationId: LocationId.CeresTerminal,
    name: 'Ceres Inbound Bus — Gate 1 Entrance to Alighting Platform',
    waypoints: [
      [0, 2.5],
      [50, 2.5],
      [110, 2.5],
      [138, 2.5],
      [146, 4.5], // Decelerate & signal right turn
      [151, 8.0], // Crossing Gate 1 driveway throat
      [148, 14.0], // Approaching alighting platform
      [142, 18.0], // Alighting Platform bay (passenger discharge)
    ],
    allowedVehicles: [VehicleType.Bus],
    weight: 35,
    yieldPoints: [
      {
        distanceAlongRoute: 148, // Near Gate 1 driveway
        yieldsToRouteIds: ['ceres_hw_sb'],
        checkLocation: [151, 8.0],
        priorityArrivalThreshold: 2.5,
      },
    ],
  },
  // 4. Ceres Bus INTERNAL STAGING LOOP — Alighting Platform to Staging Yard Queue
  {
    id: 'ceres_alight_to_staging',
    locationId: LocationId.CeresTerminal,
    name: 'Ceres Internal Loop — Alighting to Staging Yard Queue',
    waypoints: [
      [142, 18.0],
      [136, 23.0],
      [128, 29.0],
      [120, 31.0],
      [114, 31.0],
      [114, 28.0], // Queued at Staging Bay Slot 1 (facing North toward Gate 2)
    ],
    allowedVehicles: [VehicleType.Bus],
    weight: 30,
    isInternalTerminalRoute: true,
  },
  // 5. Ceres Bus Terminal EGRESS — Gate 2 NORTHBOUND (Left turn sweeping across lanes toward Bacolod)
  {
    id: 'ceres_egress_north',
    locationId: LocationId.CeresTerminal,
    name: 'Ceres Bus Egress — Gate 2 Northbound Wide Left Turn',
    waypoints: [
      [114, 28.0], // Head of departure queue (facing North)
      [114, 23.0], // Pulling forward from staging slot
      [110, 16.0], // Turning toward Gate 2 driveway throat
      [104, 11.0], // Approach Gate 2
      [103, 7.5], // Gate 2 exit apron (holding line / yield check)
      [96, 3.5], // Wide left swing cutting into SB lane
      [84, -0.5], // Sweeping across centerline
      [68, -2.5], // Merging into NB lane
      [35, -2.5],
      [0, -2.5], // Exiting corridor toward Bacolod
    ],
    allowedVehicles: [VehicleType.Bus],
    weight: 30,
    isWideTurningBus: true,
    isInternalTerminalRoute: true,
    yieldPoints: [
      {
        distanceAlongRoute: 24.5, // Gate 2 threshold (103, 7.5)
        yieldsToRouteIds: ['ceres_hw_nb', 'ceres_hw_sb', 'ceres_pedro_zayco_out_sb'],
        checkLocation: [103, 7.5],
        priorityArrivalThreshold: 4.5, // Bus requires 4.5s clear gap for wide turn
      },
    ],
  },
  // 6. Ceres Bus Terminal EGRESS — Gate 2 SOUTHBOUND (Right turn merge toward Ilog)
  {
    id: 'ceres_egress_south',
    locationId: LocationId.CeresTerminal,
    name: 'Ceres Bus Egress — Gate 2 Southbound Right Merge',
    waypoints: [
      [114, 28.0],
      [114, 23.0],
      [110, 16.0],
      [104, 11.0],
      [103, 7.5], // Gate 2 exit
      [112, 4.5], // Right turn arc
      [124, 2.5], // Merging into SB lane
      [170, 2.5],
      [220, 2.5],
    ],
    allowedVehicles: [VehicleType.Bus],
    weight: 20,
    isInternalTerminalRoute: true,
    yieldPoints: [
      {
        distanceAlongRoute: 24.5,
        yieldsToRouteIds: ['ceres_hw_sb'],
        checkLocation: [103, 7.5],
        priorityArrivalThreshold: 4.0,
      },
    ],
  },
  // 7. Pedro Zayco Sr. St (Northwest Side Street) — INGRESS from Highway
  {
    id: 'ceres_pedro_zayco_in',
    locationId: LocationId.CeresTerminal,
    name: 'Turn Left into Pedro Zayco Sr. St',
    waypoints: [
      [0, 2.5],
      [45, 2.5],
      [58, 1.0], // Left turn pocket
      [64, -8], // Crossing NB lane into Pedro Zayco St
      [64, -22],
      [64, -40], // Exiting NW
    ],
    allowedVehicles: [VehicleType.Tricycle, VehicleType.PrivateCar, VehicleType.Jeepney],
    weight: 15,
    yieldPoints: [
      {
        distanceAlongRoute: 58,
        yieldsToRouteIds: ['ceres_hw_nb', 'ceres_egress_north'],
        checkLocation: [58, 1.0],
        priorityArrivalThreshold: 4.0,
      },
    ],
  },
  // 8. Pedro Zayco Sr. St — EGRESS into Highway (Southbound Right Turn)
  {
    id: 'ceres_pedro_zayco_out_sb',
    locationId: LocationId.CeresTerminal,
    name: 'Pedro Zayco Sr. St Egress -> Southbound',
    waypoints: [
      [64, -40],
      [64, -18],
      [64, -8], // Approaching intersection
      [72, -1], // Turning right
      [85, 2.5], // Entering SB flow
      [150, 2.5],
      [220, 2.5],
    ],
    allowedVehicles: [VehicleType.Tricycle, VehicleType.PrivateCar, VehicleType.Jeepney],
    weight: 15,
    yieldPoints: [
      {
        distanceAlongRoute: 32,
        yieldsToRouteIds: ['ceres_hw_sb', 'ceres_hw_nb'],
        checkLocation: [64, -8],
        priorityArrivalThreshold: 4.0,
      },
    ],
  },
  // 9. Repollo St Connector (East side connector road)
  {
    id: 'ceres_repollo_connector',
    locationId: LocationId.CeresTerminal,
    name: 'Repollo St East Connector',
    waypoints: [
      [180, 2.5],
      [185, 8],
      [190, 20],
      [195, 38],
    ],
    allowedVehicles: [VehicleType.Tricycle, VehicleType.PrivateCar],
    weight: 10,
  },
];

// ─── Network Routes for Location 2: KCC Frontage ──────────────────────────────

const KCC_RAW_ROUTES: Array<Omit<RouteDefinition, 'samples' | 'length'>> = [
  // 1. Guanzon St Northbound Through
  {
    id: 'kcc_guanzon_nb',
    locationId: LocationId.KCCFrontage,
    name: 'Guanzon St Northbound Through',
    waypoints: [
      [180, -2.0],
      [120, -2.0],
      [80, -2.0],
      [40, -2.0],
      [0, -2.0],
    ],
    weight: 40,
  },
  // 2. Guanzon St Southbound Through
  {
    id: 'kcc_guanzon_sb',
    locationId: LocationId.KCCFrontage,
    name: 'Guanzon St Southbound Through',
    waypoints: [
      [0, 2.0],
      [50, 2.0],
      [90, 2.0],
      [130, 2.0],
      [180, 2.0],
    ],
    weight: 35,
  },
  // 3. Aquiles - Zayco Ave Y-Fork BRANCH (Southbound diverging southeast)
  {
    id: 'kcc_aquiles_zayco_branch',
    locationId: LocationId.KCCFrontage,
    name: 'Fork into Aquiles - Zayco Ave',
    waypoints: [
      [0, 2.0],
      [70, 2.0],
      [110, 3.5], // Fork start
      [135, 9.0], // Y-divergence
      [160, 18.0],
      [180, 26.0],
    ],
    weight: 25,
  },
  // 4. Aquiles - Zayco Ave MERGE (Entering Guanzon St Northbound)
  {
    id: 'kcc_aquiles_zayco_merge',
    locationId: LocationId.KCCFrontage,
    name: 'Merge from Aquiles - Zayco Ave',
    waypoints: [
      [180, 24.0],
      [155, 15.0],
      [130, 5.0],
      [110, -2.0], // Merge into NB lane
      [60, -2.0],
      [0, -2.0],
    ],
    weight: 20,
    yieldPoints: [
      {
        distanceAlongRoute: 65,
        yieldsToRouteIds: ['kcc_guanzon_nb', 'kcc_guanzon_sb'],
        checkLocation: [120, 2.0],
        priorityArrivalThreshold: 3.2,
      },
    ],
  },
  // 5. KCC Student Drop-off Loop (Tricycles/cars pulling into curb drop-off)
  {
    id: 'kcc_student_dropoff',
    locationId: LocationId.KCCFrontage,
    name: 'KCC Campus Frontage Student Drop-off',
    waypoints: [
      [180, -2.0],
      [110, -2.0],
      [95, -4.5], // Pulling into drop-off curb lane
      [80, -4.5], // Drop-off point fronting KCC gate
      [65, -4.5],
      [50, -2.0], // Re-entering Guanzon St
      [0, -2.0],
    ],
    allowedVehicles: [VehicleType.Tricycle, VehicleType.PrivateCar, VehicleType.Jeepney],
    weight: 20,
  },
  // 6. Tayum / Herrick St Intersection (North side street)
  {
    id: 'kcc_tayum_in',
    locationId: LocationId.KCCFrontage,
    name: 'Turn into Tayum / Herrick St',
    waypoints: [
      [0, 2.0],
      [35, 2.0],
      [42, -5.0],
      [42, -25.0],
    ],
    weight: 10,
    yieldPoints: [
      {
        distanceAlongRoute: 36,
        yieldsToRouteIds: ['kcc_guanzon_nb'],
        checkLocation: [38, 0],
        priorityArrivalThreshold: 2.8,
      },
    ],
  },
];

// ─── Network Routes for Location 3: Public Market Zone ────────────────────────

const MARKET_RAW_ROUTES: Array<Omit<RouteDefinition, 'samples' | 'length'>> = [
  // 1. Tan Lorenzo St Eastbound Arterial
  {
    id: 'market_tan_lorenzo_eb',
    locationId: LocationId.PublicMarket,
    name: 'Tan Lorenzo St Eastbound Through',
    waypoints: [
      [0, 2.0],
      [50, 2.0],
      [80, 2.0], // Lirazan St junction
      [110, 2.0],
      [160, 2.0],
    ],
    weight: 35,
  },
  // 2. Tan Lorenzo St Westbound Arterial
  {
    id: 'market_tan_lorenzo_wb',
    locationId: LocationId.PublicMarket,
    name: 'Tan Lorenzo St Westbound Through',
    waypoints: [
      [160, -2.0],
      [110, -2.0],
      [80, -2.0], // Lirazan St junction
      [50, -2.0],
      [0, -2.0],
    ],
    weight: 35,
  },
  // 3. Lirazan St Southbound (Between Public Market & Public Terminal)
  {
    id: 'market_lirazan_sb',
    locationId: LocationId.PublicMarket,
    name: 'Lirazan St Southbound toward Public Terminal',
    waypoints: [
      [80, -35.0], // Northern entrance
      [80, -10.0],
      [80, 0.0], // Intersection with Tan Lorenzo
      [80, 15.0], // Between Market Hall and Terminal
      [80, 35.0], // Terminal entrance
    ],
    weight: 30,
    yieldPoints: [
      {
        distanceAlongRoute: 32,
        yieldsToRouteIds: ['market_tan_lorenzo_eb', 'market_tan_lorenzo_wb'],
        checkLocation: [80, -4.0],
        priorityArrivalThreshold: 2.5,
      },
    ],
  },
  // 4. Lirazan St Northbound
  {
    id: 'market_lirazan_nb',
    locationId: LocationId.PublicMarket,
    name: 'Lirazan St Northbound toward Tan Lorenzo',
    waypoints: [
      [82, 35.0],
      [82, 15.0],
      [82, 0.0],
      [82, -15.0],
      [82, -35.0],
    ],
    weight: 25,
    yieldPoints: [
      {
        distanceAlongRoute: 32,
        yieldsToRouteIds: ['market_tan_lorenzo_eb', 'market_tan_lorenzo_wb'],
        checkLocation: [82, 4.0],
        priorityArrivalThreshold: 2.5,
      },
    ],
  },
  // 5. Turn from Tan Lorenzo into Lirazan (Heading into Public Terminal)
  {
    id: 'market_turn_tan_to_terminal',
    locationId: LocationId.PublicMarket,
    name: 'Turn into Public Terminal',
    waypoints: [
      [0, 2.0],
      [68, 2.0],
      [76, 7.0], // Right turn into Lirazan
      [80, 20.0],
      [80, 35.0],
    ],
    weight: 20,
  },
  // 6. Tricycle Market Perimeter Loop
  {
    id: 'market_tricycle_curb_loop',
    locationId: LocationId.PublicMarket,
    name: 'Market Perimeter Tricycle Staging Loop',
    waypoints: [
      [160, -2.0],
      [95, -2.0],
      [86, 6.0],
      [74, 18.0], // Curb loading in front of market stalls
      [74, 30.0],
      [80, 35.0],
    ],
    allowedVehicles: [VehicleType.Tricycle],
    weight: 20,
  },
];

// ─── Pedestrian Desire Lines ──────────────────────────────────────────────────

const RAW_PED_DESIRE_LINES: Array<Omit<PedestrianDesireLine, 'samples' | 'length'>> = [
  // Ceres Terminal: Disembarking bus passengers walking from terminal exit gate to Pedro Zayco Sr. St
  {
    id: 'ceres_ped_gate_to_pedrozayco',
    locationId: LocationId.CeresTerminal,
    name: 'Arriving Bus Passengers -> Pedro Zayco Tricycles',
    waypoints: [
      [122, 9.0], // Terminal exit gate
      [110, 6.0],
      [95, 0.0], // Crossing highway
      [86, -7.0], // Reaching Pedro Zayco sidewalk
      [72, -15.0], // Tricycle staging area
    ],
    weight: 40,
  },
  // Ceres Terminal: Continental Crosswalk crossings
  {
    id: 'ceres_ped_crosswalk_north',
    locationId: LocationId.CeresTerminal,
    name: 'Ceres Frontage Crosswalk (North to South)',
    waypoints: [
      [86, -8.5],
      [86, -3.0],
      [86, 3.0],
      [86, 8.5],
    ],
    weight: 30,
  },
  {
    id: 'ceres_ped_crosswalk_south',
    locationId: LocationId.CeresTerminal,
    name: 'Ceres Frontage Crosswalk (South to North)',
    waypoints: [
      [86, 8.5],
      [86, 3.0],
      [86, -3.0],
      [86, -8.5],
    ],
    weight: 30,
  },

  // KCC Frontage: Student clusters crossing between KCC campus gate & McDonald's/Jollibee
  {
    id: 'kcc_ped_gate_to_mcdonalds',
    locationId: LocationId.KCCFrontage,
    name: 'KCC Gate -> McDonald\'s / Jollibee Commercial Strip',
    waypoints: [
      [80, -5.5], // KCC main gate
      [80, -2.0],
      [80, 2.0],
      [80, 6.5], // Commercial fast-food sidewalk
    ],
    weight: 50,
  },
  {
    id: 'kcc_ped_mcdonalds_to_gate',
    locationId: LocationId.KCCFrontage,
    name: 'McDonald\'s -> KCC School Gate Return',
    waypoints: [
      [80, 6.5],
      [80, 2.0],
      [80, -2.0],
      [80, -5.5],
    ],
    weight: 50,
  },

  // Public Market: Dense crossing between Public Market Hall & Kabankalan City Public Terminal
  {
    id: 'market_ped_market_to_terminal',
    locationId: LocationId.PublicMarket,
    name: 'Public Market Hall <-> Public Terminal Crossing',
    waypoints: [
      [72, 18.0], // Market Hall arcade
      [77, 18.0],
      [83, 18.0], // Crossing Lirazan St
      [88, 18.0], // Terminal entrance apron
    ],
    weight: 50,
  },
  {
    id: 'market_ped_tanlorenzo_cross',
    locationId: LocationId.PublicMarket,
    name: 'Tan Lorenzo St Mid-Block Stall Crossing',
    waypoints: [
      [55, -4.5],
      [55, 0.0],
      [55, 4.5],
    ],
    weight: 50,
  },
];

// ─── Processed Spline Registry ───────────────────────────────────────────────

function processRawRoutes(rawList: Array<Omit<RouteDefinition, 'samples' | 'length'>>): Record<string, RouteDefinition> {
  const map: Record<string, RouteDefinition> = {};
  for (const raw of rawList) {
    const { samples, totalLength } = buildSampledRoute(raw.waypoints);
    map[raw.id] = {
      ...raw,
      length: totalLength,
      samples,
    };
  }
  return map;
}

function processRawPedLines(
  rawList: Array<Omit<PedestrianDesireLine, 'samples' | 'length'>>
): Record<string, PedestrianDesireLine> {
  const map: Record<string, PedestrianDesireLine> = {};
  for (const raw of rawList) {
    const { samples, totalLength } = buildSampledRoute(raw.waypoints, 0.8);
    map[raw.id] = {
      ...raw,
      length: totalLength,
      samples: samples.map((s) => ({ x: s.x, z: s.z, heading: s.heading })),
    };
  }
  return map;
}

export const ALL_ROUTES: Record<string, RouteDefinition> = {
  ...processRawRoutes(CERES_RAW_ROUTES),
  ...processRawRoutes(KCC_RAW_ROUTES),
  ...processRawRoutes(MARKET_RAW_ROUTES),
};

export const ALL_PED_DESIRE_LINES: Record<string, PedestrianDesireLine> = processRawPedLines(RAW_PED_DESIRE_LINES);

// ─── Helper Queries ─────────────────────────────────────────────────────────

export function getRoutesForLocation(locationId: LocationId): RouteDefinition[] {
  return Object.values(ALL_ROUTES).filter((r) => r.locationId === locationId);
}

export function getPedDesireLinesForLocation(locationId: LocationId): PedestrianDesireLine[] {
  return Object.values(ALL_PED_DESIRE_LINES).filter((p) => p.locationId === locationId);
}

/**
 * Evaluates route point at curvilinear distance s along route.
 * O(log N) binary search for instant 60 FPS lookups.
 */
export function evaluateRoute(
  route: RouteDefinition,
  s: number
): { x: number; z: number; heading: number; curvature: number } {
  const samples = route.samples;
  if (!samples.length) return { x: 0, z: 0, heading: 0, curvature: 0 };
  if (s <= 0) {
    const p = samples[0];
    return { x: p.x, z: p.z, heading: p.heading, curvature: p.curvature };
  }
  if (s >= route.length) {
    const p = samples[samples.length - 1];
    return { x: p.x, z: p.z, heading: p.heading, curvature: p.curvature };
  }

  // Binary search for segment
  let low = 0;
  let high = samples.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (samples[mid].distance < s) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  const idx = Math.max(0, low - 1);
  const nextIdx = Math.min(idx + 1, samples.length - 1);
  const p0 = samples[idx];
  const p1 = samples[nextIdx];
  const segSpan = p1.distance - p0.distance;
  const t = segSpan > 0.0001 ? (s - p0.distance) / segSpan : 0;

  return {
    x: p0.x + (p1.x - p0.x) * t,
    z: p0.z + (p1.z - p0.z) * t,
    heading: p0.heading + (p1.heading - p0.heading) * t,
    curvature: p0.curvature,
  };
}

/** Evaluates pedestrian position along desire line */
export function evaluatePedDesireLine(
  line: PedestrianDesireLine,
  progress: number // 0 to 1
): { x: number; z: number; heading: number } {
  const samples = line.samples;
  if (!samples.length) return { x: 0, z: 0, heading: 0 };
  const idx = Math.floor(progress * (samples.length - 1));
  const nextIdx = Math.min(idx + 1, samples.length - 1);
  const frac = progress * (samples.length - 1) - idx;

  const p0 = samples[idx];
  const p1 = samples[nextIdx];
  return {
    x: p0.x + (p1.x - p0.x) * frac,
    z: p0.z + (p1.z - p0.z) * frac,
    heading: p0.heading,
  };
}
