import { readFileSync } from 'node:fs';
import path from 'node:path';

export interface LibraryRootConfig {
  id: number;
  path: string;
  label: string;
}

export interface Config {
  host: string;
  port: number;
  dataDir: string;
  libraryRoots: LibraryRootConfig[];
  sessionSecret: string;
  sessionDays: number;
  trustHttps: boolean;
  setupToken: string | null;
  scanIntervalMinutes: number;
  ytdlpPath: string | null;
  transcribeUrl: string | null;
  transcribeApiKey: string | null;
  transcribeModel: string;
  logLevel: string;
  webDistDir: string | null;
}

/** Read ZP_FOO or the ZP_FOO_FILE variant (for Docker secrets). */
function envValue(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const file = env[`${key}_FILE`];
  if (file) {
    try {
      return readFileSync(file, 'utf8').trim();
    } catch {
      throw new Error(`${key}_FILE points at an unreadable file`);
    }
  }
  const v = env[key];
  return v === undefined || v === '' ? undefined : v;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const dataDir = envValue(env, 'ZP_DATA_DIR') ?? './data';
  const libDirs = envValue(env, 'ZP_LIBRARY_DIRS') ?? '';
  const libraryRoots: LibraryRootConfig[] = libDirs
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((p, i) => ({ id: i, path: p, label: path.basename(p) || `Library ${i + 1}` }));

  const sessionSecret = envValue(env, 'ZP_SESSION_SECRET') ?? '';
  if (env.NODE_ENV === 'production' && sessionSecret.length < 32) {
    throw new Error('ZP_SESSION_SECRET must be set (>= 32 chars) in production');
  }

  return {
    host: envValue(env, 'ZP_HOST') ?? '127.0.0.1',
    port: Number(envValue(env, 'ZP_PORT') ?? 8484),
    dataDir,
    libraryRoots,
    sessionSecret: sessionSecret || 'dev-only-secret-change-me-0123456789abcdef',
    sessionDays: Number(envValue(env, 'ZP_SESSION_DAYS') ?? 30),
    trustHttps: envValue(env, 'ZP_TRUST_HTTPS') === '1',
    setupToken: envValue(env, 'ZP_SETUP_TOKEN') ?? null,
    scanIntervalMinutes: Number(envValue(env, 'ZP_SCAN_INTERVAL_MINUTES') ?? 60),
    ytdlpPath: envValue(env, 'ZP_YTDLP_PATH') ?? null,
    transcribeUrl: envValue(env, 'ZP_TRANSCRIBE_URL') ?? null,
    transcribeApiKey: envValue(env, 'ZP_TRANSCRIBE_API_KEY') ?? null,
    transcribeModel: envValue(env, 'ZP_TRANSCRIBE_MODEL') ?? 'whisper-1',
    logLevel: envValue(env, 'ZP_LOG_LEVEL') ?? 'info',
    webDistDir: envValue(env, 'ZP_WEB_DIST') ?? null,
  };
}
