import React, { useState } from 'react';
import {
  X,
  RefreshCw,
  Building2,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  ExternalLink,
  Smartphone,
  CreditCard,
  DollarSign,
  AlertCircle,
} from 'lucide-react';
import { TransferOrder } from '../types';
import {
  calculateUsdcConversion,
  executeRemainderConversion,
  FX_RATES,
  getStoredBankAccounts,
} from '../services/bankingService';

interface ConvertRemainderModalProps {
  order: TransferOrder | null;
  isOpen: boolean;
  onClose: () => void;
  onConverted: (updatedOrder: TransferOrder) => void;
  onShowToast: (msg: string) => void;
}

export const ConvertRemainderModal: React.FC<ConvertRemainderModalProps> = ({
  order,
  isOpen,
  onClose,
  onConverted,
  onShowToast,
}) => {
  const [payoutTarget, setPayoutTarget] = useState<'recipient_bank' | 'sender_bank'>('recipient_bank');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  if (!isOpen || !order || order.remainingAmount <= 0) return null;

  const accounts = getStoredBankAccounts();
  const remainder = order.remainingAmount;

  // Determine recipient currency from corridor
  const recipientCurrency =
    order.toCountry === 'Kenya'
      ? 'KES'
      : order.toCountry === 'Canada'
      ? 'CAD'
      : order.toCountry === 'Nigeria'
      ? 'NGN'
      : order.toCountry === 'Philippines'
      ? 'PHP'
      : order.toCountry === 'Argentina'
      ? 'ARS'
      : 'USD';

  // Determine sender currency
  const senderCurrency =
    order.fromCountry === 'Canada'
      ? 'CAD'
      : order.fromCountry === 'Kenya'
      ? 'KES'
      : order.fromCountry === 'European Union'
      ? 'EUR'
      : 'USD';

  const selectedCurrency = payoutTarget === 'recipient_bank' ? recipientCurrency : senderCurrency;
  const conversion = calculateUsdcConversion(remainder, selectedCurrency);

  const recipientDefaultBank =
    selectedCurrency === 'KES'
      ? 'Equity Bank / Safaricom M-Pesa (+254 712 345 678)'
      : selectedCurrency === 'CAD'
      ? 'TD Canada Trust / Interac (•••• 4921)'
      : 'Domestic Commercial Bank (Direct Deposit)';

  const senderLinkedBank = accounts.find((b) => b.currency === senderCurrency) || accounts[0];

  const handleExecuteConversion = () => {
    setIsProcessing(true);

    setTimeout(() => {
      const res = executeRemainderConversion({
        order,
        targetCurrency: selectedCurrency,
        targetBankName:
          payoutTarget === 'recipient_bank'
            ? recipientDefaultBank
            : senderLinkedBank?.institutionName || 'Sender Bank Account',
      });

      setIsProcessing(false);
      if (res.success) {
        onConverted(res.updatedOrder);
        onShowToast(
          `⚡ Remainder of $${remainder.toFixed(2)} USDC successfully converted to ${selectedCurrency} ${res.conversionSummary.convertedFiat.toLocaleString(
            undefined,
            { minimumFractionDigits: 2 }
          )} and cleared to ${payoutTarget === 'recipient_bank' ? order.recipientName : 'your bank account'}!`
        );
        onClose();
      }
    }, 650);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-lg w-full my-6 overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/40">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center border border-amber-500/20">
              <RefreshCw className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Convert Unmatched Remainder to Fiat
                </h3>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 font-semibold">
                  Instant Clearing
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5 font-mono">
                Order #{order.id} · Remainder: ${remainder.toFixed(2)} USDC
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 text-xs">
          {/* Order Summary Cards */}
          <div className="grid grid-cols-2 gap-2 text-slate-600 dark:text-slate-400 font-mono-numbers">
            <div className="p-2.5 rounded bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
              <span className="text-[10px] text-slate-400 block font-sans">Corridor & Route</span>
              <span className="font-semibold text-slate-900 dark:text-white flex items-center gap-1 mt-0.5">
                <span>{order.fromFlag} {order.fromCountry}</span>
                <ArrowRight className="w-3 h-3 text-slate-400" />
                <span>{order.toFlag} {order.toCountry}</span>
              </span>
            </div>

            <div className="p-2.5 rounded bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
              <span className="text-[10px] text-slate-400 block font-sans">Unmatched Remainder</span>
              <span className="font-bold text-amber-600 dark:text-amber-400 text-sm mt-0.5 block">
                ${remainder.toFixed(2)} USDC
              </span>
            </div>
          </div>

          {/* Destination Selector */}
          <div>
            <label className="text-[11px] font-medium text-slate-600 dark:text-slate-400 block mb-1.5">
              Select Payout & Conversion Destination:
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPayoutTarget('recipient_bank')}
                className={`p-3 rounded-lg border text-left transition-all ${
                  payoutTarget === 'recipient_bank'
                    ? 'border-amber-500 bg-amber-50/40 dark:bg-amber-950/20 text-slate-900 dark:text-white'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold flex items-center gap-1.5">
                    <Smartphone className="w-3.5 h-3.5 text-emerald-500" />
                    Recipient Bank / Mobile
                  </span>
                  {payoutTarget === 'recipient_bank' && (
                    <CheckCircle2 className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  )}
                </div>
                <span className="text-[10px] text-slate-500 block leading-tight">
                  {order.recipientName} ({recipientCurrency})
                </span>
                <span className="text-[10px] text-slate-400 block font-mono mt-0.5">
                  {selectedCurrency === 'KES' ? 'M-Pesa Direct' : 'Domestic Bank ACH/EFT'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setPayoutTarget('sender_bank')}
                className={`p-3 rounded-lg border text-left transition-all ${
                  payoutTarget === 'sender_bank'
                    ? 'border-amber-500 bg-amber-50/40 dark:bg-amber-950/20 text-slate-900 dark:text-white'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-sky-500" />
                    My Bank Account
                  </span>
                  {payoutTarget === 'sender_bank' && (
                    <CheckCircle2 className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  )}
                </div>
                <span className="text-[10px] text-slate-500 block leading-tight">
                  Sender Fiat Cash-Out ({senderCurrency})
                </span>
                <span className="text-[10px] text-slate-400 block font-mono mt-0.5">
                  {senderLinkedBank?.institutionName || 'Linked Checking'}
                </span>
              </button>
            </div>
          </div>

          {/* Live Conversion Breakdown */}
          <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 space-y-2 font-mono-numbers">
            <div className="flex justify-between text-slate-500">
              <span>Gross Remainder:</span>
              <span className="font-semibold text-slate-900 dark:text-white">${remainder.toFixed(2)} USDC</span>
            </div>
            <div className="flex justify-between text-slate-500">
              <span>Live Anchor FX Exchange Rate:</span>
              <span className="font-semibold text-slate-900 dark:text-white">
                1 USDC = {conversion.rate.toFixed(2)} {selectedCurrency}
              </span>
            </div>
            <div className="flex justify-between text-slate-500">
              <span>Anchor Processing Fee (0.15%):</span>
              <span className="text-slate-600 dark:text-slate-400">
                {conversion.symbol}{conversion.feeFiat.toFixed(2)} {selectedCurrency}
              </span>
            </div>
            <div className="flex justify-between text-slate-500">
              <span>Stellar Horizon L1 Settlement Gas:</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">0.00001 XLM (~$0.00)</span>
            </div>

            <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex justify-between items-baseline">
              <span className="font-bold text-slate-900 dark:text-white text-xs">
                Net Fiat Deposited to Bank:
              </span>
              <span className="text-base font-bold text-emerald-600 dark:text-emerald-400">
                {conversion.symbol}
                {conversion.netFiat.toLocaleString(undefined, { minimumFractionDigits: 2 })} {selectedCurrency}
              </span>
            </div>
          </div>

          <div className="p-2.5 rounded bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40 flex items-start gap-2 text-[11px] text-emerald-900 dark:text-emerald-300">
            <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <span>
              <strong>Two-Way Street Advantage:</strong> By converting only the unmatched remainder, the sender saved on FX spreads for the matched portion and the recipient still receives 100% in local currency.
            </span>
          </div>

          <button
            type="button"
            onClick={handleExecuteConversion}
            disabled={isProcessing}
            className="w-full py-2.5 px-4 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-md text-xs font-semibold transition-colors flex items-center justify-center gap-2 shadow-xs"
          >
            {isProcessing ? (
              <span>Converting & Dispatching to Bank Rail...</span>
            ) : (
              <>
                <RefreshCw className="w-4 h-4" />
                <span>
                  Confirm & Convert Remainder to {conversion.symbol}
                  {conversion.netFiat.toLocaleString(undefined, { minimumFractionDigits: 2 })} {selectedCurrency}
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
