import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  classifyYouTubeUrl,
  watchUrl,
  type YouTubeImportPreviewEntry,
  type YouTubeSourceDto,
} from '@zenport/shared';
import type { AppContext } from '../../context.js';

interface SourceRow {
  id: number;
  video_id: string;
  url: string;
  title: string;
  creator: string | null;
  tags: string;
  collection: string | null;
  prov_kind: string;
  prov_ref: string | null;
  added_at: string;
}

function toDto(row: SourceRow): YouTubeSourceDto {
  return {
    id: row.id,
    videoId: row.video_id,
    url: row.url,
    title: row.title,
    creator: row.creator,
    tags: JSON.parse(row.tags),
    collection: row.collection,
    provenance: {
      kind: row.prov_kind as 'manual' | 'playlist' | 'channel',
      ref: row.prov_ref,
    },
    addedAt: row.added_at,
  };
}

const metaSchema = z.object({
  title: z.string().max(300).nullish(),
  creator: z.string().max(200).nullish(),
  tags: z.array(z.string().min(1).max(40)).max(20).default([]),
  collection: z.string().max(120).nullish(),
});

export function registerYouTubeRoutes(app: FastifyInstance, ctx: AppContext): void {
  const { db } = ctx;

  app.get('/api/youtube/sources', async () => {
    const rows = db
      .prepare('SELECT * FROM yt_sources ORDER BY added_at DESC')
      .all() as unknown as SourceRow[];
    return rows.map(toDto);
  });

  // Classify a pasted URL and, for single videos, try public metadata.
  app.post('/api/youtube/resolve', async (req, reply) => {
    const body = z.object({ url: z.string().max(2000) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'url required' });
    const cls = classifyYouTubeUrl(body.data.url);
    if (cls.kind === 'invalid') return { classification: cls, meta: null };
    if (cls.kind === 'video') {
      const meta = await ctx.deps.fetchVideoMeta(cls.videoId).catch(() => null);
      const exists = !!db.prepare('SELECT 1 FROM yt_sources WHERE video_id = ?').get(cls.videoId);
      return { classification: cls, meta, alreadySaved: exists };
    }
    return { classification: cls, meta: null };
  });

  app.post('/api/youtube/sources', async (req, reply) => {
    const body = metaSchema.extend({ url: z.string().max(2000) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid source' });
    const cls = classifyYouTubeUrl(body.data.url);
    if (cls.kind !== 'video') {
      return reply.code(400).send({
        error: 'only individual video URLs can be saved directly - use import for playlists',
      });
    }
    const existing = db.prepare('SELECT * FROM yt_sources WHERE video_id = ?').get(cls.videoId) as
      SourceRow | undefined;
    if (existing) return reply.code(409).send({ error: 'already saved', source: toDto(existing) });

    let title = body.data.title?.trim() || '';
    let creator = body.data.creator?.trim() || null;
    if (!title) {
      const meta = await ctx.deps.fetchVideoMeta(cls.videoId).catch(() => null);
      if (meta) {
        title = meta.title;
        creator = creator ?? meta.author;
      }
    }
    if (!title) {
      return reply.code(422).send({
        error: 'metadata unavailable - give this video a title yourself',
        needsTitle: true,
      });
    }
    const res = db
      .prepare(
        `INSERT INTO yt_sources (video_id, url, title, creator, tags, collection, prov_kind, prov_ref, added_by, added_at)
         VALUES (?, ?, ?, ?, ?, ?, 'manual', NULL, ?, ?)`,
      )
      .run(
        cls.videoId,
        watchUrl(cls.videoId),
        title,
        creator,
        JSON.stringify(body.data.tags),
        body.data.collection ?? null,
        req.user!.id,
        new Date().toISOString(),
      );
    const row = db
      .prepare('SELECT * FROM yt_sources WHERE id = ?')
      .get(Number(res.lastInsertRowid)) as unknown as SourceRow;
    return toDto(row);
  });

  app.patch('/api/youtube/sources/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const exists = db.prepare('SELECT 1 FROM yt_sources WHERE id = ?').get(id);
    if (!exists) return reply.code(404).send({ error: 'source not found' });
    const body = metaSchema.partial().safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid update' });
    const sets: string[] = [];
    const vals: unknown[] = [];
    if (body.data.title !== undefined && body.data.title) {
      sets.push('title = ?');
      vals.push(body.data.title.trim());
    }
    if (body.data.creator !== undefined) {
      sets.push('creator = ?');
      vals.push(body.data.creator);
    }
    if (body.data.tags !== undefined) {
      sets.push('tags = ?');
      vals.push(JSON.stringify(body.data.tags));
    }
    if (body.data.collection !== undefined) {
      sets.push('collection = ?');
      vals.push(body.data.collection);
    }
    if (sets.length > 0) {
      vals.push(id);
      db.prepare(`UPDATE yt_sources SET ${sets.join(', ')} WHERE id = ?`).run(...(vals as never[]));
    }
    return toDto(
      db.prepare('SELECT * FROM yt_sources WHERE id = ?').get(id) as unknown as SourceRow,
    );
  });

  app.delete('/api/youtube/sources/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const res = db.prepare('DELETE FROM yt_sources WHERE id = ?').run(id);
    if (res.changes === 0) return reply.code(404).send({ error: 'source not found' });
    return { ok: true };
  });

  app.get('/api/youtube/tooling', async () => ({
    ytdlpAvailable: ctx.deps.listPlaylist !== null,
  }));

  // Metadata-only playlist/channel listing via configured yt-dlp. Nothing is
  // downloaded and nothing is saved until the user confirms the preview.
  app.post('/api/youtube/import/preview', async (req, reply) => {
    const body = z.object({ url: z.string().max(2000) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'url required' });
    if (!ctx.deps.listPlaylist) {
      return reply.code(409).send({
        error: 'playlist import needs yt-dlp, which is not configured on this server',
      });
    }
    const cls = classifyYouTubeUrl(body.data.url);
    if (cls.kind !== 'playlist' && cls.kind !== 'channel') {
      return reply.code(400).send({ error: 'paste a playlist or channel URL to import' });
    }
    try {
      const listed = await ctx.deps.listPlaylist(
        cls.kind === 'playlist'
          ? { kind: 'playlist', value: cls.playlistId }
          : { kind: 'channel', value: cls.channelRef },
      );
      const entries: YouTubeImportPreviewEntry[] = listed.map((e) => ({
        videoId: e.videoId,
        title: e.title,
        creator: e.creator,
        alreadySaved: !!db.prepare('SELECT 1 FROM yt_sources WHERE video_id = ?').get(e.videoId),
      }));
      return {
        kind: cls.kind,
        ref: cls.kind === 'playlist' ? cls.playlistId : cls.channelRef,
        entries,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'listing failed';
      return reply.code(502).send({ error: message });
    }
  });

  app.post('/api/youtube/import/commit', async (req, reply) => {
    const body = z
      .object({
        kind: z.enum(['playlist', 'channel']),
        ref: z.string().max(200),
        collection: z.string().max(120).nullish(),
        tags: z.array(z.string().min(1).max(40)).max(20).default([]),
        entries: z
          .array(
            z.object({
              videoId: z.string().regex(/^[A-Za-z0-9_-]{11}$/),
              title: z.string().min(1).max(300),
              creator: z.string().max(200).nullish(),
            }),
          )
          .min(1)
          .max(500),
      })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid import' });
    const insert = db.prepare(
      `INSERT INTO yt_sources (video_id, url, title, creator, tags, collection, prov_kind, prov_ref, added_by, added_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(video_id) DO NOTHING`,
    );
    let added = 0;
    let skipped = 0;
    for (const entry of body.data.entries) {
      const res = insert.run(
        entry.videoId,
        watchUrl(entry.videoId),
        entry.title,
        entry.creator ?? null,
        JSON.stringify(body.data.tags),
        body.data.collection ?? null,
        body.data.kind,
        body.data.ref,
        req.user!.id,
        new Date().toISOString(),
      );
      if (res.changes > 0) added++;
      else skipped++;
    }
    return { added, skipped };
  });
}
