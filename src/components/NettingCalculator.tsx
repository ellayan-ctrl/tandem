import React, { useEffect, useMemo, useState } from 'react';
import { Corridor } from '../types';
import {
  COST_SOURCES,
  DEFAULT_XLM_USD,
  FUNDING_COST_PCT,
  NETWORK_FEES,
  computeCosts,
  twoWayNetworkCost,
  type CostLine,
} from '../data/costModel';
import { FUNDING_KINDS, fundingProvidersFor, type FundingKind } from '../data/fundingMethods';

interface NettingCalculatorProps {
  corridors: Corridor[];
}

const BASIS_STYLE: Record<CostLine['basis'], string> = {
  measured: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  sourced: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  assumption: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
};

const fmt = (usd: number) =>
  usd === 0 ? '$0.00' : usd < 0.01 ? `$${usd.toFixed(5)}` : `$${usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const NettingCalculator: React.FC<NettingCalculatorProps> = ({ corridors }) => {
  const [corridorId, setCorridorId] = useState<string>('CA-KE');
  const [reversed, setReversed] = useState(false);
  const [amount, setAmount] = useState<number>(500);
  const [matchPct, setMatchPct] = useState<number>(60);
  const [xlmUsd, setXlmUsd] = useState<number>(DEFAULT_XLM_USD);

  const corridor = corridors.find((c) => c.id === corridorId) || corridors[0];
  const from = reversed ? corridor.countryB : corridor.countryA;
  const to = reversed ? corridor.countryA : corridor.countryB;

  const fundingKinds = useMemo(
    () => [...new Set(fundingProvidersFor(from.name).map((p) => p.kind))] as FundingKind[],
    [from.name],
  );
  const [fundingKind, setFundingKind] = useState<FundingKind>('instant_transfer');
  useEffect(() => {
    if (!fundingKinds.includes(fundingKind)) setFundingKind(fundingKinds[0]);
  }, [fundingKinds]);

  const rails = computeCosts({
    amountUsd: amount,
    fromCountry: from.name,
    toCountry: to.name,
    matchPct,
    fundingKind,
    xlmUsd,
  });
  const traditional = rails.find((r) => r.id === 'traditional')!;
  const twoWay = rails.find((r) => r.id === 'twoway')!;
  const savings = traditional.total - twoWay.total;
  const network = twoWayNetworkCost(matchPct < 100, xlmUsd);

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">Cost Calculator</h1>
        <p className="mt-1 text-xs text-slate-500">
          What a transfer really costs on each rail: Stellar network fees measured from this app’s own testnet
          transactions, plus published on/off-ramp and remittance prices (researched Nov 2026).
        </p>
      </div>

      {/* Inputs */}
      <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-4 bg-white dark:bg-slate-900 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
        <div>
          <label className="text-slate-500 block mb-1">Countries</label>
          <div className="flex gap-1.5">
            <select
              value={corridorId}
              onChange={(e) => setCorridorId(e.target.value)}
              className="flex-1 min-w-0 px-2 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-white"
            >
              {corridors.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.countryA.name} ⇄ {c.countryB.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setReversed(!reversed)}
              className="px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
              title="Reverse direction"
            >
              ⇄
            </button>
          </div>
          <span className="text-[10px] text-slate-400 mt-1 block">
            {from.flag} {from.name} → {to.flag} {to.name}
          </span>
        </div>

        <div>
          <div className="flex justify-between mb-1">
            <label className="text-slate-500">Amount</label>
            <span className="font-mono-numbers font-semibold text-slate-900 dark:text-white">${amount.toLocaleString()}</span>
          </div>
          <input
            type="range"
            min={20}
            max={5000}
            step={10}
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            className="w-full accent-slate-900 dark:accent-white"
          />
          <span className="text-[10px] text-slate-400">USD-equivalent, $20 – $5,000</span>
        </div>

        <div>
          <div className="flex justify-between mb-1">
            <label className="text-slate-500">Share matched</label>
            <span className="font-mono-numbers font-semibold text-slate-900 dark:text-white">{matchPct}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={matchPct}
            onChange={(e) => setMatchPct(Number(e.target.value))}
            className="w-full accent-slate-900 dark:accent-white"
          />
          <span className="text-[10px] text-slate-400">
            Matched ${((amount * matchPct) / 100).toFixed(0)} netted locally · unmatched $
            {((amount * (100 - matchPct)) / 100).toFixed(0)} as USDC via Stellar Blockchain
          </span>
        </div>

        <div className="space-y-2">
          <div>
            <label className="text-slate-500 block mb-1">You pay the matched part with</label>
            <select
              value={fundingKind}
              onChange={(e) => setFundingKind(e.target.value as FundingKind)}
              className="w-full px-2 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-white"
            >
              {fundingKinds.map((k) => (
                <option key={k} value={k}>
                  {FUNDING_KINDS[k].label} ({FUNDING_COST_PCT[k].pct}%)
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-slate-500 shrink-0">XLM price $</label>
            <input
              type="number"
              min={0.01}
              step={0.01}
              value={xlmUsd}
              onChange={(e) => setXlmUsd(Math.max(0, Number(e.target.value) || 0))}
              className="w-20 px-2 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md font-mono-numbers"
            />
          </div>
        </div>
      </div>

      {/* Headline */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        <div className="p-4 rounded-lg border-2 border-slate-900 dark:border-white bg-white dark:bg-slate-900">
          <span className="text-slate-500 block">TwoWay saves vs. a typical provider</span>
          <span className="text-2xl font-bold font-mono-numbers text-slate-900 dark:text-white">
            {fmt(Math.max(0, savings))}
          </span>
          <span className="text-[11px] text-slate-500 block">
            {twoWay.pctOfAmount.toFixed(2)}% vs {traditional.pctOfAmount.toFixed(2)}% of the amount
          </span>
        </div>
        <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <span className="text-slate-500 block">Stellar network cost per TwoWay order</span>
          <span className="text-2xl font-bold font-mono-numbers text-slate-900 dark:text-white">{fmt(network.usd)}</span>
          <span className="text-[11px] text-slate-500 block font-mono-numbers">
            {network.stroops.toLocaleString()} stroops = {network.xlm.toFixed(7)} XLM
          </span>
        </div>
        <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <span className="text-slate-500 block">Where the money actually goes</span>
          <span className="text-[11px] text-slate-600 dark:text-slate-300 block mt-1">
            On-chain fees are a rounding error (fractions of a cent). Real cost sits in getting money into and out of
            USDC (on/off-ramp spreads). Netting skips the ramps for the matched share.
          </span>
        </div>
      </div>

      {/* Rails */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 text-xs">
        {rails.map((r) => (
          <div
            key={r.id}
            className={`p-4 rounded-lg bg-white dark:bg-slate-900 space-y-3 ${
              r.id === 'twoway' ? 'border-2 border-slate-900 dark:border-white' : 'border border-slate-200 dark:border-slate-800'
            }`}
          >
            <div>
              <span className="text-[11px] text-slate-500 block">{r.name}</span>
              <span className="text-xl font-bold font-mono-numbers text-slate-900 dark:text-white">{fmt(r.total)}</span>
              <span className="text-[10px] text-slate-400 block">{r.pctOfAmount.toFixed(2)}% of ${amount.toLocaleString()}</span>
            </div>
            <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
              {r.lines.map((l, i) => (
                <div key={i} className="text-[11px]">
                  <div className="flex justify-between gap-2 text-slate-700 dark:text-slate-300">
                    <span>{l.label}</span>
                    <span className="font-mono-numbers shrink-0">{fmt(l.usd)}</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={`px-1 rounded text-[9px] font-semibold uppercase ${BASIS_STYLE[l.basis]}`}>{l.basis}</span>
                    {l.detail && <span className="text-[10px] text-slate-400">{l.detail}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Network fee detail */}
      <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-4 bg-white dark:bg-slate-900 text-xs space-y-2">
        <span className="font-semibold text-slate-900 dark:text-white block">Stellar fees, measured on testnet</span>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 font-mono-numbers text-[11px] text-slate-600 dark:text-slate-300">
          <div>Classic USDC payment: {NETWORK_FEES.classicPayment} stroops ({fmt((NETWORK_FEES.classicPayment / 1e7) * xlmUsd)})</div>
          <div>Pre-authorization (approve): {NETWORK_FEES.preauthApprove.toLocaleString()} stroops ({fmt((NETWORK_FEES.preauthApprove / 1e7) * xlmUsd)})</div>
          <div>Soroban remainder payout: {NETWORK_FEES.sorobanPayout.toLocaleString()} stroops ({fmt((NETWORK_FEES.sorobanPayout / 1e7) * xlmUsd)})</div>
        </div>
        <p className="text-[10px] text-slate-400">
          1 XLM = 10,000,000 stroops. Soroban calls cost more than classic payments because they also pay for
          compute and storage, but still well under a cent. Mainnet fees follow the same schedule and can rise under
          congestion.
        </p>
      </div>

      {/* Sources */}
      <div className="text-[11px] text-slate-500 space-y-1">
        <span className="font-semibold text-slate-700 dark:text-slate-300 block">Sources & caveats</span>
        <p>
          <span className={`px-1 rounded text-[9px] font-semibold uppercase ${BASIS_STYLE.measured}`}>measured</span> from
          this app’s transactions ·{' '}
          <span className={`px-1 rounded text-[9px] font-semibold uppercase ${BASIS_STYLE.sourced}`}>sourced</span>{' '}
          published figure (several from secondary sources; verify before relying on them) ·{' '}
          <span className={`px-1 rounded text-[9px] font-semibold uppercase ${BASIS_STYLE.assumption}`}>assumption</span>{' '}
          no reliable public figure found. Off-ramp and cash-out figures are Kenya-based and applied to other countries
          as an approximation. Traditional cost uses the World Bank average for that country pair where available, otherwise the
          global average.
        </p>
        <ul className="list-disc pl-4 space-y-0.5">
          {COST_SOURCES.map((s) => (
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
