/**
 * Extract Both-Teams-To-Score (BTTS) odds from a Flashscore "match odds"
 * response. That endpoint returns an array of bookmakers, each with a list of
 * market groups ({bettingType, bettingScope, odds[]}). For the full-time BTTS
 * market each bookmaker exposes two lines: `bothTeamsToScore: true` (odd for
 * "Yes") and `false` (odd for "No"). We average across bookmakers to get a
 * market-consensus Yes/No pair the Calculator can blend into its prediction.
 */

export interface FlashBttsOdds {
  /** Average decimal odd for BTTS Yes (full time). */
  yes: number;
  /** Average decimal odd for BTTS No (full time). */
  no: number;
  /** How many bookmakers contributed a complete Yes/No pair. */
  bookmakers: number;
}

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Coerce wrapped payloads ({data|response|result: [...]}) into the array. */
function toBookmakerArray(input: unknown): unknown[] {
  if (Array.isArray(input)) return input;
  if (!input || typeof input !== 'object') return [];
  for (const v of Object.values(input as Record<string, unknown>)) {
    if (Array.isArray(v)) return v;
  }
  return [];
}

/**
 * Parse full-time BTTS odds, averaged across all bookmakers. Returns null when
 * no bookmaker offers a complete Yes/No pair.
 */
export function parseFlashscoreBttsOdds(input: unknown): FlashBttsOdds | null {
  const books = toBookmakerArray(input);
  const yesOdds: number[] = [];
  const noOdds: number[] = [];

  for (const book of books) {
    if (!book || typeof book !== 'object') continue;
    const markets = (book as { odds?: unknown }).odds;
    if (!Array.isArray(markets)) continue;

    let bookYes: number | null = null;
    let bookNo: number | null = null;
    for (const market of markets) {
      if (!market || typeof market !== 'object') continue;
      const m = market as { bettingType?: string; bettingScope?: string; odds?: unknown };
      if (m.bettingType !== 'BOTH_TEAMS_TO_SCORE' || m.bettingScope !== 'FULL_TIME') continue;
      if (!Array.isArray(m.odds)) continue;
      for (const line of m.odds) {
        if (!line || typeof line !== 'object') continue;
        const l = line as { value?: unknown; bothTeamsToScore?: unknown };
        const v = num(l.value);
        if (v === null) continue;
        if (l.bothTeamsToScore === true) bookYes = v;
        else if (l.bothTeamsToScore === false) bookNo = v;
      }
    }
    if (bookYes !== null && bookNo !== null) {
      yesOdds.push(bookYes);
      noOdds.push(bookNo);
    }
  }

  if (yesOdds.length === 0 || noOdds.length === 0) return null;
  const avg = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length;
  return {
    yes: round2(avg(yesOdds)),
    no: round2(avg(noOdds)),
    bookmakers: yesOdds.length,
  };
}

// ---- Over/Under 2.5 + all-market odds ----

/** Full-time market groups of every bookmaker in the payload. */
function fullTimeMarkets(input: unknown): Array<{ bettingType: string; lines: unknown[] }>[] {
  const out: Array<{ bettingType: string; lines: unknown[] }>[] = [];
  for (const book of toBookmakerArray(input)) {
    if (!book || typeof book !== 'object') continue;
    const markets = (book as { odds?: unknown }).odds;
    if (!Array.isArray(markets)) continue;
    const groups: Array<{ bettingType: string; lines: unknown[] }> = [];
    for (const market of markets) {
      if (!market || typeof market !== 'object') continue;
      const m = market as { bettingType?: unknown; bettingScope?: unknown; odds?: unknown };
      if (m.bettingScope !== 'FULL_TIME' || typeof m.bettingType !== 'string') continue;
      if (!Array.isArray(m.odds)) continue;
      groups.push({ bettingType: m.bettingType, lines: m.odds });
    }
    out.push(groups);
  }
  return out;
}

/** The line's total (e.g. 2.5) from the common shapes: handicap {value} or flat. */
function lineTotal(l: Record<string, unknown>): number | null {
  const h = l.handicap;
  if (h && typeof h === 'object') return num((h as { value?: unknown }).value);
  return num(h ?? l.total ?? l.line);
}

/** OVER / UNDER from an explicitly labelled line; null when not labelled. */
function overUnderSide(l: Record<string, unknown>): 'over' | 'under' | null {
  const raw = l.selection ?? l.type ?? l.name;
  if (typeof raw !== 'string') return null;
  const s = raw.trim().toUpperCase();
  if (s === 'OVER') return 'over';
  if (s === 'UNDER') return 'under';
  return null;
}

export interface FlashMarketOdds {
  bttsYes?: number;
  bttsNo?: number;
  over25?: number;
  under25?: number;
}

/**
 * Parse every market we use from ONE Flashscore "match odds" response, averaged
 * across bookmakers: BTTS Yes/No and Over/Under 2.5 (full time).
 *
 * Over/Under is parsed STRICTLY — a line counts only when it is explicitly
 * labelled OVER/UNDER and its total is exactly 2.5. An unexpected shape yields
 * no O/U odds (the UI then keeps manual entry) instead of mislabelled odds.
 */
export function parseFlashscoreMarketOdds(input: unknown): FlashMarketOdds | null {
  const out: FlashMarketOdds = {};
  const btts = parseFlashscoreBttsOdds(input);
  if (btts) {
    out.bttsYes = btts.yes;
    out.bttsNo = btts.no;
  }

  const overs: number[] = [];
  const unders: number[] = [];
  for (const groups of fullTimeMarkets(input)) {
    let bookOver: number | null = null;
    let bookUnder: number | null = null;
    for (const g of groups) {
      if (g.bettingType !== 'OVER_UNDER') continue;
      for (const line of g.lines) {
        if (!line || typeof line !== 'object') continue;
        const l = line as Record<string, unknown>;
        if (lineTotal(l) !== 2.5) continue;
        const side = overUnderSide(l);
        const v = num(l.value);
        if (!side || v === null) continue;
        if (side === 'over') bookOver = v;
        else bookUnder = v;
      }
    }
    if (bookOver !== null && bookUnder !== null) {
      overs.push(bookOver);
      unders.push(bookUnder);
    }
  }
  if (overs.length > 0) {
    const avg = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length;
    out.over25 = round2(avg(overs));
    out.under25 = round2(avg(unders));
  }
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * Diagnostics: which full-time markets the payload carries and, per market, the
 * field NAMES of its first line (no values). Lets us confirm the real shape of
 * markets we don't parse yet without logging any odds or keys.
 */
export function describeFlashscoreOddsMarkets(
  input: unknown,
): Array<{ bettingType: string; lineFields: string[]; sample: string }> {
  const seen = new Map<string, { lineFields: string[]; sample: string }>();
  for (const groups of fullTimeMarkets(input)) {
    for (const g of groups) {
      if (seen.has(g.bettingType)) continue;
      const first = g.lines.find((l) => l && typeof l === 'object') as
        | Record<string, unknown>
        | undefined;
      const lineFields = first ? Object.keys(first).sort() : [];
      // Non-numeric labels only (e.g. selection: "OVER", handicap.value: "2.5"),
      // so the shape is visible without exposing prices.
      const sample = first
        ? Object.entries(first)
            .filter(([k]) => k !== 'value' && k !== 'opening')
            .map(([k, v]) =>
              v && typeof v === 'object' ? `${k}=${JSON.stringify(v)}` : `${k}=${String(v)}`,
            )
            .join(', ')
        : '';
      seen.set(g.bettingType, { lineFields, sample });
    }
  }
  return [...seen.entries()].map(([bettingType, v]) => ({ bettingType, ...v }));
}
