/**
 * Embedded artwork.
 *
 * Most purchased recordings carry their cover inside the file - an ID3v2
 * APIC frame in an MP3, a PICTURE block in a FLAC - and no image file beside
 * them. A scanner that only looks for image files leaves a shelf of 100
 * albums with 4 covers, which is what the first real library looked like.
 *
 * This reads the picture out of the file's metadata head. No decoding, no
 * dependencies: the tag is walked frame by frame, the picture bytes are
 * returned as they are, and the caller caches them once per item so the
 * hourly rescan never re-reads a 40 MB file for a 60 KB picture.
 *
 * Only the metadata region is read - an ID3 tag is capped at 24 MB, a FLAC
 * block at the same - so a corrupt or hostile file cannot make the scanner
 * read a whole audiobook into memory.
 */
import { open } from 'node:fs/promises';

export interface EmbeddedArt {
  ext: 'jpg' | 'png' | 'webp' | 'gif';
  mime: string;
  data: Buffer;
}

const MAX_TAG_BYTES = 24 * 1024 * 1024;

/** Sniff the image type from its bytes - more honest than the declared MIME. */
export function sniffImage(data: Buffer): EmbeddedArt['ext'] | null {
  if (data.length < 12) return null;
  if (data[0] === 0xff && data[1] === 0xd8) return 'jpg';
  if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) return 'png';
  if (data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP') {
    return 'webp';
  }
  if (data.toString('ascii', 0, 4) === 'GIF8') return 'gif';
  return null;
}

const MIME_FOR: Record<EmbeddedArt['ext'], string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
};

function art(data: Buffer): EmbeddedArt | null {
  const ext = sniffImage(data);
  return ext ? { ext, mime: MIME_FOR[ext], data } : null;
}

export async function extractEmbeddedArt(
  absPath: string,
  ext: string,
): Promise<EmbeddedArt | null> {
  const e = ext.toLowerCase();
  try {
    if (e === 'mp3' || e === 'aac') return await readId3(absPath);
    if (e === 'flac') return await readFlac(absPath);
    return null;
  } catch {
    // Unreadable or malformed metadata is not a scan failure; the item just
    // keeps its generated cover.
    return null;
  }
}

async function readExact(
  fh: Awaited<ReturnType<typeof open>>,
  position: number,
  length: number,
): Promise<Buffer> {
  const buf = Buffer.alloc(length);
  const { bytesRead } = await fh.read(buf, 0, length, position);
  return bytesRead === length ? buf : buf.subarray(0, bytesRead);
}

const syncsafe = (b: Buffer, at: number) =>
  ((b[at]! & 0x7f) << 21) |
  ((b[at + 1]! & 0x7f) << 14) |
  ((b[at + 2]! & 0x7f) << 7) |
  (b[at + 3]! & 0x7f);

/** Undo ID3 unsynchronisation: every FF 00 pair was an FF. */
function deunsync(b: Buffer): Buffer {
  const out = Buffer.alloc(b.length);
  let o = 0;
  for (let i = 0; i < b.length; i++) {
    out[o++] = b[i]!;
    if (b[i] === 0xff && b[i + 1] === 0x00) i++;
  }
  return out.subarray(0, o);
}

// ── ID3v2 (2.2 / 2.3 / 2.4) ─────────────────────────────────────────────────

async function readId3(absPath: string): Promise<EmbeddedArt | null> {
  const fh = await open(absPath, 'r');
  try {
    const head = await readExact(fh, 0, 10);
    if (head.length < 10 || head.toString('latin1', 0, 3) !== 'ID3') return null;
    const version = head[3]!;
    const flags = head[5]!;
    const size = syncsafe(head, 6);
    if (size <= 0 || size > MAX_TAG_BYTES) return null;
    let tag = await readExact(fh, 10, size);
    // v2.3 unsynchronises the whole tag; v2.4 does it per frame.
    if (flags & 0x80 && version < 4) tag = deunsync(tag);
    return parseId3Frames(tag, version, flags);
  } finally {
    await fh.close();
  }
}

function parseId3Frames(tag: Buffer, version: number, tagFlags: number): EmbeddedArt | null {
  let pos = 0;
  if (tagFlags & 0x40) {
    // Extended header. v2.3: 4-byte size NOT including itself; v2.4: syncsafe, including itself.
    if (version === 4) pos += syncsafe(tag, 0);
    else pos += 4 + tag.readUInt32BE(0);
  }
  const idLen = version === 2 ? 3 : 4;
  const headerLen = version === 2 ? 6 : 10;
  let fallback: EmbeddedArt | null = null;

  while (pos + headerLen <= tag.length) {
    const id = tag.toString('latin1', pos, pos + idLen);
    if (id[0] === '\0') break; // padding
    let frameSize: number;
    let frameFlags = 0;
    if (version === 2) {
      frameSize = (tag[pos + 3]! << 16) | (tag[pos + 4]! << 8) | tag[pos + 5]!;
    } else if (version === 4) {
      frameSize = syncsafe(tag, pos + 4);
      frameFlags = tag[pos + 9]!;
    } else {
      frameSize = tag.readUInt32BE(pos + 4);
      frameFlags = tag[pos + 9]!;
    }
    const start = pos + headerLen;
    const end = start + frameSize;
    if (frameSize <= 0 || end > tag.length) break;

    if (id === 'APIC' || id === 'PIC') {
      let body = tag.subarray(start, end);
      if (version === 4) {
        if (frameFlags & 0x01) body = body.subarray(4); // data length indicator
        if (frameFlags & 0x02) body = deunsync(body);
      }
      const picture = parseApic(body, version === 2);
      if (picture) {
        if (picture.type === 3) return picture.art; // front cover: the one we want
        fallback ??= picture.art;
      }
    }
    pos = end;
  }
  return fallback;
}

function parseApic(body: Buffer, v22: boolean): { type: number; art: EmbeddedArt } | null {
  if (body.length < 4) return null;
  const encoding = body[0]!;
  let p = 1;
  if (v22) {
    p += 3; // three-character image format, e.g. "JPG"
  } else {
    const nul = body.indexOf(0, p);
    if (nul < 0) return null;
    p = nul + 1;
  }
  const type = body[p]!;
  p += 1;
  // Description: NUL-terminated; UTF-16 encodings (1, 2) terminate with 00 00 on an even boundary.
  if (encoding === 1 || encoding === 2) {
    while (p + 1 < body.length && !(body[p] === 0 && body[p + 1] === 0)) p += 2;
    p += 2;
  } else {
    const nul = body.indexOf(0, p);
    if (nul < 0) return null;
    p = nul + 1;
  }
  const picture = art(body.subarray(p));
  return picture ? { type, art: picture } : null;
}

// ── FLAC ────────────────────────────────────────────────────────────────────

async function readFlac(absPath: string): Promise<EmbeddedArt | null> {
  const fh = await open(absPath, 'r');
  try {
    const marker = await readExact(fh, 0, 4);
    if (marker.toString('latin1') !== 'fLaC') return null;
    let pos = 4;
    let fallback: EmbeddedArt | null = null;
    for (;;) {
      const h = await readExact(fh, pos, 4);
      if (h.length < 4) break;
      const last = (h[0]! & 0x80) !== 0;
      const type = h[0]! & 0x7f;
      const length = (h[1]! << 16) | (h[2]! << 8) | h[3]!;
      pos += 4;
      if (type === 6 && length > 0 && length <= MAX_TAG_BYTES) {
        const block = await readExact(fh, pos, length);
        const picture = parseFlacPicture(block);
        if (picture) {
          if (picture.type === 3) return picture.art;
          fallback ??= picture.art;
        }
      }
      pos += length;
      if (last) break;
    }
    return fallback;
  } finally {
    await fh.close();
  }
}

function parseFlacPicture(b: Buffer): { type: number; art: EmbeddedArt } | null {
  if (b.length < 32) return null;
  let p = 0;
  const type = b.readUInt32BE(p);
  p += 4;
  const mimeLen = b.readUInt32BE(p);
  p += 4 + mimeLen;
  const descLen = b.readUInt32BE(p);
  p += 4 + descLen;
  p += 16; // width, height, depth, colours
  const dataLen = b.readUInt32BE(p);
  p += 4;
  if (p + dataLen > b.length) return null;
  const picture = art(b.subarray(p, p + dataLen));
  return picture ? { type, art: picture } : null;
}
