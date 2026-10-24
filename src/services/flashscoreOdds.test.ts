import { describe, it, expect } from 'vitest';
import {
  parseFlashscoreBttsOdds,
  parseFlashscoreMarketOdds,
  describeFlashscoreOddsMarkets,
} from './flashscoreOdds';

const btts = (scope: string, yes: string, no: string) => ({
  bettingType: 'BOTH_TEAMS_TO_SCORE',
  bettingScope: scope,
  odds: [
    { value: yes, bothTeamsToScore: true },
    { value: no, bothTeamsToScore: false },
  ],
});

const DATA = [
  {
    name: 'bet365.us',
    odds: [
      { bettingType: 'HOME_DRAW_AWAY', bettingScope: 'FULL_TIME', odds: [{ value: '3.0' }] },
      btts('FIRST_HALF', '3.5', '1.29'),
      btts('FULL_TIME', '1.5', '2.5'),
    ],
  },
  {
    name: 'BetMGM.us',
    odds: [btts('FULL_TIME', '1.49', '2.45')],
  },
];

describe('parseFlashscoreBttsOdds', () => {
  it('averages full-time BTTS Yes/No across bookmakers', () => {
    const res = parseFlashscoreBttsOdds(DATA)!;
    expect(res.bookmakers).toBe(2);
    expect(res.yes).toBe(1.5); // (1.5 + 1.49) / 2 = 1.495 → 1.5
    expect(res.no).toBe(2.48); // (2.5 + 2.45) / 2 = 2.475 → 2.48
  });

  it('ignores non-full-time scopes and other markets', () => {
    const onlyHalf = [{ name: 'x', odds: [btts('FIRST_HALF', '3.5', '1.29')] }];
    expect(parseFlashscoreBttsOdds(onlyHalf)).toBeNull();
  });

  it('unwraps a wrapped payload and returns null when no BTTS market', () => {
    expect(parseFlashscoreBttsOdds({ data: DATA })?.bookmakers).toBe(2);
    expect(parseFlashscoreBttsOdds(null)).toBeNull();
    expect(parseFlashscoreBttsOdds([{ name: 'x', odds: [] }])).toBeNull();
  });
});

const ou = (total: string, over: string, under: string) => ({
  bettingType: 'OVER_UNDER',
  bettingScope: 'FULL_TIME',
  odds: [
    { value: over, selection: 'OVER', handicap: { value: total } },
    { value: under, selection: 'UNDER', handicap: { value: total } },
  ],
});

describe('parseFlashscoreMarketOdds', () => {
  it('reads BTTS and the 2.5 Over/Under line, averaged across bookmakers', () => {
    const data = [
      {
        name: 'a',
        odds: [btts('FULL_TIME', '1.5', '2.5'), ou('1.5', '1.2', '4.0'), ou('2.5', '1.8', '2.0')],
      },
      { name: 'b', odds: [ou('2.5', '1.9', '1.9')] },
    ];
    const res = parseFlashscoreMarketOdds(data)!;
    expect(res.bttsYes).toBe(1.5);
    expect(res.bttsNo).toBe(2.5);
    expect(res.over25).toBe(1.85); // (1.8 + 1.9) / 2
    expect(res.under25).toBe(1.95); // (2.0 + 1.9) / 2
  });

  it('ignores Over/Under lines that are not explicitly labelled (never guesses)', () => {
    const unlabelled = [
      {
        name: 'a',
        odds: [
          {
            bettingType: 'OVER_UNDER',
            bettingScope: 'FULL_TIME',
            odds: [
              { value: '1.8', handicap: { value: '2.5' } },
              { value: '2.0', handicap: { value: '2.5' } },
            ],
          },
        ],
      },
    ];
    expect(parseFlashscoreMarketOdds(unlabelled)).toBeNull();
  });

  it('accepts a flat handicap value and returns null when nothing is usable', () => {
    const flat = [
      {
        name: 'a',
        odds: [
          {
            bettingType: 'OVER_UNDER',
            bettingScope: 'FULL_TIME',
            odds: [
              { value: '1.7', selection: 'over', handicap: '2.5' },
              { value: '2.1', selection: 'under', handicap: '2.5' },
            ],
          },
        ],
      },
    ];
    expect(parseFlashscoreMarketOdds(flat)).toEqual({ over25: 1.7, under25: 2.1 });
    expect(parseFlashscoreMarketOdds([{ name: 'x', odds: [] }])).toBeNull();
  });
});

describe('describeFlashscoreOddsMarkets', () => {
  it('lists full-time markets with line field names and labels but no prices', () => {
    const shapes = describeFlashscoreOddsMarkets([{ name: 'a', odds: [ou('2.5', '1.8', '2.0')] }]);
    expect(shapes).toHaveLength(1);
    expect(shapes[0]!.bettingType).toBe('OVER_UNDER');
    expect(shapes[0]!.lineFields).toEqual(['handicap', 'selection', 'value']);
    expect(shapes[0]!.sample).toContain('selection=OVER');
    expect(shapes[0]!.sample).not.toContain('1.8');
  });
});
