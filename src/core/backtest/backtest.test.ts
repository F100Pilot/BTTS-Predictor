import { describe, it, expect } from 'vitest';
import {
  brier,
  evaluate,
  fitPlatt,
  applyPlatt,
  reliabilityCurve,
  accuracyByConfidence,
  evaluateOutcomes,
  confidenceBandsOutcomes,
  reliabilityOutcomes,
  IDENTITY_PLATT,
  wilsonInterval,
  calibrationVerdict,
  type Sample,
  type TierEval,
  type OutcomeSample,
} from './backtest';

describe('brier', () => {
  it('is squared error of probability vs outcome', () => {
    expect(brier(1, 1)).toBe(0);
    expect(brier(0.5, 1)).toBeCloseTo(0.25, 5);
    expect(brier(0, 1)).toBe(1);
  });
});

describe('evaluate', () => {
  const samples: Sample[] = [
    { probYes: 0.9, tier: 'very-strong', outcome: 1 },
    { probYes: 0.85, tier: 'very-strong', outcome: 1 },
    { probYes: 0.75, tier: 'strong', outcome: 0 },
    { probYes: 0.4, tier: 'weak', outcome: 0 },
  ];

  it('computes overall accuracy and groups by tier', () => {
    const { overall, byTier } = evaluate(samples);
    // correct: 0.9->1, 0.85->1, 0.75->0 (wrong), 0.4->0 (correct) = 3/4
    expect(overall.n).toBe(4);
    expect(overall.accuracy).toBe(75);
    expect(byTier.find((t) => t.tier === 'very-strong')?.n).toBe(2);
    expect(byTier.find((t) => t.tier === 'very-strong')?.accuracy).toBe(100);
    expect(byTier.some((t) => t.tier === 'medium')).toBe(false); // no medium samples
  });
});

describe('reliabilityCurve', () => {
  it('buckets predictions and compares predicted vs observed', () => {
    const samples: Sample[] = [
      { probYes: 0.05, tier: 'weak', outcome: 0 },
      { probYes: 0.15, tier: 'weak', outcome: 0 },
      { probYes: 0.85, tier: 'very-strong', outcome: 1 },
      { probYes: 0.95, tier: 'very-strong', outcome: 1 },
    ];
    const curve = reliabilityCurve(samples, 5);
    expect(curve).toHaveLength(5);
    expect(curve[0]!.n).toBe(2); // 0-20% bucket
    expect(curve[0]!.actual).toBe(0);
    expect(curve[4]!.n).toBe(2); // 80-100% bucket
    expect(curve[4]!.actual).toBe(100);
    expect(curve[2]!.actual).toBeNull(); // empty middle bucket
  });
});

describe('accuracyByConfidence', () => {
  it('groups hit-rate by the shown (dominant) percentage band', () => {
    const samples: Sample[] = [
      // 90–100% band: both correct (one YES side, one NO side)
      { probYes: 0.95, tier: 'very-strong', outcome: 1 },
      { probYes: 0.05, tier: 'very-strong', outcome: 0 },
      // 70–80% band: one correct, one wrong → 50%
      { probYes: 0.75, tier: 'strong', outcome: 1 },
      { probYes: 0.25, tier: 'strong', outcome: 1 },
    ];
    const bands = accuracyByConfidence(samples, 10);
    expect(bands).toHaveLength(5); // 50-60,60-70,70-80,80-90,90-100
    const top = bands.find((b) => b.lower === 90);
    expect(top?.n).toBe(2);
    expect(top?.accuracy).toBe(100);
    const mid = bands.find((b) => b.lower === 70);
    expect(mid?.n).toBe(2);
    expect(mid?.accuracy).toBe(50);
    const empty = bands.find((b) => b.lower === 50);
    expect(empty?.n).toBe(0);
    expect(empty?.accuracy).toBeNull();
  });
});

describe('generic per-market outcomes', () => {
  const samples: OutcomeSample[] = [
    { prob: 0.82, correct: 1 },
    { prob: 0.74, correct: 0 },
    { prob: 0.44, correct: 1 },
    { prob: 0.36, correct: 0 },
  ];

  it('evaluateOutcomes computes accuracy and Brier', () => {
    const e = evaluateOutcomes(samples);
    expect(e.n).toBe(4);
    expect(e.accuracy).toBe(50); // 2 of 4 correct
    expect(e.brier).toBeCloseTo(((0.82 - 1) ** 2 + 0.74 ** 2 + (0.44 - 1) ** 2 + 0.36 ** 2) / 4, 4);
  });

  it('confidenceBandsOutcomes bands across the full 0–100% range', () => {
    const bands = confidenceBandsOutcomes(samples, 10);
    expect(bands).toHaveLength(10);
    expect(bands.find((b) => b.lower === 80)?.n).toBe(1); // 0.82
    expect(bands.find((b) => b.lower === 80)?.accuracy).toBe(100);
    expect(bands.find((b) => b.lower === 70)?.accuracy).toBe(0); // 0.74 wrong
    expect(bands.find((b) => b.lower === 30)?.n).toBe(1); // 0.36
    expect(bands.find((b) => b.lower === 0)?.accuracy).toBeNull();
  });

  it('reliabilityOutcomes buckets predicted prob vs hit-rate', () => {
    const curve = reliabilityOutcomes(samples, 5);
    expect(curve).toHaveLength(5);
    expect(curve[4]?.n).toBe(1); // 80-100%: 0.82
    expect(curve[4]?.actual).toBe(100);
    expect(curve[2]?.n).toBe(1); // 40-60%: 0.44
    expect(curve[0]?.actual).toBeNull(); // 0-20% empty
  });
});

describe('fitPlatt / applyPlatt', () => {
  it('returns identity for too few samples', () => {
    expect(fitPlatt([{ probYes: 0.6, outcome: 1 }])).toEqual(IDENTITY_PLATT);
  });

  it('learns to correct an over-confident model', () => {
    // Model says 0.9 but the real rate is ~50% — recalibration should pull it down.
    const samples = Array.from({ length: 40 }, (_, i) => ({
      probYes: 0.9,
      outcome: (i % 2) as 0 | 1,
    }));
    const params = fitPlatt(samples);
    const recal = applyPlatt(0.9, params);
    expect(recal).toBeLessThan(0.9);
    expect(recal).toBeGreaterThan(0.35);
    expect(recal).toBeLessThan(0.65);
  });

  it('identity mapping leaves probabilities unchanged', () => {
    expect(applyPlatt(0.73, IDENTITY_PLATT)).toBeCloseTo(0.73, 5);
  });
});

describe('wilsonInterval', () => {
  it('matches the 95% Wilson interval for 13/18', () => {
    const { low, high } = wilsonInterval(13, 18);
    expect(low).toBeCloseTo(0.491, 2);
    expect(high).toBeCloseTo(0.875, 2);
  });

  it('narrows with more data and stays within [0, 1]', () => {
    const small = wilsonInterval(7, 10);
    const big = wilsonInterval(700, 1000);
    expect(big.high - big.low).toBeLessThan(small.high - small.low);
    const all = wilsonInterval(5, 5);
    expect(all.high).toBeLessThanOrEqual(1);
    expect(wilsonInterval(0, 0)).toEqual({ low: 0, high: 1 });
  });
});

describe('evaluate — confidence + calibration verdict', () => {
  it('averages the picked-side probability (not P(YES))', () => {
    const samples: Sample[] = [
      { probYes: 0.8, tier: 'strong', outcome: 1 },
      { probYes: 0.3, tier: 'strong', outcome: 0 },
    ];
    // picked sides: 0.8 (SIM) and 0.7 (NÃO) → 75%, while mean P(YES) is 55%.
    const { overall } = evaluate(samples);
    expect(overall.avgConfidence).toBe(75);
    expect(overall.avgPredicted).toBe(55);
  });

  const tier = (over: Partial<TierEval>): TierEval => ({
    tier: 'very-strong',
    n: 40,
    accuracy: 72,
    brier: 0.2,
    avgPredicted: 80,
    actualRate: 70,
    avgConfidence: 80,
    ciLow: 57,
    ciHigh: 84,
    ...over,
  });

  it('only flags over/under-confidence outside the 95% interval', () => {
    expect(calibrationVerdict(tier({}))).toBe('calibrated'); // 80 within [57, 84]
    expect(calibrationVerdict(tier({ avgConfidence: 90 }))).toBe('overconfident');
    expect(calibrationVerdict(tier({ avgConfidence: 50 }))).toBe('underconfident');
  });

  it('refuses to judge small samples', () => {
    expect(calibrationVerdict(tier({ n: 18, avgConfidence: 95 }))).toBe('small-sample');
  });
});
