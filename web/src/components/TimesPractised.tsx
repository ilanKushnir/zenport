/**
 * How many times you have done a meditation - quietly. The number sits inside
 * a thin ring that fills toward the next milestone (7, 21, 40, 108, then each
 * further mala), with the last time underneath. Reaching a milestone gets one
 * warm line; nothing else is gamified.
 */
import { Icon } from './ui.tsx';

export const MILESTONES: Record<number, string> = {
  7: 'A week of returning',
  21: 'Three weeks of returning',
  40: 'Forty times - a traditional practice period',
  108: '108 times - a full mala',
};

/** The milestone at or after this count: 7, 21, 40, 108, 216, 324 … */
export function nextMilestone(count: number): number {
  for (const m of [7, 21, 40, 108]) if (count < m) return m;
  return Math.ceil((count + 1) / 108) * 108;
}

export function milestoneLine(count: number): string | null {
  if (MILESTONES[count]) return MILESTONES[count]!;
  if (count > 108 && count % 108 === 0) return `${count} times - ${count / 108} full malas`;
  return null;
}

export function ordinal(n: number): string {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  const suffix = teen ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10];
  return `${n}${suffix ?? 'th'}`;
}

function lastLabel(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return 'Last today';
  if (days === 1) return 'Last yesterday';
  return `Last on ${d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}`;
}

export function TimesPractised({ count, last }: { count: number; last: string | null }) {
  const next = nextMilestone(count);
  const prev = [0, 7, 21, 40, 108].filter((m) => m <= count).pop() ?? 0;
  const base = count >= 108 ? Math.floor(count / 108) * 108 : prev;
  const frac = Math.min(1, (count - base) / Math.max(1, next - base));
  const r = 21;
  const c = 2 * Math.PI * r;
  const reached = milestoneLine(count);
  return (
    <div className={`times${reached ? ' milestone' : ''}`}>
      <span className="times-ring" aria-hidden="true">
        <svg viewBox="0 0 50 50" width="50" height="50">
          <circle cx="25" cy="25" r={r} className="times-track" />
          <circle
            cx="25"
            cy="25"
            r={r}
            className="times-fill"
            strokeDasharray={`${(reached ? 1 : frac) * c} ${c}`}
            transform="rotate(-90 25 25)"
          />
        </svg>
        <span className="times-n">{count}</span>
      </span>
      <span className="times-text">
        <strong>
          {count === 1 ? 'Practised once' : `Practised ${count} times`}
          {reached && <Icon name="sparkle" size={13} />}
        </strong>
        <span>
          {[
            reached ?? lastLabel(last),
            reached ? lastLabel(last) : `${next - count} more to ${next}`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </span>
    </div>
  );
}
