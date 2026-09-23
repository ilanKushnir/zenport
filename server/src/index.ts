import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from './api/app.js';
import { loadConfig } from './config.js';
import { openDb } from './db/index.js';
import { buildDeps } from './deps.js';
import { runScan } from './scanner/scan.js';

const here = path.dirname(fileURLToPath(import.meta.url));

function findWebDist(): string | null {
  const candidates = [
    path.resolve(here, '../../web/dist'),
    path.resolve(here, '../../../web/dist'),
  ];
  return candidates.find((c) => existsSync(path.join(c, 'index.html'))) ?? null;
}

function readVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(path.resolve(here, '../package.json'), 'utf8')) as {
      version?: string;
    };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

async function main(): Promise<void> {
  const config = loadConfig();
  if (!config.webDistDir) config.webDistDir = findWebDist();
  const db = openDb(path.join(config.dataDir, 'zenport.db'));
  const deps = buildDeps(config);
  const app = buildApp({ db, config, version: readVersion(), deps });

  await app.listen({ host: config.host, port: config.port });
  app.log.info(
    { roots: config.libraryRoots.map((r) => r.label) },
    `ZenPort listening on ${config.host}:${config.port}`,
  );

  // Initial scan on boot, then on the configured interval.
  const scan = () =>
    runScan(db, config.libraryRoots, { coverCacheDir: path.join(config.dataDir, 'covers') }).catch(
      (err) => app.log.error(err, 'scan failed'),
    );
  void scan();
  if (config.scanIntervalMinutes > 0) {
    const timer = setInterval(scan, config.scanIntervalMinutes * 60_000);
    timer.unref();
  }

  const shutdown = async () => {
    await app.close();
    db.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
