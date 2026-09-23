import { describe, expect, it } from 'vitest';
import { inferLibrary } from './infer.js';
import { classifyExt } from '../scanner/classify.js';
import type { WalkedFile } from '../scanner/walk.js';

/** Build WalkedFile records from bare relative paths (kind from extension). */
function files(...rels: string[]): WalkedFile[] {
  return rels.map((relPath) => {
    const name = relPath.split('/').at(-1) as string;
    const ext = name.includes('.') ? (name.split('.').at(-1) as string).toLowerCase() : '';
    const kind = classifyExt(ext);
    if (kind === null) throw new Error(`unsupported fixture ext: ${relPath}`);
    return { relPath, name, ext, kind, sizeBytes: 1000 };
  });
}

describe('inferLibrary', () => {
  it('1. deep wrapper/creator/meditation folder: the flagship layout', () => {
    const items = inferLibrary(
      files(
        'Meditations/Mira Solen/Morning Ritual/01 Intro.mp3',
        'Meditations/Mira Solen/Morning Ritual/02 Practice.mp3',
        'Meditations/Mira Solen/Morning Ritual/cover.jpg',
        'Meditations/Mira Solen/Morning Ritual/notes.pdf',
      ),
    );
    expect(items).toHaveLength(1);
    const it1 = items[0]!;
    expect(it1.creator).toBe('Mira Solen');
    expect(it1.title).toBe('Morning Ritual');
    expect(it1.collection).toBeNull();
    expect(it1.tracks.map((t) => t.title)).toEqual(['Intro', 'Practice']);
    expect(it1.tracks.map((t) => t.ord)).toEqual([1, 2]);
    expect(it1.coverRelPath).toBe('Meditations/Mira Solen/Morning Ritual/cover.jpg');
    expect(it1.documents.map((d) => d.relPath)).toEqual([
      'Meditations/Mira Solen/Morning Ritual/notes.pdf',
    ]);
    // The generic wrapper is recorded as evidence, not invented as a creator.
    expect(it1.decisions.some((d) => d.rule === 'wrapper-collapse')).toBe(true);
  });

  it('2. shallow creator folder with heterogeneous files: one item per file', () => {
    const items = inferLibrary(files('Orin Vale/Loving Kindness.mp3', 'Orin Vale/Body Scan.mp3'));
    expect(items).toHaveLength(2);
    expect(new Set(items.map((i) => i.creator))).toEqual(new Set(['Orin Vale']));
    expect(new Set(items.map((i) => i.title))).toEqual(new Set(['Loving Kindness', 'Body Scan']));
    for (const item of items) expect(item.tracks).toHaveLength(1);
  });

  it('3. loose audio at the root: its own item with Unknown creator', () => {
    const items = inferLibrary(files('ambient-rain.flac'));
    expect(items).toHaveLength(1);
    expect(items[0]!.creator).toBe('Unknown creator');
    expect(items[0]!.title).toBe('ambient-rain');
  });

  it('4. category layer above creators is detected from sibling evidence', () => {
    const items = inferLibrary(
      files(
        'Sleep/Stillwater Collective/Deep Rest/1.mp3',
        'Sleep/Stillwater Collective/Deep Rest/2.mp3',
        'Sleep/Lena Marsh/Evening Landing/audio.m4a',
      ),
    );
    const deepRest = items.find((i) => i.title === 'Deep Rest');
    const evening = items.find((i) => i.title === 'Evening Landing');
    expect(deepRest?.creator).toBe('Stillwater Collective');
    expect(evening?.creator).toBe('Lena Marsh');
    expect(deepRest?.decisions.some((d) => d.rule === 'category-detected')).toBe(true);
  });

  it('5. creator/program/session trees put the program into the collection', () => {
    const items = inferLibrary(
      files(
        'Anahata/21 Day Journey/Day 1/practice.ogg',
        'Anahata/21 Day Journey/Day 2/practice.ogg',
        'Anahata/One-Off Session/audio.wav',
      ),
    );
    const day1 = items.find((i) => i.title === 'Day 1');
    expect(day1?.creator).toBe('Anahata');
    expect(day1?.collection).toBe('21 Day Journey');
    const oneOff = items.find((i) => i.title === 'One-Off Session');
    expect(oneOff?.collection).toBeNull();
  });

  it('6. numbered set directly under a top-level folder reads as one meditation, Unknown creator', () => {
    const items = inferLibrary(
      files('Deep Sleep Journey/01 descent.mp3', 'Deep Sleep Journey/02 rest.mp3'),
    );
    expect(items).toHaveLength(1);
    expect(items[0]!.title).toBe('Deep Sleep Journey');
    expect(items[0]!.creator).toBe('Unknown creator');
    expect(items[0]!.tracks).toHaveLength(2);
  });

  it('7. odd names sort naturally and companions attach', () => {
    const items = inferLibrary(
      files(
        'Juniper & Friends (live!)/Sound Bath #3/10 - closing.opus',
        'Juniper & Friends (live!)/Sound Bath #3/2 - opening.opus',
        'Juniper & Friends (live!)/Sound Bath #3/notes.txt',
      ),
    );
    expect(items).toHaveLength(1);
    expect(items[0]!.creator).toBe('Juniper & Friends (live!)');
    expect(items[0]!.tracks.map((t) => t.title)).toEqual(['opening', 'closing']);
    expect(items[0]!.documents).toHaveLength(1);
  });

  it('8. mixed folder with a document subfolder attaches subtree documents', () => {
    const items = inferLibrary(
      files(
        'Creator/Retreat/session.wav',
        'Creator/Retreat/cover.png',
        'Creator/Retreat/guide.pdf',
        'Creator/Retreat/handouts/worksheet.pdf',
      ),
    );
    expect(items).toHaveLength(1);
    expect(items[0]!.coverRelPath).toBe('Creator/Retreat/cover.png');
    expect(items[0]!.documents.map((d) => d.relPath).sort()).toEqual([
      'Creator/Retreat/guide.pdf',
      'Creator/Retreat/handouts/worksheet.pdf',
    ]);
  });

  it('9. cover selection prefers canonical names, then stem match for file items', () => {
    const folder = inferLibrary(files('C/Sit/zzz.jpg', 'C/Sit/cover.jpg', 'C/Sit/a.mp3'));
    expect(folder[0]!.coverRelPath).toBe('C/Sit/cover.jpg');

    const fileItems = inferLibrary(
      files('Creator/Ocean.mp3', 'Creator/Ocean.jpg', 'Creator/Other.mp3'),
    );
    const ocean = fileItems.find((i) => i.title === 'Ocean');
    const other = fileItems.find((i) => i.title === 'Other');
    expect(ocean?.coverRelPath).toBe('Creator/Ocean.jpg');
    expect(other?.coverRelPath).toBeNull();
  });

  it('10. a single wrapper directory collapses even with a non-generic name', () => {
    const items = inferLibrary(files('My Stuff/Ansel Rook/Resting/breath.mp3'));
    expect(items[0]!.creator).toBe('Ansel Rook');
    expect(items[0]!.title).toBe('Resting');
  });

  it('13. a creator who sorts their own work into Meditations/Courses stays the creator', () => {
    // Structurally identical to test 4 (a category above creators); the
    // child names are what tell the two apart.
    const items = inferLibrary(
      files(
        'Mira Solen/Meditations/A Wider Horizon (2022)/AWH - 1. Intro (4,10).mp3',
        'Mira Solen/Meditations/A Wider Horizon (2022)/AWH - 2. Meditation (44,18).mp3',
        'Mira Solen/Meditations/Slow Tide (2019)/ST - 1. Introduction (3,08).mp3',
        'Mira Solen/Meditations/Slow Tide (2019)/ST - 2. Meditation (59,21)+.mp3',
        'Mira Solen/Courses/The Long Road/Week 1/01 Welcome.mp3',
        'Mira Solen/Courses/The Long Road/Week 1/02 Practice.mp3',
        'Quiet Harbor/Kindness Series 1/Part 1/track-a01.mp3',
        'Quiet Harbor/Kindness Series 1/Part 1/track-a02.mp3',
      ),
    );
    const byTitle = new Map(items.map((i) => [i.title, i]));
    expect(byTitle.get('A Wider Horizon (2022)')?.creator).toBe('Mira Solen');
    expect(byTitle.get('A Wider Horizon (2022)')?.collection).toBeNull();
    expect(byTitle.get('Slow Tide (2019)')?.creator).toBe('Mira Solen');
    expect(byTitle.get('Slow Tide (2019)')?.tracks).toHaveLength(2);
    expect(byTitle.get('Week 1')?.creator).toBe('Mira Solen');
    expect(byTitle.get('Week 1')?.collection).toBe('Courses / The Long Road');
    expect(byTitle.get('Part 1')?.creator).toBe('Quiet Harbor');
    expect(items.every((i) => i.creator !== 'Unknown creator')).toBe(true);
    expect(items.some((i) => i.decisions.some((d) => d.rule === 'category-detected'))).toBe(false);
  });

  it('14. "ST - 1. Introduction" / "ST - 2. Meditation" is one ordered track set', () => {
    const items = inferLibrary(
      files(
        'Orin Vale/Open Field/OF - 1. Welcome (2,00).mp3',
        'Orin Vale/Open Field/OF - 2. Body scan (20,00).mp3',
        'Orin Vale/Open Field/OF - 3. Closing (5,00).mp3',
      ),
    );
    expect(items).toHaveLength(1);
    expect(items[0]!.title).toBe('Open Field');
    expect(items[0]!.tracks.map((t) => t.ord)).toEqual([1, 2, 3]);
  });

  it('15. the recommended layout: creator folders holding meditation folders or plain files', () => {
    const items = inferLibrary(
      files(
        'Mira Solen/Morning Meditation/01 Intro.mp3',
        'Mira Solen/Morning Meditation/02 Meditation.mp3',
        'Mira Solen/Morning Meditation/cover.jpg',
        'Mira Solen/Walking Sit.mp3',
        'The Lantern Sessions/Wave I - First Light/Light 1 - Arrival.flac',
        'The Lantern Sessions/Wave I - First Light/Light 2 - First Stillness.flac',
        'Orin Vale/Body Scan.mp3',
      ),
    );
    const by = (t: string) => items.find((i) => i.title === t)!;
    expect(items.map((i) => i.title).sort()).toEqual(
      ['Body Scan', 'Morning Meditation', 'Walking Sit', 'Wave I - First Light'].sort(),
    );
    expect(by('Morning Meditation').creator).toBe('Mira Solen');
    expect(by('Morning Meditation').tracks).toHaveLength(2);
    expect(by('Morning Meditation').coverRelPath).toBe('Mira Solen/Morning Meditation/cover.jpg');
    expect(by('Walking Sit').creator).toBe('Mira Solen');
    expect(by('Wave I - First Light').creator).toBe('The Lantern Sessions');
    expect(by('Wave I - First Light').tracks).toHaveLength(2);
    expect(by('Body Scan').creator).toBe('Orin Vale');
  });

  it('11. output is deterministic regardless of input order', () => {
    const a = files(
      'Meditations/A/S1/1.mp3',
      'Meditations/A/S1/2.mp3',
      'Meditations/B/S2/x.mp3',
      'root-level.wav',
    );
    const b = [...a].reverse();
    expect(inferLibrary(a)).toEqual(inferLibrary(b));
  });

  it('12. every item carries stable keys and breadcrumbs without absolute paths', () => {
    const items = inferLibrary(files('Meditations/Joe/Calm/1.mp3'));
    const item = items[0]!;
    expect(item.itemKey).toBe('Meditations/Joe/Calm');
    expect(item.breadcrumbs).toEqual(['Meditations', 'Joe', 'Calm']);
    expect(item.itemKey.startsWith('/')).toBe(false);
  });
});
