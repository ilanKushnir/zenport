import { describe, expect, it } from 'vitest';
import { durationOf, readFrames, silenceMp3, stitch } from './mp3.js';

describe('joining speech and silence', () => {
  it('lays parts and pauses end to end, with a Xing frame that knows the length', () => {
    const a = silenceMp3(2);
    const b = silenceMp3(1);
    const r = stitch(
      [
        { mp3: a, pauseAfter: 10 },
        { mp3: b, pauseAfter: 0 },
      ],
      3,
    );
    expect(r.durationSec).toBeCloseTo(16, 1);
    expect(r.starts[0]).toBeCloseTo(3, 1);
    expect(r.starts[1]).toBeCloseTo(15, 1);
    // The Xing frame is not audio: reading the result finds just the frames.
    expect(durationOf(r.mp3)).toBeCloseTo(r.durationSec, 3);
    const tag = r.mp3.indexOf('Xing');
    expect(tag).toBeGreaterThan(0);
    expect(r.mp3.readUInt32BE(tag + 8)).toBe(readFrames(r.mp3).frames.length);
    expect(r.mp3.readUInt32BE(tag + 12)).toBe(r.mp3.length);
    // Silence is cheap: the quiet stretches use the smallest frames.
    expect(r.mp3.length).toBeLessThan(a.length + b.length + 13 * 50 * 30);
  });

  it('skips a leading ID3 tag and refuses what is not MP3', () => {
    const id3 = Buffer.concat([
      Buffer.from('ID3\x04\x00\x00\x00\x00\x00\x05', 'latin1'),
      Buffer.alloc(5),
    ]);
    expect(durationOf(Buffer.concat([id3, silenceMp3(1)]))).toBeCloseTo(1, 1);
    expect(() => readFrames(Buffer.from('not audio at all'))).toThrow();
  });
});
