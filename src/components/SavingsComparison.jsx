import { useEffect, useState } from 'react';
import { ChevronDown, ExternalLink } from 'lucide-react';

import { api } from '../services/api';
import { domesticRate } from '../data/domesticFees';
import { overseasRow } from '../data/feeMatrix';
import { MOBILE_CASHOUT_PCT, OFFRAMP_PCT, ONRAMP_PCT } from '../data/costModel';

const money = (currency, v) => `${currency} ${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** "1.03% + CAD 9.46 fee" / "1.03%, no upfront fee" */
const quoteRate = (q, currency) =>
  q.fee > 0 ? `${q.markupPct.toFixed(2)}% + ${money(currency, q.fee)} fee` : `${q.markupPct.toFixed(2)}%, no upfront fee`;

/**
 * Cost RATES for transferring the matched part: domestically with the chosen method vs. overseas.
 * No absolute savings: how much will match isn't known until matching happens.
 */
export const SavingsComparison = ({ from, to, localAmount, method }) => {
  const [overseas, setOverseas] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  // Quotes are fetched for a representative size: the amount entered (or 1,000 if none yet).
  const quoteAmount = localAmount > 0 ? localAmount : 1000;

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => {
      api
        .overseas({
          sourceCurrency: from.currency,
          targetCurrency: to.currency,
          amount: quoteAmount,
          fromCountry: from.name,
          toCountry: to.name,
        })
        .then(setOverseas, () => setOverseas(null))
        .finally(() => setLoading(false));
    }, 400);
    return () => clearTimeout(t);
  }, [from.currency, to.currency, Math.round(quoteAmount)]);

  const dom = domesticRate(from.name, method.providerId, from.currency);
  // Verified fee matrix first (src/data/feeMatrix.js); live quotes / World Bank average only for pairs it doesn't cover.
  const row = overseasRow(from.currency, to.currency);
  const cheapest = overseas?.cheapest ?? null;
  const typical = overseas?.median ?? null;
  const banks = overseas?.quotes.filter((q) => q.type === 'bank') ?? [];
  const priciestBank = banks[banks.length - 1] ?? null;
  // Rates are compared on a representative transfer: 1,000 (the matrix's verified sample) or the amount entered.
  const compareAt = row ? 1000 : quoteAmount;
  const domPct = compareAt > 0 ? (dom.maxFee(compareAt) / compareAt) * 100 : 0;
  const overseasPct = row ? row.sample1000 / 10 : cheapest ? cheapest.totalPct : (overseas?.averagePct ?? null);
  const unmatchedPct = ONRAMP_PCT + OFFRAMP_PCT + MOBILE_CASHOUT_PCT;
  const fmtFlat = (v) => money(from.currency, v).replace(/\.00$/, '');

  const bankMarkup = row
    ? row.bankMarkup[0] === row.bankMarkup[1]
      ? `${row.bankMarkup[0].toFixed(2)}%`
      : `${row.bankMarkup[0].toFixed(2)}%–${row.bankMarkup[1].toFixed(2)}%`
    : null;
  const pts = overseasPct != null ? Math.abs(overseasPct - domPct).toFixed(2) : null;
  const sortedQuotes = overseas ? [...overseas.quotes].sort((a, b) => a.totalCost - b.totalCost) : [];
  const detailLink = 'text-slate-500 hover:underline inline-flex items-center gap-0.5';
  const sectionTitle = 'text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1';
  const basisBadge = (basis) => (
    <span
      className={`px-1 rounded text-[9px] font-semibold uppercase ${
        basis === 'sourced'
          ? 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300'
          : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
      }`}
    >
      {basis}
    </span>
  );

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden text-xs">
      <div className="px-3 py-2 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
        <span className="font-semibold text-slate-900 dark:text-white">Cost to transfer the matched amount</span>
        <span className="block text-[11px] text-slate-500">Rates only. They apply just to the part that matches.</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2">
        <div className="p-3 bg-emerald-50/60 dark:bg-emerald-950/20">
          <span className="text-[11px] text-slate-500 block truncate">Domestic · {method.name}</span>
          <span className="text-base font-bold text-slate-900 dark:text-white">{dom.label}</span>
        </div>
        <div className="p-3 bg-slate-50 dark:bg-slate-800/40">
          <span className="text-[11px] text-slate-500 block">Overseas instead · cheapest</span>
          {row ? (
            <span className="text-base font-bold text-slate-900 dark:text-white">
              {row.pct}%{row.flat > 0 ? ` + ${fmtFlat(row.flat)}` : ', no flat fee'}
            </span>
          ) : loading && !overseas ? (
            <span className="text-[11px] text-slate-400">Fetching live rates…</span>
          ) : cheapest ? (
            <span className="text-base font-bold text-slate-900 dark:text-white">{quoteRate(cheapest, from.currency)}</span>
          ) : overseas?.averagePct != null ? (
            <span className="text-base font-bold text-slate-900 dark:text-white">~{overseas.averagePct}% all-in</span>
          ) : (
            <span className="text-[11px] text-slate-400">No price data available.</span>
          )}
        </div>
      </div>

      {pts != null && (
        <div className="px-3 py-2 border-t border-slate-200 dark:border-slate-700 text-[11px] text-slate-700 dark:text-slate-200">
          Domestic is about <strong className="font-mono-numbers">{pts} percentage points {overseasPct >= domPct ? 'less' : 'more'}</strong>{' '}
          than overseas.
        </div>
      )}

      <div className="border-t border-slate-200 dark:border-slate-700">
        <button
          type="button"
          onClick={() => setShowDetails(!showDetails)}
          aria-expanded={showDetails}
          className="w-full px-3 py-2 text-[11px] text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1"
        >
          <ChevronDown className={`w-3 h-3 transition-transform ${showDetails ? 'rotate-180' : ''}`} />
          {showDetails ? 'Hide details & sources' : 'Details, sources & all Wise quotes'}
        </button>

        {showDetails && (
          <div className="px-3 pb-3 space-y-3 text-[11px] text-slate-600 dark:text-slate-300">
            <div>
              <div className={sectionTitle}>Domestic: {method.name}</div>
              <div>
                {dom.rail ? `${dom.rail.rail} (${from.name})` : dom.note} {basisBadge(dom.basis)}
                {dom.sourceUrl && (
                  <a href={dom.sourceUrl} target="_blank" rel="noreferrer" className={`ml-2 ${detailLink}`}>
                    Source <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                )}
              </div>
            </div>

            <div>
              <div className={sectionTitle}>Overseas</div>
              {row ? (
                <ul className="space-y-0.5">
                  <li>
                    <strong>{row.provider}</strong>, {row.fundingMethod.toLowerCase()}: {row.pct}% variable
                    {row.flat > 0 ? ` + ${fmtFlat(row.flat)} flat` : ''}.
                  </li>
                  <li>
                    Verified quote: {money(from.currency, row.sample1000)} on {fmtFlat(1000)} ({(row.sample1000 / 10).toFixed(2)}% all-in).
                  </li>
                  <li>Traditional banks: {bankMarkup} FX markup.</li>
                  <li className="text-slate-500">{row.note}</li>
                  <li>
                    <a href={row.sourceUrl} target="_blank" rel="noreferrer" className={detailLink}>
                      Source <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  </li>
                </ul>
              ) : cheapest ? (
                <ul className="space-y-0.5">
                  <li>
                    Cheapest: <strong>{cheapest.provider}</strong>, {quoteRate(cheapest, from.currency)} (FX markup vs mid-market rate).
                  </li>
                  {typical && typical !== cheapest && (
                    <li>
                      Typical: {typical.provider}, {quoteRate(typical, from.currency)}.
                    </li>
                  )}
                  {priciestBank && (
                    <li>
                      Banks: up to {priciestBank.markupPct.toFixed(2)}%
                      {priciestBank.fee > 0 ? ` + ${money(from.currency, priciestBank.fee)} fee` : ''} ({priciestBank.provider}).
                    </li>
                  )}
                </ul>
              ) : overseas?.averagePct != null ? (
                <div>World Bank average, ~{overseas.averagePct}% all-in (no live quotes for {from.currency} → {to.currency}).</div>
              ) : (
                <div>No price data available.</div>
              )}
            </div>

            {pts != null && (
              <div>
                <div className={sectionTitle}>Comparison</div>
                <div>
                  Domestic is {pts} percentage points {overseasPct >= domPct ? 'less' : 'more'} than the cheapest overseas option
                  {row && bankMarkup ? (
                    <>
                      {' '}
                      ({Math.max(0, row.bankMarkup[0] - domPct).toFixed(2)}
                      {row.bankMarkup[1] !== row.bankMarkup[0] && `–${Math.max(0, row.bankMarkup[1] - domPct).toFixed(2)}`} less than a bank)
                    </>
                  ) : (
                    typical && typical !== cheapest && <> ({Math.max(0, typical.totalPct - domPct).toFixed(2)} less than typical)</>
                  )}
                  . Flat fees are counted on a transfer of {fmtFlat(compareAt)}, with the domestic fee at its highest.
                </div>
              </div>
            )}

            <div>
              <div className={sectionTitle}>Any unmatched part</div>
              <div>
                Converted to USDC and sent via Stellar Blockchain for about {unmatchedPct.toFixed(1)}% (on-ramp {ONRAMP_PCT}% + off-ramp{' '}
                {OFFRAMP_PCT}% + cash-out {MOBILE_CASHOUT_PCT}%), plus a network fee of under $0.01.
              </div>
            </div>

            {sortedQuotes.length > 0 && (
              <div>
                <div className={sectionTitle}>
                  Live quotes from {sortedQuotes.length} banks &amp; transfer providers for {fmtFlat(overseas.amount)}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px] font-mono-numbers">
                    <thead>
                      <tr className="text-slate-500 text-left">
                        <th className="py-1 pr-2 font-normal">Provider</th>
                        <th className="py-1 px-2 font-normal text-right">FX markup</th>
                        <th className="py-1 px-2 font-normal text-right">Upfront fee</th>
                        <th className="py-1 px-2 font-normal text-right">Total cost</th>
                        <th className="py-1 pl-2 font-normal text-right">All-in</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedQuotes.map((q, i) => (
                        <tr key={q.provider} className="border-t border-slate-100 dark:border-slate-800 text-slate-700 dark:text-slate-300">
                          <td className="py-1 pr-2 font-sans">
                            {q.provider}
                            {q.type === 'bank' && <span className="text-slate-400"> (bank)</span>}
                            {i === 0 && <span className="ml-1 text-emerald-600 dark:text-emerald-400">cheapest</span>}
                          </td>
                          <td className="py-1 px-2 text-right">{q.markupPct.toFixed(2)}%</td>
                          <td className="py-1 px-2 text-right">{q.fee > 0 ? money(from.currency, q.fee) : 'None'}</td>
                          <td className="py-1 px-2 text-right">{money(from.currency, q.totalCost)}</td>
                          <td className="py-1 pl-2 text-right">{q.totalPct.toFixed(2)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-1 text-slate-500 flex flex-wrap gap-x-3">
                  {overseas.collectedAt && <span>Collected {new Date(overseas.collectedAt).toLocaleString()}</span>}
                  <span>Via Wise&apos;s public price comparison</span>
                  <a href={overseas.sourceUrl} target="_blank" rel="noreferrer" className={detailLink}>
                    Open on Wise <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
