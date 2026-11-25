#!/usr/bin/env node
/**
 * Fetches OpenStreetMap highway ways, building footprints, and POIs around
 * Kabankalan City Ceres Bus Terminal Corridor via Overpass API and converts
 * coordinates to local ENU meters relative to CERES_ORIGIN (9.99786, 122.81195).
 *
 * Usage:
 *   node src/gis/fetchCeresOsm.mjs           # Print calibrated inspection summary
 *   node src/gis/fetchCeresOsm.mjs --raw     # Also save raw response to stdout/file
 */

import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ORIGIN = { lat: 9.99786, lng: 122.81195 };
const BBOX = { south: 9.9960, west: 122.8098, north: 9.9998, east: 122.8142 };

const METERS_PER_DEG_LAT = 110607.6; // WGS84 meridian arc at 10°N
const METERS_PER_DEG_LNG = 111319.49 * Math.cos((ORIGIN.lat * Math.PI) / 180);

function latLngToLocal(lat, lng) {
  return {
    x: Number(((lng - ORIGIN.lng) * METERS_PER_DEG_LNG).toFixed(2)),
    z: Number((-(lat - ORIGIN.lat) * METERS_PER_DEG_LAT).toFixed(2)),
  };
}

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

const QUERY = `
[out:json][timeout:20];
(
  way["highway"](${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east});
  way["building"](${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east});
  way["amenity"](${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east});
  node["name"](${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east});
);
(._;>;);
out body;
`.trim();

async function fetchOsmData() {
  // Fast official OSM 0.6 map API for small bbox (~480m x 420m), plus Overpass mirrors
  const osmMapUrl = `https://api.openstreetmap.org/api/0.6/map.json?bbox=${BBOX.west},${BBOX.south},${BBOX.east},${BBOX.north}`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    const res = await fetch(osmMapUrl, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'KabankalanDSSv2/2.0 (Thesis GIS Calibration)',
      },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (res.ok) {
      const json = await res.json();
      if (Array.isArray(json.elements)) {
        return { endpoint: osmMapUrl, data: json };
      }
    } else {
      console.warn(`[osm-api] HTTP ${res.status}`);
    }
  } catch (err) {
    console.warn('[osm-api] failed:', err instanceof Error ? err.message : String(err));
  }

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
          'User-Agent': 'KabankalanDSSv2/2.0 (Thesis GIS Calibration)',
        },
        body: `data=${encodeURIComponent(QUERY)}`,
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) {
        console.warn(`[overpass] ${endpoint} HTTP ${res.status}`);
        continue;
      }
      const json = await res.json();
      if (Array.isArray(json.elements)) {
        return { endpoint, data: json };
      }
    } catch (err) {
      console.warn(`[overpass] ${endpoint} failed:`, err instanceof Error ? err.message : String(err));
    }
  }
  return null;
}

function summarize(data) {
  const nodes = new Map();
  const ways = [];
  const pois = [];

  for (const el of data.elements) {
    if (el.type === 'node') {
      nodes.set(el.id, { lat: el.lat, lon: el.lon, tags: el.tags || {} });
      if (el.tags && el.tags.name) {
        pois.push({
          id: el.id,
          name: el.tags.name,
          kind: el.tags.amenity || el.tags.shop || el.tags.tourism || el.tags.office || 'poi',
          lat: el.lat,
          lng: el.lon,
          local: latLngToLocal(el.lat, el.lon),
        });
      }
    } else if (el.type === 'way') {
      ways.push(el);
    }
  }

  const highways = [];
  const buildings = [];

  for (const w of ways) {
    const coords = (w.nodes || [])
      .map((nid) => nodes.get(nid))
      .filter(Boolean)
      .map((n) => ({ lat: n.lat, lng: n.lon, ...latLngToLocal(n.lat, n.lon) }));
    if (coords.length < 2) continue;

    const tags = w.tags || {};
    if (tags.highway) {
      highways.push({
        id: w.id,
        name: tags.name || '(unnamed)',
        highway: tags.highway,
        lanes: tags.lanes || null,
        oneway: tags.oneway || null,
        nodeCount: coords.length,
        coords,
      });
    } else if (tags.building || tags.amenity) {
      const cx = coords.reduce((a, p) => a + p.x, 0) / coords.length;
      const cz = coords.reduce((a, p) => a + p.z, 0) / coords.length;
      buildings.push({
        id: w.id,
        name: tags.name || tags.amenity || '(building)',
        building: tags.building || tags.amenity,
        levels: tags['building:levels'] || null,
        center: { x: Number(cx.toFixed(1)), z: Number(cz.toFixed(1)) },
        coords,
      });
    }
  }

  return { highways, buildings, pois };
}

async function main() {
  const result = await fetchOsmData();
  if (!result) {
    console.error('[overpass] All endpoints unavailable. Using calibrated satellite ground truth.');
    process.exit(1);
  }

  const summary = summarize(result.data);
  console.log(`Fetched from ${result.endpoint}`);
  console.log(`Highways: ${summary.highways.length}, Buildings: ${summary.buildings.length}, Named POIs: ${summary.pois.length}`);

  console.log('\n--- HIGHWAYS ---');
  for (const h of summary.highways) {
    const p0 = h.coords[0];
    const pN = h.coords[h.coords.length - 1];
    console.log(
      `way/${h.id} [${h.highway}] "${h.name}" lanes=${h.lanes} pts=${h.nodeCount} ` +
        `start=(${p0.x},${p0.z}) end=(${pN.x},${pN.z})`
    );
  }

  console.log('\n--- NAMED POIs ---');
  for (const p of summary.pois) {
    console.log(`node/${p.id} [${p.kind}] "${p.name}" local=(${p.local.x},${p.local.z}) ll=(${p.lat.toFixed(6)},${p.lng.toFixed(6)})`);
  }

  console.log('\n--- NAMED BUILDINGS (sample) ---');
  for (const b of summary.buildings.filter((x) => x.name !== '(building)').slice(0, 25)) {
    console.log(`way/${b.id} [${b.building}] "${b.name}" center=(${b.center.x},${b.center.z}) pts=${b.coords.length}`);
  }

  if (process.argv.includes('--save-osm')) {
    const outPath = resolve(dirname(fileURLToPath(import.meta.url)), 'data', 'osm-fetch-cache.json');
    writeFileSync(outPath, JSON.stringify({ endpoint: result.endpoint, origin: ORIGIN, bbox: BBOX, ...summary }, null, 2));
    console.log(`\nSaved OSM summary to ${outPath}`);
  }
}

main();
