/**
 * The AI planner's own account of a plan: the shape in a sentence or two, the
 * reasoning behind the order and the foundations, and a few tips. Read-only -
 * it is what the planner said, kept apart from the person's own notes.
 */
import { useState } from 'react';
import type { PlanGuide } from '@zenport/shared';
import { Icon } from './ui.tsx';

export function PlanGuideView({
  guide,
  collapsible = false,
  title = 'Why this plan',
}: {
  guide: Pick<PlanGuide, 'summary' | 'why' | 'tips'> & { model?: string };
  collapsible?: boolean;
  title?: string;
}) {
  const more = Boolean(guide.why || guide.tips.length);
  const [open, setOpen] = useState(!collapsible);
  return (
    <section className="guide" aria-label={title}>
      <header className="guide-head">
        <span className="guide-ic" aria-hidden="true">
          <Icon name="sparkle" size={14} />
        </span>
        <span className="guide-title">{title}</span>
        {guide.model && <span className="guide-model">by {guide.model}</span>}
      </header>
      {guide.summary && <p className="guide-summary">{guide.summary}</p>}
      {more && open && (
        <>
          {guide.why && <p className="guide-why">{guide.why}</p>}
          {guide.tips.length > 0 && (
            <ul className="guide-tips">
              {guide.tips.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          )}
        </>
      )}
      {more && collapsible && (
        <button
          type="button"
          className="guide-more"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? 'Less' : 'The reasoning and tips'}
          <Icon name="chevron-down" size={14} />
        </button>
      )}
    </section>
  );
}
