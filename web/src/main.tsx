import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
// The wordmark's serif, bundled so it looks the same everywhere and has a
// light weight for "Port" - system serifs stop at Regular.
import '@fontsource-variable/newsreader/wght.css';
import './theme.css';
import './app.css';

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
