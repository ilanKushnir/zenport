/**
 * AI agents that act for a person (a Hermes, Claude or Codex assistant).
 *
 * The owner never handles an agent's key. ZenPort gives them a one-time
 * connect code to paste into the agent's chat; the agent trades it for its
 * key over HTTPS (POST /api/agent/connect) and keeps the key itself. A code
 * seen later in a chat log is worth nothing: it dies when redeemed (after a
 * short retry window) or when it expires. Only SHA-256 hashes of codes and
 * keys are stored.
 */
import { createHash, randomBytes } from 'node:crypto';
import type { Role } from '@zenport/shared';
import type { Db } from '../db/index.js';

export const KEY_PREFIX = 'zpa_';
export const CODE_PREFIX = 'zpc_';

/** How long a connect code can be redeemed after it is issued. */
export const CODE_TTL_MS = 24 * 3_600_000;
/**
 * After the first redemption the same code still works this long, so an
 * agent that crashed before storing its key can just retry. Each redemption
 * mints a new key, so only the last key an agent was given works.
 */
export const RETRY_GRACE_MS = 10 * 60_000;
/** last_seen_at is written at most this often (not on every call). */
const SEEN_EVERY_MS = 60_000;

const hash = (s: string) => createHash('sha256').update(s).digest('hex');

export interface AgentRow {
  id: number;
  user_id: number;
  name: string;
  journal: number;
  key_hash: string | null;
  key_hint: string | null;
  connect_hash: string | null;
  connect_expires_at: string | null;
  connect_redeemed_at: string | null;
  created_at: string;
  connected_at: string | null;
  last_seen_at: string | null;
}

export interface AgentUser {
  id: number;
  username: string;
  role: Role;
  timezone: string;
}

export class AgentError extends Error {
  constructor(
    public status: number,
    message: string,
    public code: string,
  ) {
    super(message);
  }
}

export function listAgents(db: Db, userId: number): AgentRow[] {
  return db
    .prepare('SELECT * FROM agents WHERE user_id = ? ORDER BY created_at, id')
    .all(userId) as unknown as AgentRow[];
}

export function ownedAgent(db: Db, id: number, userId: number): AgentRow | undefined {
  return db.prepare('SELECT * FROM agents WHERE id = ? AND user_id = ?').get(id, userId) as
    AgentRow | undefined;
}

export function createAgent(
  db: Db,
  userId: number,
  name: string,
  journal: boolean,
  now = new Date(),
): number {
  const res = db
    .prepare('INSERT INTO agents (user_id, name, journal, created_at) VALUES (?, ?, ?, ?)')
    .run(userId, name, journal ? 1 : 0, now.toISOString());
  return Number(res.lastInsertRowid);
}

/**
 * A fresh connect code for an agent, replacing any earlier one. The agent's
 * current key keeps working until the new code is redeemed, so handing out
 * a new code never breaks a running agent.
 */
export function issueCode(db: Db, agentId: number, now = new Date()) {
  const code = `${CODE_PREFIX}${randomBytes(18).toString('base64url')}`;
  const expiresAt = new Date(now.getTime() + CODE_TTL_MS).toISOString();
  db.prepare(
    `UPDATE agents SET connect_hash = ?, connect_expires_at = ?, connect_redeemed_at = NULL
     WHERE id = ?`,
  ).run(hash(code), expiresAt, agentId);
  return { code, expiresAt };
}

/** Trade a connect code for a new key. */
export function redeemCode(db: Db, code: string, now = new Date()) {
  const agent = code.trim().startsWith(CODE_PREFIX)
    ? (db.prepare('SELECT * FROM agents WHERE connect_hash = ?').get(hash(code.trim())) as
        AgentRow | undefined)
    : undefined;
  if (!agent || !agent.connect_expires_at) {
    throw new AgentError(
      401,
      'Unknown connect code. Ask your person for a new one (ZenPort → Settings → Agents).',
      'invalid_code',
    );
  }
  const spent =
    agent.connect_redeemed_at !== null &&
    now.getTime() - Date.parse(agent.connect_redeemed_at) > RETRY_GRACE_MS;
  if (spent || Date.parse(agent.connect_expires_at) < now.getTime()) {
    throw new AgentError(
      401,
      'This connect code has expired. Ask your person for a new one (ZenPort → Settings → Agents).',
      'code_expired',
    );
  }
  const key = `${KEY_PREFIX}${randomBytes(32).toString('base64url')}`;
  const at = now.toISOString();
  db.prepare(
    `UPDATE agents SET key_hash = ?, key_hint = ?, connect_redeemed_at = ?,
       connected_at = ?, last_seen_at = ? WHERE id = ?`,
  ).run(hash(key), `…${key.slice(-4)}`, agent.connect_redeemed_at ?? at, at, at, agent.id);
  return { agentId: agent.id, key };
}

/** The agent and its owner behind a key, or null for an unknown or revoked key. */
export function verifyKey(
  db: Db,
  key: string,
  now = new Date(),
): { agent: AgentRow; user: AgentUser } | null {
  if (!key.startsWith(KEY_PREFIX)) return null;
  const agent = db.prepare('SELECT * FROM agents WHERE key_hash = ?').get(hash(key)) as
    AgentRow | undefined;
  if (!agent) return null;
  const user = db
    .prepare('SELECT id, username, role, timezone FROM users WHERE id = ?')
    .get(agent.user_id) as AgentUser | undefined;
  if (!user) return null;
  if (!agent.last_seen_at || now.getTime() - Date.parse(agent.last_seen_at) > SEEN_EVERY_MS) {
    db.prepare('UPDATE agents SET last_seen_at = ? WHERE id = ?').run(now.toISOString(), agent.id);
  }
  return { agent, user };
}

/** Cut an agent off: its key stops working and any outstanding code dies. */
export function disconnectAgent(db: Db, agentId: number): void {
  db.prepare(
    `UPDATE agents SET key_hash = NULL, key_hint = NULL, connect_hash = NULL,
       connect_expires_at = NULL, connect_redeemed_at = NULL, connected_at = NULL
     WHERE id = ?`,
  ).run(agentId);
}
