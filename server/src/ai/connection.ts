/**
 * Which AI a person's request runs on: their own active connection, else the
 * one the owner shares with everyone here (if they chose to). Keys are sealed
 * at rest (secret.ts) and opened only for the call.
 */
import { AI_FEATURES, type AiFeature, type AiProvider } from '@zenport/shared';
import type { Db } from '../db/index.js';
import type { AiTarget } from './providers.js';
import { openSecret } from './secret.js';

export interface KeyRow {
  provider: AiProvider;
  api_key_enc: string | null;
  key_hint: string | null;
  base_url: string | null;
  model: string;
}

export function connections(db: Db, userId: number): KeyRow[] {
  return db
    .prepare(
      'SELECT provider, api_key_enc, key_hint, base_url, model FROM ai_keys WHERE user_id = ? ORDER BY updated_at DESC',
    )
    .all(userId) as unknown as KeyRow[];
}

export function activeProvider(db: Db, userId: number): AiProvider | null {
  const r = db.prepare('SELECT provider FROM ai_active WHERE user_id = ?').get(userId) as
    { provider: AiProvider } | undefined;
  return r?.provider ?? null;
}

export function activeRow(db: Db, userId: number): KeyRow | null {
  const p = activeProvider(db, userId);
  return p ? (connections(db, userId).find((c) => c.provider === p) ?? null) : null;
}

/** The owner who shares their AI with everyone here, if anyone does. */
export function sharedOwner(db: Db): { userId: number; name: string } | null {
  const v = db.prepare("SELECT value FROM app_settings WHERE key = 'ai_shared_by'").get() as
    { value: string } | undefined;
  if (!v) return null;
  const owner = db
    .prepare(
      `SELECT u.id, COALESCE(u.display_name, u.username) AS name FROM users u
       JOIN ai_active a ON a.user_id = u.id WHERE u.id = ? AND u.role = 'admin'`,
    )
    .get(Number(v.value)) as { id: number; name: string } | undefined;
  return owner ? { userId: owner.id, name: owner.name } : null;
}

export function toTarget(row: KeyRow, secret: string): AiTarget | null {
  const apiKey = row.api_key_enc ? openSecret(row.api_key_enc, secret) : '';
  if (apiKey === null) return null;
  return { provider: row.provider, apiKey, baseUrl: row.base_url, model: row.model };
}

/** What the sharing admin opened their AI for (everything, until they choose). */
export function sharedFeatures(db: Db): AiFeature[] {
  const v = db.prepare("SELECT value FROM app_settings WHERE key = 'ai_shared_features'").get() as
    { value: string } | undefined;
  const all = AI_FEATURES.map((f) => f.id) as AiFeature[];
  if (!v) return all;
  try {
    const list = JSON.parse(v.value) as string[];
    return all.filter((f) => list.includes(f));
  } catch {
    return all;
  }
}

/**
 * What this person's AI request runs on, or null when there is nothing.
 * Their own connection first; else the admin's shared one - for a `feature`
 * only when the admin opened sharing for it (admin-only work passes none).
 */
export function targetFor(
  db: Db,
  secret: string,
  userId: number,
  feature?: AiFeature,
): AiTarget | null {
  const own = activeRow(db, userId);
  if (own) return toTarget(own, secret);
  const shared = sharedOwner(db);
  if (shared && feature && !sharedFeatures(db).includes(feature)) return null;
  const theirs = shared ? activeRow(db, shared.userId) : null;
  return theirs ? toTarget(theirs, secret) : null;
}

/**
 * An OpenAI key to speak with (Made for you): this person's own OpenAI
 * connection - active or not - else the sharing admin's, when they opened
 * sharing for it. Null when there is none.
 */
export function speechKeyFor(db: Db, secret: string, userId: number): string | null {
  const own = connections(db, userId).find((r) => r.provider === 'openai');
  if (own?.api_key_enc) return openSecret(own.api_key_enc, secret);
  const shared = sharedOwner(db);
  if (!shared || shared.userId === userId || !sharedFeatures(db).includes('sits')) return null;
  const theirs = connections(db, shared.userId).find((r) => r.provider === 'openai');
  return theirs?.api_key_enc ? openSecret(theirs.api_key_enc, secret) : null;
}
