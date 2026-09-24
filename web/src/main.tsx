import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
// The wordmark's serif, bundled so it looks the same everywhere and has a
// light weight for "Port" - system serifs stop at Regular.
import '@fontsource-variable/newsreader/wght.css';
import './theme.css';
import './app.css';
import { trackViewport } from './viewport.ts';

// Safari's pinch gestures, cancelled: the installed app stays at the phone's
// own size instead of zooming and then panning sideways.
for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
}

// iOS only applies :active on touch when some touch listener exists - this
// empty one lets buttons and cards show their press.
document.addEventListener('touchstart', () => {}, { passive: true });

// The frame follows the visible screen, so the tab bar always meets the bottom.
trackViewport();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// PWA app shell (production only; requires HTTPS or localhost).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Offline shell is an enhancement, never a requirement.
    });
  });
}
