import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { silenceMp3, stitch } from '../ai/mp3.js';
import { readDuration } from './duration.js';

const dir = mkdtempSync(path.join(os.tmpdir(), 'zp-dur-'));
const file = (name: string, data: Buffer) => {
  const f = path.join(dir, name);
  writeFileSync(f, data);
  return { f, size: data.length };
};

const atom = (type: string, body: Buffer) => {
  const h = Buffer.alloc(8);
  h.writeUInt32BE(8 + body.length, 0);
  h.write(type, 4, 'latin1');
  return Buffer.concat([h, body]);
};

describe('reading a length from the header', () => {
  it('MP3 with a Xing frame (variable bitrate)', async () => {
    const { mp3, durationSec } = stitch(
      [
        { mp3: silenceMp3(3), pauseAfter: 2 },
        { mp3: silenceMp3(4), pauseAfter: 0 },
      ],
      1,
    );
    const { f, size } = file('a.mp3', mp3);
    expect(await readDuration(f, 'mp3', size)).toBeCloseTo(durationSec, 1);
  });

  it('MP4 with its movie header after the media, as many files have it', async () => {
    const mvhd = Buffer.alloc(100);
    mvhd.writeUInt32BE(600, 12); // timescale
    mvhd.writeUInt32BE(600 * 754, 16); // 754 s
    const data = Buffer.concat([
      atom('ftyp', Buffer.from('isom0000')),
      atom('mdat', Buffer.alloc(5000)),
      atom('moov', atom('mvhd', mvhd)),
    ]);
    const { f, size } = file('b.mp4', data);
    expect(await readDuration(f, 'mp4', size)).toBe(754);
  });

  it('FLAC from STREAMINFO', async () => {
    const si = Buffer.alloc(34);
    // 44100 Hz in 20 bits at byte 10, then 441000 samples in the low 36 bits.
    const rate = 44100;
    si[10] = rate >> 12;
    si[11] = (rate >> 4) & 0xff;
    si[12] = (rate & 0x0f) << 4;
    si.writeUInt32BE(441000, 14);
    const data = Buffer.concat([Buffer.from('fLaC'), Buffer.from([0x80, 0, 0, 34]), si]);
    const { f, size } = file('c.flac', data);
    expect(await readDuration(f, 'flac', size)).toBe(10);
  });

  it('nothing for what it cannot read', async () => {
    const { f, size } = file('d.mp3', Buffer.from('not audio at all'));
    expect(await readDuration(f, 'mp3', size)).toBeNull();
    expect(await readDuration(path.join(dir, 'missing.mp3'), 'mp3', 10)).toBeNull();
    const o = file('e.ogg', Buffer.alloc(100));
    expect(await readDuration(o.f, 'ogg', o.size)).toBeNull();
  });
});
