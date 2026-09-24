/**
 * Featured on Today (opt-in, any signed-in person with an AI to use).
 * GET serves the current pick, making a new one when it is due (begun,
 * left unopened STALE_DAYS, or none yet); refresh makes a new one on request.
 */
import type { FastifyInstance } from 'fastify';
import type { FeaturedDto } from '@zenport/shared';
import type { AppContext } from '../../context.js';
import { targetFor } from '../../ai/connection.js';
import { generateFeatured, pickIsDue, readFeatured } from '../../ai/featured.js';
import { AiError } from '../../ai/providers.js';

export function registerFeaturedRoutes(app: FastifyInstance, ctx: AppContext): void {
  const { db, config, deps } = ctx;
  const secret = config.sessionSecret || 'zenport-dev-secret';

  const enabled = (userId: number) =>
    (
      db.prepare('SELECT ai_featured FROM user_prefs WHERE user_id = ?').get(userId) as
        { ai_featured: number } | undefined
    )?.ai_featured === 1;

  const why = (err: unknown) =>
    err instanceof AiError
      ? err.message
      : err instanceof Error && err.name === 'TimeoutError'
        ? 'The AI took too long to answer.'
        : 'Today’s picks could not be made.';

  const answer = async (
    user: { id: number; timezone: string },
    force: boolean,
  ): Promise<FeaturedDto> => {
    const target = targetFor(db, secret, user.id, 'featured');
    const base = { enabled: enabled(user.id), canUse: !!target };
    if (!base.enabled) return { ...base, day: null, picks: [], generatedAt: null };
    let current = readFeatured(db, config, user);
    let error: string | undefined;
    // A new pick only when asked, when this one was begun, when it sat
    // unopened too long - or when there is none to show.
    if ((force || current.picks.length === 0 || pickIsDue(db, user.id)) && target) {
      try {
        await generateFeatured(db, config, deps.ai, target, user);
        current = readFeatured(db, config, user);
      } catch (err) {
        error = why(err);
      }
    }
    return {
      ...base,
      day: current.day,
      picks: current.picks,
      generatedAt: current.generatedAt,
      ...(error ? { error } : {}),
    };
  };

  app.get('/api/ai/featured', async (req) => answer(req.user!, false));
  app.post('/api/ai/featured/refresh', async (req) => answer(req.user!, true));
}
