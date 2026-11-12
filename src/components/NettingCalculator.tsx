import React, { useState } from 'react';
import { Corridor } from '../types';

interface NettingCalculatorProps {
  corridors: Corridor[];
}

export const NettingCalculator: React.FC<NettingCalculatorProps> = ({ corridors }) => {
  const [selectedCorridorId, setSelectedCorridorId] = useState<string>('CA-KE');
  const [transferAmount, setTransferAmount] = useState<number>(500);

  const activeCorridor =
    corridors.find((c) => c.id === selectedCorridorId) || corridors[0];

  const traditionalFlatFee = 18.0;
  const traditionalFxSpreadPct = 3.2;
  const traditionalTotalCost =
    traditionalFlatFee + transferAmount * (traditionalFxSpreadPct / 100);

  const directStellarNetworkFee = 0.00002;
  const directAnchorCashoutFee = transferAmount * 0.022;
  const directTotalCost = directStellarNetworkFee + directAnchorCashoutFee;

  const twoWayStellarGasFee = 0.00018;
  const twoWayNettingDiscountFee = transferAmount * 0.004;
  const twoWayTotalCost = twoWayStellarGasFee + twoWayNettingDiscountFee;

  const savings = Math.max(0, traditionalTotalCost - twoWayTotalCost);

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
          Fee & Netting Calculator
        </h1>
        <p className="mt-1 text-xs text-slate-500">
          Compare transfer fees and recipient off-ramp spreads across payment rails.
        </p>
      </div>

      {/* Inputs */}
      <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-4 bg-white dark:bg-slate-900 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
        <div>
          <label className="text-slate-500 block mb-1">Corridor</label>
          <select
            value={selectedCorridorId}
            onChange={(e) => setSelectedCorridorId(e.target.value)}
            className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-white"
          >
            {corridors.map((c) => (
              <option key={c.id} value={c.id}>
                {c.countryA.name} ⇄ {c.countryB.name} ({c.countryA.currency}/{c.countryB.currency})
              </option>
            ))}
          </select>
          <span className="text-[10px] text-slate-400 mt-1 block">
            Destination anchor: {activeCorridor.countryB.anchorName}
          </span>
        </div>

        <div>
          <div className="flex justify-between items-baseline mb-1">
            <label className="text-slate-500">Transfer Amount</label>
            <span className="font-mono-numbers font-semibold text-slate-900 dark:text-white">
              ${transferAmount} USDC
            </span>
          </div>
          <input
            type="range"
            min="50"
            max="5000"
            step="50"
            value={transferAmount}
            onChange={(e) => setTransferAmount(Number(e.target.value))}
            className="w-full accent-slate-900 dark:accent-white cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-slate-400 font-mono-numbers mt-1">
            <span>$50</span>
            <span>$2,500</span>
            <span>$5,000</span>
          </div>
        </div>
      </div>

      {/* 3-Column Comparison */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
        {/* Legacy Wire */}
        <div className="p-4 border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 space-y-3">
          <div>
            <span className="text-[11px] text-slate-400 block">Bank Wire / SWIFT</span>
            <div className="text-xl font-bold font-mono-numbers text-slate-900 dark:text-white mt-0.5">
              ${traditionalTotalCost.toFixed(2)}
            </div>
            <span className="text-[10px] text-slate-400">Total fees & FX spread</span>
          </div>

          <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-400 font-mono-numbers">
            <div className="flex justify-between">
              <span>Wire Fee:</span>
              <span>${traditionalFlatFee.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>FX Spread (3.2%):</span>
              <span>${(transferAmount * (traditionalFxSpreadPct / 100)).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-slate-500 font-sans">
              <span>Settlement:</span>
              <span>2–4 business days</span>
            </div>
          </div>
        </div>

        {/* Direct Stellar */}
        <div className="p-4 border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 space-y-3">
          <div>
            <span className="text-[11px] text-slate-400 block">Direct Stellar Transfer</span>
            <div className="text-xl font-bold font-mono-numbers text-slate-900 dark:text-white mt-0.5">
              ${directTotalCost.toFixed(2)}
            </div>
            <span className="text-[10px] text-slate-400">Network fee + anchor off-ramp</span>
          </div>

          <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-400 font-mono-numbers">
            <div className="flex justify-between">
              <span>Stellar Fee:</span>
              <span>$0.00002</span>
            </div>
            <div className="flex justify-between">
              <span>Anchor Spread (2.2%):</span>
              <span>${directAnchorCashoutFee.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-slate-500 font-sans">
              <span>Settlement:</span>
              <span>3–5 seconds</span>
            </div>
          </div>
        </div>

        {/* Two-Way Netting */}
        <div className="p-4 border-2 border-slate-900 dark:border-white rounded-lg bg-white dark:bg-slate-900 space-y-3">
          <div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium block">Two-Way Corridor Netting</span>
            <div className="text-xl font-bold font-mono-numbers text-slate-900 dark:text-white mt-0.5">
              ${twoWayTotalCost.toFixed(2)}
            </div>
            <span className="text-[10px] text-slate-500">Netted domestic clearing</span>
          </div>

          <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-400 font-mono-numbers">
            <div className="flex justify-between">
              <span>Soroban Gas:</span>
              <span>$0.00018</span>
            </div>
            <div className="flex justify-between">
              <span>Netted Spread (0.4%):</span>
              <span>${twoWayNettingDiscountFee.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-slate-500 font-sans">
              <span>Matching Window:</span>
              <span>User configured</span>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] font-medium text-slate-900 dark:text-white font-mono-numbers">
            Est. savings: ${savings.toFixed(2)}
          </div>
        </div>
      </div>
    </div>
  );
};
