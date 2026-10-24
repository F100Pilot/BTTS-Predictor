import { describe, it, expect } from 'vitest';
import { flashFixtureToFixture } from './flashscoreClient';
import type { FlashFixture } from './flashscoreMatches';

const base: FlashFixture = {
  matchId: 'm1',
  timestamp: 1_700_000_000,
  status: 'scheduled',
  tournament: 'Liga',
  country: 'Portugal',
  home: { id: 'h', name: 'Casa FC' },
  away: { id: 'a', name: 'Fora SC' },
  scores: { home: null, away: null },
  minute: null,
};

describe('flashFixtureToFixture', () => {
  it('keeps the 1X2 odds that ride on the day list', () => {
    const f = flashFixtureToFixture({ ...base, odds: { home: 2.1, draw: 3.3, away: 3.6 } });
    expect(f.odds).toEqual({ home: 2.1, draw: 3.3, away: 3.6 });
  });

  it('leaves odds undefined when the day list has none', () => {
    expect(flashFixtureToFixture(base).odds).toBeUndefined();
  });
});
