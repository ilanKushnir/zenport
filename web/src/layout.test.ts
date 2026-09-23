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
 */
import { describe, expect, it } from 'vitest';
import appCss from './app.css?raw';
import themeCss from './theme.css?raw';

const css = [appCss, themeCss].join('\n').replace(/\/\*[\s\S]*?\*\//g, '');

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
});
