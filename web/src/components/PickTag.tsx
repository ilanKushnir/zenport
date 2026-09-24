/**
 * Where an item stands for this person, as a small tag in a picker: done,
 * part-way, or already in another plan (named). Nothing when it is new.
 */
import type { MeditationSummaryDto } from '@zenport/shared';

export type Standing = 'done' | 'started' | 'planned' | 'fresh';

export function standingOf(item: MeditationSummaryDto, planned: boolean): Standing {
  if (item.trackCount > 0 && item.completedCount >= item.trackCount) return 'done';
  if (planned) return 'planned';
  if (item.completedCount > 0) return 'started';
  return 'fresh';
}

/** Why an item may not belong in this plan: done, part-way, or already planned. */
export function PickTag({
  item,
  standing,
  plans,
}: {
  item: MeditationSummaryDto;
  standing: 'done' | 'started' | 'planned' | 'fresh';
  plans: string[] | undefined;
}) {
  if (standing === 'done') return <span className="pick-tag done">Done</span>;
  if (standing === 'planned')
    return (
      <span className="pick-tag planned" title={plans?.join(', ')}>
        In {plans?.[0]}
        {plans && plans.length > 1 ? ` +${plans.length - 1}` : ''}
      </span>
    );
  if (standing === 'started')
    return (
      <span className="pick-tag started">
        {item.completedCount}/{item.trackCount} done
      </span>
    );
  return null;
}
