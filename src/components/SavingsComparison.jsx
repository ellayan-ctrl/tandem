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
  const [showQuotes, setShowQuotes] = useState(false);
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

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden text-xs">
      <div className="px-3 py-2 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
        <span className="font-semibold text-slate-900 dark:text-white">Cost to transfer the matched amount</span>
        <span className="block text-[11px] text-slate-500">
          Rates only: how much of your transfer will match isn&apos;t known until it matches, and only that part is charged these rates.
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2">
        <div className="p-3 bg-emerald-50/60 dark:bg-emerald-950/20">
          <span className="text-[11px] text-slate-500 block">Domestic, from {method.name}</span>
          <span className="text-base font-bold text-slate-900 dark:text-white">{dom.label}</span>
          <span className="text-[10px] text-slate-400 block mt-0.5">
            {dom.rail ? `${dom.rail.rail} (${from.name})` : dom.note}{' '}
            <span
              className={`px-1 rounded text-[9px] font-semibold uppercase ${
                dom.basis === 'sourced'
                  ? 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300'
                  : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
              }`}
            >
              {dom.basis}
            </span>
            {dom.sourceUrl && (
              <a href={dom.sourceUrl} target="_blank" rel="noreferrer" className="ml-1 inline-flex items-center hover:underline">
                source <ExternalLink className="w-2.5 h-2.5 ml-0.5" />
              </a>
            )}
          </span>
        </div>

        <div className="p-3 bg-slate-50 dark:bg-slate-800/40">
          <span className="text-[11px] text-slate-500 block">Overseas instead (cheapest option)</span>
          {row ? (
            <>
              <span className="text-base font-bold text-slate-900 dark:text-white">
                {row.pct}%{row.flat > 0 ? ` + ${fmtFlat(row.flat)}` : ', no flat fee'}
              </span>
              <span className="text-[11px] text-slate-600 dark:text-slate-300 block">
                {row.provider}, {row.fundingMethod.toLowerCase()}
              </span>
              <span className="text-[10px] text-slate-400 block mt-0.5">
                Verified quote: {money(from.currency, row.sample1000)} on {fmtFlat(1000)} ({(row.sample1000 / 10).toFixed(2)}% all-in)
              </span>
              <span className="text-[10px] text-slate-400 block">
                Traditional banks:{' '}
                {row.bankMarkup[0] === row.bankMarkup[1]
                  ? `${row.bankMarkup[0].toFixed(2)}%`
                  : `${row.bankMarkup[0].toFixed(2)}%–${row.bankMarkup[1].toFixed(2)}%`}{' '}
                FX markup
              </span>
            </>
          ) : loading && !overseas ? (
            <span className="text-[11px] text-slate-400">Fetching live rates…</span>
          ) : cheapest ? (
            <>
              <span className="text-base font-bold text-slate-900 dark:text-white">{quoteRate(cheapest, from.currency)}</span>
              <span className="text-[11px] text-slate-600 dark:text-slate-300 block">
                {cheapest.provider}, FX markup vs mid-market rate
              </span>
              {typical && typical !== cheapest && (
                <span className="text-[10px] text-slate-400 block mt-0.5">
                  Typical: {typical.provider} {quoteRate(typical, from.currency)}
                </span>
              )}
              {priciestBank && (
                <span className="text-[10px] text-slate-400 block">
                  Banks: up to {priciestBank.markupPct.toFixed(2)}%
                  {priciestBank.fee > 0 ? ` + ${money(from.currency, priciestBank.fee)} fee` : ''} ({priciestBank.provider})
                </span>
              )}
            </>
          ) : overseas?.averagePct != null ? (
            <>
              <span className="text-base font-bold text-slate-900 dark:text-white">~{overseas.averagePct}% all-in</span>
              <span className="text-[11px] text-slate-600 dark:text-slate-300 block">
                World Bank average (no quotes for {from.currency} → {to.currency})
              </span>
            </>
          ) : (
            <span className="text-[11px] text-slate-400">No price data available.</span>
          )}
        </div>
      </div>

      {overseasPct != null && (
        <div className="px-3 py-2 border-t border-slate-200 dark:border-slate-700 text-[11px] text-slate-700 dark:text-slate-200 flex flex-wrap items-center justify-between gap-2">
          <span>
            Domestic costs about{' '}
            <strong className="font-mono-numbers">
              {Math.abs(overseasPct - domPct).toFixed(2)} percentage points {overseasPct >= domPct ? 'less' : 'more'}
            </strong>{' '}
            than the cheapest overseas option
            {row ? (
              <>
                {' '}
                ({Math.max(0, row.bankMarkup[0] - domPct).toFixed(2)}
                {row.bankMarkup[1] !== row.bankMarkup[0] && `–${Math.max(0, row.bankMarkup[1] - domPct).toFixed(2)}`} less than a bank)
              </>
            ) : (
              typical && typical !== cheapest && <> ({Math.max(0, typical.totalPct - domPct).toFixed(2)} less than typical)</>
            )}
            , counting flat fees (domestic at its highest) on a transfer of {fmtFlat(compareAt)}.
          </span>
          {row ? (
            <a
              href={row.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="text-slate-500 hover:underline inline-flex items-center gap-1"
            >
              Source <ExternalLink className="w-3 h-3" />
            </a>
          ) : (
            overseas && (
              <a
                href={overseas.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="text-slate-500 hover:underline inline-flex items-center gap-1"
              >
                {overseas.source === 'live' ? 'Live rates' : 'World Bank'} <ExternalLink className="w-3 h-3" />
              </a>
            )
          )}
        </div>
      )}

      <div className="px-3 py-2 border-t border-slate-200 dark:border-slate-700 text-[11px] text-slate-600 dark:text-slate-300">
        Any unmatched part instead: converted to USDC and sent via Stellar Blockchain for ≈ {unmatchedPct.toFixed(1)}% (on-ramp {ONRAMP_PCT}
        % + off-ramp {OFFRAMP_PCT}% + cash-out {MOBILE_CASHOUT_PCT}%), plus a network fee of under $0.01.
      </div>

      {overseas && overseas.quotes.length > 0 && (
        <div className="border-t border-slate-200 dark:border-slate-700">
          <button
            type="button"
            onClick={() => setShowQuotes(!showQuotes)}
            className="w-full px-3 py-1.5 text-[11px] text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1"
          >
            <ChevronDown className={`w-3 h-3 transition-transform ${showQuotes ? 'rotate-180' : ''}`} />
            {row ? 'Live quotes from' : 'Overseas rates from'} {overseas.quotes.length} banks & transfer providers (via Wise&apos;s price
            comparison)
            {overseas.collectedAt && ` · collected ${new Date(overseas.collectedAt).toLocaleString()}`}
          </button>
          {showQuotes && (
            <table className="w-full text-[11px] font-mono-numbers">
              <thead>
                <tr className="text-slate-500 text-left">
                  <th className="px-3 py-1 font-normal">Provider</th>
                  <th className="px-3 py-1 font-normal text-right">FX markup</th>
                  <th className="px-3 py-1 font-normal text-right">Upfront fee</th>
                </tr>
              </thead>
              <tbody>
                {[...overseas.quotes]
                  .sort((a, b) => a.markupPct - b.markupPct)
                  .map((q) => (
                    <tr key={q.provider} className="border-t border-slate-100 dark:border-slate-800 text-slate-700 dark:text-slate-300">
                      <td className="px-3 py-1 font-sans">
                        {q.provider} <span className="text-slate-400">{q.type === 'bank' ? '(bank)' : ''}</span>
                      </td>
                      <td className="px-3 py-1 text-right">{q.markupPct.toFixed(2)}%</td>
                      <td className="px-3 py-1 text-right">{q.fee > 0 ? money(from.currency, q.fee) : 'None'}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
};
