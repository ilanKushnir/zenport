/** DTO types shared between the ZenPort server API and the web client. */

export type Role = 'admin' | 'member';

export interface UserInfo {
  id: number;
  username: string;
  role: Role;
  timezone: string;
  createdAt: string;
}

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
}

export interface ScanStateDto {
  status: 'idle' | 'scanning';
  startedAt: string | null;
  finishedAt: string | null;
  roots: ScanRootDto[];
  counts: ScanCounts;
  warnings: string[];
}

export interface TrackDto {
  id: string;
  ord: number;
  title: string;
  fileName: string;
  ext: string;
  durationSec: number | null;
  missing: boolean;
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
  field: 'creator' | 'title' | 'collection' | 'tracks' | 'cover' | 'grouping';
  value: string;
  rule: string;
  evidence: string;
}

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
  meditationIds: string[];
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
