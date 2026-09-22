import type { FastifyInstance } from 'fastify';
import type { HealthDto, ServerCapabilitiesDto } from '@zenport/shared';
import type { AppContext } from '../../context.js';

export function registerMiscRoutes(app: FastifyInstance, ctx: AppContext): void {
  const started = Date.now();

  app.get('/api/health', async (): Promise<HealthDto> => ({
    status: 'ok',
    version: ctx.version,
    uptimeSec: Math.round((Date.now() - started) / 1000),
  }));

  app.get('/api/capabilities', async (): Promise<ServerCapabilitiesDto> => {
    let transcriptionHost: string | null = null;
    if (ctx.config.transcribeUrl) {
      try {
        transcriptionHost = new URL(ctx.config.transcribeUrl).host;
      } catch {
        transcriptionHost = null;
      }
    }
    return {
      ytdlpAvailable: ctx.deps.listPlaylist !== null,
      transcriptionEnabled: ctx.deps.transcribe !== null,
      transcriptionHost,
    };
  });
}
