import { describe, it, expect } from 'vitest';
import { marketPick, marketActualSide, marketPickCorrect, sideOdd, pickEdge } from './markets';
import type { BttsPrediction, MarketPrediction } from '@/domain/types';

const btts = (probYes: number): BttsPrediction => ({
  probYes,
  probNo: 1 - probYes,
  confidence: 5,
  tier: 'medium',
  factors: [],
  modelProbYes: probYes,
  insufficientData: false,
});

const markets: MarketPrediction = {
  lambdaHome: 1.4,
  lambdaAway: 1.2,
  over25: 0.58,
  under25: 0.42,
  homeWin: 0.36,
  draw: 0.25,
  awayWin: 0.39,
};

describe('marketPick', () => {
  it('BTTS picks the dominant side with the right tone', () => {
    expect(marketPick('btts', btts(0.62), undefined)).toEqual({
      side: 'SIM',
      probability: 0.62,
      tone: 'pos',
    });
    expect(marketPick('btts', btts(0.3), undefined)?.side).toBe('NÃO');
    expect(marketPick('btts', btts(0.3), undefined)?.tone).toBe('neg');
  });

  it('Over/Under picks the larger side', () => {
    expect(marketPick('ou25', undefined, markets)).toMatchObject({
      side: 'Over 2.5',
      tone: 'pos',
    });
  });

  it('1X2 picks the most likely outcome, neutral tone', () => {
    expect(marketPick('x12', undefined, markets)).toMatchObject({ side: 'Fora', tone: 'neutral' });
  });

  it('returns null when the needed data is missing', () => {
    expect(marketPick('ou25', btts(0.6), undefined)).toBeNull();
    expect(marketPick('btts', undefined, markets)).toBeNull();
  });
});

describe('marketActualSide / marketPickCorrect', () => {
  it('derives each market outcome from a scoreline', () => {
    // 2-1: BTTS yes, Over 2.5, home win
    expect(marketActualSide('btts', 2, 1)).toBe('SIM');
    expect(marketActualSide('ou25', 2, 1)).toBe('Over 2.5');
    expect(marketActualSide('x12', 2, 1)).toBe('Casa');
    // 0-0: BTTS no, Under, draw
    expect(marketActualSide('btts', 0, 0)).toBe('NÃO');
    expect(marketActualSide('ou25', 0, 0)).toBe('Under 2.5');
    expect(marketActualSide('x12', 0, 0)).toBe('Empate');
    // 1-2 away win
    expect(marketActualSide('x12', 1, 2)).toBe('Fora');
  });

  it('grades a pick against a scoreline', () => {
    expect(marketPickCorrect('btts', 'SIM', 2, 1)).toBe(true);
    expect(marketPickCorrect('ou25', 'Under 2.5', 2, 1)).toBe(false);
    expect(marketPickCorrect('x12', 'Fora', 1, 2)).toBe(true);
  });
});

describe('sideOdd / pickEdge', () => {
  const odds = {
    bttsYes: 1.8,
    bttsNo: 2.0,
    over25: 1.9,
    under25: 1.95,
    home: 2.2,
    draw: 3.3,
    away: 3.4,
  };

  it('maps every market side to its bookmaker odd', () => {
    expect(sideOdd('SIM', odds)).toBe(1.8);
    expect(sideOdd('NÃO', odds)).toBe(2.0);
    expect(sideOdd('Over 2.5', odds)).toBe(1.9);
    expect(sideOdd('Under 2.5', odds)).toBe(1.95);
    expect(sideOdd('Casa', odds)).toBe(2.2);
    expect(sideOdd('Empate', odds)).toBe(3.3);
    expect(sideOdd('Fora', odds)).toBe(3.4);
  });

  it('returns undefined for unknown sides, missing or invalid odds', () => {
    expect(sideOdd('Over 1.5', odds)).toBeUndefined();
    expect(sideOdd('Casa', undefined)).toBeUndefined();
    expect(sideOdd('Casa', { home: 1 })).toBeUndefined();
  });

  it('computes edge as prob·odd − 1, null without an odd', () => {
    expect(pickEdge(0.5, 2.2)).toBeCloseTo(0.1, 4);
    expect(pickEdge(0.4, 2.0)).toBeCloseTo(-0.2, 4);
    expect(pickEdge(0.6, undefined)).toBeNull();
  });
});
