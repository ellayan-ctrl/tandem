import React, { useState } from 'react';
import { Calculator, ArrowRight, CheckCircle2, TrendingUp, DollarSign } from 'lucide-react';
import { Corridor } from '../types';

interface NettingCalculatorProps {
  corridors: Corridor[];
}

export const NettingCalculator: React.FC<NettingCalculatorProps> = ({ corridors }) => {
  const [selectedCorridorId, setSelectedCorridorId] = useState<string>('CA-KE');
  const [transferAmount, setTransferAmount] = useState<number>(500);
  const [monthlyVolume, setMonthlyVolume] = useState<number>(25000);

  const activeCorridor =
    corridors.find((c) => c.id === selectedCorridorId) || corridors[0];

  // Fee calculations
  // Traditional Remittance (Western Union / SWIFT Bank wire)
  const traditionalFlatFee = 18.0;
  const traditionalFxSpreadPct = 3.2; // 3.2% currency conversion spread
  const traditionalTotalCost =
    traditionalFlatFee + transferAmount * (traditionalFxSpreadPct / 100);

  // Direct Stellar Transfer (Fast, but recipient pays anchor cash-out fee)
  const directStellarNetworkFee = 0.00002;
  const directAnchorCashoutFee = transferAmount * 0.022; // 2.2% anchor off-ramp fee
  const directTotalCost = directStellarNetworkFee + directAnchorCashoutFee;

  // Two-Way Street Netting (Local anchor has zero rebalancing costs)
  const twoWayStellarGasFee = 0.00018;
  const twoWayNettingDiscountFee = transferAmount * 0.004; // 0.4% minimal processing fee
  const twoWayTotalCost = twoWayStellarGasFee + twoWayNettingDiscountFee;

  const userSavingsPerTransfer = Math.max(0, traditionalTotalCost - twoWayTotalCost);
  const monthlyCorridorSavings =
    monthlyVolume * ((traditionalFxSpreadPct - 0.4) / 100);

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 sm:px-6 space-y-8">
      {/* Title */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 shadow-xs">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 mb-2">
          <span>Cost & Settlement Simulator</span>
          <span>·</span>
          <span>Real-World Economics</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
          Netting Economics vs. Direct Stellar & Legacy Rails
        </h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 max-w-2xl leading-relaxed">
          Calculate real-world savings when opposite cross-border flows cancel out, eliminating the expensive
          fiat anchor rebalancing fees that traditional remittances and standard stablecoin cash-outs charge.
        </p>
      </div>

      {/* Input Controls */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 shadow-xs">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Corridor Selection */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 block mb-2">
              Select Cross-Border Corridor
            </label>
            <select
              value={selectedCorridorId}
              onChange={(e) => setSelectedCorridorId(e.target.value)}
              className="w-full px-3 py-2.5 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-indigo-500"
            >
              {corridors.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.countryA.flag} {c.countryA.name} ⇄ {c.countryB.flag} {c.countryB.name} ({c.countryA.currency} / {c.countryB.currency})
                </option>
              ))}
            </select>
            <div className="text-[11px] text-slate-400 mt-1">
              Local Anchor: {activeCorridor.countryB.anchorName}
            </div>
          </div>

          {/* Transfer Amount */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                Transfer Amount (USDC)
              </label>
              <span className="font-mono-numbers font-bold text-sm text-indigo-600 dark:text-indigo-400">
                ${transferAmount.toLocaleString()} USDC
              </span>
            </div>
            <input
              type="range"
              min="50"
              max="5000"
              step="50"
              value={transferAmount}
              onChange={(e) => setTransferAmount(Number(e.target.value))}
              className="w-full accent-indigo-600 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-400 mt-1 font-mono-numbers">
              <span>$50</span>
              <span>$1,000</span>
              <span>$2,500</span>
              <span>$5,000</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3-Way Comparison Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Card 1: Traditional Wire / Western Union */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-slate-900 dark:text-white">
                Legacy Bank / MTO
              </span>
              <span className="text-[10px] font-medium text-slate-400">SWIFT Rails</span>
            </div>
            <div className="text-2xl font-bold font-mono-numbers text-rose-600 dark:text-rose-400">
              ${traditionalTotalCost.toFixed(2)}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              Total transfer fee & FX spread
            </div>

            <div className="space-y-2 mt-4 pt-4 border-t border-slate-100 dark:border-slate-700 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Base Wire Fee:</span>
                <span className="font-mono-numbers text-slate-700 dark:text-slate-300">
                  ${traditionalFlatFee.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">FX Spread (3.2%):</span>
                <span className="font-mono-numbers text-slate-700 dark:text-slate-300">
                  ${(transferAmount * (traditionalFxSpreadPct / 100)).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Settlement Time:</span>
                <span className="font-medium text-rose-600 dark:text-rose-400">
                  2 – 4 Business Days
                </span>
              </div>
            </div>
          </div>

          <div className="mt-5 pt-3 border-t border-slate-100 dark:border-slate-700 text-[11px] text-slate-500">
            High correspondent banking deductions and delayed physical cash-out.
          </div>
        </div>

        {/* Card 2: Direct Stellar USDC Transfer */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-slate-900 dark:text-white">
                Direct Stellar USDC
              </span>
              <span className="text-[10px] font-medium text-slate-400">Pure Stellar L1</span>
            </div>
            <div className="text-2xl font-bold font-mono-numbers text-slate-800 dark:text-slate-200">
              ${directTotalCost.toFixed(2)}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              On-chain fee + local anchor cash-out
            </div>

            <div className="space-y-2 mt-4 pt-4 border-t border-slate-100 dark:border-slate-700 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Stellar Network Fee:</span>
                <span className="font-mono-numbers text-emerald-600 dark:text-emerald-400">
                  $0.00002
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Anchor Cash-Out (2.2%):</span>
                <span className="font-mono-numbers text-slate-700 dark:text-slate-300">
                  ${directAnchorCashoutFee.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Settlement Time:</span>
                <span className="font-medium text-emerald-600 dark:text-emerald-400">
                  3 – 5 Seconds
                </span>
              </div>
            </div>
          </div>

          <div className="mt-5 pt-3 border-t border-slate-100 dark:border-slate-700 text-[11px] text-slate-500">
            Instant on-chain transfer, but recipient still absorbs destination anchor cash-out spread.
          </div>
        </div>

        {/* Card 3: Two-Way Street Netting Protocol */}
        <div className="bg-indigo-50/50 dark:bg-indigo-950/20 rounded-xl border-2 border-indigo-500 p-5 shadow-sm flex flex-col justify-between relative">
          <div className="absolute -top-3 right-4 bg-indigo-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
            Optimized Netting
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-indigo-950 dark:text-indigo-200">
                Two-Way Netting Escrow
              </span>
              <span className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400">
                Soroban Protocol
              </span>
            </div>
            <div className="text-2xl font-bold font-mono-numbers text-indigo-600 dark:text-indigo-400">
              ${twoWayTotalCost.toFixed(2)}
            </div>
            <div className="text-[11px] text-indigo-700 dark:text-indigo-300/80 mt-0.5">
              Net balance clearing + zero SWIFT rebalance
            </div>

            <div className="space-y-2 mt-4 pt-4 border-t border-indigo-100 dark:border-indigo-900 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Soroban Gas Fee:</span>
                <span className="font-mono-numbers text-emerald-600 dark:text-emerald-400">
                  $0.00018
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Netted Anchor Spread (0.4%):</span>
                <span className="font-mono-numbers text-indigo-900 dark:text-indigo-200 font-semibold">
                  ${twoWayNettingDiscountFee.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Matching Window:</span>
                <span className="font-medium text-indigo-700 dark:text-indigo-300">
                  15m – 1h (or instant fallback)
                </span>
              </div>
            </div>
          </div>

          <div className="mt-5 pt-3 border-t border-indigo-100 dark:border-indigo-900 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            <span>You save ${userSavingsPerTransfer.toFixed(2)} on this single transfer</span>
          </div>
        </div>
      </div>

      {/* Aggregate Institutional & B2B Volume Netting Impact */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 shadow-xs">
        <div className="flex items-center gap-2 mb-2">
          <TrendingUp className="w-4 h-4 text-indigo-600" />
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            B2B & Monthly Corridor Liquidity Impact
          </h3>
        </div>
        <p className="text-xs text-slate-500 mb-4">
          Estimate cumulative savings when corporate invoices and supply chain flows are netted continuously.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-600 dark:text-slate-400 font-medium">Monthly Corridor Volume:</span>
              <span className="font-mono-numbers font-bold text-slate-900 dark:text-white">
                ${monthlyVolume.toLocaleString()} USDC
              </span>
            </div>
            <input
              type="range"
              min="5000"
              max="200000"
              step="5000"
              value={monthlyVolume}
              onChange={(e) => setMonthlyVolume(Number(e.target.value))}
              className="w-full accent-indigo-600 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-400 mt-1 font-mono-numbers">
              <span>$5,000</span>
              <span>$100,000</span>
              <span>$200,000</span>
            </div>
          </div>

          <div className="bg-slate-50 dark:bg-slate-900/60 p-4 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-500 block">Estimated Monthly Corridor Capital Saved:</span>
              <span className="text-2xl font-bold font-mono-numbers text-emerald-600 dark:text-emerald-400">
                ${monthlyCorridorSavings.toFixed(2)}
              </span>
            </div>
            <div className="text-[11px] text-slate-400 text-right">
              Eliminated FX spread <br />& nostro pre-funding
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
