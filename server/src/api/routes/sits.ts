/**
 * Made for you (any signed-in person with an AI to write and an OpenAI key to
 * speak - their own, or a shared one opened for it): make one, list them,
 * hear a voice, play one in the player, delete one.
 */
import { rm, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  SIT_FEELINGS,
  SIT_FOCI,
  SIT_ITEM_PREFIX,
  SIT_LENGTHS,
  SIT_TITLE,
  SIT_VOICES,
  type MeditationDetailDto,
  type SitsDto,
} from '@zenport/shared';
import type { AppContext } from '../../context.js';
import { speechKeyFor, targetFor } from '../../ai/connection.js';
import { AiError } from '../../ai/providers.js';
import { listSits, makeSit, readSit, sitFile, sitsDir } from '../../ai/sits.js';

const ids = <T extends { id: string }>(xs: readonly T[]) =>
  xs.map((x) => x.id) as [T['id'], ...T['id'][]];

const making = new Set<number>();

export function registerSitRoutes(app: FastifyInstance, ctx: AppContext): void {
  const { db, config, deps } = ctx;
  const secret = config.sessionSecret || 'zenport-dev-secret';

  app.get('/api/ai/sits', async (req): Promise<SitsDto> => ({
    canUse: !!targetFor(db, secret, req.user!.id, 'sits'),
    canSpeak: !!speechKeyFor(db, secret, req.user!.id),
    sits: listSits(db, req.user!.id),
  }));

  app.post('/api/ai/sits', async (req, reply) => {
    const body = z
      .object({
        minutes: z
          .number()
          .int()
          .refine((n) => (SIT_LENGTHS as readonly number[]).includes(n)),
        feelings: z.array(z.enum(ids(SIT_FEELINGS))).max(4),
        focus: z.enum(ids(SIT_FOCI)),
        voice: z.enum(ids(SIT_VOICES)),
        note: z.string().max(600).optional(),
      })
      .safeParse(req.body);
    if (!body.success)
      return reply.code(400).send({ error: 'Choose a length, a focus and a voice.' });
    const userId = req.user!.id;
    const target = targetFor(db, secret, userId, 'sits');
    if (!target) return reply.code(400).send({ error: 'Set up AI first.' });
    const key = speechKeyFor(db, secret, userId);
    if (!key) {
      return reply
        .code(400)
        .send({ error: 'The voice comes from OpenAI - connect an OpenAI key to hear it.' });
    }
    if (making.has(userId)) {
      return reply.code(429).send({ error: 'Your last one is still being made.' });
    }
    making.add(userId);
    try {
      return await makeSit(db, config.dataDir, deps.ai, target, key, req.user!, {
        ...body.data,
        minutes: body.data.minutes as 5 | 10 | 15 | 20,
      });
    } catch (err) {
      if (err instanceof AiError) return reply.code(err.status).send({ error: err.message });
      if (err instanceof Error && err.name === 'TimeoutError') {
        return reply.code(504).send({ error: 'The AI took too long. Try again.' });
      }
      req.log.warn({ err }, 'made-for-you failed');
      return reply.code(502).send({ error: 'It could not be made this time. Try again.' });
    } finally {
      making.delete(userId);
    }
  });

  // The sit as a recording the player can play: one track, served by the media route.
  app.get('/api/ai/sits/:id/item', async (req, reply) => {
    const sit = readSit(db, req.user!.id, (req.params as { id: string }).id);
    if (!sit) return reply.code(404).send({ error: 'not found' });
    const file = sitFile(db, req.user!.id, sit.id)!;
    const item: MeditationDetailDto = {
      id: `${SIT_ITEM_PREFIX}${sit.id}`,
      title: sit.title,
      creator: SIT_TITLE,
      collection: null,
      rootId: -1,
      rootLabel: SIT_TITLE,
      trackCount: 1,
      totalDurationSec: Math.round(sit.durationSec),
      coverId: null,
      documentCount: 0,
      formats: ['mp3'],
      missing: false,
      addedAt: sit.createdAt,
      type: 'meditation',
      typeSource: 'auto',
      hasVideo: false,
      completedCount: 0,
      resumeSec: null,
      practiceCount: sit.sat,
      lastPracticedAt: null,
      breadcrumbs: [],
      tracks: [
        {
          id: `ai-${sit.id}`,
          ord: 1,
          title: sit.title,
          fileName: `${sit.id}.mp3`,
          ext: 'mp3',
          durationSec: Math.round(sit.durationSec),
          missing: false,
          video: false,
          completed: false,
          role: 'practice',
          roleSource: 'auto',
          positionSec: null,
          sizeBytes: file.size,
        },
      ],
      documents: [],
      evidence: [],
      related: [],
      resume: null,
      customOrder: false,
    };
    return item;
  });

  app.delete('/api/ai/sits/:id', async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const f = sitFile(db, req.user!.id, id);
    if (!f) return reply.code(404).send({ error: 'not found' });
    db.prepare('DELETE FROM ai_sits WHERE id = ?').run(id);
    await rm(path.join(sitsDir(config.dataDir), f.file), { force: true });
    return { ok: true };
  });

  // Hear a voice before choosing it: one line, made once and kept.
  app.get('/api/ai/sits/voices/:voice', async (req, reply) => {
    const voice = (req.params as { voice: string }).voice;
    if (!SIT_VOICES.some((v) => v.id === voice))
      return reply.code(404).send({ error: 'not found' });
    const dir = path.join(sitsDir(config.dataDir), 'voices');
    const file = path.join(dir, `${voice}.mp3`);
    let bytes: Buffer | null = await readFile(file).catch(() => null);
    if (!bytes) {
      const key = speechKeyFor(db, secret, req.user!.id);
      if (!key) return reply.code(400).send({ error: 'Connect an OpenAI key to hear the voices.' });
      try {
        bytes = await deps.ai.speak(key, {
          voice,
          text: 'Let your breath settle, just as it is. There is nowhere else you need to be.',
          instructions:
            'Speak as an experienced meditation teacher: slowly, softly and warmly, with calm, low energy.',
        });
      } catch (err) {
        if (err instanceof AiError) return reply.code(err.status).send({ error: err.message });
        throw err;
      }
      await mkdir(dir, { recursive: true });
      await writeFile(file, bytes);
    }
    return reply
      .header('Content-Type', 'audio/mpeg')
      .header('Cache-Control', 'private, max-age=604800')
      .send(bytes);
  });
}
