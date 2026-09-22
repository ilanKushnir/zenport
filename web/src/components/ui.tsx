import { useEffect, useRef, type ReactNode } from 'react';
import { GeneratedCover } from './CoverArt.tsx';

/**
 * Cover art. Real embedded artwork wins when the scanner found any; otherwise
 * a piece is generated from the title (see CoverArt.tsx) so a shelf of
 * untagged recordings still reads as a shelf of distinct things.
 */
export function Cover({
  coverId,
  title,
  creator,
  className,
}: {
  coverId: string | null;
  title: string;
  creator?: string;
  className?: string;
}) {
  if (coverId) {
    return (
      <div className={`cover ${className ?? ''}`}>
        <img src={`/api/media/asset/${coverId}`} alt="" loading="lazy" width={300} height={300} />
      </div>
    );
  }
  return (
    <div className={`cover cover-generated ${className ?? ''}`} aria-hidden="true">
      <GeneratedCover seed={`${creator ?? ''}/${title}`} />
      <span className="cover-title">{title}</span>
    </div>
  );
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="error-note" role="alert">
      {message}
      {onRetry && (
        <>
          {' '}
          <button className="btn btn-sm btn-quiet" onClick={onRetry}>
            Try again
          </button>
        </>
      )}
    </div>
  );
}

export function SkeletonGrid({ count = 8 }: { count?: number }) {
  return (
    <div className="card-grid" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i}>
          <div className="skeleton" style={{ aspectRatio: '1' }} />
          <div className="skeleton" style={{ marginTop: 10, width: '80%' }} />
          <div className="skeleton" style={{ marginTop: 6, width: '50%' }} />
        </div>
      ))}
    </div>
  );
}

/**
 * Modal sheet with focus management: focus moves in on open, is trapped,
 * Escape closes, and focus returns to the opener on close.
 */
export function Sheet({
  title,
  onClose,
  children,
  labelId,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  labelId?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const id = labelId ?? 'sheet-title';

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const node = ref.current;
    if (!node) return;
    const focusables = () =>
      [
        ...node.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((el) => !el.hasAttribute('disabled'));
    (focusables()[0] ?? node).focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      } else if (e.key === 'Tab') {
        const els = focusables();
        if (els.length === 0) return;
        const first = els[0] as HTMLElement;
        const last = els[els.length - 1] as HTMLElement;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    node.addEventListener('keydown', onKey);
    return () => {
      node.removeEventListener('keydown', onKey);
      opener?.focus();
    };
  }, [onClose]);

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby={id} ref={ref}>
        <div className="sheet-head">
          <h2 id={id}>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </div>
        {children}
      </div>
    </>
  );
}

/** One inline icon set, stroke 1.5, currentColor. */
const PATHS: Record<string, ReactNode> = {
  library: (
    <>
      <path d="M4 4.5h5.5v15H4zM9.5 4.5H15v15H9.5z" />
      <path d="m15.2 5.4 4.6 1.2-3.6 13.5-4.5-1.2" />
    </>
  ),
  plans: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4" />
    </>
  ),
  journal: (
    <>
      <path d="M5 4.5A1.5 1.5 0 0 1 6.5 3h11A1.5 1.5 0 0 1 19 4.5v15a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19.5z" />
      <path d="M8.5 3v18M12 8h4M12 11.5h4" />
    </>
  ),
  stats: <path d="M4 20V10M9.3 20V4M14.6 20v-9M20 20V7" />,
  sources: (
    <>
      <rect x="3" y="6" width="18" height="12.5" rx="3" />
      <path d="m10.2 9.5 4.6 2.75-4.6 2.75z" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.1 14.4a1.5 1.5 0 0 0 .3 1.65l.05.06a1.8 1.8 0 1 1-2.55 2.55l-.06-.06a1.5 1.5 0 0 0-1.65-.3 1.5 1.5 0 0 0-.91 1.37v.17a1.8 1.8 0 1 1-3.6 0v-.09a1.5 1.5 0 0 0-.98-1.37 1.5 1.5 0 0 0-1.65.3l-.06.06A1.8 1.8 0 1 1 4.44 16.3l.06-.06a1.5 1.5 0 0 0 .3-1.65 1.5 1.5 0 0 0-1.37-.91h-.17a1.8 1.8 0 1 1 0-3.6h.09a1.5 1.5 0 0 0 1.37-.98 1.5 1.5 0 0 0-.3-1.65l-.06-.06A1.8 1.8 0 1 1 6.91 4.84l.06.06a1.5 1.5 0 0 0 1.65.3h.07a1.5 1.5 0 0 0 .91-1.37v-.17a1.8 1.8 0 1 1 3.6 0v.09a1.5 1.5 0 0 0 .91 1.37 1.5 1.5 0 0 0 1.65-.3l.06-.06a1.8 1.8 0 1 1 2.55 2.55l-.06.06a1.5 1.5 0 0 0-.3 1.65v.07a1.5 1.5 0 0 0 1.37.91h.17a1.8 1.8 0 1 1 0 3.6h-.09a1.5 1.5 0 0 0-1.37.91z" />
    </>
  ),
  plug: (
    <>
      <path d="M9 3.5V8M15 3.5V8M7 8h10v3a5 5 0 0 1-10 0z" />
      <path d="M12 16v4.5" />
    </>
  ),
  play: <path d="M8 5.5v13l10-6.5z" fill="currentColor" stroke="none" />,
  pause: <path d="M8.5 5.5v13M15.5 5.5v13" strokeWidth="2.4" />,
  next: <path d="m6 6 7 6-7 6zM17.5 6v12" />,
  prev: <path d="m18 6-7 6 7 6zM6.5 6v12" />,
  x: <path d="m6 6 12 12M18 6 6 18" />,
  plus: <path d="M12 5v14M5 12h14" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  bell: (
    <>
      <path d="M12 4a6 6 0 0 1 6 6v3.5l1.5 2.5H4.5L6 13.5V10a6 6 0 0 1 6-6z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </>
  ),
  moon: <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z" />,
  mic: (
    <>
      <rect x="9" y="3.5" width="6" height="11" rx="3" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" />
    </>
  ),
  trash: <path d="M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13M10.5 10.5v6M13.5 10.5v6" />,
  doc: (
    <>
      <path d="M6.5 3.5h7L18 8v12.5h-11.5z" />
      <path d="M13 3.5V8h4.5" />
    </>
  ),
  expand: <path d="M4 9V4h5M20 15v5h-5M4 4l6 6M20 20l-6-6" />,
  history: (
    <>
      <path d="M4.5 12a7.5 7.5 0 1 1 2.2 5.3M4.5 12H2M4.5 12l1.6 2.6" />
      <path d="M12 8v4.5l3 1.8" />
    </>
  ),
  external: <path d="M9 5h10v10M19 5l-9.5 9.5M11 5H5v14h14v-6" />,
  timer: (
    <>
      <circle cx="12" cy="13.5" r="7.5" />
      <path d="M12 9.5v4l2.5 1.5M9.5 2.5h5M19 6.5l1.5-1.5" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6" />
    </>
  ),
  heart: (
    <path d="M12 20s-7.5-4.6-7.5-9.4A4.1 4.1 0 0 1 12 8a4.1 4.1 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z" />
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </>
  ),
  sparkle: (
    <path d="M12 3.5 13.8 9l5.7 1.8-5.7 1.8L12 18.3 10.2 12.6 4.5 10.8 10.2 9zM18.5 4v3M20 5.5h-3" />
  ),
};

export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  return (
    <svg
      className="nav-ic"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ inlineSize: size, blockSize: size }}
    >
      {PATHS[name] ?? null}
    </svg>
  );
}
