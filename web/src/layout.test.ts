/**
 * Layout invariants, checked against the stylesheets themselves.
 *
 * Two bugs each shipped more than once before this test existed:
 *
 * - The sidebar (sticky) and the phone tab bar (fixed) scrolled away with the
 *   page, because a later rule - one meant to lift page chrome above the
 *   aurora - gave them `position: relative`. Any rule that targets either
 *   element directly must leave its position alone.
 * - Pages scrolled sideways, because a `1fr` grid column will not shrink below
 *   its longest unbreakable word, and folder names are exactly that. Columns
 *   are written minmax(0, 1fr) (or with an explicit minimum) instead.
 *
 * And one that made phones need a double tap: iOS treats the first tap on
 * anything whose :hover style reveals content as a hover, not a click. Hover
 * styles live inside `@media (hover: hover)`, where touch screens never go.
 */
/// <reference types="node" />
// Read from disk: under Vitest every CSS import, ?raw included, is an empty
// string, which would let these checks pass on nothing.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (f: string) => readFileSync(new URL(f, import.meta.url), 'utf8');
const css = [read('./app.css'), read('./theme.css')].join('\n').replace(/\/\*[\s\S]*?\*\//g, '');

/** Innermost `selector { declarations }` blocks, including those inside @media. */
function rules(): { selectors: string[]; body: string }[] {
  const out: { selectors: string[]; body: string }[] = [];
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = m[1]!
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    out.push({ selectors, body: m[2]! });
  }
  return out;
}

const positionOf = (body: string) => body.match(/(?:^|;|\s)position\s*:\s*([a-z-]+)/)?.[1];

describe('layout invariants', () => {
  it('actually has the stylesheets to check', () => {
    expect(css.length).toBeGreaterThan(20_000);
    expect(css).toContain('.sidebar');
    expect(css).toContain('.mobile-tabs');
  });

  it('nothing overrides the sidebar being sticky', () => {
    for (const r of rules()) {
      const hits = r.selectors.filter((s) => /(^|[\s>])\.sidebar$/.test(s));
      const pos = positionOf(r.body);
      if (hits.length && pos)
        expect({ selectors: hits, pos }).toEqual({ selectors: hits, pos: 'sticky' });
    }
  });

  it('nothing overrides the phone tab bar being fixed', () => {
    for (const r of rules()) {
      const hits = r.selectors.filter((s) => /(^|[\s>])\.mobile-tabs$/.test(s));
      const pos = positionOf(r.body);
      if (hits.length && pos)
        expect({ selectors: hits, pos }).toEqual({ selectors: hits, pos: 'fixed' });
    }
  });

  it('the full player takes its height from the screen edges, never a viewport unit', () => {
    // 100dvh is shorter than the screen in an installed iOS app: the player
    // ended above the bottom and its content spilled over its own header.
    for (const r of rules()) {
      if (!r.selectors.includes('.fp')) continue;
      expect(r.body).not.toMatch(/(^|[;\s])(block-size|height|min-height)\s*:[^;]*v[hw]/);
    }
  });

  it('the app stays at the phone size: no zoom, and no field small enough to trigger it', () => {
    const html = read('../index.html');
    expect(html).toMatch(/maximum-scale=1/);
    expect(html).toMatch(/user-scalable=no/);
    // iOS zooms into any field under 16px; on touch screens every field is 16px.
    expect(css).toMatch(
      /@media \(pointer: coarse\)\s*\{\s*input,\s*textarea,\s*select\s*\{[^}]*font-size:\s*16px !important/,
    );
    expect(css).toMatch(/touch-action:\s*pan-x pan-y/);
  });

  it('every flexible grid column can shrink', () => {
    const bad: string[] = [];
    for (const m of css.matchAll(/grid-template-columns\s*:([^;]+);/g)) {
      const value = m[1]!;
      // Drop the columns that are fine: minmax(<anything>, Nfr).
      const rest = value.replace(/minmax\([^()]*\)/g, '');
      if (/\d*\.?\d+fr\b/.test(rest)) bad.push(value.trim());
    }
    expect(bad).toEqual([]);
  });

  it('hover styles only apply where there is a real hover', () => {
    const bad: string[] = [];
    const stack: string[] = [];
    let prelude = '';
    for (const ch of css) {
      if (ch === '{') {
        const head = prelude.trim();
        if (head.includes(':hover') && !stack.some((h) => /@media[^{]*\(hover:\s*hover\)/.test(h)))
          bad.push(head);
        stack.push(head);
        prelude = '';
      } else if (ch === '}') {
        stack.pop();
        prelude = '';
      } else if (ch === ';') {
        prelude = '';
      } else {
        prelude += ch;
      }
    }
    expect(bad).toEqual([]);
  });

  it('date and time fields can shrink with their column (iOS draws them wider)', () => {
    expect(css).toMatch(
      /input\[type='date'\],\s*input\[type='time'\][^{]*\{[^}]*appearance:\s*none[^}]*min-inline-size:\s*0/,
    );
  });
});
