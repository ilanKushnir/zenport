#!/usr/bin/env node
/**
 * Generate the committed sample library under fixtures/library/meditations.
 * Everything is synthesized right here (sine-pad WAVs, solid-color PNG
 * covers, minimal PDFs, text notes) so the repository owns every byte —
 * no copyrighted media, nothing fetched.
 *
 * The tree deliberately exercises the scanner: deep creator/collection
 * nesting, a category layer, a shallow creator folder, a numbered set with
 * no creator, odd names, loose root audio, junk and unsupported files.
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', 'fixtures', 'library', 'meditations');
rmSync(root, { recursive: true, force: true });

function put(rel, content) {
  const abs = path.join(root, rel);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

/** Small calm WAV: layered sines with slow amplitude swell, 8 kHz mono. */
function wav(seconds, baseFreq) {
  const rate = 8000;
  const n = Math.floor(rate * seconds);
  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const env = Math.sin((Math.PI * i) / n) * 0.4; // swell in and out
    const s =
      Math.sin(2 * Math.PI * baseFreq * t) * 0.6 +
      Math.sin(2 * Math.PI * baseFreq * 1.5 * t) * 0.25 +
      Math.sin(2 * Math.PI * baseFreq * 0.5 * t) * 0.15;
    data.writeInt16LE(Math.round(s * env * 32767 * 0.5), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

function crc32(buf) {
  const table = [];
  for (let nn = 0; nn < 256; nn++) {
    let c = nn;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[nn] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** Two-tone cover: solid field with a horizon band — calm, no cliché. */
function cover(size, [r1, g1, b1], [r2, g2, b2]) {
  const rows = [];
  const horizon = Math.floor(size * 0.62);
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 3);
    const [r, g, b] = y < horizon ? [r1, g1, b1] : [r2, g2, b2];
    for (let x = 0; x < size; x++) {
      row[1 + x * 3] = r;
      row[2 + x * 3] = g;
      row[3 + x * 3] = b;
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(Buffer.concat(rows))),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Minimal valid one-page PDF with a line of text. */
function pdf(text) {
  const stream = `BT /F1 18 Tf 72 720 Td (${text.replace(/[()\\]/g, '')}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((obj, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) out += `${String(off).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out);
}

const plum = [46, 36, 64];
const copper = [196, 144, 100];
const stone = [58, 51, 72];
const parchment = [219, 208, 186];
const seafoam = [34, 48, 49];

// 1. Flagship deep layout: creator / meditation / tracks + cover + notes.
put('Mira Solen/Morning Ritual/01 Settling In.wav', wav(5, 196));
put('Mira Solen/Morning Ritual/02 Elevated Breath.wav', wav(6, 220));
put('Mira Solen/Morning Ritual/03 Rest In The Unknown.wav', wav(5, 174));
put('Mira Solen/Morning Ritual/cover.png', cover(320, plum, copper));
put(
  'Mira Solen/Morning Ritual/notes.md',
  `# Morning Ritual\n\nA three-part morning practice.\n\n## Suggested rhythm\n\n- Sit before sunrise when you can\n- Track 1 settles the body\n- Track 2 works the breath\n- Track 3 rests in open awareness\n\n> Consistency over intensity.\n`,
);
put('Mira Solen/Evening Wind-Down/wind-down.wav', wav(6, 147));
put('Mira Solen/Evening Wind-Down/cover.png', cover(320, stone, plum));

// 2. Shallow creator folder: each file is its own meditation.
put('Orin Vale/Loving Kindness.wav', wav(5, 262));
put('Orin Vale/Body Scan.wav', wav(6, 233));
put('Orin Vale/Body Scan.png', cover(320, seafoam, parchment));
put('Orin Vale/Tender Evening.wav', wav(5, 208));

// 3. Category layer above creators (sibling evidence).
put('Sleep/Stillwater Collective/Deep Rest Program/Night 1/night-1.wav', wav(6, 131));
put('Sleep/Stillwater Collective/Deep Rest Program/Night 2/night-2.wav', wav(6, 123));
put('Sleep/Lena Marsh/Evening Landing/audio.wav', wav(5, 165));
put('Sleep/Lena Marsh/Evening Landing/cover.png', cover(320, plum, stone));
put('Sleep/Lena Marsh/Evening Landing/guide.pdf', pdf('Evening Landing - practice guide'));

// 4. Numbered set with no creator folder above it.
put('Deep Sleep Journey/01 Descent.wav', wav(5, 110));
put('Deep Sleep Journey/02 Ocean Floor.wav', wav(6, 98));

// 5. Odd names, natural ordering, plain-text companion.
put('Juniper & Friends (live!)/Sound Bath #3/2 - opening.wav', wav(4, 294));
put('Juniper & Friends (live!)/Sound Bath #3/10 - closing.wav', wav(4, 247));
put(
  'Juniper & Friends (live!)/Sound Bath #3/notes.txt',
  'Recorded at the winter gathering.\nBowls: F, A-flat, C.\nBest with headphones, lying down.\n',
);

// 6. Mixed folder with docs subfolder and an HTML companion.
put('Breathwork Foundations/session.wav', wav(6, 185));
put('Breathwork Foundations/cover.png', cover(320, copper, plum));
put(
  'Breathwork Foundations/worksheet.html',
  `<!doctype html><html><head><meta charset="utf-8"><title>Breathwork worksheet</title></head><body><h1>Breathwork Foundations</h1><p>Count four in, six out. Note what changes.</p></body></html>\n`,
);
put('Breathwork Foundations/handouts/counting-card.pdf', pdf('Counting card: 4 in, 6 out'));

// 7. Loose audio at the root.
put('ambient-rain.wav', wav(8, 90));

// 8. Junk and unsupported files the scanner must shrug off.
put('.DS_Store', Buffer.from([0, 1, 2, 3]));
put('Thumbs.db', Buffer.from([0]));
put('Mira Solen/desktop.ini', '[ViewState]\n');
put('._resource-fork.wav', Buffer.from([0x00, 0x05, 0x16, 0x07]));
put('notes-backup.xyz', 'not a supported format\n');

console.log(`sample library written to ${root}`);
