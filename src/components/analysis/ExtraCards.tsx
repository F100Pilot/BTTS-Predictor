import { useState } from 'react';
import type { BttsPrediction, Fixture, MarketPrediction } from '@/domain/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { computeValue } from '@/core/value/value';
import { sideOdd, pickEdge } from '@/core/markets/markets';
import { toPercent, round } from '@/lib/math';

export function MarketsCard({ markets, fixture }: { markets: MarketPrediction; fixture: Fixture }) {
  const rows: Array<{ label: string; side: string; prob: number }> = [
    { label: 'Over 2.5 golos', side: 'Over 2.5', prob: markets.over25 },
    { label: 'Under 2.5 golos', side: 'Under 2.5', prob: markets.under25 },
    { label: `Vitória ${fixture.home.name}`, side: 'Casa', prob: markets.homeWin },
    { label: 'Empate', side: 'Empate', prob: markets.draw },
    { label: `Vitória ${fixture.away.name}`, side: 'Fora', prob: markets.awayWin },
  ];
  const anyOdds = rows.some((r) => sideOdd(r.side, fixture.odds) !== undefined);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Outros mercados</CardTitle>
        <CardDescription>
          Modelo de Poisson (Dixon-Coles) · golos esperados {round(markets.lambdaHome, 2)} –{' '}
          {round(markets.lambdaAway, 2)}
          {anyOdds && ' · com a odd média das casas e o valor (verde = aposta vantajosa)'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
          {rows.map((r) => {
            const odd = sideOdd(r.side, fixture.odds);
            const edge = pickEdge(r.prob, odd);
            return (
              <div key={r.label} className="flex flex-col">
                <span className="text-xs text-muted-foreground">{r.label}</span>
                <span className="font-semibold tabular-nums">{toPercent(r.prob)}</span>
                {odd !== undefined && edge !== null && (
                  <span className="text-xs tabular-nums text-muted-foreground">
                    @ {odd.toFixed(2)} ·{' '}
                    <span className={edge > 0 ? 'font-semibold text-success' : ''}>
                      {edge > 0 ? `Valor +${round(edge * 100, 1)}%` : 'Sem valor'}
                    </span>
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export function ValueCard({
  prediction,
  fixture,
}: {
  prediction: BttsPrediction;
  fixture: Fixture;
}) {
  // Source odds as defaults; the user can type their bookmaker's odds (the free
  // Football-Data.org plan does not provide odds, so the card is always usable).
  const [yesOdd, setYesOdd] = useState(fixture.odds?.bttsYes ? String(fixture.odds.bttsYes) : '');
  const [noOdd, setNoOdd] = useState(fixture.odds?.bttsNo ? String(fixture.odds.bttsNo) : '');

  const odds = {
    bttsYes: Number(yesOdd) > 1 ? Number(yesOdd) : undefined,
    bttsNo: Number(noOdd) > 1 ? Number(noOdd) : undefined,
  };
  const value = computeValue(prediction.probYes, odds);

  const Row = ({ side, label }: { side: 'yes' | 'no'; label: string }) => {
    const v = value[side];
    if (!v) return null;
    const positive = v.edge > 0;
    const isBest = value.best === side;
    const pct = round(v.edge * 100, 1);
    // The odd you'd need for this side to be break-even at the model's probability.
    const fairOdd = v.prob > 0 ? round(1 / v.prob, 2) : null;
    return (
      <div className="border-b py-2 last:border-0">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium">
            {label} <span className="text-xs text-muted-foreground">@ {v.odd.toFixed(2)}</span>
          </span>
          <span
            className={
              positive
                ? 'shrink-0 font-bold text-success'
                : 'shrink-0 text-sm font-medium text-muted-foreground'
            }
          >
            {positive ? `Valor +${pct}%` : `Sem valor (${pct}%)`}
          </span>
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          Modelo {toPercent(v.prob)}
          {fairOdd != null && ` · odd justa ${fairOdd.toFixed(2)}`}
          {isBest && positive && ' · melhor opção'}
        </div>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Valor vs mercado</CardTitle>
        <CardDescription>
          Compara a probabilidade do modelo com a odd da casa. “Valor +X%” (verde) = aposta
          vantajosa a longo prazo; “Sem valor” = a odd é baixa demais. A “odd justa” é a odd mínima
          a partir da qual passaria a ter valor.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="odd-yes" className="text-xs">
              Odd BTTS SIM
            </Label>
            <Input
              id="odd-yes"
              type="number"
              step="0.01"
              min={1.01}
              placeholder="ex.: 1.90"
              value={yesOdd}
              onChange={(e) => setYesOdd(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="odd-no" className="text-xs">
              Odd BTTS NÃO
            </Label>
            <Input
              id="odd-no"
              type="number"
              step="0.01"
              min={1.01}
              placeholder="ex.: 1.90"
              value={noOdd}
              onChange={(e) => setNoOdd(e.target.value)}
            />
          </div>
        </div>
        {!value.yes && !value.no ? (
          <p className="text-sm text-muted-foreground">
            Introduza as odds da sua casa de apostas para calcular o valor.
          </p>
        ) : (
          <div>
            <Row side="yes" label="BTTS SIM" />
            <Row side="no" label="BTTS NÃO" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
