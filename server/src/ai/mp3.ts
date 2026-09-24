/**
 * Joining spoken MP3 segments with silence between them - without ffmpeg.
 *
 * A guided meditation is mostly quiet: a few sentences, then a minute of
 * silence. Speech comes from the TTS provider as MPEG Layer III; silence is
 * made here as real, empty Layer III frames (all-zero side info decodes as
 * silence) at the lowest bitrate the stream allows, so a quiet minute costs
 * kilobytes, not a megabyte. Because the bitrate then varies, a Xing frame
 * with the frame count, byte count and a seek table leads the file, so
 * players know its true length and seek correctly.
 */

// Bitrates (kbps) by [MPEG-1 | MPEG-2/2.5] for Layer III.
const BITRATES = {
  v1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  v2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};
// Sample rates by version bits (3 = MPEG-1, 2 = MPEG-2, 0 = MPEG-2.5).
const RATES: Record<number, number[]> = {
  3: [44100, 48000, 32000],
  2: [22050, 24000, 16000],
  0: [11025, 12000, 8000],
};

export class Mp3Error extends Error {}

interface Header {
  version: 3 | 2 | 0;
  bitrateIndex: number;
  sampleRate: number;
  padding: number;
  mono: boolean;
  length: number;
  samples: number;
  /** Bytes of side information after the 4-byte header (no CRC). */
  sideInfo: number;
  crc: boolean;
}

function parseHeader(b: Buffer, i: number): Header | null {
  if (i + 4 > b.length || b[i] !== 0xff || (b[i + 1]! & 0xe0) !== 0xe0) return null;
  const version = (b[i + 1]! >> 3) & 3;
  const layer = (b[i + 1]! >> 1) & 3;
  if (version === 1 || layer !== 1) return null; // reserved version, or not Layer III
  const crc = (b[i + 1]! & 1) === 0;
  const bitrateIndex = b[i + 2]! >> 4;
  const rateIndex = (b[i + 2]! >> 2) & 3;
  if (bitrateIndex === 0 || bitrateIndex === 15 || rateIndex === 3) return null;
  const v1 = version === 3;
  const kbps = (v1 ? BITRATES.v1 : BITRATES.v2)[bitrateIndex]!;
  const sampleRate = RATES[version]![rateIndex]!;
  const padding = (b[i + 2]! >> 1) & 1;
  const mono = b[i + 3]! >> 6 === 3;
  const samples = v1 ? 1152 : 576;
  const length = Math.floor(((samples / 8) * kbps * 1000) / sampleRate) + padding;
  const sideInfo = v1 ? (mono ? 17 : 32) : mono ? 9 : 17;
  return {
    version: version as 3 | 2 | 0,
    bitrateIndex,
    sampleRate,
    padding,
    mono,
    length,
    samples,
    sideInfo,
    crc,
  };
}

export interface Mp3Stream {
  frames: Buffer[];
  header: Header;
  /** The first frame's 4 header bytes, as a template for made frames. */
  template: Buffer;
}

/** The audio frames of an MP3 (ID3 tags and Xing/Info/VBRI frames left out). */
export function readFrames(buf: Buffer): Mp3Stream {
  let i = 0;
  if (buf.subarray(0, 3).toString('latin1') === 'ID3' && buf.length > 10) {
    i = 10 + ((buf[6]! << 21) | (buf[7]! << 14) | (buf[8]! << 7) | buf[9]!);
  }
  const frames: Buffer[] = [];
  let first: Header | null = null;
  let template: Buffer | null = null;
  while (i < buf.length) {
    const h = parseHeader(buf, i);
    if (!h) {
      i++;
      continue;
    }
    const frame = buf.subarray(i, i + h.length);
    if (frame.length < h.length) break;
    const tagAt = 4 + (h.crc ? 2 : 0) + h.sideInfo;
    const tag = frame.subarray(tagAt, tagAt + 4).toString('latin1');
    const vbri = frame.subarray(36, 40).toString('latin1');
    if (!(tag === 'Xing' || tag === 'Info' || vbri === 'VBRI')) {
      if (!first) {
        first = h;
        template = Buffer.from(frame.subarray(0, 4));
      } else if (h.sampleRate !== first.sampleRate || h.mono !== first.mono) {
        throw new Mp3Error('segments differ in sample rate or channels');
      }
      frames.push(frame);
    }
    i += h.length;
  }
  if (!first || !template) throw new Mp3Error('no audio frames');
  return { frames, header: first, template };
}

/** A frame header like the template, at a bitrate index, without padding or CRC. */
function headerAt(template: Buffer, bitrateIndex: number): Buffer {
  const h = Buffer.from(template);
  h[1] = h[1]! | 1; // no CRC
  h[2] = (bitrateIndex << 4) | (h[2]! & 0x0c); // bitrate, keep sample rate, no padding
  return h;
}

/** One empty Layer III frame: decodes as silence. */
function silentFrame(template: Buffer, bitrateIndex: number): Buffer {
  const head = headerAt(template, bitrateIndex);
  const h = parseHeader(Buffer.concat([head, Buffer.alloc(4)]), 0)!;
  return Buffer.concat([head, Buffer.alloc(h.length - 4)]);
}

export interface Part {
  mp3: Buffer;
  /** Seconds of silence after this part. */
  pauseAfter: number;
}

export interface Stitched {
  mp3: Buffer;
  durationSec: number;
  /** Where each part begins, in seconds. */
  starts: number[];
}

/**
 * Silence, then each part followed by its pause, as one MP3 led by a Xing
 * frame (frames, bytes, a 100-point seek table).
 */
export function stitch(parts: Part[], leadIn = 0): Stitched {
  if (parts.length === 0) throw new Mp3Error('nothing to join');
  const streams = parts.map((p) => readFrames(p.mp3));
  const ref = streams[0]!;
  for (const s of streams) {
    if (s.header.sampleRate !== ref.header.sampleRate || s.header.mono !== ref.header.mono) {
      throw new Mp3Error('segments differ in sample rate or channels');
    }
  }
  const frameSec = ref.header.samples / ref.header.sampleRate;
  const quiet = silentFrame(ref.template, 1); // the lowest bitrate
  const silence = (sec: number) => {
    const n = Math.max(0, Math.round(sec / frameSec));
    return Array.from({ length: n }, () => quiet);
  };

  const frames: Buffer[] = [...silence(leadIn)];
  const starts: number[] = [];
  streams.forEach((s, k) => {
    starts.push(frames.length * frameSec);
    frames.push(...s.frames, ...silence(parts[k]!.pauseAfter));
  });

  // The Xing frame, at a bitrate large enough to hold it.
  const v2 = ref.header.version !== 3;
  const table = v2 ? BITRATES.v2 : BITRATES.v1;
  let xingIndex = ref.header.bitrateIndex;
  const tagAt = 4 + ref.header.sideInfo;
  const need = tagAt + 120;
  for (let bi = 1; bi < table.length; bi++) {
    const len = parseHeader(
      Buffer.concat([headerAt(ref.template, bi), Buffer.alloc(4)]),
      0,
    )!.length;
    if (len >= need) {
      xingIndex = bi;
      break;
    }
  }
  const xingHead = headerAt(ref.template, xingIndex);
  const xingLen = parseHeader(Buffer.concat([xingHead, Buffer.alloc(4)]), 0)!.length;
  const totalBytes = xingLen + frames.reduce((n, f) => n + f.length, 0);

  // Seek table: at i% of the duration, the byte offset as a fraction of 256.
  const offsets: number[] = [];
  let at = xingLen;
  for (const f of frames) {
    offsets.push(at);
    at += f.length;
  }
  const toc = Buffer.alloc(100);
  for (let p = 0; p < 100; p++) {
    const idx = Math.min(frames.length - 1, Math.floor((p / 100) * frames.length));
    toc[p] = Math.min(255, Math.floor(((offsets[idx] ?? 0) / totalBytes) * 256));
  }
  const xing = Buffer.alloc(xingLen);
  xingHead.copy(xing, 0);
  xing.write('Xing', tagAt, 'latin1');
  xing.writeUInt32BE(0x0f, tagAt + 4); // frames, bytes, toc, quality
  xing.writeUInt32BE(frames.length, tagAt + 8);
  xing.writeUInt32BE(totalBytes, tagAt + 12);
  toc.copy(xing, tagAt + 16);
  xing.writeUInt32BE(50, tagAt + 116);

  return {
    mp3: Buffer.concat([xing, ...frames]),
    durationSec: frames.length * frameSec,
    starts,
  };
}

/** How long an MP3's audio lasts (its frames, not its tags). */
export function durationOf(mp3: Buffer): number {
  const s = readFrames(mp3);
  return (s.frames.length * s.header.samples) / s.header.sampleRate;
}

/** Plain silence as an MP3 (24 kHz mono) - for tests and placeholders. */
export function silenceMp3(seconds: number): Buffer {
  const template = Buffer.from([0xff, 0xf3, 0xc4, 0xc4]); // MPEG-2 Layer III, 128k, 24 kHz, mono
  const frame = silentFrame(template, 12);
  const n = Math.max(1, Math.round(seconds / (576 / 24000)));
  return Buffer.concat(Array.from({ length: n }, () => frame));
}
