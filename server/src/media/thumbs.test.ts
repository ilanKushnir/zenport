import { mkdtempSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { parseCoverWidth, sizedCover } from './thumbs.js';

describe('sizedCover', () => {
  it('only accepts the fixed widths', () => {
    expect(parseCoverWidth('32')).toBe(32);
    expect(parseCoverWidth('640')).toBe(640);
    expect(parseCoverWidth('500')).toBeNull();
    expect(parseCoverWidth(undefined)).toBeNull();
  });

  it('writes a square WebP at the width, reuses it, and gives up on junk', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'zp-thumb-'));
    const src = path.join(dir, 'cover.png');
    await sharp({ create: { width: 800, height: 600, channels: 3, background: '#7c3aed' } })
      .png()
      .toFile(src);

    const out = await sizedCover(src, path.join(dir, 'thumbs'), 'abc', 32);
    expect(out).toBeTruthy();
    const meta = await sharp(out!).metadata();
    expect(meta).toMatchObject({ format: 'webp', width: 32, height: 32 });

    const first = statSync(out!).mtimeMs;
    await sizedCover(src, path.join(dir, 'thumbs'), 'abc', 32);
    expect(statSync(out!).mtimeMs).toBe(first); // cache hit, not rewritten

    const junk = path.join(dir, 'junk.jpg');
    writeFileSync(junk, 'not an image');
    expect(await sizedCover(junk, path.join(dir, 'thumbs'), 'junk', 320)).toBeNull();
  });
});
