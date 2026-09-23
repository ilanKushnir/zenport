#!/usr/bin/env node
/**
 * Derives every icon slot from the one real logo: `logo.png` at the repo root.
 *
 *   web/public/icons/logo-256.png   in-app mark (sidebar, auth, onboarding)
 *   web/public/icons/favicon-64.png tab icon
 *   web/public/icons/apple-touch-180.png
 *   web/public/icons/icon-192.png   PWA, maskable: opaque plum ground, mark
 *   web/public/icons/icon-512.png   inside the ~80% safe zone
 *
 * logo.png is the design; nothing here redraws it. This only decodes it,
 * box-resamples it, and for the maskable slots composites it onto the app
 * background - because a maskable icon must not be transparent and the mark
 * must sit inside the safe zone or a platform mask clips it.
 *
 * Pure node: the PNG decoder (inflate + the five filter types) and encoder
 * are written out here so the repo keeps its no-image-dependencies rule.
 *
 * Run with: npm run icons
 */
import { deflateSync, inflateSync } from 'node:zlib';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const outDir = path.join(root, 'web', 'public', 'icons');
mkdirSync(outDir, { recursive: true });

const BG = [0x18, 0x14, 0x20]; // --bg

// ── PNG decode (8-bit RGB / RGBA, non-interlaced) ───────────────────────────
function decodePng(buf) {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (!sig.every((b, i) => buf[i] === b)) throw new Error('not a PNG');
  let pos = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  let bitDepth = 0;
  let interlace = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const body = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      bitDepth = body[8];
      colorType = body[9];
      interlace = body[12];
    } else if (type === 'IDAT') {
      idat.push(body);
    } else if (type === 'IEND') {
      break;
    }
    pos += 12 + len;
  }
  if (bitDepth !== 8 || interlace !== 0 || (colorType !== 6 && colorType !== 2)) {
    throw new Error(
      `logo.png must be 8-bit RGB or RGBA, non-interlaced (got depth ${bitDepth}, type ${colorType}, interlace ${interlace})`,
    );
  }
  const channels = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(width * height * 4);
  let prev = Buffer.alloc(stride);
  let p = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[p++];
    const cur = Buffer.from(raw.subarray(p, p + stride));
    p += stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? cur[x - channels] : 0;
      const b = prev[x];
      const c = x >= channels ? prev[x - channels] : 0;
      let v = cur[x];
      switch (filter) {
        case 1:
          v += a;
          break;
        case 2:
          v += b;
          break;
        case 3:
          v += (a + b) >> 1;
          break;
        case 4: {
          const pp = a + b - c;
          const pa = Math.abs(pp - a);
          const pb = Math.abs(pp - b);
          const pc = Math.abs(pp - c);
          v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
          break;
        }
        default:
          break;
      }
      cur[x] = v & 0xff;
    }
    for (let x = 0; x < width; x++) {
      const s = x * channels;
      const d = (y * width + x) * 4;
      out[d] = cur[s];
      out[d + 1] = cur[s + 1];
      out[d + 2] = cur[s + 2];
      out[d + 3] = channels === 4 ? cur[s + 3] : 255;
    }
    prev = cur;
  }
  return { width, height, data: out };
}

// ── PNG encode (RGBA) ───────────────────────────────────────────────────────
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
function encodePng({ width, height, data }) {
  const rows = [];
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 4);
    data.copy(row, 1, y * width * 4, (y + 1) * width * 4);
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── resampling ──────────────────────────────────────────────────────────────
/** Opaque bounding box, so the mark is framed by its ink rather than its file. */
function bounds(img) {
  let minX = img.width;
  let minY = img.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (img.data[(y * img.width + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/**
 * Area-averaging resample of a source rectangle into a `size`×`size` square,
 * centred, preserving aspect. Premultiplied during averaging so transparent
 * neighbours do not bleed dark fringes into the edges of the mark.
 */
function resample(img, src, size, fill) {
  const out = Buffer.alloc(size * size * 4);
  const scale = Math.max(src.w, src.h) / (size * fill);
  const drawW = src.w / scale;
  const drawH = src.h / scale;
  const offX = (size - drawW) / 2;
  const offY = (size - drawH) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // source box covered by this output pixel
      const sx0 = src.x + (x - offX) * scale;
      const sy0 = src.y + (y - offY) * scale;
      const sx1 = sx0 + scale;
      const sy1 = sy0 + scale;
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      const ix0 = Math.max(0, Math.floor(sx0));
      const iy0 = Math.max(0, Math.floor(sy0));
      const ix1 = Math.min(img.width, Math.ceil(sx1));
      const iy1 = Math.min(img.height, Math.ceil(sy1));
      for (let yy = iy0; yy < iy1; yy++) {
        for (let xx = ix0; xx < ix1; xx++) {
          const i = (yy * img.width + xx) * 4;
          const pa = img.data[i + 3] / 255;
          r += img.data[i] * pa;
          g += img.data[i + 1] * pa;
          b += img.data[i + 2] * pa;
          a += pa;
          n++;
        }
      }
      const o = (y * size + x) * 4;
      if (n === 0 || a === 0) continue;
      out[o] = Math.round(r / a);
      out[o + 1] = Math.round(g / a);
      out[o + 2] = Math.round(b / a);
      out[o + 3] = Math.round((a / n) * 255);
    }
  }
  return { width: size, height: size, data: out };
}

function onGround(img, rgb) {
  const out = Buffer.alloc(img.data.length);
  for (let i = 0; i < img.data.length; i += 4) {
    const a = img.data[i + 3] / 255;
    out[i] = Math.round(rgb[0] * (1 - a) + img.data[i] * a);
    out[i + 1] = Math.round(rgb[1] * (1 - a) + img.data[i + 1] * a);
    out[i + 2] = Math.round(rgb[2] * (1 - a) + img.data[i + 2] * a);
    out[i + 3] = 255;
  }
  return { ...img, data: out };
}

// ── run ─────────────────────────────────────────────────────────────────────
const logo = decodePng(readFileSync(path.join(root, 'logo.png')));
const box = bounds(logo);
console.log(`logo.png ${logo.width}×${logo.height}, ink ${box.w}×${box.h} at ${box.x},${box.y}`);

const write = (name, img) => {
  writeFileSync(path.join(outDir, name), encodePng(img));
  console.log(`wrote icons/${name}`);
};

// Transparent marks: the ink fills the frame.
write('logo-256.png', resample(logo, box, 256, 0.98));
write('favicon-64.png', resample(logo, box, 64, 0.98));
// The home-screen icon. Apple ignores alpha and masks its own corners, so it
// is an opaque square on the app ground with the mark at ~66% - the same
// proportion Pumpy, ReadPort and Keepster use, so the four sit as a set on a
// phone. The splashes are the outermost ink, and this keeps them clear of
// the rounded corners iOS cuts.
write('apple-touch-180.png', onGround(resample(logo, box, 180, 0.66), BG));
// Maskable PWA icons: same ground, mark inside the ~80% safe zone.
for (const size of [192, 512]) {
  write(`icon-${size}.png`, onGround(resample(logo, box, size, 0.66), BG));
}
