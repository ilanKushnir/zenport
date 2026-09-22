#!/usr/bin/env node
/**
 * Renders the ZenPort mark into the slots that cannot take the app's inline
 * React SVG: the PWA icons, the apple-touch icon, and favicon.svg.
 *
 * Geometry is imported from shared/src/brand.ts — the single source of truth
 * that web/src/components/Brand.tsx also draws from — so the tab icon and the
 * sidebar can never drift apart. Node strips the TypeScript at load; the repo
 * already runs the dev server the same way.
 *
 * PNGs are written with zlib only: no image dependencies.
 *
 * Run with: npm run icons
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DROPS,
  GAP,
  GRAD,
  RING,
  STOPS,
  SWIRL,
  angleToSweep,
  polar,
  spectrumAt,
} from '../shared/src/brand.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, '..', 'web', 'public', 'icons');
mkdirSync(outDir, { recursive: true });

const VB = 64; // viewBox the geometry is authored in
const BG = [0x18, 0x14, 0x20]; // app background, for the maskable icons

function inGap(deg) {
  const d = ((deg % 360) + 360) % 360;
  return d >= GAP.from && d <= GAP.to;
}

/** Gradient parameter at a point, projected onto the axis the SVG uses. */
function gradT(x, y) {
  const abx = GRAD.bx - GRAD.ax;
  const aby = GRAD.by - GRAD.ay;
  return ((x - GRAD.ax) * abx + (y - GRAD.ay) * aby) / (abx * abx + aby * aby);
}

/**
 * Coverage and colour of the mark at a point in viewBox space. Returns null
 * where nothing is drawn. The caller samples this several times per output
 * pixel, which is what gives the edges their antialiasing.
 */
function markAt(x, y) {
  const dx = x - RING.cx;
  const dy = y - RING.cy;
  const dist = Math.hypot(dx, dy);
  const deg = (Math.atan2(dy, dx) * 180) / Math.PI;

  // main ring band, minus the gap, plus a round cap at each end
  let ringCov = 0;
  const half = RING.width / 2;
  if (Math.abs(dist - RING.r) <= half && !inGap(deg)) ringCov = 1;
  if (ringCov < 1) {
    for (const end of [GAP.to, GAP.from]) {
      const [ex, ey] = polar(end, RING.r);
      if (Math.hypot(x - ex, y - ey) <= half) ringCov = 1;
    }
  }

  // inner swirl: thinner second pass crossing the ring the other way
  let swirlCov = 0;
  const ir = RING.r - RING.width * SWIRL.inset;
  const shalf = (RING.width * SWIRL.widthScale) / 2;
  if (Math.abs(dist - ir) <= shalf) {
    const d = (deg + 360) % 360;
    // runs SWIRL.from → SWIRL.to the long way, i.e. NOT through the middle
    if (!(d > SWIRL.to && d < SWIRL.from)) swirlCov = 0.88;
  }
  if (swirlCov === 0) {
    for (const end of [SWIRL.from, SWIRL.to]) {
      const [ex, ey] = polar(end, ir);
      if (Math.hypot(x - ex, y - ey) <= shalf) swirlCov = 0.88;
    }
  }

  // droplets
  let dropCov = 0;
  let dropRgb = null;
  for (const [angle, ddist, dr] of DROPS) {
    const [px, py] = polar(angle, ddist);
    if (Math.hypot(x - px, y - py) <= dr) {
      dropRgb = spectrumAt(angleToSweep(angle));
      dropCov = Math.min(1, 0.5 + Math.min(1, dr / 2.6) * 0.5);
      break;
    }
  }

  const alpha = Math.max(ringCov, swirlCov, dropCov);
  if (alpha === 0) return null;
  const color =
    dropRgb && dropCov >= Math.max(ringCov, swirlCov) ? dropRgb : spectrumAt(gradT(x, y));
  return { alpha, color };
}

// ── PNG writer (truecolor + alpha) ──────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (const b of buf) crc = CRC_TABLE[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/**
 * @param size     output pixels
 * @param opaqueBg true for maskable PWA icons — those must not be transparent
 * @param inset    fraction of the canvas the mark fills; maskable icons stay
 *                 inside the ~80% safe zone so platform masks cannot clip them
 */
function png(size, opaqueBg, inset) {
  const SS = 3; // supersamples per axis
  const rows = [];
  const scale = VB / (size * inset);
  const offset = (size * (1 - inset)) / 2;

  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4);
    for (let x = 0; x < size; x++) {
      let ar = 0;
      let ag = 0;
      let ab = 0;
      let aa = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const vx = (x + (sx + 0.5) / SS - offset) * scale;
          const vy = (y + (sy + 0.5) / SS - offset) * scale;
          const hit = markAt(vx, vy);
          if (hit) {
            ar += hit.color[0] * hit.alpha;
            ag += hit.color[1] * hit.alpha;
            ab += hit.color[2] * hit.alpha;
            aa += hit.alpha;
          }
        }
      }
      const a = aa / (SS * SS);
      let r = 0;
      let g = 0;
      let b = 0;
      if (aa > 0) {
        r = ar / aa;
        g = ag / aa;
        b = ab / aa;
      }
      let outA;
      if (opaqueBg) {
        r = BG[0] * (1 - a) + r * a;
        g = BG[1] * (1 - a) + g * a;
        b = BG[2] * (1 - a) + b * a;
        outA = 255;
      } else {
        outA = Math.round(a * 255);
      }
      row[1 + x * 4] = Math.round(r);
      row[2 + x * 4] = Math.round(g);
      row[3 + x * 4] = Math.round(b);
      row[4 + x * 4] = outA;
    }
    rows.push(row);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // truecolor + alpha
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const size of [192, 512]) {
  writeFileSync(path.join(outDir, `icon-${size}.png`), png(size, true, 0.72));
  console.log(`wrote icons/icon-${size}.png`);
}
// Transparent mark, for surfaces whose ground is not ours (README, share cards).
writeFileSync(path.join(outDir, 'mark-512.png'), png(512, false, 0.94));
console.log('wrote icons/mark-512.png');

// ── favicon.svg ─────────────────────────────────────────────────────────────
const [sx, sy] = polar(GAP.to, RING.r);
const [ex, ey] = polar(GAP.from, RING.r);
const ir = RING.r - RING.width * SWIRL.inset;
const [isx, isy] = polar(SWIRL.from, ir);
const [iex, iey] = polar(SWIRL.to, ir);

const stopEls = STOPS.map(
  ([at, [r, g, b]]) => `<stop offset="${at * 100}%" stop-color="rgb(${r},${g},${b})"/>`,
).join('');

const dropEls = DROPS.map(([angle, dist, r]) => {
  const [x, y] = polar(angle, dist);
  const [cr, cg, cb] = spectrumAt(angleToSweep(angle));
  const op = (0.5 + Math.min(1, r / 2.6) * 0.5).toFixed(2);
  return `  <circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${r}" fill="rgb(${cr},${cg},${cb})" opacity="${op}"/>`;
}).join('\n');

const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VB} ${VB}" role="img" aria-label="ZenPort">
  <defs>
    <linearGradient id="s" x1="${GRAD.ax}" y1="${GRAD.ay}" x2="${GRAD.bx}" y2="${GRAD.by}" gradientUnits="userSpaceOnUse">${stopEls}</linearGradient>
    <linearGradient id="i" x1="54" y1="10" x2="12" y2="54" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#8E4BF0" stop-opacity=".95"/>
      <stop offset="42%" stop-color="#F463A0" stop-opacity=".85"/>
      <stop offset="100%" stop-color="#FFCB6A" stop-opacity=".7"/>
    </linearGradient>
  </defs>
  <path d="M ${sx.toFixed(2)} ${sy.toFixed(2)} A ${RING.r} ${RING.r} 0 1 1 ${ex.toFixed(2)} ${ey.toFixed(2)}" fill="none" stroke="url(#s)" stroke-width="${RING.width}" stroke-linecap="round"/>
  <path d="M ${isx.toFixed(2)} ${isy.toFixed(2)} A ${ir.toFixed(3)} ${ir.toFixed(3)} 0 1 1 ${iex.toFixed(2)} ${iey.toFixed(2)}" fill="none" stroke="url(#i)" stroke-width="${(RING.width * SWIRL.widthScale).toFixed(2)}" stroke-linecap="round"/>
${dropEls}
</svg>
`;
writeFileSync(path.join(outDir, 'favicon.svg'), favicon);
console.log('wrote icons/favicon.svg');
