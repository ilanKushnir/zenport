#!/usr/bin/env node
/**
 * Neutral TEMPORARY PWA icons. The real ZenPort logo is being designed
 * separately; these are deliberately plain placeholders (ink-plum square,
 * parchment "Z") so nothing here gets mistaken for a brand decision.
 *
 * PNGs are generated with zlib only — no image dependencies.
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, '..', 'web', 'public', 'icons');
mkdirSync(outDir, { recursive: true });

const BG = [0x18, 0x14, 0x20];
const FG = [0xef, 0xe7, 0xda];

/** 7x7 bitmap of a plain Z glyph. */
const Z = ['1111111', '0000011', '0000110', '0001100', '0011000', '0110000', '1111111'];

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
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

function png(size) {
  const cell = Math.floor(size / 16);
  const glyph = cell * 7;
  const gx = Math.floor((size - glyph) / 2);
  const gy = Math.floor((size - glyph) / 2);
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 3);
    for (let x = 0; x < size; x++) {
      let [r, g, b] = BG;
      const zx = Math.floor((x - gx) / cell);
      const zy = Math.floor((y - gy) / cell);
      if (zx >= 0 && zx < 7 && zy >= 0 && zy < 7 && Z[zy][zx] === '1') {
        [r, g, b] = FG;
      }
      row[1 + x * 3] = r;
      row[2 + x * 3] = g;
      row[3 + x * 3] = b;
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolor
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const size of [192, 512]) {
  writeFileSync(path.join(outDir, `icon-${size}.png`), png(size));
  console.log(`wrote icons/icon-${size}.png`);
}

const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <!-- TEMPORARY placeholder icon; the real ZenPort mark is designed elsewhere. -->
  <rect width="32" height="32" rx="7" fill="#181420"/>
  <text x="16" y="22.5" text-anchor="middle" font-family="Georgia, serif" font-size="18" fill="#EFE7DA">Z</text>
</svg>
`;
writeFileSync(path.join(outDir, 'favicon.svg'), favicon);
console.log('wrote icons/favicon.svg');
