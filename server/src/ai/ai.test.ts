import { describe, expect, it } from 'vitest';
import type { AiPlanRequest, MeditationSummaryDto } from '@zenport/shared';
import { chatModels } from './openai.js';
import { planPrompt, renderCatalog, resolveProposal, type CatalogEntry } from './planner.js';
import { openSecret, sealSecret } from './secret.js';

describe('key encryption', () => {
  it('round-trips, and refuses the wrong secret or a tampered value', () => {
    const sealed = sealSecret('sk-test-1234567890abcdef', 'secret-a');
    expect(sealed).not.toContain('sk-test');
    expect(openSecret(sealed, 'secret-a')).toBe('sk-test-1234567890abcdef');
    expect(openSecret(sealed, 'secret-b')).toBeNull();
    expect(openSecret(sealed.slice(0, -2) + 'xx', 'secret-a')).toBeNull();
  });
});

describe('chatModels', () => {
  it('keeps general chat models, best first', () => {
    const got = chatModels([
      'gpt-image-2',
      'gpt-4o',
      'gpt-5.5',
      'text-embedding-3',
      'gpt-4o-2024-08-06',
      'gpt-5-mini',
      'whisper-1',
    ]);
    expect(got).toEqual(['gpt-5.5', 'gpt-5-mini', 'gpt-4o']);
  });
});

const item = (
  id: string,
  type: MeditationSummaryDto['type'],
  title: string,
): MeditationSummaryDto => ({
  id,
  title,
  type,
  creator: 'Mira Solen',
  collection: null,
  rootId: 0,
  rootLabel: 'Library',
  trackCount: 2,
  totalDurationSec: 1200,
  coverId: null,
  documentCount: 0,
  formats: ['mp3'],
  missing: false,
  addedAt: '',
  typeSource: 'auto',
  hasVideo: type === 'course',
  completedCount: 0,
});

const entries: CatalogEntry[] = [
  {
    handle: 'm1',
    item: item('aaa', 'meditation', 'Morning Ritual'),
    lessons: [
      { title: 'Intro', minutes: 3, done: true, practice: false },
      { title: 'Practice', minutes: 17, done: false, practice: false },
    ],
  },
  { handle: 'm2', item: item('bbb', 'course', 'The Long Road'), lessons: [] },
  { handle: 'm3', item: item('ccc', 'talk', 'Evening Gathering'), lessons: [] },
];

const req: AiPlanRequest = {
  goal: 'calm mornings',
  weeks: 4,
  startDate: '2026-10-01',
  practice: { daysPerWeek: 5, minutes: 20 },
  learning: { minutesPerWeek: 120, daysPerWeek: 2 },
  timeOfDay: 'morning',
  level: 'some',
  creators: [],
  includeFinished: false,
};

describe('planner', () => {
  it('renders items with lessons beneath, and marks what is done', () => {
    const text = renderCatalog(entries);
    expect(text).toContain('m1 | meditation | Mira Solen > Morning Ritual | 2 tracks, 20 min');
    expect(text).toContain('    1. Intro (3m) [done]');
    expect(text).toContain('m2 | course (video)');
  });

  it('trusts nothing: unknown handles, duplicates and wrong kinds are dropped', () => {
    const p = resolveProposal(
      {
        name: 'Four weeks',
        weeks: 4,
        intention: 'Begin gently.',
        summary: 'A plan.',
        approach: 'together',
        why: 'Foundations first.',
        tips: ['Sit at the same time.', '', 'Keep notes short.'],
        stages: [
          {
            title: 'Steady mornings',
            focus: 'practice',
            startWeek: 1,
            weeks: 4,
            daysOfWeek: [1, 1, 3, 9],
            minutesPerSession: 20,
            preferredTime: 'soon',
            items: [
              { handle: 'm1', why: 'Start here.' },
              { handle: 'm1', why: 'again' },
              { handle: 'm2', why: 'a course is not practice' },
              { handle: 'm99', why: 'invented' },
            ],
          },
          {
            title: 'Foundations',
            focus: 'learning',
            startWeek: 1,
            weeks: 9,
            daysOfWeek: [2, 4],
            minutesPerSession: 60,
            preferredTime: '19:00',
            items: [
              { handle: 'm2', why: 'Foundations.' },
              { handle: 'm3', why: 'Then the talk.' },
              { handle: 'm1', why: 'not learning' },
            ],
          },
        ],
        outline: [
          { week: 1, focus: 'Arrive' },
          { week: 99, focus: 'nope' },
        ],
      },
      entries,
      req,
      'gpt-test',
    );
    const practice = p.stages.find((st) => st.focus === 'practice');
    const learning = p.stages.find((st) => st.focus === 'learning');
    expect(practice?.items.map((i) => i.id)).toEqual(['aaa']);
    expect(practice?.daysOfWeek).toEqual([1, 3]);
    expect(practice?.preferredTime).toBe('07:00'); // invalid time falls back to the chosen time of day
    expect(learning?.items.map((i) => i.id)).toEqual(['bbb', 'ccc']);
    expect(learning?.weeks).toBe(4); // a chosen length is fixed; stages are cut to fit it
    expect(p.outline).toEqual([{ week: 1, focus: 'Arrive' }]);
    expect(p.why).toBe('Foundations first.');
    expect(p.tips).toEqual(['Sit at the same time.', 'Keep notes short.']);
  });

  it('lays stages out one after another, and a planner-chosen length grows to fit them', () => {
    const stage = (focus: string, startWeek: number, weeks: number, handle: string) => ({
      title: handle,
      focus,
      startWeek,
      weeks,
      daysOfWeek: [1],
      minutesPerSession: 30,
      preferredTime: null,
      items: [{ handle, why: '' }],
    });
    const p = resolveProposal(
      {
        name: 'Path',
        weeks: 6,
        intention: '',
        summary: '',
        approach: 'learn-first',
        stages: [stage('practice', 9, 20, 'm1'), stage('learning', 1, 8, 'm2')],
        outline: [],
      },
      entries,
      { ...req, weeks: null, untilComplete: true, approach: 'learn-first' },
      'gpt-test',
    );
    expect(p.approach).toBe('learn-first');
    expect(p.stages.map((st) => [st.focus, st.startWeek, st.weeks])).toEqual([
      ['learning', 1, 8],
      ['practice', 9, 20],
    ]);
    expect(p.weeks).toBe(28);
  });

  it('a kind the person did not ask for stays out whatever the model says', () => {
    const p = resolveProposal(
      {
        name: 'x',
        weeks: 4,
        intention: '',
        summary: '',
        approach: 'together',
        stages: [
          {
            title: 'Study',
            focus: 'learning',
            startWeek: 1,
            weeks: 4,
            daysOfWeek: [1],
            minutesPerSession: 30,
            preferredTime: null,
            items: [{ handle: 'm2', why: '' }],
          },
        ],
        outline: [],
      },
      entries,
      { ...req, learning: null },
      'gpt-test',
    );
    expect(p.stages).toEqual([]);
  });

  it('a course already in another plan is left out unless the person allows repeats', () => {
    const raw = {
      name: 'x',
      weeks: 4,
      intention: '',
      summary: '',
      why: '',
      tips: [],
      approach: 'together',
      stages: [
        {
          title: 'Study',
          focus: 'learning',
          startWeek: 1,
          weeks: 4,
          daysOfWeek: [1],
          minutesPerSession: 30,
          preferredTime: null,
          items: [
            { handle: 'm2', why: '' },
            { handle: 'm3', why: '' },
          ],
        },
      ],
      outline: [],
    };
    const planned = new Set(['bbb']);
    const dropped = resolveProposal(raw, entries, req, 'gpt-test', planned);
    expect(dropped.stages[0]!.items.map((i) => i.id)).toEqual(['ccc']);
    const allowed = resolveProposal(
      raw,
      entries,
      { ...req, includePlanned: true },
      'gpt-test',
      planned,
    );
    expect(allowed.stages[0]!.items.map((i) => i.id)).toEqual(['bbb', 'ccc']);
    const text = renderCatalog(entries, undefined, new Map([['bbb', ['Morning path']]]));
    expect(text).toContain('[in another plan: "Morning path"]');
  });

  it('asks for the chosen approach, and for the whole path when length is open', () => {
    const { user } = planPrompt(
      { ...req, weeks: null, untilComplete: true, approach: 'learn-first' },
      'catalogue',
    );
    expect(user).toContain('Approach "learn-first"');
    expect(user).toContain('as long as it takes');
  });
});
