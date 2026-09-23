import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import { verifySession, type SessionUser } from '../auth/sessions.js';
import type { AppContext } from '../context.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerLibraryRoutes } from './routes/library.js';
import { registerMediaRoutes } from './routes/media.js';
import { registerPracticeRoutes } from './routes/practice.js';
import { registerPlanRoutes } from './routes/plans.js';
import { registerStatsRoutes } from './routes/stats.js';
import { registerJournalRoutes } from './routes/journal.js';
import { registerYouTubeRoutes } from './routes/youtube.js';
import { registerPrefsRoutes } from './routes/prefs.js';
import { registerMiscRoutes } from './routes/misc.js';

declare module 'fastify' {
  interface FastifyRequest {
    user: SessionUser | null;
  }
}

export const SESSION_COOKIE = 'zp_session';

/** Paths reachable without a session. */
const PUBLIC_PATHS = new Set(['/api/health', '/api/setup/status', '/api/setup', '/api/auth/login']);

export function buildApp(ctx: AppContext): FastifyInstance {
  const app = Fastify({
    logger: { level: ctx.config.logLevel },
    bodyLimit: 1024 * 1024,
    trustProxy: false,
  });

  app.decorateRequest('user', null);
  void app.register(fastifyCookie);

  // Any other declared type: accept an EMPTY body (a POST with nothing in it
  // is a signal, not a payload - rescan, logout, favourites) and reject a
  // non-empty one, since nothing here reads bodies in unknown encodings.
  // Without this a proxy- or browser-supplied content-type on a body-less
  // request was a 415 before the route ever ran.
  app.addContentTypeParser('*', { parseAs: 'buffer' }, (_req, body, done) => {
    if ((body as Buffer).length === 0) return done(null, undefined);
    const err = new Error('unsupported media type') as Error & { statusCode?: number };
    err.statusCode = 415;
    done(err, undefined);
  });

  // Raw-buffer parser for voice note uploads (route enforces its own limits).
  app.addContentTypeParser(
    ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'application/octet-stream'],
    { parseAs: 'buffer', bodyLimit: 30 * 1024 * 1024 },
    (_req, body, done) => done(null, body),
  );

  app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    // Security headers on everything.
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'same-origin');
    reply.header('X-Frame-Options', 'SAMEORIGIN');

    if (!req.url.startsWith('/api/')) return;

    // CSRF: mutations must carry the custom header (a cross-site form or
    // <img> cannot set it), and when a browser sends Origin it must match.
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
      if (req.headers['x-zenport-csrf'] !== '1') {
        return reply.code(403).send({ error: 'missing CSRF header' });
      }
      const origin = req.headers.origin;
      if (origin && origin !== 'null') {
        try {
          const originHost = new URL(origin).host;
          if (originHost !== req.headers.host) {
            return reply.code(403).send({ error: 'cross-origin request rejected' });
          }
        } catch {
          return reply.code(403).send({ error: 'cross-origin request rejected' });
        }
      }
    }

    const token = req.cookies[SESSION_COOKIE];
    req.user = token ? verifySession(ctx.db, token) : null;

    if (PUBLIC_PATHS.has(req.url.split('?')[0] as string)) return;
    if (!req.user) {
      return reply.code(401).send({ error: 'not signed in' });
    }
  });

  registerAuthRoutes(app, ctx);
  registerLibraryRoutes(app, ctx);
  registerMediaRoutes(app, ctx);
  registerPracticeRoutes(app, ctx);
  registerPlanRoutes(app, ctx);
  registerStatsRoutes(app, ctx);
  registerJournalRoutes(app, ctx);
  registerYouTubeRoutes(app, ctx);
  registerPrefsRoutes(app, ctx);
  registerMiscRoutes(app, ctx);

  // Static frontend + SPA fallback (production only; dev uses Vite).
  if (ctx.config.webDistDir) {
    void app.register(fastifyStatic, {
      root: ctx.config.webDistDir,
      wildcard: false,
      index: ['index.html'],
    });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) {
        return reply.code(404).send({ error: 'not found' });
      }
      return reply.sendFile('index.html');
    });
  }

  return app;
}

/** Helper for routes: set (or clear) the session cookie. */
export function sessionCookieOptions(ctx: AppContext) {
  return {
    path: '/',
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: ctx.config.trustHttps,
    maxAge: ctx.config.sessionDays * 86_400,
  };
}
