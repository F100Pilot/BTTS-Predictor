import { getProvider } from '@/data/providers/registry';
import type { ProviderContext } from '@/data/providers/types';
import { todayIso } from '@/lib/format';
import { fetchFlashscoreOddsRaw } from '@/services/flashscoreClient';
import {
  describeFlashscoreOddsMarkets,
  parseFlashscoreMarketOdds,
} from '@/services/flashscoreOdds';

export interface DiagCheck {
  label: string;
  ok: boolean;
  detail: string;
}

/**
 * Connection test for a provider: tries to fetch today's fixtures (and one
 * team's recent matches) through the real provider implementation.
 */
export async function runProviderTest(
  providerId: string,
  ctx: ProviderContext,
): Promise<DiagCheck[]> {
  const provider = getProvider(providerId);
  const checks: DiagCheck[] = [
    {
      label: 'Chave de API',
      ok: provider.isConfigured(ctx),
      detail: provider.isConfigured(ctx) ? 'configurada' : 'em falta — configure a chave',
    },
  ];
  if (!provider.isConfigured(ctx)) return checks;

  try {
    const fixtures = await provider.getFixturesByDate(todayIso(), ctx);
    checks.push({
      label: `Ligação (${provider.label})`,
      ok: true,
      detail: `OK — ${fixtures.length} jogo(s) hoje`,
    });
    const fixture = fixtures[0];
    if (fixture && provider.getFixtureMatches) {
      // Match-keyed sources (Flashscore): the analysis reads both teams' form +
      // H2H from one per-fixture request, so test THAT, not getTeamRecentMatches
      // (which such providers leave empty by design).
      const bundle = await provider.getFixtureMatches(fixture, ctx);
      const total = bundle.home.length + bundle.away.length;
      checks.push({
        label: 'Forma das equipas (previsões)',
        ok: total > 0,
        detail: `${fixture.home.name} / ${fixture.away.name}: ${bundle.home.length}+${bundle.away.length} jogos`,
      });
      // Odds: one request on a fixture that already shows 1X2 odds in the day
      // list (more likely to have bookmaker markets). Reports what we parse
      // and the line SHAPE (field names / labels, no prices) of O/U and 1X2.
      if (providerId === 'flashscore') {
        const withOdds = fixtures.find((f) => f.odds?.home) ?? fixture;
        try {
          const raw = await fetchFlashscoreOddsRaw(ctx.apiKey!, ctx.corsProxy ?? '', withOdds.id);
          const parsed = parseFlashscoreMarketOdds(raw);
          const mark = (ok: boolean): string => (ok ? '✓' : '✗');
          checks.push({
            label: 'Odds (mercados)',
            ok: Boolean(parsed?.bttsYes || parsed?.over25 || withOdds.odds?.home),
            detail: `${withOdds.home.name} vs ${withOdds.away.name}: BTTS ${mark(Boolean(parsed?.bttsYes))} · O/U 2.5 ${mark(Boolean(parsed?.over25))} · 1X2 ${mark(Boolean(withOdds.odds?.home))}`,
          });
          const shapes = describeFlashscoreOddsMarkets(raw).filter(
            (m) => m.bettingType === 'OVER_UNDER' || m.bettingType === 'HOME_DRAW_AWAY',
          );
          for (const m of shapes) {
            checks.push({
              label: `Formato ${m.bettingType}`,
              ok: true,
              detail: m.sample || m.lineFields.join(', ') || '(sem linhas)',
            });
          }
        } catch (err) {
          checks.push({
            label: 'Odds (mercados)',
            ok: false,
            detail: err instanceof Error ? err.message : 'falha ao obter odds',
          });
        }
      }
    } else if (fixture?.home.id) {
      const recent = await provider.getTeamRecentMatches(fixture.home.id, 5, ctx);
      checks.push({
        label: 'Histórico de equipa (previsões)',
        ok: recent.length > 0,
        detail: `${fixture.home.name}: ${recent.length} jogo(s) recentes`,
      });
    }
  } catch (err) {
    checks.push({
      label: `Ligação (${provider.label})`,
      ok: false,
      detail: err instanceof Error ? err.message : 'falha na ligação (possível CORS)',
    });
  }
  return checks;
}
