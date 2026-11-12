/**
 * Live cost of sending money OVERSEAS, for comparison with paying the matched part domestically.
 *
 * Source: Wise's public price-comparison endpoint, which returns current quotes (flat fee + FX
 * markup vs. the mid-market rate) from banks and money-transfer providers for a currency pair.
 * Note Wise is itself one of the providers compared. When a pair has no live quotes (e.g. KES ->
 * CAD), we fall back to the World Bank Remittance Prices Worldwide average.
 */
import { TRADITIONAL_REMITTANCE_PCT } from '../src/data/costModel.ts';

export interface OverseasQuote {
  provider: string;
  type: 'bank' | 'moneyTransferProvider' | string;
  fee: number; // source currency
  markupPct: number; // FX margin vs mid-market
  totalCost: number; // fee + markup on the amount, source currency
  totalPct: number;
}

export interface OverseasPricing {
  source: 'live' | 'world_bank_average';
  sourceLabel: string;
  sourceUrl: string;
  collectedAt: string | null;
  amount: number;
  sourceCurrency: string;
  targetCurrency: string;
  quotes: OverseasQuote[]; // cheapest first
  cheapest: OverseasQuote | null;
  median: OverseasQuote | null;
  /** Average when no live quotes. */
  averagePct: number | null;
}

const CACHE_MS = 10 * 60_000;
const cache = new Map<string, { at: number; value: OverseasPricing }>();

export async function overseasPricing(p: {
  sourceCurrency: string;
  targetCurrency: string;
  amount: number;
  fromCountry: string;
  toCountry: string;
}): Promise<OverseasPricing> {
  const amount = Math.max(1, Math.round(p.amount));
  // Quotes scale with amount; bucket the cache key so typing doesn't hammer the API.
  const bucket = amount < 100 ? amount : Math.round(amount / 25) * 25;
  const key = `${p.sourceCurrency}-${p.targetCurrency}-${bucket}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return rescale(hit.value, amount);

  let value: OverseasPricing | null = null;
  try {
    const url = `https://api.wise.com/v4/comparisons/?sourceCurrency=${p.sourceCurrency}&targetCurrency=${p.targetCurrency}&sendAmount=${bucket}`;
    const res = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const data = (await res.json()) as { providers?: Array<{ name: string; type: string; quotes?: any[] }> };
      const quotes: OverseasQuote[] = (data.providers ?? [])
        .map((pr) => {
          const q = pr.quotes?.[0];
          if (!q) return null;
          const fee = Number(q.fee) || 0;
          const markupPct = Number(q.markup) || 0;
          const totalCost = fee + (bucket * markupPct) / 100;
          return { provider: pr.name, type: pr.type, fee, markupPct, totalCost, totalPct: (totalCost / bucket) * 100, collectedAt: q.dateCollected };
        })
        .filter((q): q is OverseasQuote & { collectedAt: string } => !!q)
        .sort((a, b) => a.totalCost - b.totalCost);
      if (quotes.length) {
        value = {
          source: 'live',
          sourceLabel: `Live quotes from ${quotes.length} banks & transfer providers (via Wise's price comparison)`,
          sourceUrl: `https://wise.com/gb/compare/?sourceCurrency=${p.sourceCurrency}&targetCurrency=${p.targetCurrency}&sendAmount=${bucket}`,
          collectedAt: (quotes as any)[0].collectedAt ?? new Date().toISOString(),
          amount: bucket,
          sourceCurrency: p.sourceCurrency,
          targetCurrency: p.targetCurrency,
          quotes: quotes.map(({ collectedAt: _c, ...q }: any) => q),
          cheapest: null,
          median: null,
          averagePct: null,
        };
      }
    }
  } catch {
    // fall through to the World Bank average
  }

  if (!value) {
    const pct = TRADITIONAL_REMITTANCE_PCT[`${p.fromCountry}->${p.toCountry}`] ?? TRADITIONAL_REMITTANCE_PCT.default;
    value = {
      source: 'world_bank_average',
      sourceLabel: `No live quotes for ${p.sourceCurrency} → ${p.targetCurrency}; World Bank average remittance cost (${pct}%)`,
      sourceUrl: 'https://remittanceprices.worldbank.org/',
      collectedAt: null,
      amount: bucket,
      sourceCurrency: p.sourceCurrency,
      targetCurrency: p.targetCurrency,
      quotes: [],
      cheapest: null,
      median: null,
      averagePct: pct,
    };
  }
  cache.set(key, { at: Date.now(), value });
  return rescale(value, amount);
}

/** Re-express cached quotes for the exact amount (fees are flat, markups are %). */
function rescale(v: OverseasPricing, amount: number): OverseasPricing {
  const quotes = v.quotes
    .map((q) => {
      const totalCost = q.fee + (amount * q.markupPct) / 100;
      return { ...q, totalCost, totalPct: (totalCost / amount) * 100 };
    })
    .sort((a, b) => a.totalCost - b.totalCost);
  return {
    ...v,
    amount,
    quotes,
    cheapest: quotes[0] ?? null,
    median: quotes.length ? quotes[Math.floor((quotes.length - 1) / 2)] : null,
  };
}
