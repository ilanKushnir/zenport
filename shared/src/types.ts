/** DTO types shared between the ZenPort server API and the web client. */

export type Role = 'admin' | 'member';

export interface UserInfo {
  id: number;
  username: string;
  role: Role;
  timezone: string;
  createdAt: string;
  /** What friends see; null falls back to the username. */
  displayName: string | null;
  /** One emoji, or null for initials. */
  avatar: string | null;
  shareLevel: ShareLevel;
}

/**
 * How much friends see. full: what you practised and studied, when, and
 * what is playing now. summary: minutes, streaks and days only - no titles.
 * off: nothing beyond the friendship itself.
 */
export type ShareLevel = 'full' | 'summary' | 'off';

// --- Library / scanner ---

export interface ScanRootDto {
  id: number;
  label: string;
  ok: boolean;
  /** Human note when the root is unreadable; never an absolute host path leak beyond config intent. */
  note: string | null;
}

export interface ScanCounts {
  items: number;
  tracks: number;
  covers: number;
  documents: number;
  ignored: number;
  missing: number;
  /** Meditations inside folders the owner excluded. */
  excluded: number;
}

export interface ScanStateDto {
  status: 'idle' | 'scanning';
  startedAt: string | null;
  finishedAt: string | null;
  roots: ScanRootDto[];
  counts: ScanCounts;
  warnings: string[];
  /** Recordings the last scan found that were never seen before. */
  newItems: number;
  /** While scanning: how far it has got. */
  progress?: ScanProgressDto | null;
}

export interface ScanProgressDto {
  phase: 'reading' | 'understanding' | 'artwork' | 'saving' | 'lengths';
  /** The library being read now, and its place among them. */
  root: string;
  rootIndex: number;
  roots: number;
  /** Files met so far (all libraries). */
  files: number;
  /** Recordings recognised so far. */
  items: number;
  /** Within a phase that has a count: done of total. */
  done: number;
  total: number;
  /** Creators recognised so far, in the order they were met. */
  creators: string[];
  /** A few of the recordings just recognised, for a live ticker. */
  latest: string[];
}

/** One folder of a library root, as the last scan walked it. */
export interface FolderNodeDto {
  name: string;
  /** Posix path relative to the root; '' for the root itself. */
  relPath: string;
  /** Audio files in this folder and everything beneath it. */
  audioFiles: number;
  /** Excluded itself (not merely inside an excluded parent). */
  excluded: boolean;
  children: FolderNodeDto[];
}

export interface LibraryFoldersDto {
  scanning: boolean;
  roots: { id: number; label: string; ok: boolean; tree: FolderNodeDto | null }[];
}

export interface TrackDto {
  id: string;
  ord: number;
  title: string;
  fileName: string;
  ext: string;
  durationSec: number | null;
  missing: boolean;
  /** Played as video rather than audio. */
  video: boolean;
  /** This account finished it (played to the end, or marked done). */
  completed: boolean;
  /**
   * Inside a course or talk: a lesson to study, or a meditation that belongs
   * to the course. (Every track of a meditation item is a practice.)
   */
  role: 'lesson' | 'practice';
  roleSource: 'auto' | 'manual';
  /** Where this account left off in it, when that place is worth returning to. */
  positionSec: number | null;
  /** File size, for a download's estimate. */
  sizeBytes: number;
}

/** A practice session played without a connection, sent up once back online. */
export interface OfflineSessionDto {
  /** Made on the device, so a retried upload cannot count a sit twice. */
  clientId: string;
  itemId: string;
  startedAt: string;
  endedAt: string;
  listenedSec: number;
  status: 'completed' | 'abandoned';
}

export type DocumentKind = 'pdf' | 'text' | 'markdown' | 'html';

export interface DocumentDto {
  id: string;
  name: string;
  kind: DocumentKind;
  sizeBytes: number;
  missing: boolean;
}

export interface InferenceDecision {
  field: 'creator' | 'title' | 'collection' | 'tracks' | 'cover' | 'grouping' | 'type';
  value: string;
  rule: string;
  evidence: string;
}

// --- Content types ---

/**
 * What a library item is for. Two practise, two teach:
 *  - meditation: a guided practice (intro tracks included)
 *  - soundscape: music, sound baths, ambient or sleep sound
 *  - course:     a series of lessons worked through in order
 *  - talk:       a single lecture, livestream, workshop or Q&A
 */
export const CONTENT_TYPES = ['meditation', 'course', 'talk', 'soundscape'] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

/** Types that count as practice (streaks, practice minutes); the rest are learning. */
export const PRACTICE_TYPES: readonly ContentType[] = ['meditation', 'soundscape'];
export const isPracticeType = (t: ContentType): boolean => PRACTICE_TYPES.includes(t);

/** Containers a browser plays as video. (mpg/flv are not playable and never indexed.) */
export const VIDEO_EXTS: readonly string[] = ['mp4', 'm4v', 'webm', 'mov'];
export const isVideoExt = (ext: string): boolean => VIDEO_EXTS.includes(ext.toLowerCase());

export type PlanFocus = 'practice' | 'learning';

export interface MeditationSummaryDto {
  id: string;
  title: string;
  creator: string;
  collection: string | null;
  rootId: number;
  rootLabel: string;
  trackCount: number;
  totalDurationSec: number | null;
  coverId: string | null;
  documentCount: number;
  formats: string[];
  missing: boolean;
  addedAt: string;
  /** Effective type: the owner's choice if they made one, else the scanner's. */
  type: ContentType;
  typeSource: 'auto' | 'manual';
  /** At least one track is a video container. */
  hasVideo: boolean;
  /** Tracks this account has finished (lessons done, for a course). */
  completedCount: number;
  /** Seconds into the item's last-played, unfinished track; null when there is nothing to resume. */
  resumeSec: number | null;
  /**
   * How many times this account has done it: sessions that covered at least
   * half of its length (or, with the length unknown, completed after a minute).
   */
  practiceCount: number;
  lastPracticedAt: string | null;
  /** Who it suits: set by an admin, read from its name ("(ADV)"), researched, or the AI's. */
  level?: ItemLevel | null;
  levelSource?: LevelSource | null;
  /** One part; several meant in order (programme); or several in any order (pack). */
  structure?: Structure;
  structureSource?: StructureSource | null;
}

import type { Structure, StructureSource } from './structure.js';
export type LevelSource = 'manual' | 'name' | 'research' | 'ai';
/** Beginner first; "every level" sits with beginners, unknown in the middle. */
export const LEVEL_ORDER: Record<ItemLevel, number> = {
  beginner: 0,
  all: 1,
  intermediate: 2,
  advanced: 3,
};

/** Minutes a meditation's place is kept for an accidental exit; courses keep theirs. */
export const PRACTICE_RESUME_MINUTES = 10;

export interface MeditationDetailDto extends MeditationSummaryDto {
  /** Source-relative breadcrumb segments (never absolute host paths). */
  breadcrumbs: string[];
  tracks: TrackDto[];
  documents: DocumentDto[];
  evidence: InferenceDecision[];
  related: MeditationSummaryDto[];
  resume: ResumeStateDto | null;
  /** The parts play in an order the owner set by hand, not the scanner's. */
  customOrder: boolean;
  /** What research found about it (approved by the owner). */
  about?: ItemAboutDto | null;
}

/** A library that was mounted once and is no longer in ZP_LIBRARY_DIRS. */
export interface RemovedLibraryDto {
  id: number;
  label: string;
  items: number;
  tracks: number;
  /** People with any progress on its recordings (places, ticks, favourites). */
  people: number;
  lastSeen: string;
}

export interface CreatorDto {
  name: string;
  itemCount: number;
  totalDurationSec: number | null;
  coverIds: string[];
  /** A picture chosen for the creator (AI-found and approved), when there is one. */
  imageUrl?: string | null;
}

export interface LibraryDto {
  items: MeditationSummaryDto[];
  creators: CreatorDto[];
  /** Guides and notes that belong to a creator or series rather than one recording. */
  folderDocs?: FolderDocsDto[];
  /** Series an admin marked a programme or a collection, against what the names say. */
  seriesStructures?: { creator: string; collection: string; structure: 'programme' | 'pack' }[];
  scan: ScanStateDto;
  /** Set aside from this account's Continue row: 'item:<id>' or 'series:<creator>\u001f<series>'. */
  continueHidden: string[];
}

// --- Player / progress ---

export interface ResumeStateDto {
  trackId: string;
  positionSec: number;
  updatedAt: string;
}

// --- Practice sessions ---

/**
 * Reserved meditation id for an unguided sit on the timer, which has no
 * library item behind it. Real item ids are 20-char hex digests, so this can
 * never collide with one. The server recognises it and skips the items
 * lookup; the API renders it as "Unguided sit" rather than as a removed item.
 */
export const TIMER_ITEM_ID = 'zenport:timer';
export const TIMER_ITEM_TITLE = 'Unguided sit';

export type PracticeStatus = 'active' | 'completed' | 'abandoned';

export interface PracticeSessionDto {
  id: number;
  meditationId: string;
  meditationTitle: string;
  creator: string;
  startedAt: string;
  endedAt: string | null;
  listenedSec: number;
  wallClockSec: number | null;
  status: PracticeStatus;
  reason: string | null;
}

// --- Plans ---

export type PlanStatus = 'active' | 'paused' | 'ended';

export interface PlanDto {
  id: number;
  name: string;
  intention: string | null;
  startDate: string; // YYYY-MM-DD
  endDate: string | null;
  /** 0 = Sunday … 6 = Saturday. Empty = every day. */
  daysOfWeek: number[];
  preferredTime: string | null; // HH:MM
  targetMinutes: number | null;
  notes: string | null;
  status: PlanStatus;
  /** Practice plans hold meditations; learning plans follow courses and talks. */
  focus: PlanFocus;
  meditationIds: string[];
  /** Plans made together as one path (by the AI planner) share a name; step orders them. */
  path: { name: string; step: number } | null;
  /** Pushes: from each date on (in turn), sessions slide by that many days. */
  shifts: PlanShift[];
  /** The AI planner's own account of the plan (read-only); null for plans made by hand. */
  guide: PlanGuide | null;
  createdAt: string;
}

/** Why a planned path is shaped as it is, in the planner's words. */
export interface PlanGuide {
  /** The shape of the plan in two or three sentences. */
  summary: string;
  /** The reasoning: why this order and these foundations, what usually comes first. */
  why: string;
  /** A few practical tips for following it. */
  tips: string[];
  model: string;
  /** This stage's milestone, when the plan is one stage of a longer path. */
  milestone?: string;
}

export interface PlanShift {
  from: string; // YYYY-MM-DD
  days: number;
}

/** Where a date the cadence produced lands after the plan's pushes. */
export function shiftedDate(date: string, shifts: readonly PlanShift[]): string {
  let d = date;
  for (const s of shifts) {
    if (d >= s.from) {
      d = new Date(new Date(`${d}T00:00:00Z`).getTime() + s.days * 86_400_000)
        .toISOString()
        .slice(0, 10);
    }
  }
  return d;
}

export type OccurrenceStatus = 'upcoming' | 'today' | 'completed' | 'skipped' | 'missed';

export interface PlanOccurrenceDto {
  planId: number;
  planName: string;
  date: string; // YYYY-MM-DD
  status: OccurrenceStatus;
  meditationIds: string[];
  /** Set when this date was rescheduled to another date. */
  movedTo: string | null;
  /** Set when this occurrence exists because another date moved here. */
  movedFrom: string | null;
  completedSessionId: number | null;
  /** The plan's focus; optional so the pure expander need not know it. */
  focus?: PlanFocus;
}

// --- Stats ---

export interface TrendBucket {
  bucket: string; // YYYY-MM-DD (day) or YYYY-Www (week)
  minutes: number;
  sessions: number;
}

export interface MixSlice {
  name: string;
  minutes: number;
  sessions: number;
}

export interface StatsDto {
  timezone: string;
  totalMinutes: number;
  totalSessions: number;
  completedSessions: number;
  currentStreak: number;
  longestStreak: number;
  /** Human explanation of the streak day-boundary rule. */
  dayBoundaryRule: string;
  weekTrend: TrendBucket[];
  monthTrend: TrendBucket[];
  creatorMix: MixSlice[];
  meditationMix: MixSlice[];
  comparison: {
    periodDays: number;
    current: { minutes: number; sessions: number };
    previous: { minutes: number; sessions: number };
  };
  /**
   * Courses and talks, kept apart: everything above counts practice only
   * (meditations, soundscapes, unguided sits), so study never inflates a streak.
   */
  learning: {
    totalMinutes: number;
    sessions: number;
    lessonsCompleted: number;
    weekTrend: TrendBucket[];
  };
}

// --- Journal ---

export type TranscriptStatus = 'none' | 'pending' | 'done' | 'error';

export interface VoiceNoteDto {
  id: string;
  durationSec: number | null;
  sizeBytes: number;
  mime: string;
  transcript: string | null;
  transcriptStatus: TranscriptStatus;
  transcriptError: string | null;
}

export interface JournalEntryDto {
  id: number;
  sessionId: number | null;
  meditationId: string | null;
  meditationTitle: string | null;
  title: string | null;
  body: string;
  /** 1 (unsettled) … 5 (deeply settled). */
  mood: number | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  voice: VoiceNoteDto | null;
}

// --- YouTube sources ---

export interface YouTubeSourceDto {
  id: number;
  videoId: string;
  url: string;
  title: string;
  creator: string | null;
  tags: string[];
  collection: string | null;
  provenance: { kind: 'manual' | 'playlist' | 'channel'; ref: string | null };
  addedAt: string;
}

export interface YouTubeImportPreviewEntry {
  videoId: string;
  title: string;
  creator: string | null;
  alreadySaved: boolean;
}

// --- Misc ---

export interface HealthDto {
  status: 'ok';
  version: string;
  uptimeSec: number;
}

export interface SetupStatusDto {
  needsSetup: boolean;
  /** True while the instance is unclaimed AND the server demands ZP_SETUP_TOKEN. */
  setupTokenRequired: boolean;
}

export interface ServerCapabilitiesDto {
  ytdlpAvailable: boolean;
  transcriptionEnabled: boolean;
  /** Redacted transcription endpoint host for the privacy notice, if enabled. */
  transcriptionHost: string | null;
}

// --- Preferences ---

/** Accent treatment applied across the UI; 'spectrum' uses the full logo sweep. */
export type AccentKey = 'spectrum' | 'amber' | 'rose' | 'violet';

export type StartPage = 'today' | 'library';

export interface UserPrefsDto {
  /** ISO timestamp of when this account finished onboarding; null = never. */
  onboardedAt: string | null;
  accent: AccentKey;
  startPage: StartPage;
  /** Minutes/day the practice ring fills toward. Null = no goal shown. */
  dailyGoalMinutes: number | null;
  defaultTimerMinutes: number;
  bellEnabled: boolean;
  bellVolume: number;
  /** Bell every N minutes during an unguided sit. Null = opening/closing only. */
  intervalBellMinutes: number | null;
  autoplayNext: boolean;
  /** Opt out of decorative motion independently of the OS setting. */
  calmMotion: boolean;
  ambientBackground: boolean;
  /** Latest release this account has been told about; null = never (predates the dialog). */
  seenVersion: string | null;
  /** Opted in to AI picks on Today. */
  aiFeatured: boolean;
}

export interface FavoriteDto {
  itemId: string;
  createdAt: string;
}

// --- AI planning ---

export type AiProvider = 'openai' | 'anthropic' | 'gemini' | 'openrouter' | 'compatible';

export interface AiProviderInfo {
  id: AiProvider;
  label: string;
  /** One line on what it is. */
  blurb: string;
  needsKey: boolean;
  /** A local or self-hosted server at an address you give. */
  needsBaseUrl: boolean;
  /** It can look things up on the web (Discover, library research). */
  webSearch: boolean;
  /** Only an admin may point the server at an address of their choosing. */
  adminOnly: boolean;
  /** Where to get a key. */
  keyUrl: string | null;
}

export const AI_PROVIDERS: readonly AiProviderInfo[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    blurb: 'GPT models, from the makers of ChatGPT.',
    needsKey: true,
    needsBaseUrl: false,
    webSearch: true,
    adminOnly: false,
    keyUrl: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    blurb: 'Claude - careful, thoughtful writing.',
    needsKey: true,
    needsBaseUrl: false,
    webSearch: true,
    adminOnly: false,
    keyUrl: 'https://console.anthropic.com/settings/keys',
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    blurb: "Google's Gemini models, with Google Search.",
    needsKey: true,
    needsBaseUrl: false,
    webSearch: true,
    adminOnly: false,
    keyUrl: 'https://aistudio.google.com/apikey',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    blurb: 'One key for hundreds of models from many makers.',
    needsKey: true,
    needsBaseUrl: false,
    webSearch: true,
    adminOnly: false,
    keyUrl: 'https://openrouter.ai/keys',
  },
  {
    id: 'compatible',
    label: 'Your own AI server',
    blurb: 'Ollama, LM Studio or any OpenAI-compatible server - nothing leaves your network.',
    needsKey: false,
    needsBaseUrl: true,
    webSearch: false,
    adminOnly: true,
    keyUrl: null,
  },
];

/** One provider this account has connected. The key itself is never sent back. */
export interface AiConnectionDto {
  provider: AiProvider;
  /** Last four characters of the key, e.g. "…a1b2"; null when there is none. */
  keyHint: string | null;
  baseUrl: string | null;
  model: string;
  active: boolean;
}

export interface AiSettingsDto {
  /** This account has a connection of its own in use. */
  configured: boolean;
  provider: AiProvider | null;
  /** Of the connection in use. Never the key. */
  keyHint: string | null;
  model: string | null;
  /** Chat models the connection in use can choose from, best first. */
  models: string[];
  /**
   * The cheaper sibling simple jobs run on (levels, fixes, pictures, today's
   * pick) - its mini, Haiku or Flash - or null when that is the model itself.
   */
  lightModel?: string | null;
  connections: AiConnectionDto[];
  /** Admin only: whether members without a key may use this one. */
  sharing?: boolean;
  /** Set when this account has no connection of its own but may use the owner's. */
  sharedBy?: string | null;
  /** Anything AI can run for this account - its own connection or a shared one. */
  canUse: boolean;
  /**
   * What a shared AI may be used for: to the sharing admin, what they allow;
   * to someone using it, what they may use it for.
   */
  sharedFeatures?: AiFeature[];
}

/** Personal AI features a shared key can be opened or closed for. */
export const AI_FEATURES = [
  { id: 'plan', label: 'Plan with AI' },
  { id: 'guide', label: 'Your guide' },
  { id: 'featured', label: 'For you today' },
  { id: 'discover', label: 'Discover' },
  { id: 'sits', label: 'Made for you' },
] as const;
export type AiFeature = (typeof AI_FEATURES)[number]['id'];

// --- Intentions: why someone practises, for everything the AI does ---

export const INTENTION_REASONS = [
  { id: 'calm', label: 'Calm and less stress' },
  { id: 'sleep', label: 'Better sleep' },
  { id: 'focus', label: 'Focus and clarity' },
  { id: 'emotions', label: 'Working with emotions' },
  { id: 'healing', label: 'Healing' },
  { id: 'self', label: 'Knowing myself' },
  { id: 'spirit', label: 'Spiritual growth' },
  { id: 'health', label: 'Body and health' },
  { id: 'kindness', label: 'Kindness and connection' },
  { id: 'curious', label: 'Curiosity' },
] as const;

export const INTENTION_LIKES = [
  { id: 'guided', label: 'Guided meditations' },
  { id: 'silent', label: 'Silent sits' },
  { id: 'breath', label: 'Breathwork' },
  { id: 'body', label: 'Body scans' },
  { id: 'courses', label: 'Courses and lessons' },
  { id: 'talks', label: 'Talks and lectures' },
  { id: 'sound', label: 'Sound and music' },
  { id: 'visualise', label: 'Visualisation' },
] as const;

export type IntentionExperience = 'new' | 'some' | 'experienced' | 'deep';
export type IntentionMinutes = '5' | '15' | '30' | '60';

export interface IntentionsDto {
  reasons: string[];
  /** In their own words: what they would love to be true a year from now. */
  hope: string;
  experience: IntentionExperience;
  /** Minutes on a usual day. */
  minutes: IntentionMinutes;
  daysPerWeek: number;
  likes: string[];
  /** What to avoid or keep in mind (health, dislikes, circumstances). */
  notes: string;
  updatedAt?: string;
}

export type PlanLevel = 'new' | 'some' | 'experienced';

/** How learning and practice share the weeks of a plan. */
export type PlanApproach = 'together' | 'learn-first' | 'alternate' | 'ai';

export interface AiPlanRequest {
  /** In the person's own words: what they want from the next weeks. */
  goal: string;
  /** Null: let the planner choose the length the content and time need. */
  weeks: number | null;
  /** With weeks null: cover the whole path to the goal, however long it takes. */
  untilComplete?: boolean;
  /** Only matters when both practice and learning are on. */
  approach?: PlanApproach;
  startDate: string; // YYYY-MM-DD
  practice: { daysPerWeek: number; minutes: number } | null;
  learning: { minutesPerWeek: number; daysPerWeek: number } | null;
  timeOfDay: 'morning' | 'midday' | 'evening' | 'any';
  level: PlanLevel;
  /** Only these creators, if any are given. */
  creators: string[];
  /** Include meditations/courses/talks/soundscapes the account already finished. */
  includeFinished: boolean;
  /** Courses and talks already in another of this account's plans may be used again. */
  includePlanned?: boolean;
  /** Items that must be in the plan (by id). The planner places them; it may add more. */
  mustInclude?: string[];
}

/** Rework the rest of a path from how it actually went. */
export interface AiAdjustRequest {
  /** The plans of the path (or the single plan) to rework. */
  planIds: number[];
  /** In the person's words: what changed, what they want now. */
  note: string;
  /** New pace, if it changed. */
  practice?: { daysPerWeek: number; minutes: number } | null;
  learning?: { minutesPerWeek: number; daysPerWeek: number } | null;
}

export interface AiPlanItemDto {
  id: string;
  why: string;
  item: MeditationSummaryDto;
}

/**
 * One stretch of a path: practice or learning, from a start week for some
 * weeks. Stages may run side by side or one after another; each becomes a plan.
 */
export interface AiPlanStageDto {
  title: string;
  focus: PlanFocus;
  /** 1-based week of the path this stage starts in. */
  startWeek: number;
  weeks: number;
  daysOfWeek: number[];
  minutesPerSession: number;
  preferredTime: string | null;
  items: AiPlanItemDto[];
  /** What the person will have done, or be able to do, by the end of this stage. */
  milestone: string;
}

export interface AiPlanProposalDto {
  name: string;
  intention: string;
  summary: string;
  approach: PlanApproach;
  /** Why this order and these foundations - shown before accepting, kept with the plans. */
  why: string;
  tips: string[];
  /** In start order. */
  stages: AiPlanStageDto[];
  outline: { week: number; focus: string }[];
  /** How long the whole path runs - the person's choice, or the planner's. */
  weeks: number;
  model: string;
  /** Must-include items the planner left out, placed by ZenPort itself (titles). */
  added?: string[];
  /** A reworked path: the date its first week starts. */
  startDate?: string;
}

// --- People: invites, accounts, friends ---

export type InviteKind = 'join' | 'reset';
export type InviteStatus = 'open' | 'used' | 'expired' | 'revoked';

export interface InviteDto {
  id: number;
  kind: InviteKind;
  /** Who it is for, in the owner's words ("For Dana"). */
  note: string | null;
  role: Role;
  /** Become friends with the inviter on joining. */
  befriend: boolean;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
  usedBy: string | null;
  /** For a reset link: whose password it resets. */
  forUser: string | null;
  status: InviteStatus;
}

/** The raw token exists only in this answer; the server keeps its hash. */
export interface InviteCreatedDto {
  invite: InviteDto;
  token: string;
}

export interface JoinInfoDto {
  kind: InviteKind;
  note: string | null;
  invitedBy: string;
  /** For a reset: the account it resets. */
  username: string | null;
  expiresAt: string;
}

export interface AdminUserDto {
  id: number;
  username: string;
  displayName: string | null;
  avatar: string | null;
  role: Role;
  createdAt: string;
  lastActiveAt: string | null;
}

export type Relation = 'friend' | 'outgoing' | 'incoming' | 'none';

export interface PersonDto {
  id: number;
  name: string;
  username: string;
  avatar: string | null;
  relation: Relation;
}

export interface FriendActivityDto {
  sessionId: number;
  friendId: number;
  friendName: string;
  friendAvatar: string | null;
  itemId: string;
  title: string;
  creator: string;
  type: ContentType | 'timer';
  coverId: string | null;
  minutes: number;
  at: string;
  completed: boolean;
  bows: number;
  bowedByMe: boolean;
}

export interface FriendDto {
  id: number;
  name: string;
  username: string;
  avatar: string | null;
  shareLevel: ShareLevel;
  friendsSince: string;
  /** Null when they share nothing. */
  today: { minutes: number; studyMinutes: number } | null;
  streak: number | null;
  /** Seven days of practice minutes, oldest first, in their own days. */
  week: { day: string; minutes: number }[];
  /** Days in a row you have both practised, up to today or yesterday. */
  together: number | null;
  /** Something is playing for them right now (title only when sharing fully). */
  now: { title: string | null; type: ContentType | 'timer' | null; since: string } | null;
  last: FriendActivityDto | null;
  learning: { itemId: string; title: string; done: number; total: number } | null;
  /** You already nudged them today. */
  nudgedToday: boolean;
}

export interface FriendsDto {
  friends: FriendDto[];
  incoming: PersonDto[];
  outgoing: PersonDto[];
}

export interface FriendProfileDto {
  friend: FriendDto;
  /** 35 days of practice minutes, oldest first. */
  days: { day: string; minutes: number }[];
  totalMinutes: number | null;
  totalSessions: number | null;
  longestStreak: number | null;
  recent: FriendActivityDto[];
}

export type CheerKind = 'bow' | 'nudge' | 'sit';

export interface CheerDto {
  id: number;
  kind: CheerKind;
  from: { id: number; name: string; avatar: string | null };
  /** A bow: the session it was for. */
  sessionTitle: string | null;
  /** A sit invitation: what to sit with. */
  item: { id: string; title: string; coverId: string | null } | null;
  message: string | null;
  at: string;
  seen: boolean;
}

export interface InboxDto {
  requests: PersonDto[];
  cheers: CheerDto[];
  unseen: number;
}

// --- Library review (admin) ---

/** Why an item might want a look. */
export type ReviewFlag = 'unknown-creator' | 'raw-names' | 'mixed-media';
/** What the owner has corrected on an item. */
export type ReviewEdit = 'title' | 'creator' | 'series' | 'type' | 'order' | 'names' | 'roles';

export interface ReviewItemDto extends MeditationSummaryDto {
  /** Left out of the library by the owner. */
  hidden: boolean;
  /** Added since the library was first read, and not reviewed yet. */
  isNew: boolean;
  reviewedAt: string | null;
  edited: ReviewEdit[];
  flags: ReviewFlag[];
}

export interface ReviewListDto {
  items: ReviewItemDto[];
  /** Every creator and series in the library, for the editor's suggestions. */
  creators: string[];
  series: { creator: string; collection: string }[];
  lastScan: { finishedAt: string | null; newItems: number };
}

export interface ReviewTrackDto {
  id: string;
  title: string;
  /** What the scanner read from the file name. */
  scannedTitle: string;
  /** A tidier name when the file name looks raw ("-video", "640x360", "audio-2248"). */
  suggestion: string | null;
  video: boolean;
  ext: string;
  durationSec: number | null;
  role: 'lesson' | 'practice';
  scannedRole: 'lesson' | 'practice';
  missing: boolean;
}

/**
 * Recordings that look like one set, filed apart - "Vol. 1" to "Vol. 5" side
 * by side, or several sharing a name - offered as one series.
 */
export interface GroupSuggestionDto {
  /** Stable while the set is the same; dismissing it keeps it dismissed. */
  key: string;
  creator: string;
  /** The series name to give them (the admin can change it). */
  name: string;
  /** Numbered ("Vol. 1…5"), or several sharing a name. */
  why: 'numbered' | 'shared-name';
  /** In the order they would take in the series. */
  items: { id: string; title: string; coverId: string | null }[];
}

export interface ReviewSummaryDto {
  new: number;
  look: number;
  lastScan: { finishedAt: string | null; newItems: number };
}

export interface ReviewDetailDto {
  id: string;
  title: string;
  creator: string;
  collection: string | null;
  type: ContentType;
  coverId: string | null;
  hidden: boolean;
  hasVideo: boolean;
  rootLabel: string;
  /** Where it lives in the library, folder by folder. */
  path: string[];
  scanned: { title: string; creator: string; collection: string | null; type: ContentType };
  customOrder: boolean;
  /** Track ids in the order the scanner reads them. */
  scannedOrder: string[];
  /** Other items sharing this creator and series. */
  seriesSize: number;
  evidence: InferenceDecision[];
  tracks: ReviewTrackDto[];
}

export interface ReviewSaveDto {
  title?: string;
  creator?: string;
  /** '' for no series. */
  series?: string;
  type?: ContentType;
  /** Creator, series and type for this item alone, or its whole series. */
  scope?: 'item' | 'series';
  tracks?: { id: string; title?: string; role?: 'lesson' | 'practice' }[];
  /** Track ids in the wanted order; null for the scanner's order. */
  order?: string[] | null;
  hidden?: boolean;
}

// --- AI library enhancements (admin) ---

export type SuggestionKind = 'fix' | 'about' | 'creator-image';
export type SuggestionField =
  'type' | 'title' | 'creator' | 'series' | 'part-names' | 'order' | 'about' | 'image';
export type ItemLevel = 'beginner' | 'intermediate' | 'advanced' | 'all';

export interface ItemAboutDto {
  description: string;
  level: ItemLevel | null;
  sources: { title: string; url: string }[];
}

export interface SuggestionDto {
  id: number;
  kind: SuggestionKind;
  field: SuggestionField;
  /** The recording (id) or the creator (name) it is about. */
  target: string;
  /** For display: what it is about. */
  targetTitle: string;
  targetSub: string;
  coverId: string | null;
  /** Readable before and after. */
  from: string;
  to: string;
  /** Part names, before and after, for a part-names or order suggestion. */
  parts?: { from: string; to: string }[];
  about?: ItemAboutDto;
  /** A creator image candidate, served for preview. */
  imageUrl?: string;
  sourceUrl?: string | null;
  reason: string;
  confidence: 'high' | 'medium';
  status: 'pending' | 'applied' | 'dismissed';
  model: string | null;
}

export interface EnhanceStatusDto {
  canUse: boolean;
  /** Research and pictures need a provider that can search the web. */
  webSearch: boolean;
  items: number;
  /** How many calls a full check for fixes takes. */
  batches: number;
  /** How many calls setting every level takes, and where levels stand. */
  levelBatches: number;
  levels: { set: number; byName: number; byAi: number; byYou: number };
  pending: Partial<Record<SuggestionKind, number>>;
  /** Recordings that already have a description. */
  aboutIds: string[];
}

export interface EnhanceRunDto {
  /** Which batch this was, of how many (fixes run in batches). */
  batch: number;
  batches: number;
  /** New suggestions this call added. */
  found: number;
  /** Plain notes: what was skipped or could not be found. */
  notes: string[];
}

// ── The guide (AI mentor) ─────────────────────────────────────────────────

export const GUIDE_PERIODS = [7, 30, 90] as const;
export type GuidePeriod = (typeof GUIDE_PERIODS)[number];

/** What a review will send, shown before anything is sent. */
export interface GuideDisclosureDto {
  canUse: boolean;
  /** The provider and model it goes to (for "sent to …"). */
  provider: AiProvider | null;
  model: string | null;
  days: number;
  sessions: number;
  practiceDays: number;
  minutes: number;
  lessons: number;
  plans: number;
  intentions: boolean;
  /** Entries in the period - sent only when the person includes them. */
  journalEntries: number;
  journalIncluded: boolean;
  libraryItems: number;
}

export interface GuideRequest {
  days: GuidePeriod;
  journal: boolean;
  question?: string;
}

export interface GuideTipDto {
  title: string;
  detail: string;
  item: { id: string; title: string; creator: string; coverId: string | null } | null;
}

export type GuideNextAction = 'none' | 'plan' | 'adjust';

export interface GuideNoteDto {
  id: number;
  createdAt: string;
  days: number;
  usedJournal: boolean;
  question: string | null;
  model: string | null;
  summary: string;
  goingWell: string[];
  patterns: { title: string; detail: string }[];
  tips: GuideTipDto[];
  next: { title: string; detail: string; action: GuideNextAction };
  reflection: string;
}

// ── Featured on Today (AI, opt-in) ────────────────────────────────────────

export interface FeaturedPickDto {
  item: MeditationSummaryDto;
  /** Why this, now - one short line. */
  why: string;
}

export interface FeaturedDto {
  enabled: boolean;
  canUse: boolean;
  /** The local day the pick was made; null when there is none. */
  day: string | null;
  /** One meditation (kept until it is begun, refreshed, or left unopened a few days). */
  picks: FeaturedPickDto[];
  generatedAt: string | null;
  /** When a new pick could not be made. */
  error?: string;
}

// ── Discover (AI, web search) ─────────────────────────────────────────────

export const DISCOVER_KINDS = [
  { id: 'teacher', label: 'Teachers' },
  { id: 'course', label: 'Courses' },
  { id: 'book', label: 'Books' },
  { id: 'retreat', label: 'Retreats & workshops' },
] as const;
export type DiscoverKind = (typeof DISCOVER_KINDS)[number]['id'];

export interface DiscoverItemDto {
  id: number;
  kind: DiscoverKind;
  title: string;
  /** The teacher, author or organisation. */
  by: string | null;
  /** Why it suits this person. */
  why: string;
  url: string;
  host: string;
  /** Online, in person, audio, a book… - a few words. */
  format: string | null;
  cost: 'free' | 'paid' | 'unknown';
  saved: boolean;
}

export interface DiscoverRunDto {
  id: number;
  createdAt: string;
  kinds: DiscoverKind[];
  note: string | null;
  model: string | null;
  /** Found by searching the web; false = from the AI's own knowledge. */
  fromWeb: boolean;
  items: DiscoverItemDto[];
  /** Suggestions dropped because their link did not answer. */
  dropped?: number;
}

export interface DiscoverDto {
  canUse: boolean;
  webSearch: boolean;
  saved: DiscoverItemDto[];
  runs: DiscoverRunDto[];
}

export interface DiscoverRequest {
  kinds: DiscoverKind[];
  note?: string;
}

/** A creator as the admin manages it. */
export interface AdminCreatorDto extends CreatorDto {
  seriesCount: number;
  /** Other spellings merged into this one (undoable). */
  aliases: string[];
}

// ── Made for you: a guided meditation written and spoken for this moment ──

/** Practice sessions of a made-for-you sit use `ai:<id>` as their item. */
export const SIT_ITEM_PREFIX = 'ai:';
export const SIT_TITLE = 'Made for you';

export const SIT_FEELINGS = [
  { id: 'restless', label: 'Restless' },
  { id: 'anxious', label: 'Anxious' },
  { id: 'tired', label: 'Tired' },
  { id: 'scattered', label: 'Scattered' },
  { id: 'low', label: 'Low' },
  { id: 'tender', label: 'Tender' },
  { id: 'sleepless', label: 'Can’t sleep' },
  { id: 'grateful', label: 'Grateful' },
  { id: 'calm', label: 'Calm' },
] as const;
export type SitFeeling = (typeof SIT_FEELINGS)[number]['id'];

export const SIT_FOCI = [
  { id: 'any', label: 'Let it choose' },
  { id: 'breath', label: 'Breath' },
  { id: 'body', label: 'Body' },
  { id: 'kindness', label: 'Kindness' },
  { id: 'awareness', label: 'Open awareness' },
  { id: 'sleep', label: 'Sleep' },
] as const;
export type SitFocus = (typeof SIT_FOCI)[number]['id'];

export const SIT_VOICES = [
  { id: 'sage', label: 'Sage', hint: 'Soft and clear' },
  { id: 'coral', label: 'Coral', hint: 'Warm' },
  { id: 'ballad', label: 'Ballad', hint: 'Gentle' },
  { id: 'ash', label: 'Ash', hint: 'Low and steady' },
] as const;
export type SitVoice = (typeof SIT_VOICES)[number]['id'];

export const SIT_LENGTHS = [5, 10, 15, 20] as const;

export interface SitRequest {
  minutes: (typeof SIT_LENGTHS)[number];
  feelings: SitFeeling[];
  focus: SitFocus;
  voice: SitVoice;
  note?: string;
}

export interface SitDto {
  id: string;
  createdAt: string;
  title: string;
  minutes: number;
  durationSec: number;
  feelings: SitFeeling[];
  focus: SitFocus;
  voice: SitVoice;
  note: string | null;
  /** The words, in order - to read along or read back. */
  script: string[];
  /** Times it was sat (practice sessions that counted). */
  sat: number;
}

export interface SitsDto {
  /** Something to write the words with. */
  canUse: boolean;
  /** Something to speak them with: an OpenAI key, own or shared. */
  canSpeak: boolean;
  sits: SitDto[];
}

/** Documents of a folder that holds no audio itself: a creator's or a series' guides. */
export interface FolderDocsDto {
  creator: string;
  /** Set when everything under the folder is one series. */
  collection: string | null;
  /** The folder's own name, when it is not the creator's top folder. */
  label: string | null;
  docs: DocumentDto[];
}

// ── Enhance the library, in one go (onboarding, Admin) ────────────────────

export type EnhanceStepKey = 'levels' | 'pictures' | 'fixes' | 'about';

export interface EnhanceJobRequest {
  steps: EnhanceStepKey[];
  /** Use found pictures and descriptions straight away (fixes always wait for you). */
  apply: boolean;
  /** Descriptions for at most this many recordings (web research is slow). */
  aboutLimit?: number;
}

export interface EnhanceJobStepDto {
  key: EnhanceStepKey;
  state: 'waiting' | 'running' | 'done' | 'failed';
  done: number;
  total: number;
  /** What it found or set. */
  found: number;
  note: string | null;
  /** Pictures just found, to show as they arrive. */
  images?: { name: string; url: string }[];
}

/** One thing the AI just decided, for a live feed. */
export interface EnhanceFindingDto {
  step: EnhanceStepKey;
  title: string;
  /** What it decided: "Beginner · Programme", "Day 1", the start of a description. */
  detail: string;
  at: number;
}

export interface EnhanceJobDto {
  running: boolean;
  /** Waiting for the scan to finish before starting. */
  waitingForScan: boolean;
  startedAt: string;
  finishedAt: string | null;
  apply: boolean;
  steps: EnhanceJobStepDto[];
  error: string | null;
  /** The latest findings, newest first. */
  findings: EnhanceFindingDto[];
}

// ── Choosing libraries (admin) ────────────────────────────────────────────

export interface LibrariesDto {
  /** The mounted folder libraries are chosen from; null when none is mounted. */
  base: string | null;
  /** Set by the server's configuration (ZP_LIBRARY_DIRS). */
  fixed: { label: string; path: string }[];
  chosen: { rel: string; label: string }[];
}

export interface LibraryBrowseDto {
  rel: string;
  /** media is null until counted (see LibraryCountsDto). */
  folders: { name: string; rel: string; media: number | null; chosen: boolean; partly: boolean }[];
  /** Counting stopped early: counts are "at least". */
  capped: boolean;
}

export interface LibraryCountsDto {
  rel: string;
  /** Recording files under each folder, by its relative path. */
  counts: Record<string, number>;
  capped: boolean;
}
