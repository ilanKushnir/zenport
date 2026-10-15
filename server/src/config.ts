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
  /** The libraries in use: those set by ZP_LIBRARY_DIRS, plus any an admin chose (live). */
  libraryRoots: LibraryRootConfig[];
  /** Just the ones ZP_LIBRARY_DIRS sets (fixed by the server's configuration). */
  envRoots?: LibraryRootConfig[];
  /** A mounted folder whose sub-folders an admin may choose as libraries (ZP_LIBRARY_BASE). */
  libraryBase?: string | null;
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
  /** The address people open ZenPort at (ZP_PUBLIC_URL); else read from each request. */
  publicUrl?: string | null;
  /** A direct (LAN) address for AI agents (ZP_AGENT_URL), past CDN bot filters. */
  agentUrl?: string | null;
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

/** An http(s) origin without a trailing slash, or null when unset. */
function origin(v: string | undefined, key: string): string | null {
  if (!v) return null;
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    throw new Error(`${key} must be an http(s) address`);
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error(`${key} must be an http(s) address`);
  }
  return `${u.origin}${u.pathname.replace(/\/+$/, '')}`;
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
    envRoots: [...libraryRoots],
    libraryBase: envValue(env, 'ZP_LIBRARY_BASE') ?? null,
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
    publicUrl: origin(envValue(env, 'ZP_PUBLIC_URL'), 'ZP_PUBLIC_URL'),
    agentUrl: origin(envValue(env, 'ZP_AGENT_URL'), 'ZP_AGENT_URL'),
  };
}
