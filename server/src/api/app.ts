import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import { verifySession, type SessionUser } from '../auth/sessions.js';
import { verifyKey, type AgentRow } from '../agents/service.js';
import type { AppContext } from '../context.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerLibraryRoutes } from './routes/library.js';
import { registerEnhanceRoutes } from './routes/enhance.js';
import { registerGuideRoutes } from './routes/guide.js';
import { registerFeaturedRoutes } from './routes/featured.js';
import { registerDiscoverRoutes } from './routes/discover.js';
import { registerCreatorRoutes } from './routes/creators.js';
import { registerSitRoutes } from './routes/sits.js';
import { registerLibrarySourceRoutes } from './routes/libraries.js';
import { registerMediaRoutes } from './routes/media.js';
import { registerPracticeRoutes } from './routes/practice.js';
import { registerPlanRoutes } from './routes/plans.js';
import { registerStatsRoutes } from './routes/stats.js';
import { registerAiRoutes } from './routes/ai.js';
import { registerJournalRoutes } from './routes/journal.js';
import { registerYouTubeRoutes } from './routes/youtube.js';
import { registerPrefsRoutes } from './routes/prefs.js';
import { registerMiscRoutes } from './routes/misc.js';
import { registerInviteRoutes } from './routes/invites.js';
import { registerFriendRoutes } from './routes/friends.js';
import { registerAgentRoutes } from './routes/agents.js';
import { resolveRoots } from '../scanner/roots.js';
import { wantedRoots } from '../library/sources.js';

declare module 'fastify' {
  interface FastifyRequest {
    user: SessionUser | null;
    /** Set when an AI agent calls /api/agent with its key. */
    agent: AgentRow | null;
  }
}

export const SESSION_COOKIE = 'zp_session';

/** Paths reachable without a session. */
const PUBLIC_PATHS = new Set(['/api/health', '/api/setup/status', '/api/setup', '/api/auth/login']);

/** Agent paths reachable without a key: trading a connect code for one, and the skill. */
const AGENT_OPEN_PATHS = new Set(['/api/agent/connect', '/api/agent/skill.md']);

export function buildApp(ctx: AppContext): FastifyInstance {
  // Ids that follow each library's path (see scanner/roots.ts). Everything -
  // scans, media, folders - reads the roots from here on.
  // The libraries in use: the server's fixed ones, and those an admin chose.
  if (!ctx.config.envRoots) ctx.config.envRoots = [...ctx.config.libraryRoots];
  ctx.config.libraryRoots = resolveRoots(ctx.db, wantedRoots(ctx.db, ctx.config));
  const app = Fastify({
    logger: { level: ctx.config.logLevel },
    bodyLimit: 1024 * 1024,
    trustProxy: false,
  });

  app.decorateRequest('user', null);
  app.decorateRequest('agent', null);
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

  // Raw images (a creator's picture, uploaded by an admin); decoded and
  // re-encoded before anything is kept.
  app.addContentTypeParser(
    ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'],
    { parseAs: 'buffer', bodyLimit: 15 * 1024 * 1024 },
    (_req, body, done) => done(null, body),
  );

  app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    // Security headers on everything.
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'same-origin');
    reply.header('X-Frame-Options', 'SAMEORIGIN');

    if (!req.url.startsWith('/api/')) return;

    // AI agents live apart from people: /api/agent takes only a bearer key
    // (never the session cookie, so a browser cannot be tricked into calling
    // it - no CSRF to guard), and the key opens nothing outside /api/agent.
    const path = req.url.split('?')[0] as string;
    if (path.startsWith('/api/agent/')) {
      if (AGENT_OPEN_PATHS.has(path)) return;
      const bearer = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization ?? '')?.[1];
      const found = bearer ? verifyKey(ctx.db, bearer) : null;
      if (!found) {
        return reply.code(401).send(
          bearer
            ? {
                error:
                  'This key does not work any more. Ask your person for a new connect code (ZenPort -> Settings -> Agents).',
                code: 'invalid_key',
              }
            : { error: 'send Authorization: Bearer <your ZenPort key>', code: 'missing_key' },
        );
      }
      req.user = found.user;
      req.agent = found.agent;
      return;
    }

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

    const route = req.url.split('?')[0] as string;
    // Invitation links are opened by people who have no account yet.
    if (PUBLIC_PATHS.has(route) || route.startsWith('/api/join/')) return;
    if (!req.user) {
      return reply.code(401).send({ error: 'not signed in' });
    }
  });

  // The same line again once the route is known, so no spelling of a path
  // (encoded or doubled slashes) can carry a key past /api/agent or reach an
  // agent route without one.
  app.addHook('preHandler', async (req, reply) => {
    const url = req.routeOptions.url ?? '';
    const agentRoute = url.startsWith('/api/agent/') && !AGENT_OPEN_PATHS.has(url);
    if (agentRoute !== (req.agent !== null)) {
      return reply.code(403).send({ error: 'not allowed', code: 'forbidden' });
    }
  });

  registerAuthRoutes(app, ctx);
  registerLibraryRoutes(app, ctx);
  registerMediaRoutes(app, ctx);
  registerPracticeRoutes(app, ctx);
  registerPlanRoutes(app, ctx);
  registerStatsRoutes(app, ctx);
  registerAiRoutes(app, ctx);
  registerEnhanceRoutes(app, ctx);
  registerGuideRoutes(app, ctx);
  registerFeaturedRoutes(app, ctx);
  registerDiscoverRoutes(app, ctx);
  registerCreatorRoutes(app, ctx);
  registerSitRoutes(app, ctx);
  registerLibrarySourceRoutes(app, ctx);
  registerJournalRoutes(app, ctx);
  registerYouTubeRoutes(app, ctx);
  registerPrefsRoutes(app, ctx);
  registerMiscRoutes(app, ctx);
  registerInviteRoutes(app, ctx);
  registerFriendRoutes(app, ctx);
  registerAgentRoutes(app, ctx);

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
