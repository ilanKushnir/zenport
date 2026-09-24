/**
 * Done or not done, for one lesson or track - the same control on the item's
 * page, in the player and in its lesson list. An empty ring reads as "still
 * ahead"; ticking fills it and draws the check, and ticking again takes it
 * back. The label says what it will do, so it is never a guess.
 */
import type { TrackDto } from '@zenport/shared';

/** What finishing this part is called: watched, practised, or simply done. */
export function doneWords(t: Pick<TrackDto, 'video' | 'role'>) {
  if (t.role === 'practice') return { mark: 'Mark as practised', done: 'Practised' };
  if (t.video) return { mark: 'Mark as watched', done: 'Watched' };
  return { mark: 'Mark as done', done: 'Done' };
}

function Ring({ done, size }: { done: boolean; size: number }) {
  return (
    <svg
      className="dt-ring"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      data-done={done || undefined}
    >
      <circle className="dt-disc" cx="12" cy="12" r="10" />
      <path className="dt-check" d="M7.5 12.4l3 3 6-6.4" pathLength={1} />
    </svg>
  );
}

/** A round tick, for lists. */
export function DoneTick({
  track,
  done,
  onToggle,
}: {
  track: Pick<TrackDto, 'title' | 'video' | 'role'>;
  done: boolean;
  onToggle: () => void;
}) {
  const w = doneWords(track);
  const label = done
    ? `${track.title}: ${w.done.toLowerCase()} - tap to undo`
    : `${w.mark}: ${track.title}`;
  return (
    <button
      type="button"
      className="done-tick"
      aria-pressed={done}
      aria-label={label}
      title={done ? `${w.done} - tap to undo` : w.mark}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
    >
      <Ring done={done} size={22} />
    </button>
  );
}

/** A labelled tick, for the part that is playing now. */
export function DonePill({
  track,
  done,
  onToggle,
}: {
  track: Pick<TrackDto, 'video' | 'role'>;
  done: boolean;
  onToggle: () => void;
}) {
  const w = doneWords(track);
  return (
    <button
      type="button"
      className={`done-pill${done ? ' is-done' : ''}`}
      aria-pressed={done}
      title={done ? 'Tap to mark it not done' : undefined}
      onClick={onToggle}
    >
      <Ring done={done} size={18} />
      <span>{done ? w.done : w.mark}</span>
    </button>
  );
}
