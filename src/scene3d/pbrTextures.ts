import * as THREE from 'three';

export interface PBRTextureSet {
  readonly map: THREE.CanvasTexture;
  readonly bumpMap: THREE.CanvasTexture;
  readonly roughnessMap?: THREE.CanvasTexture;
}

function makePrng(initialSeed: number): () => number {
  let seed = initialSeed;
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

function configureTexture(
  canvas: HTMLCanvasElement,
  isColor: boolean,
  repeatX = 1,
  repeatY = 1,
  anisotropy = 8,
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.anisotropy = anisotropy;
  tex.needsUpdate = true;
  return tex;
}

export function disposePBRSet(set: PBRTextureSet | null | undefined): void {
  if (!set) return;
  set.map.dispose();
  set.bumpMap.dispose();
  set.roughnessMap?.dispose();
}

/**
 * 512x512 weathered Philippine asphalt PBR set (albedo, bump, roughness).
 * Features fine crushed basalt aggregate, longitudinal tire-wear polish, and subtle bitumen variation.
 */
export function createAsphaltPBR(): PBRTextureSet | null {
  if (typeof document === 'undefined') return null;
  const size = 512;

  const mapCanvas = document.createElement('canvas');
  mapCanvas.width = size;
  mapCanvas.height = size;
  const mCtx = mapCanvas.getContext('2d');

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bCtx = bumpCanvas.getContext('2d');

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = size;
  roughCanvas.height = size;
  const rCtx = roughCanvas.getContext('2d');

  if (!mCtx || !bCtx || !rCtx) return null;

  mCtx.fillStyle = '#383e47';
  mCtx.fillRect(0, 0, size, size);
  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, size, size);
  rCtx.fillStyle = '#e0e0e0';
  rCtx.fillRect(0, 0, size, size);

  const rand = makePrng(202611);

  // Subtle tonal asphalt patches
  for (let i = 0; i < 65; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const rad = 18 + rand() * 48;
    const dark = rand() > 0.45;
    mCtx.fillStyle = dark ? 'rgba(34, 39, 46, 0.18)' : 'rgba(72, 79, 90, 0.14)';
    mCtx.beginPath();
    mCtx.arc(x, y, rad, 0, Math.PI * 2);
    mCtx.fill();
  }

  // Subtle longitudinal tire-wear tracks (U-axis = across road, V-axis = along road)
  for (const trackU of [0.28, 0.72]) {
    const grad = mCtx.createLinearGradient(size * (trackU - 0.1), 0, size * (trackU + 0.1), 0);
    grad.addColorStop(0, 'rgba(26, 30, 36, 0)');
    grad.addColorStop(0.5, 'rgba(26, 30, 36, 0.22)');
    grad.addColorStop(1, 'rgba(26, 30, 36, 0)');
    mCtx.fillStyle = grad;
    mCtx.fillRect(0, 0, size, size);

    const rGrad = rCtx.createLinearGradient(size * (trackU - 0.1), 0, size * (trackU + 0.1), 0);
    rGrad.addColorStop(0, 'rgba(180, 180, 180, 0)');
    rGrad.addColorStop(0.5, 'rgba(170, 170, 170, 0.45)');
    rGrad.addColorStop(1, 'rgba(180, 180, 180, 0)');
    rCtx.fillStyle = rGrad;
    rCtx.fillRect(0, 0, size, size);
  }

  // Crushed mineral aggregate speckles
  for (let i = 0; i < 24000; i++) {
    const x = Math.floor(rand() * size);
    const y = Math.floor(rand() * size);
    const sz = rand() > 0.85 ? 2 : 1;
    const tone = Math.floor(38 + rand() * 46);
    mCtx.fillStyle = `rgb(${tone},${tone + 3},${tone + 7})`;
    mCtx.fillRect(x, y, sz, sz);

    const bTone = Math.floor(85 + rand() * 95);
    bCtx.fillStyle = `rgb(${bTone},${bTone},${bTone})`;
    bCtx.fillRect(x, y, sz, sz);
  }

  // Faint tar hairline seal
  mCtx.strokeStyle = 'rgba(22, 25, 30, 0.35)';
  mCtx.lineWidth = 1.5;
  for (let c = 0; c < 4; c++) {
    let cx = rand() * size;
    let cy = rand() * size;
    mCtx.beginPath();
    mCtx.moveTo(cx, cy);
    for (let s = 0; s < 7; s++) {
      cx += (rand() - 0.5) * 32;
      cy += 10 + rand() * 24;
      mCtx.lineTo(cx, cy);
    }
    mCtx.stroke();
  }

  return {
    map: configureTexture(mapCanvas, true, 1, 1, 8),
    bumpMap: configureTexture(bumpCanvas, false, 1, 1, 8),
    roughnessMap: configureTexture(roughCanvas, false, 1, 1, 8),
  };
}

/**
 * 512x512 brushed concrete slab PBR set with expansion joints for Ceres terminal yard & sidewalks.
 */
export function createConcretePBR(repeatX = 1, repeatY = 1): PBRTextureSet | null {
  if (typeof document === 'undefined') return null;
  const size = 512;

  const mapCanvas = document.createElement('canvas');
  mapCanvas.width = size;
  mapCanvas.height = size;
  const mCtx = mapCanvas.getContext('2d');

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bCtx = bumpCanvas.getContext('2d');

  if (!mCtx || !bCtx) return null;

  mCtx.fillStyle = '#c2c8cf';
  mCtx.fillRect(0, 0, size, size);
  bCtx.fillStyle = '#a0a0a0';
  bCtx.fillRect(0, 0, size, size);

  const rand = makePrng(8821);

  // Subtle slab-by-slab tonal variance (4x4 grid of concrete panels)
  const cell = size / 4;
  for (let gx = 0; gx < 4; gx++) {
    for (let gy = 0; gy < 4; gy++) {
      const delta = Math.floor((rand() - 0.5) * 14);
      const base = 192 + delta;
      mCtx.fillStyle = `rgb(${base},${base + 3},${base + 6})`;
      mCtx.fillRect(gx * cell + 2, gy * cell + 2, cell - 4, cell - 4);
    }
  }

  // Fine sand/concrete weathering grain
  for (let i = 0; i < 14000; i++) {
    const x = Math.floor(rand() * size);
    const y = Math.floor(rand() * size);
    const v = Math.floor(165 + rand() * 52);
    mCtx.fillStyle = `rgba(${v},${v + 2},${v + 4},0.35)`;
    mCtx.fillRect(x, y, 2, 2);

    const bv = Math.floor(115 + rand() * 65);
    bCtx.fillStyle = `rgb(${bv},${bv},${bv})`;
    bCtx.fillRect(x, y, 2, 2);
  }

  // Crisp concrete expansion joint grooves
  mCtx.strokeStyle = 'rgba(78, 86, 98, 0.55)';
  mCtx.lineWidth = 3;
  bCtx.strokeStyle = '#383838';
  bCtx.lineWidth = 4;

  for (let g = 0; g <= 4; g++) {
    const pos = g * cell;
    mCtx.beginPath();
    mCtx.moveTo(pos, 0);
    mCtx.lineTo(pos, size);
    mCtx.stroke();

    mCtx.beginPath();
    mCtx.moveTo(0, pos);
    mCtx.lineTo(size, pos);
    mCtx.stroke();

    bCtx.beginPath();
    bCtx.moveTo(pos, 0);
    bCtx.lineTo(pos, size);
    bCtx.stroke();

    bCtx.beginPath();
    bCtx.moveTo(0, pos);
    bCtx.lineTo(size, pos);
    bCtx.stroke();
  }

  return {
    map: configureTexture(mapCanvas, true, repeatX, repeatY, 8),
    bumpMap: configureTexture(bumpCanvas, false, repeatX, repeatY, 8),
  };
}

/**
 * 256x256 corrugated GI roof sheet PBR set (gives realistic ribbed metallic shading to roofs & sheds).
 */
export function createCorrugatedRoofPBR(): PBRTextureSet | null {
  if (typeof document === 'undefined') return null;
  const size = 256;

  const mapCanvas = document.createElement('canvas');
  mapCanvas.width = size;
  mapCanvas.height = size;
  const mCtx = mapCanvas.getContext('2d');

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bCtx = bumpCanvas.getContext('2d');

  if (!mCtx || !bCtx) return null;

  const ribs = 24;
  for (let x = 0; x < size; x++) {
    const wave = 0.5 + 0.5 * Math.sin((x / size) * ribs * Math.PI * 2);
    const albedoV = Math.floor(205 + wave * 48);
    mCtx.fillStyle = `rgb(${albedoV},${albedoV},${albedoV})`;
    mCtx.fillRect(x, 0, 1, size);

    const bumpV = Math.floor(45 + wave * 195);
    bCtx.fillStyle = `rgb(${bumpV},${bumpV},${bumpV})`;
    bCtx.fillRect(x, 0, 1, size);
  }

  // Horizontal lap seams across roof sheets
  mCtx.fillStyle = 'rgba(40, 48, 56, 0.25)';
  bCtx.fillStyle = '#505050';
  for (let y = 64; y < size; y += 64) {
    mCtx.fillRect(0, y, size, 2);
    bCtx.fillRect(0, y, size, 2);
  }

  return {
    map: configureTexture(mapCanvas, true, 4, 2, 8),
    bumpMap: configureTexture(bumpCanvas, false, 4, 2, 8),
  };
}

/**
 * 512x512 tropical commercial stucco & masonry reveal texture (tinted per building facadeColor).
 */
export function createFacadePBR(): PBRTextureSet | null {
  if (typeof document === 'undefined') return null;
  const size = 512;

  const mapCanvas = document.createElement('canvas');
  mapCanvas.width = size;
  mapCanvas.height = size;
  const mCtx = mapCanvas.getContext('2d');

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bCtx = bumpCanvas.getContext('2d');

  if (!mCtx || !bCtx) return null;

  mCtx.fillStyle = '#ececec';
  mCtx.fillRect(0, 0, size, size);
  bCtx.fillStyle = '#909090';
  bCtx.fillRect(0, 0, size, size);

  const rand = makePrng(5193);

  // Subtle stucco plaster grain
  for (let i = 0; i < 16000; i++) {
    const x = Math.floor(rand() * size);
    const y = Math.floor(rand() * size);
    const v = Math.floor(220 + rand() * 34);
    mCtx.fillStyle = `rgba(${v},${v},${v},0.45)`;
    mCtx.fillRect(x, y, 2, 2);

    const bv = Math.floor(110 + rand() * 75);
    bCtx.fillStyle = `rgb(${bv},${bv},${bv})`;
    bCtx.fillRect(x, y, 2, 2);
  }

  // Vertical structural concrete column reveals & subtle ground-level moisture shadow
  const grad = mCtx.createLinearGradient(0, size * 0.72, 0, size);
  grad.addColorStop(0, 'rgba(60, 68, 78, 0)');
  grad.addColorStop(1, 'rgba(55, 62, 72, 0.24)');
  mCtx.fillStyle = grad;
  mCtx.fillRect(0, 0, size, size);

  mCtx.strokeStyle = 'rgba(95, 104, 116, 0.22)';
  mCtx.lineWidth = 3;
  bCtx.strokeStyle = '#555555';
  bCtx.lineWidth = 3;
  for (let x = 128; x < size; x += 128) {
    mCtx.beginPath();
    mCtx.moveTo(x, 0);
    mCtx.lineTo(x, size);
    mCtx.stroke();
    bCtx.beginPath();
    bCtx.moveTo(x, 0);
    bCtx.lineTo(x, size);
    bCtx.stroke();
  }

  return {
    map: configureTexture(mapCanvas, true, 2, 1, 4),
    bumpMap: configureTexture(bumpCanvas, false, 2, 1, 4),
  };
}

/**
 * 256x256 tinted architectural window grid texture with aluminum mullions and subtle interior blinds.
 */
export function createWindowGridPBR(): PBRTextureSet | null {
  if (typeof document === 'undefined') return null;
  const size = 256;

  const mapCanvas = document.createElement('canvas');
  mapCanvas.width = size;
  mapCanvas.height = size;
  const mCtx = mapCanvas.getContext('2d');

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bCtx = bumpCanvas.getContext('2d');

  if (!mCtx || !bCtx) return null;

  // Frame base
  mCtx.fillStyle = '#334155';
  mCtx.fillRect(0, 0, size, size);
  bCtx.fillStyle = '#d8d8d8';
  bCtx.fillRect(0, 0, size, size);

  const rand = makePrng(7741);
  const cols = 4;
  const rows = 2;
  const pad = 7;
  const cellW = size / cols;
  const cellH = size / rows;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const gx = c * cellW + pad;
      const gy = r * cellH + pad;
      const gw = cellW - pad * 2;
      const gh = cellH - pad * 2;

      const grad = mCtx.createLinearGradient(gx, gy, gx, gy + gh);
      const bright = rand() > 0.38;
      grad.addColorStop(0, bright ? '#3b5875' : '#1e2f44');
      grad.addColorStop(0.55, '#192a3e');
      grad.addColorStop(1, '#0f1b2b');
      mCtx.fillStyle = grad;
      mCtx.fillRect(gx, gy, gw, gh);

      // Subtle diagonal sky reflection glint
      mCtx.fillStyle = 'rgba(186, 230, 253, 0.14)';
      mCtx.beginPath();
      mCtx.moveTo(gx, gy);
      mCtx.lineTo(gx + gw * 0.55, gy);
      mCtx.lineTo(gx, gy + gh * 0.65);
      mCtx.closePath();
      mCtx.fill();

      // Recessed glass depth in bump map
      bCtx.fillStyle = '#404040';
      bCtx.fillRect(gx, gy, gw, gh);
    }
  }

  return {
    map: configureTexture(mapCanvas, true, 3, 1, 4),
    bumpMap: configureTexture(bumpCanvas, false, 3, 1, 4),
  };
}

/**
 * 512x512 lush tropical urban turf & soil ground PBR set.
 */
export function createNaturalTerrainPBR(): PBRTextureSet | null {
  if (typeof document === 'undefined') return null;
  const size = 512;

  const mapCanvas = document.createElement('canvas');
  mapCanvas.width = size;
  mapCanvas.height = size;
  const mCtx = mapCanvas.getContext('2d');

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bCtx = bumpCanvas.getContext('2d');

  if (!mCtx || !bCtx) return null;

  mCtx.fillStyle = '#4c6d3f';
  mCtx.fillRect(0, 0, size, size);
  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, size, size);

  const rand = makePrng(4207);

  // Soft grass/soil macro variation
  for (let i = 0; i < 240; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 14 + rand() * 44;
    const roll = rand();
    mCtx.fillStyle =
      roll < 0.42
        ? 'rgba(92, 128, 72, 0.16)'
        : roll < 0.8
          ? 'rgba(56, 84, 48, 0.16)'
          : 'rgba(104, 96, 68, 0.12)';
    mCtx.beginPath();
    mCtx.arc(x, y, r, 0, Math.PI * 2);
    mCtx.fill();
  }

  // Fine blade & soil micro-grain
  for (let i = 0; i < 22000; i++) {
    const x = Math.floor(rand() * size);
    const y = Math.floor(rand() * size);
    const g = Math.floor(86 + rand() * 46);
    mCtx.fillStyle = `rgba(${Math.floor(g * 0.72)},${g},${Math.floor(g * 0.56)},0.45)`;
    mCtx.fillRect(x, y, 2, 2);

    const bv = Math.floor(95 + rand() * 85);
    bCtx.fillStyle = `rgb(${bv},${bv},${bv})`;
    bCtx.fillRect(x, y, 2, 2);
  }

  return {
    map: configureTexture(mapCanvas, true, 28, 28, 8),
    bumpMap: configureTexture(bumpCanvas, false, 28, 28, 8),
  };
}
