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
}

export interface MeditationDetailDto extends MeditationSummaryDto {
  /** Source-relative breadcrumb segments (never absolute host paths). */
  breadcrumbs: string[];
  tracks: TrackDto[];
  documents: DocumentDto[];
  evidence: InferenceDecision[];
  related: MeditationSummaryDto[];
  resume: ResumeStateDto | null;
}

export interface CreatorDto {
  name: string;
  itemCount: number;
  totalDurationSec: number | null;
  coverIds: string[];
}

export interface LibraryDto {
  items: MeditationSummaryDto[];
  creators: CreatorDto[];
  scan: ScanStateDto;
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
  createdAt: string;
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
}

export interface FavoriteDto {
  itemId: string;
  createdAt: string;
}

// --- AI planning ---

export interface AiSettingsDto {
  configured: boolean;
  /** Last four characters of the key, e.g. "…a1b2". Never the key. */
  keyHint: string | null;
  model: string | null;
  /** Chat models this key can use, newest-preferred first. */
  models: string[];
  /** Admin only: whether members without a key may plan with this one. */
  sharing?: boolean;
  /** Set when this account has no key of its own but may use the owner's. */
  sharedBy?: string | null;
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
}

export interface AiPlanProposalDto {
  name: string;
  intention: string;
  summary: string;
  approach: PlanApproach;
  /** In start order. */
  stages: AiPlanStageDto[];
  outline: { week: number; focus: string }[];
  /** How long the whole path runs - the person's choice, or the planner's. */
  weeks: number;
  model: string;
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
