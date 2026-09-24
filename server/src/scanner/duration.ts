/**
 * How long a recording is, read from the file's own header - a few
 * kilobytes, never the whole file, so a network share is not dragged
 * through. Lengths used to be known only once a track had played in a
 * browser; now the library, today's pick and the planner know them from
 * the first scan.
 *
 * - MP3: the Xing/Info or VBRI frame's frame count (variable bitrate), else
 *   the audio bytes over the bitrate (constant bitrate).
 * - MP4, M4A, M4V, MOV: the movie header ('mvhd') inside 'moov', which may
 *   sit at either end of the file.
 * - FLAC: STREAMINFO's sample count over its sample rate.
 * - WAV: the data chunk over the byte rate.
 *
 * Anything else, or anything unreadable, is null - the player still reports
 * a length when it first plays the track.
 */
import { open, realpath, type FileHandle } from 'node:fs/promises';
import path from 'node:path';
import type { Db } from '../db/index.js';
import { parseHeader } from '../ai/mp3.js';

const HEAD = 64 * 1024;

async function readAt(fh: FileHandle, pos: number, len: number): Promise<Buffer> {
  const buf = Buffer.alloc(len);
  const { bytesRead } = await fh.read(buf, 0, len, pos);
  return buf.subarray(0, bytesRead);
}

/** Where the audio starts after an ID3v2 tag (which can hold a large cover). */
function id3End(b: Buffer): number {
  if (b.length < 10 || b.subarray(0, 3).toString('latin1') !== 'ID3') return 0;
  const size =
    ((b[6]! & 0x7f) << 21) | ((b[7]! & 0x7f) << 14) | ((b[8]! & 0x7f) << 7) | (b[9]! & 0x7f);
  const footer = (b[5]! & 0x10) !== 0 ? 10 : 0;
  return 10 + size + footer;
}

async function mp3(fh: FileHandle, size: number): Promise<number | null> {
  const start = id3End(await readAt(fh, 0, 10));
  const b = await readAt(fh, start, HEAD);
  for (let i = 0; i + 4 < b.length; i++) {
    const h = parseHeader(b, i);
    if (!h) continue;
    // A real frame is followed by another: a stray 0xFF byte is not.
    if (i + h.length + 4 <= b.length && !parseHeader(b, i + h.length)) continue;
    const side = i + 4 + (h.crc ? 2 : 0) + h.sideInfo;
    const tag = b.subarray(side, side + 4).toString('latin1');
    if ((tag === 'Xing' || tag === 'Info') && side + 12 <= b.length) {
      const flags = b.readUInt32BE(side + 4);
      if (flags & 1) return (b.readUInt32BE(side + 8) * h.samples) / h.sampleRate;
    }
    const vbri = i + 4 + 32;
    if (b.subarray(vbri, vbri + 4).toString('latin1') === 'VBRI' && vbri + 18 <= b.length) {
      return (b.readUInt32BE(vbri + 14) * h.samples) / h.sampleRate;
    }
    const audio = size - start - i;
    return audio > 0 ? (audio * 8) / h.bitrate : null;
  }
  return null;
}

async function mp4(fh: FileHandle, size: number): Promise<number | null> {
  let pos = 0;
  for (let n = 0; n < 64 && pos + 8 <= size; n++) {
    const h = await readAt(fh, pos, 16);
    if (h.length < 8) return null;
    let len = h.readUInt32BE(0);
    const type = h.subarray(4, 8).toString('latin1');
    let head = 8;
    if (len === 1 && h.length >= 16) {
      len = Number(h.readBigUInt64BE(8));
      head = 16;
    } else if (len === 0) {
      len = size - pos;
    }
    if (len < head) return null;
    if (type === 'moov') {
      const body = await readAt(fh, pos + head, Math.min(len - head, HEAD));
      return mvhd(body);
    }
    pos += len;
  }
  return null;
}

/** The movie header among moov's children: duration over timescale. */
function mvhd(b: Buffer): number | null {
  let i = 0;
  while (i + 8 <= b.length) {
    const len = b.readUInt32BE(i);
    const type = b.subarray(i + 4, i + 8).toString('latin1');
    if (type === 'mvhd') {
      const c = i + 8;
      const version = b[c];
      if (version === 1 && c + 32 <= b.length) {
        const scale = b.readUInt32BE(c + 20);
        return scale ? Number(b.readBigUInt64BE(c + 24)) / scale : null;
      }
      if (c + 20 <= b.length) {
        const scale = b.readUInt32BE(c + 12);
        return scale ? b.readUInt32BE(c + 16) / scale : null;
      }
      return null;
    }
    if (len < 8) return null;
    i += len;
  }
  return null;
}

async function flac(fh: FileHandle): Promise<number | null> {
  const start = id3End(await readAt(fh, 0, 10));
  const b = await readAt(fh, start, 42);
  if (b.length < 42 || b.subarray(0, 4).toString('latin1') !== 'fLaC') return null;
  if ((b[4]! & 0x7f) !== 0) return null; // the first block is always STREAMINFO
  const s = 8;
  const rate = (b[s + 10]! << 12) | (b[s + 11]! << 4) | (b[s + 12]! >> 4);
  const total = (b[s + 13]! & 0x0f) * 2 ** 32 + b.readUInt32BE(s + 14);
  return rate && total ? total / rate : null;
}

async function wav(fh: FileHandle): Promise<number | null> {
  const b = await readAt(fh, 0, 4096);
  if (
    b.subarray(0, 4).toString('latin1') !== 'RIFF' ||
    b.subarray(8, 12).toString('latin1') !== 'WAVE'
  )
    return null;
  let byteRate = 0;
  let i = 12;
  while (i + 8 <= b.length) {
    const id = b.subarray(i, i + 4).toString('latin1');
    const len = b.readUInt32LE(i + 4);
    if (id === 'fmt ' && i + 20 <= b.length) byteRate = b.readUInt32LE(i + 16);
    if (id === 'data') return byteRate ? len / byteRate : null;
    i += 8 + len + (len % 2);
  }
  return null;
}

/** Seconds, or null when the file does not say (or cannot be read). */
export async function readDuration(
  file: string,
  ext: string,
  size: number,
): Promise<number | null> {
  let fh: FileHandle | null = null;
  try {
    fh = await open(file, 'r');
    const e = ext.toLowerCase().replace(/^\./, '');
    const sec =
      e === 'mp3'
        ? await mp3(fh, size)
        : ['mp4', 'm4a', 'm4v', 'm4b', 'mov'].includes(e)
          ? await mp4(fh, size)
          : e === 'flac'
            ? await flac(fh)
            : e === 'wav'
              ? await wav(fh)
              : null;
    // Nonsense (a broken header) is no length at all.
    return sec !== null && Number.isFinite(sec) && sec > 0.5 && sec < 86_400 ? sec : null;
  } catch {
    return null;
  } finally {
    await fh?.close().catch(() => {});
  }
}

/**
 * Lengths for every present track that has none yet, a few files at a time.
 * Each path is resolved inside its library (never outside it) before it is
 * opened. A file that says nothing is not asked again until ZenPort restarts.
 */
const tried = new Set<string>();

export async function fillDurations(
  db: Db,
  roots: { id: number; path: string }[],
  onProgress?: (done: number, total: number) => void,
): Promise<number> {
  const rows = (
    db
      .prepare(
        'SELECT id, root_id, rel_path, ext, size_bytes FROM tracks WHERE missing = 0 AND duration_sec IS NULL',
      )
      .all() as { id: string; root_id: number; rel_path: string; ext: string; size_bytes: number }[]
  ).filter((r) => !tried.has(r.id) && roots.some((x) => x.id === r.root_id));
  if (rows.length === 0) return 0;
  const real = new Map<number, string>();
  for (const r of roots) {
    try {
      real.set(r.id, await realpath(r.path));
    } catch {
      /* an unreachable library: its tracks wait for the next scan */
    }
  }
  const set = db.prepare(
    'UPDATE tracks SET duration_sec = ? WHERE id = ? AND duration_sec IS NULL',
  );
  let done = 0;
  let found = 0;
  let next = 0;
  const worker = async () => {
    while (next < rows.length) {
      const r = rows[next++]!;
      tried.add(r.id);
      const base = real.get(r.root_id);
      if (base) {
        const abs = path.resolve(base, r.rel_path);
        if (abs.startsWith(base + path.sep)) {
          const sec = await readDuration(abs, r.ext, r.size_bytes);
          if (sec !== null) {
            set.run(Math.round(sec * 10) / 10, r.id);
            found++;
          }
        }
      }
      done++;
      if (done % 10 === 0 || done === rows.length) onProgress?.(done, rows.length);
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  return found;
}
