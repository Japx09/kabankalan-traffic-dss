export interface LatLng {
  readonly lat: number;
  readonly lng: number;
}

export interface LocalPoint {
  readonly x: number;
  readonly z: number;
}

export interface LocalBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  readonly centerX: number;
  readonly centerZ: number;
  readonly width: number;
  readonly depth: number;
}

export interface LatLngBounds {
  readonly south: number;
  readonly west: number;
  readonly north: number;
  readonly east: number;
}

export interface SatelliteTileSpec {
  readonly z: number;
  readonly x: number;
  readonly y: number;
  readonly url: string;
  readonly boundsLatLng: LatLngBounds;
  readonly boundsLocal: LocalBounds;
}

export interface SatelliteCoverageSpec {
  readonly origin: LatLng;
  readonly zoom: number;
  readonly requestedHalfExtentMeters: number;
  readonly boundsLatLng: LatLngBounds;
  readonly boundsLocal: LocalBounds;
  readonly cols: number;
  readonly rows: number;
  readonly tileUrlTemplate: string;
  readonly tiles: readonly SatelliteTileSpec[];
}

/**
 * Ground-truth origin anchor: Kabankalan City Ceres Bus Terminal frontage
 * along National Road (Negros South Road), Negros Occidental, Philippines.
 */
export const CERES_ORIGIN: LatLng = {
  lat: 9.99786,
  lng: 122.81195,
} as const;

// WGS84 ellipsoid local tangent plane scales at CERES_ORIGIN
const WGS84_A = 6378137.0;
const WGS84_E2 = 0.0066943799901413165;
const ORIGIN_LAT_RAD = (CERES_ORIGIN.lat * Math.PI) / 180;
const SIN_ORIGIN_LAT = Math.sin(ORIGIN_LAT_RAD);
const ONE_MINUS_E2_SIN2 = 1 - WGS84_E2 * SIN_ORIGIN_LAT * SIN_ORIGIN_LAT;

const MERIDIAN_RADIUS = (WGS84_A * (1 - WGS84_E2)) / Math.pow(ONE_MINUS_E2_SIN2, 1.5);
const PRIME_VERTICAL_RADIUS = WGS84_A / Math.sqrt(ONE_MINUS_E2_SIN2);

export const METERS_PER_DEG_LAT = MERIDIAN_RADIUS * (Math.PI / 180);
export const METERS_PER_DEG_LNG = PRIME_VERTICAL_RADIUS * Math.cos(ORIGIN_LAT_RAD) * (Math.PI / 180);

/**
 * Converts WGS84 (lat, lng) into Three.js right-handed local metric coordinates:
 * +X = East, -Z = North, +Z = South, Y = Elevation (up).
 */
export function latLngToLocal(lat: number, lng: number): LocalPoint {
  return {
    x: (lng - CERES_ORIGIN.lng) * METERS_PER_DEG_LNG,
    z: -(lat - CERES_ORIGIN.lat) * METERS_PER_DEG_LAT,
  };
}

/**
 * Converts local metric (x, z) back into WGS84 (lat, lng).
 */
export function localToLatLng(x: number, z: number): LatLng {
  return {
    lat: CERES_ORIGIN.lat - z / METERS_PER_DEG_LAT,
    lng: CERES_ORIGIN.lng + x / METERS_PER_DEG_LNG,
  };
}

function latLngToTileXY(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const n = Math.pow(2, zoom);
  const latRad = (lat * Math.PI) / 180;
  const x = Math.floor(((lng + 180) / 360) * n);
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return { x, y };
}

function tileXYToBoundsLatLng(tx: number, ty: number, zoom: number): LatLngBounds {
  const n = Math.pow(2, zoom);
  const west = (tx / n) * 360 - 180;
  const east = ((tx + 1) / n) * 360 - 180;
  const north = (Math.atan(Math.sinh(Math.PI * (1 - (2 * ty) / n))) * 180) / Math.PI;
  const south = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (ty + 1)) / n))) * 180) / Math.PI;
  return { south, west, north, east };
}

function latLngBoundsToLocalBounds(b: LatLngBounds): LocalBounds {
  const nw = latLngToLocal(b.north, b.west);
  const se = latLngToLocal(b.south, b.east);
  const minX = nw.x;
  const maxX = se.x;
  const minZ = nw.z;
  const maxZ = se.z;
  return {
    minX,
    maxX,
    minZ,
    maxZ,
    centerX: (minX + maxX) * 0.5,
    centerZ: (minZ + maxZ) * 0.5,
    width: maxX - minX,
    depth: maxZ - minZ,
  };
}

/**
 * Returns exact georeferenced ESRI World Imagery tile URLs + local metric bounds
 * covering a square of side ~2 * halfExtentMeters (default 340m × 340m) centered on origin.
 */
export function getEsriSatelliteTileBounds(
  halfExtentMeters = 170,
  zoom = 18,
  origin: LatLng = CERES_ORIGIN
): SatelliteCoverageSpec {
  const originLocal = latLngToLocal(origin.lat, origin.lng);
  const nwReq = localToLatLng(originLocal.x - halfExtentMeters, originLocal.z - halfExtentMeters);
  const seReq = localToLatLng(originLocal.x + halfExtentMeters, originLocal.z + halfExtentMeters);

  const minTile = latLngToTileXY(nwReq.lat, nwReq.lng, zoom);
  const maxTile = latLngToTileXY(seReq.lat, seReq.lng, zoom);

  const tiles: SatelliteTileSpec[] = [];
  for (let ty = minTile.y; ty <= maxTile.y; ty++) {
    for (let tx = minTile.x; tx <= maxTile.x; tx++) {
      const boundsLatLng = tileXYToBoundsLatLng(tx, ty, zoom);
      const boundsLocal = latLngBoundsToLocalBounds(boundsLatLng);
      tiles.push({
        z: zoom,
        x: tx,
        y: ty,
        url: `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${ty}/${tx}`,
        boundsLatLng,
        boundsLocal,
      });
    }
  }

  const nwUnion = tileXYToBoundsLatLng(minTile.x, minTile.y, zoom);
  const seUnion = tileXYToBoundsLatLng(maxTile.x, maxTile.y, zoom);
  const boundsLatLng: LatLngBounds = {
    north: nwUnion.north,
    west: nwUnion.west,
    south: seUnion.south,
    east: seUnion.east,
  };
  const boundsLocal = latLngBoundsToLocalBounds(boundsLatLng);

  const tileUrlTemplate =
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

  return {
    origin,
    zoom,
    requestedHalfExtentMeters: halfExtentMeters,
    boundsLatLng,
    boundsLocal,
    cols: maxTile.x - minTile.x + 1,
    rows: maxTile.y - minTile.y + 1,
    tileUrlTemplate,
    tiles,
  };
}
