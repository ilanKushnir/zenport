/**
 * Sized covers.
 *
 * A cover arrives at whatever size it was saved at - a 3000px scan in the
 * folder, a 600px picture in the tags - and a shelf of them on a phone is
 * megabytes the reader never sees. Covers are served at a few fixed widths
 * instead, as WebP, cached under the data dir next to the extracted ones.
 *
 * The 32px width is the placeholder: a few hundred bytes the page shows
 * blurred at once, so a cover fades from soft to sharp instead of popping in.
 */
import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

export const COVER_WIDTHS = [32, 320, 640, 1024] as const;
export type CoverWidth = (typeof COVER_WIDTHS)[number];

export function parseCoverWidth(raw: unknown): CoverWidth | null {
  const n = Number(raw);
  return (COVER_WIDTHS as readonly number[]).includes(n) ? (n as CoverWidth) : null;
}

// libvips is multi-threaded already; a page of 40 covers should queue, not
// fork 40 decoders at once.
const MAX_PARALLEL = 3;
let running = 0;
const waiting: (() => void)[] = [];
async function slot<T>(fn: () => Promise<T>): Promise<T> {
  if (running >= MAX_PARALLEL) await new Promise<void>((r) => waiting.push(r));
  running++;
  try {
    return await fn();
  } finally {
    running--;
    waiting.shift()?.();
  }
}

const inFlight = new Map<string, Promise<string | null>>();

/**
 * Path of the cover at `width`, generating it if the cache is missing or older
 * than the source. Null when the source cannot be decoded - the caller then
 * serves the original.
 */
export function sizedCover(
  srcAbs: string,
  cacheDir: string,
  assetId: string,
  width: CoverWidth,
): Promise<string | null> {
  const out = path.join(cacheDir, `${assetId}-${width}.webp`);
  const pending = inFlight.get(out);
  if (pending) return pending;
  const job = (async () => {
    try {
      const [src, cached] = await Promise.all([stat(srcAbs), stat(out).catch(() => null)]);
      if (cached && cached.mtimeMs >= src.mtimeMs) return out;
      await mkdir(cacheDir, { recursive: true });
      await slot(() =>
        sharp(srcAbs, { failOn: 'none' })
          .rotate()
          .resize(width, width, { fit: 'cover', withoutEnlargement: true })
          .webp({ quality: width <= 32 ? 45 : 80 })
          .toFile(out),
      );
      return out;
    } catch {
      return null;
    } finally {
      inFlight.delete(out);
    }
  })();
  inFlight.set(out, job);
  return job;
}
