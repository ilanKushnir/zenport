import { promises as fs } from 'node:fs';
import path from 'node:path';
import { naturalCompare } from '@zenport/shared';
import { classifyExt, isJunkName, type FileKind } from './classify.js';

export interface WalkedFile {
  /** Posix-style path relative to the scanned root. */
  relPath: string;
  name: string;
  ext: string;
  kind: FileKind;
  sizeBytes: number;
  /** Last modified, ms since the epoch - with the size, says when a fingerprint is stale. */
  mtimeMs?: number;
}

export interface WalkResult {
  ok: boolean;
  files: WalkedFile[];
  warnings: string[];
  ignored: number;
}

const MAX_DEPTH = 24;

/**
 * Recursively inventory a library root without ever modifying it and without
 * ever following a symlink outside the root. Containment is enforced with
 * realpath comparison on every directory and symlinked file, so `../` tricks
 * and symlink chains cannot escape. Results are naturally ordered and
 * deterministic.
 */
export async function safeWalk(
  rootPath: string,
  onFile?: (count: number) => void,
): Promise<WalkResult> {
  const warnings: string[] = [];
  const files: WalkedFile[] = [];
  let ignored = 0;

  let rootReal: string;
  try {
    rootReal = await fs.realpath(rootPath);
    const st = await fs.stat(rootReal);
    if (!st.isDirectory()) throw new Error('not a directory');
  } catch {
    return { ok: false, files: [], warnings: [`library root is not readable`], ignored: 0 };
  }

  const contained = (realTarget: string): boolean =>
    realTarget === rootReal || realTarget.startsWith(rootReal + path.sep);

  async function visit(absDir: string, relDir: string, depth: number): Promise<void> {
    if (depth > MAX_DEPTH) {
      warnings.push(`skipped "${relDir}": nested deeper than ${MAX_DEPTH} levels`);
      return;
    }
    let entries;
    try {
      entries = await fs.readdir(absDir, { withFileTypes: true });
    } catch {
      warnings.push(`could not read folder "${relDir || '.'}"`);
      return;
    }
    entries.sort((a, b) => naturalCompare(a.name, b.name));
    for (const entry of entries) {
      const name = entry.name;
      if (isJunkName(name)) {
        ignored++;
        continue;
      }
      const abs = path.join(absDir, name);
      const rel = relDir ? `${relDir}/${name}` : name;

      let isDir = entry.isDirectory();
      let isFile = entry.isFile();
      if (entry.isSymbolicLink()) {
        // Resolve and verify the target stays inside the root before use.
        let real: string;
        try {
          real = await fs.realpath(abs);
        } catch {
          warnings.push(`broken symlink ignored: "${rel}"`);
          continue;
        }
        if (!contained(real)) {
          warnings.push(`symlink outside the library root ignored: "${rel}"`);
          continue;
        }
        try {
          const st = await fs.stat(abs);
          isDir = st.isDirectory();
          isFile = st.isFile();
        } catch {
          continue;
        }
      }

      if (isDir) {
        await visit(abs, rel, depth + 1);
        continue;
      }
      if (!isFile) continue;

      const dot = name.lastIndexOf('.');
      const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
      const kind = classifyExt(ext);
      if (kind === null) {
        ignored++;
        continue;
      }
      let sizeBytes = 0;
      let mtimeMs = 0;
      try {
        const st = await fs.stat(abs);
        sizeBytes = st.size;
        mtimeMs = Math.floor(st.mtimeMs);
      } catch {
        warnings.push(`could not stat "${rel}"`);
        continue;
      }
      files.push({ relPath: rel, name, ext, kind, sizeBytes, mtimeMs });
      onFile?.(files.length);
    }
  }

  await visit(rootReal, '', 0);
  files.sort((a, b) => naturalCompare(a.relPath, b.relPath));
  return { ok: true, files, warnings, ignored };
}
