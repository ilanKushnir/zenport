import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { parseCoverWidth, sizedCover } from '../../media/thumbs.js';
import { EMBEDDED_ROOT_ID } from '../../scanner/scan.js';
import type { AppContext } from '../../context.js';
import { AUDIO_MIME, DOCUMENT_MIME, IMAGE_MIME, documentKind } from '../../scanner/classify.js';

/** Cap a single range response; clients simply request the next chunk. */
const MAX_CHUNK = 8 * 1024 * 1024;
const MAX_TEXT_DOC = 1024 * 1024;

/**
 * All media is addressed by opaque ids. The database maps an id to a
 * (rootId, source-relative path); the absolute path is resolved and then
 * realpath-verified to still live inside the configured root before a
 * single byte is read. MIME comes from an allowlist, never from the client.
 */
export function registerMediaRoutes(app: FastifyInstance, ctx: AppContext): void {
  const { db, config } = ctx;

  async function resolveContained(rootId: number, relPath: string): Promise<string | null> {
    if (rootId === EMBEDDED_ROOT_ID) {
      // Covers read out of the audio files, cached under the data dir.
      const dir = path.resolve(config.dataDir, 'covers');
      const abs = path.resolve(dir, relPath);
      if (!abs.startsWith(dir + path.sep)) return null;
      try {
        await fs.access(abs);
        return abs;
      } catch {
        return null;
      }
    }
    const root = config.libraryRoots.find((r) => r.id === rootId);
    if (!root) return null;
    try {
      const rootReal = await fs.realpath(root.path);
      const abs = path.resolve(rootReal, relPath);
      const real = await fs.realpath(abs);
      if (real !== rootReal && !real.startsWith(rootReal + path.sep)) return null;
      return real;
    } catch {
      return null;
    }
  }

  async function streamFile(
    reply: FastifyReply,
    absPath: string,
    mime: string,
    rangeHeader: string | undefined,
  ) {
    const st = await fs.stat(absPath);
    reply.header('Accept-Ranges', 'bytes');
    reply.header('Cache-Control', 'private, max-age=3600');
    const m = rangeHeader?.match(/^bytes=(\d*)-(\d*)$/);
    if (m && (m[1] || m[2])) {
      const start = m[1] ? Number(m[1]) : Math.max(0, st.size - Number(m[2]));
      let end = m[1] && m[2] ? Number(m[2]) : st.size - 1;
      if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= st.size) {
        return reply.code(416).header('Content-Range', `bytes */${st.size}`).send();
      }
      end = Math.min(end, st.size - 1, start + MAX_CHUNK - 1);
      reply
        .code(206)
        .header('Content-Range', `bytes ${start}-${end}/${st.size}`)
        .header('Content-Length', end - start + 1)
        .type(mime);
      return reply.send(createReadStream(absPath, { start, end }));
    }
    reply.header('Content-Length', st.size).type(mime);
    return reply.send(createReadStream(absPath));
  }

  app.get('/api/media/track/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = db
      .prepare('SELECT root_id, rel_path, ext, missing FROM tracks WHERE id = ?')
      .get(id) as { root_id: number; rel_path: string; ext: string; missing: number } | undefined;
    if (!row || row.missing) return reply.code(404).send({ error: 'audio not found' });
    const mime = AUDIO_MIME[row.ext];
    if (!mime) return reply.code(415).send({ error: 'unsupported format' });
    const abs = await resolveContained(row.root_id, row.rel_path);
    if (!abs) return reply.code(404).send({ error: 'audio not available' });
    return streamFile(reply, abs, mime, req.headers.range);
  });

  app.get('/api/media/asset/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const q = req.query as { download?: string };
    const row = db
      .prepare('SELECT root_id, rel_path, ext, kind, name, missing FROM assets WHERE id = ?')
      .get(id) as
      | {
          root_id: number;
          rel_path: string;
          ext: string;
          kind: string;
          name: string;
          missing: number;
        }
      | undefined;
    if (!row || row.missing) return reply.code(404).send({ error: 'file not found' });
    const mime = row.kind === 'cover' ? IMAGE_MIME[row.ext] : DOCUMENT_MIME[row.ext];
    if (!mime) return reply.code(415).send({ error: 'unsupported format' });
    const abs = await resolveContained(row.root_id, row.rel_path);
    if (!abs) return reply.code(404).send({ error: 'file not available' });

    // Covers at a fixed width, as WebP: `?w=32` is the blurred placeholder.
    const width = row.kind === 'cover' ? parseCoverWidth((req.query as { w?: string }).w) : null;
    if (width) {
      const sized = await sizedCover(abs, path.join(config.dataDir, 'thumbs'), id, width);
      if (sized) {
        reply.header('Cache-Control', 'private, max-age=604800');
        reply.header('Vary', 'Cookie');
        return reply.type('image/webp').send(createReadStream(sized));
      }
    }

    const safeName = row.name.replace(/[^\w.\- ()#&]/g, '_');
    if (q.download === '1') {
      reply.header('Content-Disposition', `attachment; filename="${safeName}"`);
    } else if (row.kind === 'document') {
      reply.header('Content-Disposition', `inline; filename="${safeName}"`);
    }
    if (documentKind(row.ext) === 'html') {
      // Neutralize scripts/origin even if opened directly.
      reply.header('Content-Security-Policy', "sandbox; default-src 'none'; img-src data:;");
    }
    return streamFile(reply, abs, mime, req.headers.range);
  });

  // Small text/markdown documents rendered in the in-app reader.
  app.get('/api/media/doc/:id/text', async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = db
      .prepare(
        `SELECT root_id, rel_path, ext, size_bytes, missing FROM assets
         WHERE id = ? AND kind = 'document'`,
      )
      .get(id) as
      | { root_id: number; rel_path: string; ext: string; size_bytes: number; missing: number }
      | undefined;
    if (!row || row.missing) return reply.code(404).send({ error: 'document not found' });
    const kind = documentKind(row.ext);
    if (kind !== 'text' && kind !== 'markdown') {
      return reply.code(415).send({ error: 'not a text document' });
    }
    const abs = await resolveContained(row.root_id, row.rel_path);
    if (!abs) return reply.code(404).send({ error: 'document not available' });
    const st = await fs.stat(abs);
    if (st.size > MAX_TEXT_DOC) return reply.code(413).send({ error: 'document too large' });
    const content = await fs.readFile(abs, 'utf8');
    return { kind, content };
  });

  // Voice notes live under ZenPort's own /data; owner-only.
  app.get('/api/media/voice/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = db
      .prepare('SELECT user_id, file_name, mime FROM voice_notes WHERE id = ?')
      .get(id) as { user_id: number; file_name: string; mime: string } | undefined;
    if (!row || row.user_id !== req.user!.id) {
      return reply.code(404).send({ error: 'voice note not found' });
    }
    const abs = path.join(config.dataDir, 'voice', String(row.user_id), row.file_name);
    try {
      await fs.stat(abs);
    } catch {
      return reply.code(404).send({ error: 'voice note file missing' });
    }
    return streamFile(reply, abs, row.mime, req.headers.range);
  });
}
