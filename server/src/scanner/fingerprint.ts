/**
 * A file's fingerprint: what lets ZenPort know a recording again after it
 * moves - to another folder, under another name, or into a library mounted
 * somewhere else.
 *
 * It hashes the size with the first and last 64 KiB. Reading two small
 * windows keeps a scan cheap over SMB even for hour-long videos, and the pair
 * is effectively unique for media: two different recordings that agree on
 * their exact byte length and on both ends do not happen in a real library.
 * A whole-file hash would add nothing but minutes of reading.
 *
 * Retagging a file (new ID3 title, new cover) changes its head and so its
 * fingerprint; the scanner then falls back to name + size, and a file that
 * stays at its path keeps its identity by path regardless.
 */
import { createHash } from 'node:crypto';
import { open } from 'node:fs/promises';

const WINDOW = 64 * 1024;

export async function fingerprintFile(abs: string, size: number): Promise<string | null> {
  let fh: Awaited<ReturnType<typeof open>> | null = null;
  try {
    fh = await open(abs, 'r');
    const hash = createHash('sha256').update(`zp1:${size}:`);
    const head = Buffer.alloc(Math.min(WINDOW, size));
    const { bytesRead } = await fh.read(head, 0, head.length, 0);
    hash.update(head.subarray(0, bytesRead));
    if (size > WINDOW) {
      const n = Math.min(WINDOW, size - WINDOW);
      const tail = Buffer.alloc(n);
      const r = await fh.read(tail, 0, n, size - n);
      hash.update(tail.subarray(0, r.bytesRead));
    }
    return hash.digest('hex').slice(0, 32);
  } catch {
    return null;
  } finally {
    await fh?.close().catch(() => {});
  }
}

/** Run `work` over `inputs`, at most `limit` at a time. */
export async function inPool<T>(
  inputs: T[],
  limit: number,
  work: (input: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const lane = async () => {
    while (next < inputs.length) {
      const i = next++;
      await work(inputs[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, inputs.length) }, lane));
}
