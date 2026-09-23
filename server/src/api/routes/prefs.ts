import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { FavoriteDto, UserPrefsDto } from '@zenport/shared';
import type { AppContext } from '../../context.js';

/** Row shape of user_prefs, before the booleans are widened out of INTEGER. */
interface PrefsRow {
  onboarded_at: string | null;
  accent: string;
  start_page: string;
  daily_goal_minutes: number | null;
  default_timer_minutes: number;
  bell_enabled: number;
  bell_volume: number;
  interval_bell_minutes: number | null;
  autoplay_next: number;
  calm_motion: number;
  ambient_background: number;
  seen_version: string | null;
}

const ACCENTS = ['spectrum', 'amber', 'rose', 'violet'] as const;
const START_PAGES = ['today', 'library'] as const;

const patchSchema = z.object({
  accent: z.enum(ACCENTS).optional(),
  startPage: z.enum(START_PAGES).optional(),
  dailyGoalMinutes: z.number().int().min(1).max(600).nullable().optional(),
  defaultTimerMinutes: z.number().int().min(1).max(180).optional(),
  bellEnabled: z.boolean().optional(),
  bellVolume: z.number().min(0).max(1).optional(),
  intervalBellMinutes: z.number().int().min(1).max(120).nullable().optional(),
  autoplayNext: z.boolean().optional(),
  calmMotion: z.boolean().optional(),
  ambientBackground: z.boolean().optional(),
  seenVersion: z.string().min(1).max(40).optional(),
  /** Set true exactly once, when the welcome flow is finished or skipped. */
  onboarded: z.boolean().optional(),
});

/** Column each patch key writes to. Keeps the UPDATE built from a fixed map. */
const COLUMN: Record<string, string> = {
  accent: 'accent',
  startPage: 'start_page',
  dailyGoalMinutes: 'daily_goal_minutes',
  defaultTimerMinutes: 'default_timer_minutes',
  bellEnabled: 'bell_enabled',
  bellVolume: 'bell_volume',
  intervalBellMinutes: 'interval_bell_minutes',
  autoplayNext: 'autoplay_next',
  calmMotion: 'calm_motion',
  ambientBackground: 'ambient_background',
  seenVersion: 'seen_version',
};

function toDto(row: PrefsRow): UserPrefsDto {
  return {
    onboardedAt: row.onboarded_at,
    accent: (ACCENTS as readonly string[]).includes(row.accent)
      ? (row.accent as UserPrefsDto['accent'])
      : 'spectrum',
    startPage: (START_PAGES as readonly string[]).includes(row.start_page)
      ? (row.start_page as UserPrefsDto['startPage'])
      : 'today',
    dailyGoalMinutes: row.daily_goal_minutes,
    defaultTimerMinutes: row.default_timer_minutes,
    bellEnabled: row.bell_enabled === 1,
    bellVolume: row.bell_volume,
    intervalBellMinutes: row.interval_bell_minutes,
    autoplayNext: row.autoplay_next === 1,
    calmMotion: row.calm_motion === 1,
    ambientBackground: row.ambient_background === 1,
    seenVersion: row.seen_version,
  };
}

export function registerPrefsRoutes(app: FastifyInstance, ctx: AppContext): void {
  const { db } = ctx;

  /**
   * Accounts created before migration v3 — and any created by a release that
   * inserts into `users` without touching `user_prefs` — have no row yet.
   * Reading lazily creates it with the schema defaults, so a missing row can
   * never surface as a 500 or as an account that cannot be configured.
   *
   * onboarded_at stays NULL here on purpose: a brand-new account SHOULD see
   * the welcome flow. Only migration v3 backfills a timestamp, and only for
   * accounts that predate onboarding entirely.
   */
  const load = (userId: number): PrefsRow => {
    const read = () =>
      db
        .prepare(
          `SELECT onboarded_at, accent, start_page, daily_goal_minutes, default_timer_minutes,
                  bell_enabled, bell_volume, interval_bell_minutes, autoplay_next,
                  calm_motion, ambient_background, seen_version
           FROM user_prefs WHERE user_id = ?`,
        )
        .get(userId) as PrefsRow | undefined;
    let row = read();
    if (!row) {
      db.prepare('INSERT OR IGNORE INTO user_prefs (user_id) VALUES (?)').run(userId);
      row = read();
    }
    return row!;
  };

  app.get('/api/prefs', async (req): Promise<UserPrefsDto> => toDto(load(req.user!.id)));

  app.patch('/api/prefs', async (req, reply): Promise<UserPrefsDto | { error: string }> => {
    const body = patchSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid preferences' });
    const userId = req.user!.id;
    load(userId); // ensure the row exists before updating it

    const sets: string[] = [];
    const values: (string | number | null)[] = [];
    for (const [key, value] of Object.entries(body.data)) {
      if (key === 'onboarded') continue;
      const col = COLUMN[key];
      if (!col || value === undefined) continue;
      sets.push(`${col} = ?`);
      values.push(typeof value === 'boolean' ? (value ? 1 : 0) : (value as string | number | null));
    }
    // Onboarding is a latch, not a toggle: COALESCE keeps the first timestamp
    // so finishing the flow twice cannot rewrite when this account started.
    if (body.data.onboarded === true) {
      sets.push(`onboarded_at = COALESCE(onboarded_at, strftime('%Y-%m-%dT%H:%M:%SZ','now'))`);
    }
    if (sets.length > 0) {
      sets.push(`updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')`);
      values.push(userId);
      db.prepare(`UPDATE user_prefs SET ${sets.join(', ')} WHERE user_id = ?`).run(...values);
    }
    return toDto(load(userId));
  });

  // --- Favourites -----------------------------------------------------------

  app.get('/api/favorites', async (req): Promise<FavoriteDto[]> => {
    return db
      .prepare(
        'SELECT item_id AS itemId, created_at AS createdAt FROM favorites WHERE user_id = ? ORDER BY created_at DESC',
      )
      .all(req.user!.id) as unknown as FavoriteDto[];
  });

  app.put('/api/favorites/:itemId', async (req, reply) => {
    const itemId = (req.params as { itemId: string }).itemId;
    // Only real library items can be starred — otherwise a typo'd id becomes a
    // permanent orphan row the UI can never show or clear.
    const exists = db.prepare('SELECT 1 FROM items WHERE id = ?').get(itemId);
    if (!exists) return reply.code(404).send({ error: 'no such meditation' });
    db.prepare('INSERT OR IGNORE INTO favorites (user_id, item_id) VALUES (?, ?)').run(
      req.user!.id,
      itemId,
    );
    return { ok: true };
  });

  app.delete('/api/favorites/:itemId', async (req) => {
    db.prepare('DELETE FROM favorites WHERE user_id = ? AND item_id = ?').run(
      req.user!.id,
      (req.params as { itemId: string }).itemId,
    );
    return { ok: true };
  });
}
