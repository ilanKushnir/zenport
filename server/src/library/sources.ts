/**
 * Libraries: the folders ZenPort reads. Some are fixed by the server's own
 * configuration (ZP_LIBRARY_DIRS); the rest an admin chooses - in onboarding
 * or under Admin - from inside one mounted folder (ZP_LIBRARY_BASE), so a
 * whole NAS share can be mounted once and its libraries picked in the app.
 *
 * Every chosen path is checked to stay inside the base (real paths, so no
 * symlink leads out). Changing the choice applies at once: the list in use is
 * updated in place and a scan follows.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Config, LibraryRootConfig } from '../config.js';
import type { Db } from '../db/index.js';
import { classifyExt, isJunkName } from '../scanner/classify.js';
import { resolveRoots } from '../scanner/roots.js';

export class SourceError extends Error {}

interface Choice {
  rel_path: string;
  label: string;
}

const choices = (db: Db) =>
  db
    .prepare('SELECT rel_path, label FROM library_choices ORDER BY added_at')
    .all() as unknown as Choice[];

/** The fixed libraries, then the chosen ones (a path only once). */
export function wantedRoots(db: Db, config: Config): LibraryRootConfig[] {
  const out: LibraryRootConfig[] = [...(config.envRoots ?? [])];
  if (config.libraryBase) {
    for (const c of choices(db)) {
      const p = path.join(config.libraryBase, c.rel_path);
      if (!out.some((r) => r.path === p)) out.push({ id: -1, path: p, label: c.label });
    }
  }
  return out;
}

/** Put the wanted libraries in use, keeping each one's lasting id. */
export function applyRoots(db: Db, config: Config): void {
  const next = resolveRoots(db, wantedRoots(db, config));
  config.libraryRoots.splice(0, config.libraryRoots.length, ...next);
}

/** A relative path inside the base, checked: an existing folder that stays inside. */
async function inside(config: Config, rel: string): Promise<{ abs: string; clean: string }> {
  if (!config.libraryBase) throw new SourceError('No folder is mounted to choose libraries from.');
  const clean = rel
    .split('/')
    .filter((s) => s && s !== '.')
    .join('/');
  if (clean.split('/').includes('..')) throw new SourceError('That folder is outside the library.');
  let baseReal: string;
  try {
    baseReal = await fs.realpath(config.libraryBase);
  } catch {
    throw new SourceError('The mounted library folder cannot be read.');
  }
  const abs = path.join(config.libraryBase, clean);
  let real: string;
  try {
    real = await fs.realpath(abs);
    if (!(await fs.stat(real)).isDirectory()) throw new Error('not a folder');
  } catch {
    throw new SourceError('That folder cannot be read.');
  }
  if (real !== baseReal && !real.startsWith(baseReal + path.sep)) {
    throw new SourceError('That folder is outside the library.');
  }
  return { abs, clean };
}

/** Recordings under a folder, counted quickly (enough to show which folders hold some). */
async function countMedia(abs: string, budget: { files: number; until: number }): Promise<number> {
  let n = 0;
  const walk = async (dir: string, depth: number): Promise<void> => {
    if (depth > 8 || budget.files <= 0 || Date.now() > budget.until) return;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (isJunkName(e.name) || e.name.startsWith('.')) continue;
      if (e.isDirectory()) await walk(path.join(dir, e.name), depth + 1);
      else if (e.isFile()) {
        budget.files--;
        const dot = e.name.lastIndexOf('.');
        const kind = classifyExt(dot > 0 ? e.name.slice(dot + 1).toLowerCase() : '');
        if (kind === 'audio') n++;
      }
      if (budget.files <= 0 || Date.now() > budget.until) return;
    }
  };
  await walk(abs, 0);
  return n;
}

export interface BrowseResult {
  rel: string;
  folders: { name: string; rel: string; media: number | null; chosen: boolean; partly: boolean }[];
  capped: boolean;
}

/** The folders in a folder - names only, at once (counting is separate and slower). */
export async function browse(db: Db, config: Config, rel: string): Promise<BrowseResult> {
  const { abs, clean } = await inside(config, rel);
  const entries = (await fs.readdir(abs, { withFileTypes: true }))
    .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !isJunkName(e.name))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  const chosen = new Set(choices(db).map((c) => c.rel_path));
  return {
    rel: clean,
    folders: entries.map((name) => {
      const r = clean ? `${clean}/${name}` : name;
      const hit = counted.get(path.join(abs, name));
      return {
        name,
        rel: r,
        media: hit && Date.now() - hit.at < COUNT_TTL ? hit.n : null,
        chosen: chosen.has(r),
        partly: [...chosen].some((c) => c.startsWith(`${r}/`)),
      };
    }),
    capped: false,
  };
}

// Counting recordings on a network share is slow: each folder's count is
// kept a while, so looking again (or going back) costs nothing.
const COUNT_TTL = 15 * 60_000;
const counted = new Map<string, { n: number; capped: boolean; at: number }>();

/** How many recording files each folder in a folder holds (cached). */
export async function countFolders(
  config: Config,
  rel: string,
): Promise<{ rel: string; counts: Record<string, number>; capped: boolean }> {
  const { abs, clean } = await inside(config, rel);
  const names = (await fs.readdir(abs, { withFileTypes: true }))
    .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !isJunkName(e.name))
    .map((e) => e.name);
  const counts: Record<string, number> = {};
  let capped = false;
  await Promise.all(
    names.map(async (name) => {
      const key = path.join(abs, name);
      const hit = counted.get(key);
      if (hit && Date.now() - hit.at < COUNT_TTL) {
        counts[clean ? `${clean}/${name}` : name] = hit.n;
        capped ||= hit.capped;
        return;
      }
      const budget = { files: 20_000, until: Date.now() + 8000 };
      const n = await countMedia(key, budget);
      const over = budget.files <= 0 || Date.now() > budget.until;
      counted.set(key, { n, capped: over, at: Date.now() });
      counts[clean ? `${clean}/${name}` : name] = n;
      capped ||= over;
    }),
  );
  return { rel: clean, counts, capped };
}

export async function addLibrary(
  db: Db,
  config: Config,
  rel: string,
  label?: string,
): Promise<void> {
  const { clean } = await inside(config, rel);
  if (!clean) throw new SourceError('Choose a folder inside the mount.');
  const folder = clean.split('/').pop() || clean;
  // A folder's name, as a library's: "spiritual" reads as "Spiritual".
  const name = (label?.trim() || folder.charAt(0).toUpperCase() + folder.slice(1)).slice(0, 80);
  db.prepare(
    `INSERT INTO library_choices (rel_path, label, added_at) VALUES (?, ?, ?)
     ON CONFLICT(rel_path) DO UPDATE SET label = excluded.label`,
  ).run(clean, name, new Date().toISOString());
  // A folder inside one already chosen, or holding one, would be read twice.
  db.prepare(
    "DELETE FROM library_choices WHERE rel_path != ? AND (rel_path LIKE ? || '/%' OR ? LIKE rel_path || '/%')",
  ).run(clean, clean, clean);
  applyRoots(db, config);
}

export function renameLibrary(db: Db, config: Config, rel: string, label: string): void {
  const name = label.trim().slice(0, 80);
  if (!name) throw new SourceError('A name is needed.');
  db.prepare('UPDATE library_choices SET label = ? WHERE rel_path = ?').run(name, rel);
  applyRoots(db, config);
}

export function removeLibrary(db: Db, config: Config, rel: string): void {
  db.prepare('DELETE FROM library_choices WHERE rel_path = ?').run(rel);
  applyRoots(db, config);
}

export function listLibraries(db: Db, config: Config) {
  return {
    base: config.libraryBase ?? null,
    fixed: (config.envRoots ?? []).map((r) => ({ label: r.label, path: r.path })),
    chosen: choices(db).map((c) => ({ rel: c.rel_path, label: c.label })),
  };
}
