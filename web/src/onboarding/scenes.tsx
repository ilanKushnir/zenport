/**
 * Onboarding illustrations.
 *
 * Drawn from the logo's own vocabulary — arcs, a ring, scattered droplets, the
 * amber→violet sweep — so the welcome flow reads as the same object as the
 * mark rather than as stock art bolted on. All inline SVG: no binary assets to
 * ship, they inherit the accent, and they stay sharp on every display.
 *
 * Each scene is decorative. They carry aria-hidden and the step's own heading
 * does the describing, so a screen reader is not read a picture of a circle.
 */
import { useId, type ReactNode } from 'react';
import { DROPS, dropColor, polar, RING, STOPS } from '@zenport/shared';

/**
 * The droplet table lives in the logo's 64-unit viewBox, centred on RING.
 * These scenes are 120 units centred at (60, 60), so a droplet has to be
 * re-centred and scaled rather than merely multiplied — multiplying alone
 * moves the centre too, and walks the whole ring off the canvas.
 */
function toScene(angle: number, dist: number, scale = 1.7): [number, number] {
  const [x, y] = polar(angle, dist);
  return [(x - RING.cx) * scale + 60, (y - RING.cy) * scale + 60];
}

function Sweep({ id }: { id: string }) {
  return (
    <linearGradient id={id} x1="12" y1="24" x2="108" y2="96" gradientUnits="userSpaceOnUse">
      {STOPS.map(([at, [r, g, b]]) => (
        <stop key={at} offset={`${at * 100}%`} stopColor={`rgb(${r} ${g} ${b})`} />
      ))}
    </linearGradient>
  );
}

function Frame({ children }: { children: ReactNode }) {
  return (
    <svg className="ob-art" viewBox="0 0 120 120" fill="none" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

/** Welcome — the mark itself, breathing. */
export function SceneWelcome() {
  const uid = useId().replace(/:/g, '');
  const g = `ob-w-${uid}`;
  return (
    <Frame>
      <defs>
        <Sweep id={g} />
        <radialGradient id={`${g}-glow`}>
          <stop offset="40%" stopColor="#F04C8A" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#F04C8A" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="60" cy="60" r="56" fill={`url(#${g}-glow)`} />
      <g className="ob-breathe" style={{ transformOrigin: '60px 60px' }}>
        <circle
          cx="60"
          cy="60"
          r="34"
          stroke={`url(#${g})`}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray="196 40"
          transform="rotate(-40 60 60)"
        />
        <circle
          cx="60"
          cy="60"
          r="24"
          stroke={`url(#${g})`}
          strokeWidth="2.6"
          opacity="0.5"
          strokeDasharray="120 30"
          transform="rotate(140 60 60)"
        />
      </g>
      {DROPS.filter((_, i) => i % 3 === 0).map(([angle, dist, r], i) => {
        const [x, y] = toScene(angle, dist, 1.72);
        return (
          <circle
            key={i}
            cx={x.toFixed(1)}
            cy={y.toFixed(1)}
            r={r * 1.15}
            fill={dropColor(angle)}
            opacity="0.75"
          />
        );
      })}
    </Frame>
  );
}

/** Library — stacked shelves of media, one of them lit. */
export function SceneLibrary() {
  const uid = useId().replace(/:/g, '');
  const g = `ob-l-${uid}`;
  return (
    <Frame>
      <defs>
        <Sweep id={g} />
      </defs>
      {[0, 1, 2].map((row) =>
        [0, 1, 2].map((col) => {
          const lit = row === 1 && col === 1;
          return (
            <rect
              key={`${row}-${col}`}
              x={20 + col * 28}
              y={22 + row * 28}
              width="22"
              height="22"
              rx="5"
              fill={lit ? `url(#${g})` : 'none'}
              stroke={lit ? 'none' : 'currentColor'}
              strokeWidth="1.6"
              opacity={lit ? 1 : 0.28}
            />
          );
        }),
      )}
      <path d="M55.5 46.5v12l10-6z" fill="#1a1522" />
      <circle cx="99" cy="26" r="3" fill="#FFC04A" opacity=".8" />
      <circle cx="107" cy="35" r="1.6" fill="#F04C8A" opacity=".7" />
      <circle cx="15" cy="92" r="2.2" fill="#7C3AED" opacity=".75" />
    </Frame>
  );
}

/** Sit — a timer ring part-filled, with the bell's rings coming off it. */
export function SceneSit() {
  const uid = useId().replace(/:/g, '');
  const g = `ob-s-${uid}`;
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <Frame>
      <defs>
        <Sweep id={g} />
      </defs>
      <circle cx="60" cy="60" r={r} stroke="currentColor" strokeWidth="8" opacity="0.16" />
      <circle
        cx="60"
        cy="60"
        r={r}
        stroke={`url(#${g})`}
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={`${c * 0.62} ${c}`}
        transform="rotate(-90 60 60)"
      />
      <path
        d="M52 52v16M60 46v28M68 54v12"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        opacity="0.55"
      />
      <g opacity="0.5" stroke={`url(#${g})`} strokeWidth="1.8" fill="none">
        <path d="M100 48a14 14 0 0 1 0 24" strokeLinecap="round" />
        <path d="M20 48a14 14 0 0 0 0 24" strokeLinecap="round" />
      </g>
    </Frame>
  );
}

/** Rhythm — a week of practice, some days filled. */
export function SceneRhythm() {
  const uid = useId().replace(/:/g, '');
  const g = `ob-r-${uid}`;
  const heights = [16, 30, 22, 44, 34, 12, 38];
  return (
    <Frame>
      <defs>
        <Sweep id={g} />
      </defs>
      {heights.map((h, i) => (
        <rect
          key={i}
          x={16 + i * 13}
          y={86 - h}
          width="8"
          height={h}
          rx="4"
          fill={i >= 3 ? `url(#${g})` : 'currentColor'}
          opacity={i >= 3 ? 0.95 : 0.22}
        />
      ))}
      <path d="M12 92h96" stroke="currentColor" strokeWidth="1.4" opacity="0.2" />
      <circle cx="94" cy="28" r="9" stroke={`url(#${g})`} strokeWidth="2.4" />
      <path
        d="m90.5 28 2.6 2.6 4.6-5"
        stroke={`url(#${g})`}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Frame>
  );
}

/** Feel — colour and sound: a swatch fan and a struck bell's rings. */
export function SceneFeel() {
  const uid = useId().replace(/:/g, '');
  const g = `ob-f-${uid}`;
  return (
    <Frame>
      <defs>
        <Sweep id={g} />
      </defs>
      {[0, 1, 2, 3].map((i) => (
        <rect
          key={i}
          x={22 + i * 8}
          y={34 + i * 4}
          width="34"
          height="52"
          rx="9"
          fill={`url(#${g})`}
          opacity={0.25 + i * 0.25}
          transform={`rotate(${-12 + i * 8} 40 60)`}
        />
      ))}
      <g stroke={`url(#${g})`} fill="none" strokeLinecap="round">
        <path d="M84 46a18 18 0 0 1 0 28" strokeWidth="2.4" opacity="0.85" />
        <path d="M92 38a30 30 0 0 1 0 44" strokeWidth="2" opacity="0.5" />
        <path d="M100 31a41 41 0 0 1 0 58" strokeWidth="1.6" opacity="0.25" />
      </g>
      <circle cx="78" cy="60" r="4.5" fill={`url(#${g})`} />
    </Frame>
  );
}

/** Ready — the ring closes. */
export function SceneReady() {
  const uid = useId().replace(/:/g, '');
  const g = `ob-d-${uid}`;
  return (
    <Frame>
      <defs>
        <Sweep id={g} />
        <radialGradient id={`${g}-glow`}>
          <stop offset="40%" stopColor="#B44BD8" stopOpacity="0.24" />
          <stop offset="100%" stopColor="#B44BD8" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="60" cy="60" r="54" fill={`url(#${g}-glow)`} />
      <circle cx="60" cy="60" r="36" stroke={`url(#${g})`} strokeWidth="8" strokeLinecap="round" />
      <path
        d="m47 60 9.5 9.5L75 51"
        stroke={`url(#${g})`}
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {DROPS.filter((_, i) => i % 4 === 0).map(([angle, dist], i) => {
        const [x, y] = toScene(angle, dist, 1.78);
        return (
          <circle
            key={i}
            cx={x.toFixed(1)}
            cy={y.toFixed(1)}
            r={2.1}
            fill={dropColor(angle)}
            opacity="0.75"
          />
        );
      })}
    </Frame>
  );
}
