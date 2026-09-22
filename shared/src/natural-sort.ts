/**
 * Deterministic natural ordering for filenames and titles.
 *
 * Numeric runs compare by magnitude ("2" < "10"), letters compare
 * case-insensitively, and the raw string breaks any remaining tie so the
 * result is a total order — the same input always yields the same output.
 */

const CHUNK = /(\d+)|(\D+)/g;

export function naturalCompare(a: string, b: string): number {
  const ax = a.match(CHUNK) ?? [];
  const bx = b.match(CHUNK) ?? [];
  const len = Math.min(ax.length, bx.length);
  for (let i = 0; i < len; i++) {
    const as = ax[i] as string;
    const bs = bx[i] as string;
    const an = /^\d+$/.test(as);
    const bn = /^\d+$/.test(bs);
    if (an && bn) {
      const diff = Number.parseInt(as, 10) - Number.parseInt(bs, 10);
      if (diff !== 0) return diff < 0 ? -1 : 1;
    } else if (an !== bn) {
      // Numbers sort before letters at the same position.
      return an ? -1 : 1;
    } else {
      const al = as.toLowerCase();
      const bl = bs.toLowerCase();
      if (al !== bl) return al < bl ? -1 : 1;
    }
  }
  if (ax.length !== bx.length) return ax.length - bx.length;
  // Total order: identical when compared loosely, fall back to raw string.
  return a < b ? -1 : a > b ? 1 : 0;
}

export function naturalSort(values: readonly string[]): string[] {
  return [...values].sort(naturalCompare);
}

/**
 * Derive a human title from a filename stem: strip a leading track number
 * plus separator, normalize underscores, and trim. A purely numeric stem is
 * kept verbatim (stripping it would leave nothing).
 */
export function titleFromStem(stem: string): string {
  const cleaned = stem.replace(/_/g, ' ').trim();
  const stripped = cleaned.replace(/^\d+\s*[-–—._)]*\s+/, '').trim();
  if (stripped.length === 0) return cleaned;
  return stripped;
}
