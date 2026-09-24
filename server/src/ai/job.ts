/**
 * Enhance the library in one go - what onboarding offers, and Admin can
 * start again: levels and programmes, creator pictures, suggested fixes,
 * descriptions. Runs on the server, a step at a time, so it carries on while
 * the admin finishes onboarding or closes the page; the page reads how far
 * it has got. It waits for a scan under way to finish first.
 *
 * Pictures and descriptions can be used as they are found ("apply"); fixes
 * always wait for the admin, since they change titles and order.
 */
import type {
  EnhanceJobDto,
  EnhanceJobRequest,
  EnhanceJobStepDto,
  EnhanceStepKey,
} from '@zenport/shared';
import { isPracticeType } from '@zenport/shared';
import { libraryDto } from '../library/queries.js';
import { isScanning } from '../scanner/coordinator.js';
import {
  FIX_BATCH,
  LEVEL_BATCH,
  applySuggestion,
  listSuggestions,
  runAbout,
  runCreatorImages,
  runFixes,
  runLevels,
  type EnhanceCtx,
} from './enhance.js';
import { AiError } from './providers.js';

const ORDER: EnhanceStepKey[] = ['levels', 'pictures', 'fixes', 'about'];
let job: EnhanceJobDto | null = null;

export const jobState = (): EnhanceJobDto | null => job;

const chunk = <T>(xs: T[], n: number): T[][] =>
  Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

export function startJob(ctx: EnhanceCtx, userId: number, req: EnhanceJobRequest): EnhanceJobDto {
  if (job?.running) return job;
  const keys = ORDER.filter((k) => req.steps.includes(k));
  job = {
    running: true,
    waitingForScan: isScanning(),
    startedAt: new Date().toISOString(),
    finishedAt: null,
    apply: req.apply,
    steps: keys.map((key) => ({ key, state: 'waiting', done: 0, total: 0, found: 0, note: null })),
    error: null,
    findings: [],
  };
  const current = job;
  void run(ctx, userId, req, current).finally(() => {
    current.running = false;
    current.waitingForScan = false;
    current.finishedAt = new Date().toISOString();
  });
  return current;
}

async function run(
  ctx: EnhanceCtx,
  userId: number,
  req: EnhanceJobRequest,
  state: EnhanceJobDto,
): Promise<void> {
  // The library has to be read before it can be enhanced.
  const until = Date.now() + 60 * 60_000;
  while (isScanning() && Date.now() < until) {
    state.waitingForScan = true;
    await new Promise((r) => setTimeout(r, 1500));
  }
  state.waitingForScan = false;

  for (const step of state.steps) {
    step.state = 'running';
    try {
      await STEPS[step.key](ctx, userId, req, step, (title, detail) => {
        state.findings.unshift({ step: step.key, title, detail, at: Date.now() });
        state.findings.length = Math.min(state.findings.length, 40);
      });
      step.state = 'done';
    } catch (err) {
      step.state = 'failed';
      step.note = err instanceof Error ? err.message : 'It stopped.';
      // A key refused or out of credit will not get better on the next step.
      if (err instanceof AiError && (err.status === 400 || err.status === 429)) {
        state.error = err.message;
        for (const rest of state.steps) if (rest.state === 'waiting') rest.state = 'failed';
        return;
      }
    }
  }
}

type Step = (
  ctx: EnhanceCtx,
  userId: number,
  req: EnhanceJobRequest,
  step: EnhanceJobStepDto,
  found: (title: string, detail: string) => void,
) => Promise<void>;

const LEVEL_WORD: Record<string, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
  all: 'All levels',
};
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

const present = (ctx: EnhanceCtx, userId: number) =>
  libraryDto(ctx.db, ctx.config, userId).items.filter((i) => !i.missing);

const STEPS: Record<EnhanceStepKey, Step> = {
  async levels(ctx, userId, _req, step, found) {
    const batches = Math.max(1, Math.ceil(present(ctx, userId).length / LEVEL_BATCH));
    step.total = batches;
    for (let b = 1; b <= batches; b++) {
      const since = new Date().toISOString();
      const r = await runLevels(ctx, userId, b);
      step.found += r.found;
      step.done = b;
      // A few of what it just decided, for the live feed.
      const rows = ctx.db
        .prepare(
          `SELECT i.title, i.collection, l.level, s.structure FROM item_levels l
           JOIN items i ON i.id = l.item_id
           LEFT JOIN item_structures s ON s.item_id = l.item_id
           WHERE l.source = 'ai' AND l.updated_at >= ? ORDER BY RANDOM() LIMIT 6`,
        )
        .all(since) as {
        title: string;
        collection: string | null;
        level: string;
        structure: string | null;
      }[];
      for (const row of rows) {
        found(
          clip(
            row.collection ? `${row.collection.split(' / ').pop()} · ${row.title}` : row.title,
            70,
          ),
          `${LEVEL_WORD[row.level] ?? row.level}${row.structure === 'programme' ? ' · a programme' : row.structure === 'pack' ? ' · a pack' : ''}`,
        );
      }
    }
  },

  async pictures(ctx, userId, req, step, found) {
    const lib = libraryDto(ctx.db, ctx.config, userId);
    const names = lib.creators
      .filter((c) => !c.imageUrl && !/^unknown/i.test(c.name))
      .map((c) => c.name);
    const groups = chunk(names, 4);
    step.total = groups.length;
    step.images = [];
    if (names.length === 0) step.note = 'Every creator already has a picture.';
    for (const [n, group] of groups.entries()) {
      const r = await runCreatorImages(ctx, userId, group);
      step.found += r.found;
      for (const s of listSuggestions(ctx.db, ctx.config).filter(
        (x) => x.kind === 'creator-image' && group.includes(x.target),
      )) {
        found(s.target, req.apply ? 'Picture found and set' : 'Picture found - waiting for you');
        if (req.apply) {
          await applySuggestion(ctx.db, ctx.config, ctx.dataDir, s.id);
          const img = ctx.db
            .prepare('SELECT file FROM creator_images WHERE name = ?')
            .get(s.target) as { file: string } | undefined;
          if (img) step.images.push({ name: s.target, url: `/api/media/creator/${img.file}` });
        } else if (s.imageUrl) {
          step.images.push({ name: s.target, url: s.imageUrl });
        }
      }
      step.done = n + 1;
    }
  },

  async fixes(ctx, userId, _req, step, found) {
    const batches = Math.max(1, Math.ceil(present(ctx, userId).length / FIX_BATCH));
    step.total = batches;
    const seen = new Set(listSuggestions(ctx.db, ctx.config).map((x) => x.id));
    for (let b = 1; b <= batches; b++) {
      const r = await runFixes(ctx, userId, b);
      step.found += r.found;
      step.done = b;
      for (const x of listSuggestions(ctx.db, ctx.config).filter(
        (x) => x.kind === 'fix' && !seen.has(x.id),
      )) {
        seen.add(x.id);
        const first = x.parts?.find((p) => p.from !== p.to);
        found(
          clip(x.targetTitle, 60),
          first
            ? `${clip(first.from, 28)} → ${clip(first.to, 28)}`
            : `${clip(x.from || '—', 28)} → ${clip(x.to, 28)}`,
        );
      }
    }
    if (step.found > 0) step.note = 'Waiting for you under Enhance the library → Fixes.';
  },

  async about(ctx, userId, req, step, found) {
    const have = new Set(
      (ctx.db.prepare('SELECT item_id FROM item_about').all() as { item_id: string }[]).map(
        (r) => r.item_id,
      ),
    );
    // Practice first, then courses and talks; the longest-running first within each.
    const todo = present(ctx, userId)
      .filter((i) => !have.has(i.id))
      .sort(
        (a, b) =>
          Number(isPracticeType(b.type)) - Number(isPracticeType(a.type)) ||
          (b.totalDurationSec ?? 0) - (a.totalDurationSec ?? 0),
      )
      .slice(0, Math.max(1, Math.min(120, req.aboutLimit ?? 24)));
    const groups = chunk(todo, 6);
    step.total = groups.length;
    for (const [n, group] of groups.entries()) {
      const r = await runAbout(
        ctx,
        userId,
        group.map((i) => i.id),
      );
      step.found += r.found;
      if (req.apply) {
        const ids = new Set(group.map((i) => i.id));
        for (const s of listSuggestions(ctx.db, ctx.config).filter(
          (x) => x.kind === 'about' && ids.has(x.target),
        )) {
          found(clip(s.targetTitle, 60), clip(s.about?.description ?? '', 110));
          await applySuggestion(ctx.db, ctx.config, ctx.dataDir, s.id);
        }
      }
      step.done = n + 1;
    }
  },
};
