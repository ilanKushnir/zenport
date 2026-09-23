import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractEmbeddedArt, sniffImage } from './artwork.js';

/** The smallest PNG there is: 1×1, transparent. */
const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0300050001ff2b4c6e0000000049454e44ae426082',
  'hex',
);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(24, 0x11)]);

const syncsafe = (n: number) =>
  Buffer.from([(n >> 21) & 0x7f, (n >> 14) & 0x7f, (n >> 7) & 0x7f, n & 0x7f]);
const u32 = (n: number) => {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n);
  return b;
};

function apicBody(mime: string, type: number, data: Buffer, encoding = 0): Buffer {
  const desc = encoding === 1 ? Buffer.from([0xff, 0xfe, 0x64, 0x00, 0x00, 0x00]) : Buffer.from('cover\0', 'latin1');
  return Buffer.concat([Buffer.from([encoding]), Buffer.from(`${mime}\0`, 'latin1'), Buffer.from([type]), desc, data]);
}

function id3v24(frames: { id: string; body: Buffer; flags?: number }[]): Buffer {
  const parts = frames.map((f) =>
    Buffer.concat([Buffer.from(f.id, 'latin1'), syncsafe(f.body.length), Buffer.from([0, f.flags ?? 0]), f.body]),
  );
  const tag = Buffer.concat(parts);
  return Buffer.concat([Buffer.from('ID3', 'latin1'), Buffer.from([4, 0, 0]), syncsafe(tag.length), tag]);
}

function id3v23(frames: { id: string; body: Buffer }[]): Buffer {
  const parts = frames.map((f) =>
    Buffer.concat([Buffer.from(f.id, 'latin1'), u32(f.body.length), Buffer.from([0, 0]), f.body]),
  );
  const tag = Buffer.concat(parts);
  return Buffer.concat([Buffer.from('ID3', 'latin1'), Buffer.from([3, 0, 0]), syncsafe(tag.length), tag]);
}

function flac(pictures: { type: number; data: Buffer }[]): Buffer {
  const blocks = pictures.map((p, i) => {
    const mime = Buffer.from('image/png', 'latin1');
    const body = Buffer.concat([
      u32(p.type),
      u32(mime.length),
      mime,
      u32(0),
      u32(1),
      u32(1),
      u32(32),
      u32(0),
      u32(p.data.length),
      p.data,
    ]);
    const last = i === pictures.length - 1 ? 0x80 : 0;
    const len = body.length;
    return Buffer.concat([Buffer.from([last | 6, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff]), body]);
  });
  return Buffer.concat([Buffer.from('fLaC', 'latin1'), ...blocks]);
}

async function tmpFile(name: string, bytes: Buffer): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'zp-art-'));
  const p = path.join(dir, name);
  await writeFile(p, bytes);
  return p;
}

describe('sniffImage', () => {
  it('reads the type from the bytes, not from anything declared', () => {
    expect(sniffImage(PNG)).toBe('png');
    expect(sniffImage(JPG)).toBe('jpg');
    expect(sniffImage(Buffer.from('not an image at all'))).toBeNull();
  });
});

describe('extractEmbeddedArt', () => {
  it('reads a front cover out of an ID3v2.4 APIC frame', async () => {
    const f = await tmpFile('a.mp3', Buffer.concat([id3v24([
      { id: 'TIT2', body: Buffer.from('\0Title', 'latin1') },
      { id: 'APIC', body: apicBody('image/png', 3, PNG) },
    ]), Buffer.alloc(64, 0xff)]));
    const art = await extractEmbeddedArt(f, 'mp3');
    expect(art?.ext).toBe('png');
    expect(art?.data.equals(PNG)).toBe(true);
  });

  it('prefers the front cover over other pictures, and falls back to any picture', async () => {
    const both = await tmpFile('b.mp3', id3v24([
      { id: 'APIC', body: apicBody('image/jpeg', 4, JPG) }, // back cover
      { id: 'APIC', body: apicBody('image/png', 3, PNG) }, // front
    ]));
    expect((await extractEmbeddedArt(both, 'mp3'))?.ext).toBe('png');
    const backOnly = await tmpFile('c.mp3', id3v24([{ id: 'APIC', body: apicBody('image/jpeg', 4, JPG) }]));
    expect((await extractEmbeddedArt(backOnly, 'mp3'))?.ext).toBe('jpg');
  });

  it('handles ID3v2.3 sizes and a UTF-16 description', async () => {
    const f = await tmpFile('d.mp3', id3v23([{ id: 'APIC', body: apicBody('image/png', 3, PNG, 1) }]));
    expect((await extractEmbeddedArt(f, 'mp3'))?.ext).toBe('png');
  });

  it('reads a FLAC PICTURE block', async () => {
    const f = await tmpFile('e.flac', flac([{ type: 4, data: JPG }, { type: 3, data: PNG }]));
    const art = await extractEmbeddedArt(f, 'flac');
    expect(art?.ext).toBe('png');
  });

  it('returns null for files with no picture, and never throws on junk', async () => {
    expect(await extractEmbeddedArt(await tmpFile('f.mp3', Buffer.alloc(100, 0)), 'mp3')).toBeNull();
    expect(await extractEmbeddedArt(await tmpFile('g.flac', Buffer.from('fLaC')), 'flac')).toBeNull();
    expect(await extractEmbeddedArt(await tmpFile('h.mp3', id3v24([{ id: 'APIC', body: Buffer.from([0, 0]) }])), 'mp3')).toBeNull();
    expect(await extractEmbeddedArt('/nonexistent/x.mp3', 'mp3')).toBeNull();
    expect(await extractEmbeddedArt(await tmpFile('i.wav', PNG), 'wav')).toBeNull();
  });
});
