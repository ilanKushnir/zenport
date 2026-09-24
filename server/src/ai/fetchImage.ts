/**
 * Fetching a picture from the web - an address an AI suggested, so trusted
 * no further than it can be checked:
 *
 * - https only, to a public address: every hop of a redirect is resolved and
 *   refused if it lands on a private, loopback, link-local or otherwise
 *   internal address (so a suggestion can never make the server reach into
 *   the home network).
 * - At most 8 MB, within 15 seconds.
 * - Decoded for real: whatever arrives must be an image sharp can read. It is
 *   stored as a 512px square WebP, so what is kept is ours, not theirs.
 */
import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const MAX_BYTES = 8 * 1024 * 1024;
const TIMEOUT = 15_000;
export const UA =
  'ZenPort/1 (self-hosted meditation library; https://github.com/ilanKushnir/zenport)';

export class ImageFetchError extends Error {}

/** Is this address one the server must never be pointed at? */
export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split('.').map(Number) as [number, number];
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (v === 6) {
    const x = ip.toLowerCase();
    if (x === '::' || x === '::1') return true;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(x);
    if (mapped) return isPrivateAddress(mapped[1]!);
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(x);
  }
  return true;
}

export async function assertPublic(url: URL): Promise<void> {
  if (url.protocol !== 'https:') throw new ImageFetchError('only https addresses');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (addrs.length === 0 || addrs.some((a) => isPrivateAddress(a.address))) {
    throw new ImageFetchError('not a public address');
  }
}

/**
 * Wikimedia serves thumbnails only at its standard widths and answers any
 * other width with 400 - and AI answers often carry an odd one. So a
 * Wikimedia thumbnail is asked for at 960px (plenty for a 512px square), and
 * failing that, the original file.
 */
export function imageAddresses(raw: string): string[] {
  const m = /^(https:\/\/upload\.wikimedia\.org\/.+)\/thumb\/(.+?)\/(\d+)px-([^/]+)$/.exec(raw);
  if (!m) return [raw];
  const [, base, file, , name] = m;
  return [`${base}/thumb/${file}/960px-${name}`, `${base}/${file}`];
}

/** Download an image: each known address in turn (see imageAddresses). */
export async function downloadImage(raw: string): Promise<Buffer> {
  const tries = imageAddresses(raw);
  let last: unknown;
  for (const url of tries) {
    try {
      return await downloadOne(url);
    } catch (err) {
      last = err;
      if (!(err instanceof ImageFetchError)) throw err;
    }
  }
  throw last;
}

/** Download one address, following at most three redirects, each checked. */
async function downloadOne(raw: string): Promise<Buffer> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ImageFetchError('not an address');
  }
  const deadline = AbortSignal.timeout(TIMEOUT);
  for (let hop = 0; hop < 4; hop++) {
    await assertPublic(url);
    const res = await fetch(url, {
      redirect: 'manual',
      signal: deadline,
      headers: { 'User-Agent': UA, Accept: 'image/*' },
    });
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get('location');
      if (!next) throw new ImageFetchError('redirect without a destination');
      url = new URL(next, url);
      continue;
    }
    if (!res.ok) throw new ImageFetchError(`answered ${res.status}`);
    const type = res.headers.get('content-type') ?? '';
    if (!/^image\//i.test(type)) throw new ImageFetchError('not an image');
    const length = Number(res.headers.get('content-length') ?? 0);
    if (length > MAX_BYTES) throw new ImageFetchError('too large');
    const chunks: Buffer[] = [];
    let total = 0;
    const reader = res.body?.getReader();
    if (!reader) throw new ImageFetchError('empty answer');
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) {
        await reader.cancel();
        throw new ImageFetchError('too large');
      }
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks);
  }
  throw new ImageFetchError('too many redirects');
}

/**
 * Decode, square and store: returns the file name under `dir`. A picture too
 * small to be a portrait or a logo (under 96px) is turned away.
 */
export async function storeSquare(bytes: Buffer, dir: string): Promise<string> {
  let img: ReturnType<typeof sharp>;
  try {
    img = sharp(bytes, { failOn: 'error' });
    const meta = await img.metadata();
    if (!meta.width || !meta.height || Math.min(meta.width, meta.height) < 96) {
      throw new ImageFetchError('too small');
    }
  } catch (err) {
    if (err instanceof ImageFetchError) throw err;
    throw new ImageFetchError('not a readable image');
  }
  const out = await img
    .rotate()
    .resize(512, 512, { fit: 'cover', position: sharp.strategy.attention })
    .webp({ quality: 84 })
    .toBuffer();
  const name = `${createHash('sha1').update(out).digest('hex').slice(0, 20)}.webp`;
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name), out);
  return name;
}
