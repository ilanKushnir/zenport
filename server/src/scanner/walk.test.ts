import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { safeWalk } from './walk.js';

let root: string;
let outside: string;

function put(rel: string, content = 'x') {
  const abs = path.join(root, rel);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'zp-walk-'));
  outside = mkdtempSync(path.join(tmpdir(), 'zp-outside-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
});

describe('safeWalk', () => {
  it('inventories nested supported files with relative posix paths', async () => {
    put('Creator/Session/01 intro.mp3');
    put('Creator/Session/cover.jpg');
    put('Creator/Session/notes.pdf');
    const res = await safeWalk(root);
    const rels = res.files.map((f) => f.relPath);
    expect(rels).toContain('Creator/Session/01 intro.mp3');
    expect(rels).toContain('Creator/Session/cover.jpg');
    expect(rels).toContain('Creator/Session/notes.pdf');
    expect(res.files.find((f) => f.relPath.endsWith('.mp3'))?.kind).toBe('audio');
    expect(res.files.find((f) => f.relPath.endsWith('.jpg'))?.kind).toBe('image');
    expect(res.files.find((f) => f.relPath.endsWith('.pdf'))?.kind).toBe('document');
  });

  it('ignores hidden files, junk files, and unsupported extensions without crashing', async () => {
    put('a.mp3');
    put('.DS_Store');
    put('Thumbs.db');
    put('desktop.ini');
    put('._resource-fork.mp3');
    put('.hidden/inside.mp3');
    put('weird.xyz');
    put('archive.zip');
    const res = await safeWalk(root);
    expect(res.files.map((f) => f.relPath)).toEqual(['a.mp3']);
    expect(res.ignored).toBeGreaterThanOrEqual(4);
  });

  it('never follows a symlink that escapes the root', async () => {
    writeFileSync(path.join(outside, 'secret.mp3'), 'secret');
    put('safe.mp3');
    symlinkSync(outside, path.join(root, 'escape-dir'));
    symlinkSync(path.join(outside, 'secret.mp3'), path.join(root, 'escape-file.mp3'));
    const res = await safeWalk(root);
    expect(res.files.map((f) => f.relPath)).toEqual(['safe.mp3']);
    expect(res.warnings.length).toBeGreaterThanOrEqual(1);
  });

  it('follows a symlink that stays inside the root', async () => {
    put('real/target.mp3');
    symlinkSync(path.join(root, 'real'), path.join(root, 'alias'));
    const res = await safeWalk(root);
    const rels = res.files.map((f) => f.relPath);
    expect(rels).toContain('real/target.mp3');
  });

  it('returns deterministic natural ordering', async () => {
    put('b/10.mp3');
    put('b/2.mp3');
    put('a/1.mp3');
    const res1 = await safeWalk(root);
    const res2 = await safeWalk(root);
    expect(res1.files.map((f) => f.relPath)).toEqual(res2.files.map((f) => f.relPath));
    expect(res1.files.map((f) => f.relPath)).toEqual(['a/1.mp3', 'b/2.mp3', 'b/10.mp3']);
  });

  it('reports an unreadable root as an error result, not a crash', async () => {
    await expect(safeWalk(path.join(root, 'does-not-exist'))).resolves.toMatchObject({
      ok: false,
    });
  });
});
