/**
 * One scan at a time, whoever asks - the boot scan, the timer, Rescan, a
 * library added in onboarding - and how far it has got, for a live view.
 */
import path from 'node:path';
import type { ScanProgressDto } from '@zenport/shared';
import type { Config } from '../config.js';
import type { Db } from '../db/index.js';
import { runScan } from './scan.js';

let running: Promise<void> | null = null;
let again = false;
let progress: ScanProgressDto | null = null;

/**
 * Start a scan, or - if one is under way - make sure another follows it, so
 * a change made mid-scan (a library added) is always read.
 */
export function startScan(db: Db, config: Config, onError?: (err: unknown) => void): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  const once = async (): Promise<void> => {
    do {
      again = false;
      progress = null;
      try {
        await runScan(db, config.libraryRoots, {
          coverCacheDir: path.join(config.dataDir, 'covers'),
          onProgress: (p) => {
            progress = p;
          },
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
