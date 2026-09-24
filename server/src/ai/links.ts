/**
 * Is a link real? Every address the AI recommends is visited before anyone
 * sees it - with the same guard as picture fetches (https, public addresses
 * only, each redirect re-checked) - and kept only if the page answers.
 *
 * A site that turns robots away (401, 403, 429) still answered for that
 * address, so it counts; a missing page (404, 410), a server error, or no
 * answer at all does not.
 */
import { assertPublic, UA } from './fetchImage.js';

const TIMEOUT = 8_000;

export async function linkWorks(raw: string): Promise<string | null> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const deadline = AbortSignal.timeout(TIMEOUT);
  try {
    for (let hop = 0; hop < 5; hop++) {
      await assertPublic(url);
      const res = await fetch(url, {
        method: 'GET',
        redirect: 'manual',
        signal: deadline,
        headers: { 'User-Agent': UA, Accept: 'text/html,*/*;q=0.5' },
      });
      await res.body?.cancel().catch(() => {});
      if (res.status >= 300 && res.status < 400) {
        const next = res.headers.get('location');
        if (!next) return null;
        url = new URL(next, url);
        continue;
      }
      if (res.ok || [401, 403, 405, 429].includes(res.status)) return raw;
      return null;
    }
    return null;
  } catch {
    return null;
  }
}

/** Check many at once, a few at a time. */
export async function checkLinks(
  urls: string[],
  concurrency = 6,
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, urls.length) }, async () => {
      while (next < urls.length) {
        const u = urls[next++]!;
        out.set(u, await linkWorks(u));
      }
    }),
  );
  return out;
}
