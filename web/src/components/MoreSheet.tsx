/**
 * Everything the phone tab bar has no room for.
 *
 * The bar keeps the four places people go every day; the rest of the app is
 * one tap away here instead of being desktop-only. Tiles rather than a list:
 * each one says what the page is for, so nobody has to open Integrations to
 * find out what it means.
 */
import { NavLink } from 'react-router-dom';
import { Icon, Sheet } from './ui.tsx';
import { useAuth } from '../App.tsx';
import { useInbox } from '../social.tsx';

export const MORE_LINKS: {
  to: string;
  label: string;
  icon: string;
  hint: string;
  admin?: boolean;
}[] = [
  { to: '/ai', label: 'AI', icon: 'sparkle', hint: 'Your companion' },
  { to: '/friends', label: 'Friends', icon: 'friends', hint: 'Practise together' },
  { to: '/journal', label: 'Journal', icon: 'journal', hint: 'After each sit' },
  { to: '/stats', label: 'Practice', icon: 'stats', hint: 'Streaks and minutes' },
  { to: '/downloads', label: 'Offline', icon: 'on-device', hint: 'Saved on this device' },
];

export function MoreSheet({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const { inbox } = useInbox();
  const unseen = inbox?.unseen ?? 0;
  return (
    <Sheet title="More" onClose={onClose} labelId="more-title">
      <nav className="more-grid" aria-label="More pages">
        {MORE_LINKS.filter((l) => !l.admin || user?.role === 'admin').map((l) => (
          <NavLink key={l.to} to={l.to} className="more-tile" onClick={onClose}>
            <span className="more-ic">
              <Icon name={l.icon} size={20} />
              {l.to === '/friends' && unseen > 0 && <span className="tab-dot" />}
            </span>
            <span className="more-label">{l.label}</span>
            <span className="more-hint">
              {l.to === '/friends' && unseen > 0 ? `${unseen} new` : l.hint}
            </span>
          </NavLink>
        ))}
      </nav>
      <button
        className="more-search"
        onClick={() => {
          onClose();
          window.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }),
          );
        }}
      >
        <Icon name="search" size={17} />
        Search meditations, pages and settings
      </button>
    </Sheet>
  );
}
