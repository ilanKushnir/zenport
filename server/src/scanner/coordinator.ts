/**
 * One scan at a time, whoever asks - the boot scan, the timer, Rescan, a
 * library added in onboarding - and how far it has got, for a live view.
 */
import path from 'node:path';
import type { ScanProgressDto } from '@zenport/shared';
import type { Config } from '../config.js';
import type { Db } from '../db/index.js';
import { fillDurations } from './duration.js';
import { runScan, type ScanOptions } from './scan.js';

let running: Promise<void> | null = null;
let again = false;
let progress: ScanProgressDto | null = null;

/**
 * Start a scan, or - if one is under way - make sure another follows it, so
 * a change made mid-scan (a library added) is always read.
 */
export function startScan(
  db: Db,
  config: Config,
  onError?: (err: unknown) => void,
  idHints?: ScanOptions['idHints'],
): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  const once = async (): Promise<void> => {
    let hints = idHints;
    do {
      again = false;
      progress = null;
      try {
        await runScan(db, config.libraryRoots, {
          idHints: hints,
          coverCacheDir: path.join(config.dataDir, 'covers'),
          onProgress: (p) => {
            progress = p;
          },
        });
        hints = undefined;
        // Then how long each new recording is, from its header.
        const last = progress as ScanProgressDto | null;
        await fillDurations(db, config.libraryRoots, (done, total) => {
          progress = last
            ? { ...last, phase: 'lengths', done, total }
            : {
                phase: 'lengths',
                root: '',
                rootIndex: 0,
                roots: config.libraryRoots.length,
                files: 0,
                items: 0,
                done,
                total,
                creators: [],
                latest: [],
              };
        });
      } catch (err) {
        onError?.(err);
      }
    } while (again);
  };
  running = once().finally(() => {
    running = null;
    progress = null;
  });
  return running;
}

export const scanProgress = (): ScanProgressDto | null => progress;
export const isScanning = (): boolean => running !== null;
