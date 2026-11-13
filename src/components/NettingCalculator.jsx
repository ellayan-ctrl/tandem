import { useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight } from 'lucide-react';

import fxFallback from '../../shared/fx_rates.json';
import { COST_SOURCES, DEFAULT_XLM_USD, NETWORK_FEES, OFFRAMP_PCT, ONRAMP_PCT, STROOPS_PER_XLM } from '../data/costModel';
import { CORRIDORS } from '../data/corridors';
import { corridorCosts } from '../data/feeSheet';
import { SHEETS } from '../data/sheets';
const MAX_AMOUNT = 1000;
const FX_URL = 'https://open.er-api.com/v6/latest/USD';

const usd = (v) =>
  v === 0 ? '$0.00' : v < 0.01 ? `$${v.toFixed(4)}` : `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (v) => `${Number(v.toFixed(2))}%`;
const money = (v, cur) => `${cur} ${Number(v.toFixed(2)).toLocaleString('en-US')}`;

export const NettingCalculator = () => {
  const [sheetId, setSheetId] = useState('verified');
  const rows = SHEETS[sheetId].rows;

  // The app's country pairs (shared/corridors.json), as on every other tab.
  const [pairId, setPairId] = useState(CORRIDORS[0].id);
  const [reversed, setReversed] = useState(false);
  const pair = CORRIDORS.find((p) => p.id === pairId) ?? CORRIDORS[0];
  const origin = reversed ? pair.countryB.name : pair.countryA.name;
  const dest = reversed ? pair.countryA.name : pair.countryB.name;
  const [amount, setAmount] = useState(MAX_AMOUNT);
  const [matched, setMatched] = useState(500);
  const [onrampPct, setOnrampPct] = useState(ONRAMP_PCT);
  const [offrampPct, setOfframpPct] = useState(OFFRAMP_PCT);
  const [xlmUsd, setXlmUsd] = useState(DEFAULT_XLM_USD);
  const [fx, setFx] = useState({ rates: Object.fromEntries(Object.entries(fxFallback.rates).map(([k, v]) => [k, v.rate])), live: false, date: null });

  // Live FX (USD -> origin currency), falling back to the app's indicative rates.
  useEffect(() => {
    let alive = true;
    fetch(FX_URL)
      .then((r) => r.json())
      .then((d) => {
        if (alive && d.result === 'success') setFx({ rates: d.rates, live: true, date: d.time_last_update_utc });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const row = rows.find((r) => r.origin === origin && r.dest === dest);
  const otherSheet = Object.entries(SHEETS).find(([id, s]) => id !== sheetId && s.rows.some((r) => r.origin === origin && r.dest === dest));
  const rate = row ? fx.rates[row.originCurrency] : undefined;
  const M = Math.min(matched, amount);

  const networkUsd = {
    preauth: (NETWORK_FEES.preauthApprove / STROOPS_PER_XLM) * xlmUsd,
    payout: (NETWORK_FEES.sorobanPayout / STROOPS_PER_XLM) * xlmUsd,
  };
  const params = { amountUsd: amount, fx: rate, onrampPct, offrampPct, networkUsd };
  const c = row && rate ? corridorCosts(row, { ...params, matchedUsd: M }) : null;

  // TwoWay total across every matched amount, for the chart.
  const curve = useMemo(() => {
    if (!row || !rate) return [];
    const steps = 50;
    return Array.from({ length: steps + 1 }, (_, k) => {
      const m = (amount * k) / steps;
      return { m, total: corridorCosts(row, { ...params, matchedUsd: m }).twoWay.total };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row, rate, amount, onrampPct, offrampPct, xlmUsd]);

  const inputCls =
    'px-2 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-white';

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">Cost Calculator</h1>
        <p className="mt-1 text-xs text-slate-500 max-w-3xl">
          Pick a country pair and direction, then slide how much of the transfer is matched domestically. Every corridor fee (overseas
          provider, domestic rail, bank FX markup) is read from the fee spreadsheet <code className="text-[11px]">{SHEETS[sheetId].file}</code>;
          change the CSV and the calculator follows.
        </p>
      </div>

      {/* Inputs */}
      <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-4 bg-white dark:bg-slate-900 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
        <label className="block md:col-span-2">
          <span className="text-slate-500 block mb-1">Fee spreadsheet</span>
          <select value={sheetId} onChange={(e) => setSheetId(e.target.value)} className={`w-full ${inputCls}`}>
            {Object.entries(SHEETS).map(([id, s]) => (
              <option key={id} value={id}>
                {s.label} ({s.rows.length} of the app's directions)
              </option>
            ))}
          </select>
        </label>

        <div>
          <span className="text-slate-500 block mb-1">Countries</span>
          <div className="flex items-center gap-1.5">
            <select value={pairId} onChange={(e) => setPairId(e.target.value)} className={`flex-1 min-w-0 ${inputCls}`} aria-label="Country pair">
              {CORRIDORS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.countryA.name} ⇄ {c.countryB.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setReversed(!reversed)}
              className="p-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
              title="Reverse direction"
              aria-label="Reverse direction"
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <span className="text-[10px] text-slate-400 block mt-1">
            {pair[reversed ? 'countryB' : 'countryA'].flag} {origin} → {pair[reversed ? 'countryA' : 'countryB'].flag} {dest}
          </span>
        </div>

        <label className="block">
          <span className="text-slate-500 block mb-1">Amount to send (USD, up to ${MAX_AMOUNT.toLocaleString()})</span>
          <input
            type="number"
            min={1}
            max={MAX_AMOUNT}
            value={amount}
            onChange={(e) => setAmount(Math.min(MAX_AMOUNT, Math.max(0, Number(e.target.value) || 0)))}
            className={`w-full font-mono-numbers ${inputCls}`}
          />
        </label>

        <div className="md:col-span-2">
          <div className="flex flex-wrap justify-between gap-2 mb-1">
            <label htmlFor="matched" className="text-slate-500">
              Matched domestically
            </label>
            <span className="font-mono-numbers font-semibold text-slate-900 dark:text-white">
              {usd(M)} matched ({amount > 0 ? Math.round((M / amount) * 100) : 0}%) · {usd(amount - M)} via crypto
            </span>
          </div>
          <input
            id="matched"
            type="range"
            min={0}
            max={MAX_AMOUNT}
            step={1}
            value={M}
            onChange={(e) => setMatched(Math.min(amount, Number(e.target.value)))}
            className="w-full accent-slate-900 dark:accent-white"
            aria-valuetext={`${usd(M)} matched domestically`}
          />
          <div className="flex justify-between text-[10px] text-slate-400 font-mono-numbers">
            <span>$0 (fully crypto)</span>
            <span>$500</span>
            <span>$1,000</span>
          </div>
          {row && (
            <p className="text-[11px] text-slate-500 mt-1">
              Matched part: {row.domestic.method} at {pct(row.domestic.pct)} + {money(row.domestic.flat, row.originCurrency)}
              {row.domestic.cap ? `, capped at ${money(row.domestic.cap, row.originCurrency)}` : ''} (spreadsheet). Unmatched part: on-ramp{' '}
              {pct(onrampPct)} + off-ramp {pct(offrampPct)} + Stellar fee.
            </p>
          )}
        </div>
      </div>

      {!row && (
        <div className="text-xs p-3 rounded-md bg-amber-50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300">
          This spreadsheet has no {origin} → {dest} row.{' '}
          {otherSheet ? (
            <button type="button" className="underline font-semibold" onClick={() => setSheetId(otherSheet[0])}>
              Use the {otherSheet[1].label}, which has it
            </button>
          ) : (
            'Neither spreadsheet has this direction; reverse it or pick another pair.'
          )}
        </div>
      )}
      {row && !rate && (
        <div className="text-xs text-rose-600">No exchange rate for {row.originCurrency}, so its fees can't be converted to USD.</div>
      )}

      {row && c && (
        <>
          {/* The spreadsheet row */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-4 bg-white dark:bg-slate-900 text-xs space-y-2">
            <div className="flex flex-wrap justify-between gap-2">
              <span className="font-semibold text-slate-900 dark:text-white">
                Spreadsheet row {row.id}: {row.origin} ({row.originCurrency}) → {row.dest} ({row.destCurrency})
              </span>
              {row.sourceUrl && (
                <a href={row.sourceUrl} target="_blank" rel="noreferrer" className="text-sky-700 dark:text-sky-400 hover:underline">
                  Source
                </a>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[11px] text-slate-600 dark:text-slate-300">
              <div>
                <span className="text-slate-400 block">Overseas ({row.provider})</span>
                {pct(row.overseas.pct)} + {money(row.overseas.flat, row.originCurrency)}
                {row.overseas.sample1000 !== null && (
                  <span className="text-slate-400 block">Sheet sample on 1,000 {row.originCurrency}: {money(row.overseas.sample1000, row.originCurrency)}</span>
                )}
              </div>
              <div>
                <span className="text-slate-400 block">Domestic rail</span>
                {row.domestic.method}: {pct(row.domestic.pct)} + {money(row.domestic.flat, row.originCurrency)}
                {row.domestic.cap ? ` (cap ${money(row.domestic.cap, row.originCurrency)})` : ''}
              </div>
              <div>
                <span className="text-slate-400 block">Traditional bank FX markup</span>
                {row.bankMarkup ? (row.bankMarkup[0] === row.bankMarkup[1] ? pct(row.bankMarkup[0]) : `${pct(row.bankMarkup[0])} – ${pct(row.bankMarkup[1])}`) : 'n/a'}
              </div>
            </div>
            {row.note && <p className="text-[10px] text-slate-400">{row.note}</p>}
          </div>

          {/* Results */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <Card
              title="Fully via crypto (nothing matched)"
              total={c.fullCrypto.total}
              amount={amount}
              lines={[
                [`On-ramp to USDC (${pct(onrampPct)})`, c.fullCrypto.onramp],
                ['Stellar payout fee', c.fullCrypto.network],
                [`Off-ramp to local (${pct(offrampPct)})`, c.fullCrypto.offramp],
              ]}
            />
            <Card
              highlight
              title={`TwoWay: ${usd(M)} matched, ${usd(c.unmatched)} via crypto`}
              total={c.twoWay.total}
              amount={amount}
              lines={[
                [
                  `Matched: ${row.domestic.method}`,
                  c.twoWay.domestic,
                  c.twoWay.domesticLow < c.twoWay.domestic ? `sheet range ${usd(c.twoWay.domesticLow)}–${usd(c.twoWay.domestic)}; the higher is used` : null,
                ],
                ['Pre-authorization (Soroban)', c.twoWay.preauth],
                [`Unmatched: on-ramp (${pct(onrampPct)})`, c.twoWay.onramp],
                ['Unmatched: Stellar payout fee', c.twoWay.network],
                [`Unmatched: off-ramp (${pct(offrampPct)})`, c.twoWay.offramp],
              ]}
            />
            <Card
              title={`Overseas provider (${row.provider})`}
              total={c.overseas}
              amount={amount}
              lines={[[`${pct(row.overseas.pct)} + ${money(row.overseas.flat, row.originCurrency)} on the whole amount`, c.overseas]]}
            />
            <Card
              title="Traditional bank (FX markup only)"
              total={c.bank ? c.bank[1] : 0}
              totalLabel={c.bank ? (c.bank[0] === c.bank[1] ? usd(c.bank[1]) : `${usd(c.bank[0])} – ${usd(c.bank[1])}`) : 'n/a'}
              amount={amount}
              lines={c.bank ? [['Markup range from the sheet (wire fees not included)', c.bank[1]]] : []}
            />
          </div>

          <div className="p-4 rounded-lg border-2 border-slate-900 dark:border-white bg-white dark:bg-slate-900 text-xs flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
            <div>
              <span className="text-slate-500 block">Matching {usd(M)} domestically saves, vs sending it all via crypto</span>
              <span className="text-2xl font-bold font-mono-numbers text-slate-900 dark:text-white">
                {usd(Math.max(0, c.fullCrypto.total - c.twoWay.total))}
              </span>
              {c.twoWay.total > c.fullCrypto.total && (
                <span className="text-[11px] text-amber-700 dark:text-amber-400 block">
                  At this amount the domestic rail costs more than crypto for the matched part ({usd(c.twoWay.total - c.fullCrypto.total)} more).
                </span>
              )}
            </div>
            <div className="text-[11px] text-slate-500 sm:text-right font-mono-numbers">
              TwoWay {pct(amount > 0 ? (c.twoWay.total / amount) * 100 : 0)} · full crypto {pct(amount > 0 ? (c.fullCrypto.total / amount) * 100 : 0)} ·{' '}
              {row.provider} {pct(amount > 0 ? (c.overseas / amount) * 100 : 0)} of {usd(amount)}
            </div>
          </div>

          <CostChart curve={curve} amount={amount} matched={M} fullCrypto={c.fullCrypto.total} overseas={c.overseas} provider={row.provider} />
        </>
      )}

      {/* Crypto assumptions */}
      <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-4 bg-white dark:bg-slate-900 text-xs space-y-2">
        <span className="font-semibold text-slate-900 dark:text-white block">Crypto route assumptions (not in the spreadsheet; edit to test)</span>
        <div className="flex flex-wrap gap-4">
          <NumberField label="On-ramp %" value={onrampPct} onChange={setOnrampPct} step={0.1} />
          <NumberField label="Off-ramp %" value={offrampPct} onChange={setOfframpPct} step={0.1} />
          <NumberField label="XLM price $" value={xlmUsd} onChange={setXlmUsd} step={0.01} />
        </div>
        <p className="text-[10px] text-slate-400">
          Stellar fees are measured from this app&apos;s testnet transactions: approve {NETWORK_FEES.preauthApprove.toLocaleString()} stroops, settle_remainder{' '}
          {NETWORK_FEES.sorobanPayout.toLocaleString()} stroops (1 XLM = 10,000,000 stroops). Exchange rates:{' '}
          {fx.live ? `live from open.er-api.com (${fx.date})` : 'indicative rates from shared/fx_rates.json (live rates unavailable)'}
          {rate && row ? `; 1 USD = ${rate} ${row.originCurrency}` : ''}.
        </p>
      </div>

      <div className="text-[11px] text-slate-500 space-y-1">
        <span className="font-semibold text-slate-700 dark:text-slate-300 block">Sources</span>
        <ul className="list-disc pl-4 space-y-0.5">
          {row?.sourceUrl && (
            <li>
              <a href={row.sourceUrl} target="_blank" rel="noreferrer" className="hover:underline">
                Spreadsheet source for {row.id}
              </a>
            </li>
          )}
          {COST_SOURCES.filter((s) => /ramp|USDC|Stellar|stroops|XLM|fee_stats/i.test(s.label)).map((s) => (
            <li key={s.url}>
              <a href={s.url} target="_blank" rel="noreferrer" className="hover:underline">
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

const Card = ({ title, total, totalLabel, amount, lines, highlight }) => (
  <div
    className={`p-4 rounded-lg bg-white dark:bg-slate-900 space-y-3 ${
      highlight ? 'border-2 border-slate-900 dark:border-white' : 'border border-slate-200 dark:border-slate-800'
    }`}
  >
    <div>
      <span className="text-[11px] text-slate-500 block">{title}</span>
      <span className="text-xl font-bold font-mono-numbers text-slate-900 dark:text-white">{totalLabel ?? usd(total)}</span>
      <span className="text-[10px] text-slate-400 block">{amount > 0 ? pct((total / amount) * 100) : '0%'} of the amount</span>
    </div>
    <div className="space-y-1 pt-2 border-t border-slate-100 dark:border-slate-800">
      {lines.map(([label, v, note], i) => (
        <div key={i} className="text-[11px]">
          <div className="flex justify-between gap-2 text-slate-700 dark:text-slate-300">
            <span>{label}</span>
            <span className="font-mono-numbers shrink-0">{usd(v)}</span>
          </div>
          {note && <span className="text-[10px] text-slate-400">{note}</span>}
        </div>
      ))}
    </div>
  </div>
);

const NumberField = ({ label, value, onChange, step }) => (
  <label className="flex items-center gap-2 text-slate-500">
    {label}
    <input
      type="number"
      min={0}
      step={step}
      value={value}
      onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
      className="w-20 px-2 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md font-mono-numbers"
    />
  </label>
);

/** Total cost vs matched amount: TwoWay (line), full crypto and the overseas provider (flat references). */
const CostChart = ({ curve, amount, matched, fullCrypto, overseas, provider }) => {
  if (!curve.length || amount <= 0) return null;
  const W = 600;
  const H = 180;
  const pad = { l: 44, r: 10, t: 10, b: 24 };
  const maxY = Math.max(fullCrypto, overseas, ...curve.map((p) => p.total)) * 1.1 || 1;
  const x = (m) => pad.l + (m / amount) * (W - pad.l - pad.r);
  const y = (v) => pad.t + (1 - v / maxY) * (H - pad.t - pad.b);
  const path = curve.map((p, i) => `${i ? 'L' : 'M'}${x(p.m).toFixed(1)},${y(p.total).toFixed(1)}`).join(' ');
  const here = curve.reduce((a, p) => (Math.abs(p.m - matched) < Math.abs(a.m - matched) ? p : a), curve[0]);
  return (
    <figure className="border border-slate-200 dark:border-slate-800 rounded-lg p-4 bg-white dark:bg-slate-900 text-xs">
      <figcaption className="font-semibold text-slate-900 dark:text-white mb-2">Total cost by matched amount</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Cost of TwoWay as more of the transfer is matched, compared with sending it all via crypto">
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={pad.l} x2={W - pad.r} y1={y(maxY * f)} y2={y(maxY * f)} className="stroke-slate-200 dark:stroke-slate-700" strokeWidth="1" />
            <text x={pad.l - 6} y={y(maxY * f) + 3} textAnchor="end" className="fill-slate-400" fontSize="10">
              {usd(maxY * f)}
            </text>
          </g>
        ))}
        <line x1={pad.l} x2={W - pad.r} y1={y(fullCrypto)} y2={y(fullCrypto)} className="stroke-amber-500" strokeDasharray="4 3" strokeWidth="1.5" />
        <line x1={pad.l} x2={W - pad.r} y1={y(overseas)} y2={y(overseas)} className="stroke-sky-500" strokeDasharray="2 3" strokeWidth="1.5" />
        <path d={path} fill="none" className="stroke-emerald-600 dark:stroke-emerald-400" strokeWidth="2" />
        <circle cx={x(here.m)} cy={y(here.total)} r="4" className="fill-emerald-600 dark:fill-emerald-400" />
        <text x={pad.l} y={H - 6} className="fill-slate-400" fontSize="10">
          $0 matched
        </text>
        <text x={W - pad.r} y={H - 6} textAnchor="end" className="fill-slate-400" fontSize="10">
          {usd(amount)} matched
        </text>
      </svg>
      <div className="flex flex-wrap gap-4 mt-2 text-[11px] text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-emerald-600" /> TwoWay
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-amber-500" /> Fully via crypto
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-sky-500" /> {provider} (overseas)
        </span>
      </div>
    </figure>
  );
};
