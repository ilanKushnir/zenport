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
import { VersionRow } from '../whatsnew/WhatsNew.tsx';

export const MORE_LINKS = [
  { to: '/journal', label: 'Journal', icon: 'journal', hint: 'Reflections after each sit' },
  { to: '/stats', label: 'Practice', icon: 'stats', hint: 'Streaks, minutes, patterns' },
  { to: '/library/folders', label: 'Folders', icon: 'folder', hint: 'Choose what gets scanned' },
  { to: '/sources', label: 'Sources', icon: 'sources', hint: 'YouTube talks and playlists' },
  { to: '/integrations', label: 'Integrations', icon: 'plug', hint: 'Calendars and exports' },
  { to: '/settings', label: 'Settings', icon: 'settings', hint: 'Account, look and sound' },
] as const;

export function MoreSheet({ onClose }: { onClose: () => void }) {
  return (
    <Sheet title="More" onClose={onClose} labelId="more-title">
      <nav className="more-grid" aria-label="More pages">
        {MORE_LINKS.map((l) => (
          <NavLink key={l.to} to={l.to} className="more-tile" onClick={onClose}>
            <span className="more-ic">
              <Icon name={l.icon} size={20} />
            </span>
            <span className="more-label">{l.label}</span>
            <span className="more-hint">{l.hint}</span>
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
      <div className="more-foot">
        <VersionRow />
      </div>
    </Sheet>
  );
}
