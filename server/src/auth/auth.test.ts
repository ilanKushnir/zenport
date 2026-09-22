import { beforeEach, describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './passwords.js';
import { createSession, destroySession, verifySession } from './sessions.js';
import { RateLimiter } from './ratelimit.js';
import { openDb, type Db } from '../db/index.js';

describe('passwords', () => {
  it('hashes and verifies', async () => {
    const hash = await hashPassword('still-waters-run-deep');
    expect(hash).not.toContain('still-waters');
    expect(await verifyPassword('still-waters-run-deep', hash)).toBe(true);
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });

  it('produces unique salts', async () => {
    const a = await hashPassword('same');
    const b = await hashPassword('same');
    expect(a).not.toBe(b);
  });
});

describe('sessions', () => {
  let db: Db;
  beforeEach(() => {
    db = openDb(':memory:');
    db.prepare(
      `INSERT INTO users (id, username, password_hash, role) VALUES (1, 'astra', 'x', 'admin')`,
    ).run();
  });

  it('creates and verifies a session token', () => {
    const token = createSession(db, 1, 30);
    const user = verifySession(db, token);
    expect(user?.id).toBe(1);
    expect(user?.username).toBe('astra');
  });

  it('stores only a hash of the token', () => {
    const token = createSession(db, 1, 30);
    const rows = db.prepare('SELECT token_hash FROM auth_sessions').all() as {
      token_hash: string;
    }[];
    expect(rows.some((r) => r.token_hash === token)).toBe(false);
  });

  it('rejects expired sessions', () => {
    const token = createSession(db, 1, -1);
    expect(verifySession(db, token)).toBeNull();
  });

  it('destroys sessions on logout', () => {
    const token = createSession(db, 1, 30);
    destroySession(db, token);
    expect(verifySession(db, token)).toBeNull();
  });
});

describe('rate limiter', () => {
  it('limits after the allowed attempts within the window', () => {
    const rl = new RateLimiter(3, 60_000);
    const t = 1_000_000;
    expect(rl.tryTake('ip1', t)).toBe(true);
    expect(rl.tryTake('ip1', t + 1)).toBe(true);
    expect(rl.tryTake('ip1', t + 2)).toBe(true);
    expect(rl.tryTake('ip1', t + 3)).toBe(false);
    expect(rl.tryTake('ip2', t + 3)).toBe(true);
  });

  it('resets after the window passes', () => {
    const rl = new RateLimiter(1, 1000);
    expect(rl.tryTake('ip', 0)).toBe(true);
    expect(rl.tryTake('ip', 500)).toBe(false);
    expect(rl.tryTake('ip', 1500)).toBe(true);
  });
});
