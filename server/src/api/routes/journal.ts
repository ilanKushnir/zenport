import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { JournalEntryDto, VoiceNoteDto } from '@zenport/shared';
import type { AppContext } from '../../context.js';

const MAX_VOICE_BYTES = 25 * 1024 * 1024;
const VOICE_MIME_EXT: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
};

const entrySchema = z.object({
  sessionId: z.number().int().nullish(),
  meditationId: z.string().nullish(),
  title: z.string().max(200).nullish(),
  body: z.string().max(20_000).default(''),
  mood: z.number().int().min(1).max(5).nullish(),
  tags: z.array(z.string().min(1).max(40)).max(20).default([]),
});

interface EntryRow {
  id: number;
  session_id: number | null;
  item_id: string | null;
  title: string | null;
  body: string;
  mood: number | null;
  tags: string;
  created_at: string;
  updated_at: string;
  med_title: string | null;
}

interface VoiceRow {
  id: string;
  entry_id: number;
  mime: string;
  size_bytes: number;
  duration_sec: number | null;
  transcript: string | null;
  transcript_status: string;
  transcript_error: string | null;
  file_name: string;
}

export function registerJournalRoutes(app: FastifyInstance, ctx: AppContext): void {
  const { db, config } = ctx;

  const voiceDto = (v: VoiceRow | undefined): VoiceNoteDto | null =>
    v
      ? {
          id: v.id,
          durationSec: v.duration_sec,
          sizeBytes: v.size_bytes,
          mime: v.mime,
          transcript: v.transcript,
          transcriptStatus: v.transcript_status as VoiceNoteDto['transcriptStatus'],
          transcriptError: v.transcript_error,
        }
      : null;

  const toDto = (row: EntryRow): JournalEntryDto => {
    const voice = db.prepare('SELECT * FROM voice_notes WHERE entry_id = ?').get(row.id) as
      VoiceRow | undefined;
    return {
      id: row.id,
      sessionId: row.session_id,
      meditationId: row.item_id,
      meditationTitle: row.med_title,
      title: row.title,
      body: row.body,
      mood: row.mood,
      tags: JSON.parse(row.tags),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      voice: voiceDto(voice),
    };
  };

  const SELECT = `SELECT j.*, i.title AS med_title FROM journal_entries j
    LEFT JOIN items i ON i.id = j.item_id`;

  const owned = (id: number, userId: number): EntryRow | undefined =>
    db.prepare(`${SELECT} WHERE j.id = ? AND j.user_id = ?`).get(id, userId) as
      EntryRow | undefined;

  app.get('/api/journal', async (req) => {
    const rows = db
      .prepare(`${SELECT} WHERE j.user_id = ? ORDER BY j.created_at DESC LIMIT 500`)
      .all(req.user!.id) as unknown as EntryRow[];
    return rows.map(toDto);
  });

  app.post('/api/journal', async (req, reply) => {
    const body = entrySchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid journal entry' });
    const now = new Date().toISOString();
    const e = body.data;
    // A linked session must belong to the writer.
    if (e.sessionId != null) {
      const ok = db
        .prepare('SELECT 1 FROM practice_sessions WHERE id = ? AND user_id = ?')
        .get(e.sessionId, req.user!.id);
      if (!ok) return reply.code(400).send({ error: 'unknown session' });
    }
    const res = db
      .prepare(
        `INSERT INTO journal_entries (user_id, session_id, item_id, title, body, mood, tags, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        req.user!.id,
        e.sessionId ?? null,
        e.meditationId ?? null,
        e.title ?? null,
        e.body,
        e.mood ?? null,
        JSON.stringify(e.tags),
        now,
        now,
      );
    const row = owned(Number(res.lastInsertRowid), req.user!.id)!;
    return toDto(row);
  });

  app.patch('/api/journal/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (!owned(id, req.user!.id)) return reply.code(404).send({ error: 'entry not found' });
    const body = entrySchema.partial().safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid journal entry' });
    const e = body.data;
    const sets: string[] = ['updated_at = ?'];
    const vals: unknown[] = [new Date().toISOString()];
    if (e.title !== undefined) {
      sets.push('title = ?');
      vals.push(e.title);
    }
    if (e.body !== undefined) {
      sets.push('body = ?');
      vals.push(e.body);
    }
    if (e.mood !== undefined) {
      sets.push('mood = ?');
      vals.push(e.mood);
    }
    if (e.tags !== undefined) {
      sets.push('tags = ?');
      vals.push(JSON.stringify(e.tags));
    }
    vals.push(id);
    db.prepare(`UPDATE journal_entries SET ${sets.join(', ')} WHERE id = ?`).run(
      ...(vals as never[]),
    );
    return toDto(owned(id, req.user!.id)!);
  });

  app.delete('/api/journal/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (!owned(id, req.user!.id)) return reply.code(404).send({ error: 'entry not found' });
    const voice = db
      .prepare('SELECT file_name, user_id FROM voice_notes WHERE entry_id = ?')
      .get(id) as { file_name: string; user_id: number } | undefined;
    db.prepare('DELETE FROM journal_entries WHERE id = ?').run(id);
    if (voice) {
      await removeVoiceFile(config.dataDir, voice.user_id, voice.file_name);
    }
    return { ok: true };
  });

  // Export one's own journal as Markdown (private data belongs to its owner).
  app.get('/api/journal/export', async (req, reply) => {
    const rows = db
      .prepare(`${SELECT} WHERE j.user_id = ? ORDER BY j.created_at`)
      .all(req.user!.id) as unknown as EntryRow[];
    const lines: string[] = ['# ZenPort journal export', ''];
    for (const row of rows) {
      const entry = toDto(row);
      lines.push(`## ${entry.createdAt.slice(0, 10)}${entry.title ? ` — ${entry.title}` : ''}`);
      if (entry.meditationTitle) lines.push(`*After: ${entry.meditationTitle}*`);
      if (entry.mood) lines.push(`*Settledness: ${entry.mood}/5*`);
      if (entry.tags.length) lines.push(`*Tags: ${entry.tags.join(', ')}*`);
      lines.push('', entry.body, '');
      if (entry.voice?.transcript) {
        lines.push('> Voice note transcript:', `> ${entry.voice.transcript}`, '');
      }
    }
    reply
      .type('text/markdown; charset=utf-8')
      .header('Content-Disposition', 'attachment; filename="zenport-journal.md"');
    return lines.join('\n');
  });

  // --- Voice notes ---

  app.post('/api/journal/:id/voice', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (!owned(id, req.user!.id)) return reply.code(404).send({ error: 'entry not found' });
    const mime = (req.headers['content-type'] ?? '').split(';')[0]?.trim() ?? '';
    const ext = VOICE_MIME_EXT[mime];
    if (!ext) return reply.code(415).send({ error: 'unsupported audio type' });
    const buf = req.body as Buffer;
    if (!Buffer.isBuffer(buf) || buf.length === 0) {
      return reply.code(400).send({ error: 'empty recording' });
    }
    if (buf.length > MAX_VOICE_BYTES) return reply.code(413).send({ error: 'recording too large' });
    const durationSec = Number((req.headers['x-zp-duration'] as string) ?? '') || null;

    // One voice note per entry: replace any previous one.
    const prev = db.prepare('SELECT id, file_name FROM voice_notes WHERE entry_id = ?').get(id) as
      { id: string; file_name: string } | undefined;
    if (prev) {
      db.prepare('DELETE FROM voice_notes WHERE id = ?').run(prev.id);
      await removeVoiceFile(config.dataDir, req.user!.id, prev.file_name);
    }

    const voiceId = randomUUID();
    const fileName = `${voiceId}.${ext}`;
    const dir = path.join(config.dataDir, 'voice', String(req.user!.id));
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, fileName), buf);
    db.prepare(
      `INSERT INTO voice_notes (id, entry_id, user_id, file_name, mime, size_bytes, duration_sec, transcript_status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'none', ?)`,
    ).run(
      voiceId,
      id,
      req.user!.id,
      fileName,
      mime,
      buf.length,
      durationSec,
      new Date().toISOString(),
    );
    return toDto(owned(id, req.user!.id)!);
  });

  app.delete('/api/journal/voice/:vid', async (req, reply) => {
    const vid = (req.params as { vid: string }).vid;
    const row = db
      .prepare('SELECT file_name FROM voice_notes WHERE id = ? AND user_id = ?')
      .get(vid, req.user!.id) as { file_name: string } | undefined;
    if (!row) return reply.code(404).send({ error: 'voice note not found' });
    db.prepare('DELETE FROM voice_notes WHERE id = ?').run(vid);
    await removeVoiceFile(config.dataDir, req.user!.id, row.file_name);
    return { ok: true };
  });

  // Optional transcription: only runs when the self-hoster configured an
  // endpoint, only when the user asks, never silently.
  app.post('/api/journal/voice/:vid/transcribe', async (req, reply) => {
    const vid = (req.params as { vid: string }).vid;
    const row = db
      .prepare('SELECT file_name, mime FROM voice_notes WHERE id = ? AND user_id = ?')
      .get(vid, req.user!.id) as { file_name: string; mime: string } | undefined;
    if (!row) return reply.code(404).send({ error: 'voice note not found' });
    if (!ctx.deps.transcribe) {
      return reply.code(409).send({ error: 'transcription is not configured on this server' });
    }
    db.prepare(
      `UPDATE voice_notes SET transcript_status = 'pending', transcript_error = NULL WHERE id = ?`,
    ).run(vid);
    try {
      const abs = path.join(config.dataDir, 'voice', String(req.user!.id), row.file_name);
      const buf = await fs.readFile(abs);
      const text = await ctx.deps.transcribe(buf, row.mime, row.file_name);
      db.prepare(
        `UPDATE voice_notes SET transcript = ?, transcript_status = 'done' WHERE id = ?`,
      ).run(text, vid);
      return { status: 'done', transcript: text };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'transcription failed';
      db.prepare(
        `UPDATE voice_notes SET transcript_status = 'error', transcript_error = ? WHERE id = ?`,
      ).run(message, vid);
      return reply.code(502).send({ error: message });
    }
  });
}

async function removeVoiceFile(dataDir: string, userId: number, fileName: string): Promise<void> {
  // fileName is server-generated (uuid.ext); defensive basename anyway.
  const safe = path.basename(fileName);
  try {
    await fs.unlink(path.join(dataDir, 'voice', String(userId), safe));
  } catch {
    // Already gone — deletion is idempotent.
  }
}
