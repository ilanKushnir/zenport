/**
 * A secondary action on an item's page: an icon in a soft round well with a
 * short label beneath, no border. They sit in one even row under the page's
 * one primary button - the things you might also do, never competing with
 * the thing you came to do.
 */
import type { ReactNode } from 'react';
import { Icon } from './ui.tsx';

export function ActionTile({
  icon,
  label,
  hint,
  tone,
  onClick,
  title,
  ariaLabel,
}: {
  /** An icon name, or a drawing of its own (a progress ring). */
  icon: string | ReactNode;
  label: string;
  /** A quiet second line: a size, a percentage. */
  hint?: string;
  tone?: 'on' | 'error';
  onClick: () => void;
  title?: string;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      className={`action-tile${tone ? ` ${tone}` : ''}`}
      onClick={onClick}
      title={title}
      aria-label={ariaLabel}
    >
      <span className="action-tile-ic" aria-hidden="true">
        {typeof icon === 'string' ? <Icon name={icon} size={20} /> : icon}
      </span>
      <span className="action-tile-label">{label}</span>
      {hint && <span className="action-tile-hint">{hint}</span>}
    </button>
  );
}
