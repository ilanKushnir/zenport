import { describe, expect, it } from 'vitest';
import { likelySame } from './CreatorsAdmin.tsx';

describe('creators that look like one', () => {
  it('pairs spellings a letter or two apart, into the bigger one', () => {
    expect(
      likelySame([
        { name: 'Quiet Harbor', itemCount: 9 },
        { name: 'Quiet Harbour', itemCount: 2 },
        { name: 'Mira Solen', itemCount: 4 },
        { name: 'mira-solen', itemCount: 1 },
        { name: 'The Long Road', itemCount: 3 },
        { name: 'Long Road', itemCount: 5 },
        { name: 'Tomas Reyes', itemCount: 2 },
        { name: 'Unknown creator', itemCount: 7 },
        { name: 'Unknown creators', itemCount: 1 },
      ]),
    ).toEqual([
      { from: 'Quiet Harbour', to: 'Quiet Harbor' },
      { from: 'mira-solen', to: 'Mira Solen' },
      { from: 'The Long Road', to: 'Long Road' },
    ]);
  });
  it('leaves different creators alone', () => {
    expect(
      likelySame([
        { name: 'Ana Lee', itemCount: 1 },
        { name: 'Ana Leo', itemCount: 1 },
        { name: 'Quiet Harbor', itemCount: 1 },
        { name: 'Quiet Hours', itemCount: 1 },
      ]),
    ).toEqual([]);
  });
});
