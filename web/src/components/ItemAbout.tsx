/**
 * What a recording is about - researched on the web by the admin's AI and
 * approved by them. A few lines under the title; "More" opens the rest and
 * the pages it came from, so anyone can check.
 */
import { useLayoutEffect, useRef, useState } from 'react';
import type { ItemAboutDto } from '@zenport/shared';
import { Icon } from './ui.tsx';

const host = (url: string) => {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return url;
  }
};

export function ItemAbout({ about }: { about: ItemAboutDto }) {
  const [open, setOpen] = useState(false);
  const [long, setLong] = useState(false);
  const ref = useRef<HTMLParagraphElement>(null);

  // Only offer "More" when the text is actually cut.
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && !open) setLong(el.scrollHeight > el.clientHeight + 2);
  }, [about.description, open]);

  return (
    <div className={`item-about${open ? ' open' : ''}`}>
      <p ref={ref} className="item-about-text" id="item-about-text">
        {about.description}
      </p>
      {(long || open || about.sources.length > 0) && (
        <button
          className="item-about-more"
          aria-expanded={open}
          aria-controls="item-about-text"
          onClick={() => setOpen(!open)}
        >
          {open ? 'Less' : long ? 'More' : 'Sources'}
        </button>
      )}
      {open && about.sources.length > 0 && (
        <p className="item-about-sources">
          <Icon name="sparkle" size={12} /> Researched from{' '}
          {about.sources.map((s, i) => (
            <span key={s.url}>
              {i > 0 && ', '}
              <a href={s.url} target="_blank" rel="noopener noreferrer" title={s.title}>
                {host(s.url)}
              </a>
            </span>
          ))}
        </p>
      )}
    </div>
  );
}
