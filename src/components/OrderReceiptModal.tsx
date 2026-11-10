import React, { useState, useEffect } from 'react';
import {
  X,
  ShieldCheck,
  ArrowRight,
  Clock,
  Layers,
  SendHorizontal,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Zap,
  ExternalLink,
} from 'lucide-react';
import { TransferOrder } from '../types';

interface OrderReceiptModalProps {
  order: TransferOrder | null;
  onClose: () => void;
  onInstantSendRemainder?: (orderId: string) => void;
  onInstantRefundRemainder?: (orderId: string) => void;
  onFastForwardExpiry?: (orderId: string) => void;
}

export const OrderReceiptModal: React.FC<OrderReceiptModalProps> = ({
  order,
  onClose,
  onInstantSendRemainder,
  onInstantRefundRemainder,
  onFastForwardExpiry,
}) => {
  const [currentTime, setCurrentTime] = useState<number>(Date.now());

  // Real-time ticking interval
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  if (!order) return null;

  const percentFilled =
    order.amount > 0 ? (order.matchedAmount / order.amount) * 100 : 0;

  const isPending =
    order.status === 'open' || order.status === 'partially_matched';

  const timeRemainingMs = Math.max(0, order.deadlineTimestamp - currentTime);
  const totalDurationMs = Math.max(
    1,
    order.deadlineMinutes * 60 * 1000
  );
  const timeElapsedMs = Math.min(totalDurationMs, totalDurationMs - timeRemainingMs);
  const countdownPercent = Math.min(
    100,
    Math.max(0, (timeRemainingMs / totalDurationMs) * 100)
  );

  const hours = Math.floor(timeRemainingMs / (1000 * 60 * 60));
  const minutes = Math.floor((timeRemainingMs % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((timeRemainingMs % (1000 * 60)) / 1000);

  const formattedCountdown = `${hours > 0 ? `${hours}h ` : ''}${minutes
    .toString()
    .padStart(2, '0')}m ${seconds.toString().padStart(2, '0')}s`;

  const deadlineDate = new Date(order.deadlineTimestamp);
  const formattedDeadlineDate = deadlineDate.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xl max-w-xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Transfer Details & Matching Status
              </h3>
              <p className="text-xs text-slate-400 font-mono">{order.id}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 text-xs">
          {/* Corridor & Amount Summary */}
          <div className="bg-slate-50 dark:bg-slate-900/60 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-200 text-sm">
              <span>{order.fromFlag} {order.fromCountry}</span>
              <ArrowRight className="w-4 h-4 text-indigo-500" />
              <span>{order.toFlag} {order.toCountry}</span>
            </div>
            <div className="text-right">
              <span className="font-mono-numbers font-bold text-base text-slate-900 dark:text-white block">
                ${order.amount.toFixed(2)} USDC
              </span>
              <span className="text-[10px] text-slate-400">
                {order.transferType === 'direct_instant' ? 'Direct Transfer' : 'Escrowed Intent'}
              </span>
            </div>
          </div>

          {/* REAL-TIME MATCHING COUNTDOWN TIMER */}
          {isPending ? (
            <div className="bg-indigo-50/70 dark:bg-indigo-950/30 p-4 rounded-xl border border-indigo-200 dark:border-indigo-800/60 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-indigo-950 dark:text-indigo-200 flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-indigo-600 animate-pulse" />
                  Live Matching Window Countdown
                </span>
                <span className="text-sm font-mono font-bold text-indigo-700 dark:text-indigo-300">
                  {timeRemainingMs > 0 ? formattedCountdown : '00m 00s (Expired)'}
                </span>
              </div>

              {/* Countdown Progress Bar */}
              <div className="w-full bg-indigo-200/60 dark:bg-indigo-900/40 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-indigo-600 h-full rounded-full transition-all duration-1000"
                  style={{ width: `${countdownPercent}%` }}
                />
              </div>

              <div className="flex justify-between items-center text-[11px] text-slate-600 dark:text-slate-300 pt-0.5">
                <span>
                  Expires: <strong className="font-mono-numbers">{formattedDeadlineDate}</strong> ({order.deadlineMinutes}m total)
                </span>
                <span className="text-indigo-600 dark:text-indigo-400 font-medium">
                  {timeRemainingMs > 0 ? 'Searching for peer match...' : 'Deadline reached'}
                </span>
              </div>

              {/* What happens at zero */}
              <div className="text-[11px] bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-indigo-100 dark:border-indigo-900 text-slate-600 dark:text-slate-300">
                <strong className="text-slate-900 dark:text-white block mb-0.5">
                  Autonomous Policy Trigger:
                </strong>
                {order.remainderPolicy === 'direct_stellar_fallback' ? (
                  <span className="text-emerald-700 dark:text-emerald-400">
                    ⚡ If unmatched when countdown hits zero, remaining ${order.remainingAmount.toFixed(2)} USDC is automatically dispatched to {order.recipientName} via direct Stellar transfer.
                  </span>
                ) : (
                  <span className="text-amber-700 dark:text-amber-400">
                    🔄 If unmatched when countdown hits zero, remaining ${order.remainingAmount.toFixed(2)} USDC is safely refunded back to your wallet.
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-slate-50 dark:bg-slate-900/60 p-3 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs">
              <span className="text-slate-500">Matching Status:</span>
              <span className="font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {order.status === 'settled' && 'Fully Settled'}
                {order.status === 'fallback_executed' && 'Direct Fallback Executed'}
                {order.status === 'refunded' && 'Refund Completed'}
              </span>
            </div>
          )}

          {/* Action Choice: Send Remainder Now or Refund Now */}
          {isPending && order.remainingAmount > 0 && (
            <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
              <span className="font-bold text-slate-800 dark:text-slate-200 block">
                Manage In-Flight Remainder (${order.remainingAmount.toFixed(2)} USDC)
              </span>
              <p className="text-[11px] text-slate-500">
                Don't want to wait for the timer? You can manually trigger settlement or refund right now.
              </p>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                {onInstantSendRemainder && (
                  <button
                    type="button"
                    onClick={() => {
                      onInstantSendRemainder(order.id);
                      onClose();
                    }}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
                  >
                    <SendHorizontal className="w-3.5 h-3.5" />
                    <span>Send Remainder Now via Direct Stellar</span>
                  </button>
                )}

                {onInstantRefundRemainder && (
                  <button
                    type="button"
                    onClick={() => {
                      onInstantRefundRemainder(order.id);
                      onClose();
                    }}
                    className="px-3 py-1.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
                    <span>Refund Remainder Now</span>
                  </button>
                )}

                {onFastForwardExpiry && timeRemainingMs > 0 && (
                  <button
                    type="button"
                    onClick={() => onFastForwardExpiry(order.id)}
                    className="px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 rounded-lg text-[11px] font-medium transition-colors"
                    title="Simulate timer hitting 00:00 to test policy trigger"
                  >
                    Fast-Forward Timer (Test)
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Parties */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block mb-1">
                Sender Account
              </span>
              <div className="font-semibold text-slate-900 dark:text-white">
                {order.senderName}
              </div>
              <div className="font-mono text-[11px] text-slate-500 mt-0.5 truncate">
                {order.senderAddress}
              </div>
            </div>

            <div className="p-3 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block mb-1">
                Recipient Account
              </span>
              <div className="font-semibold text-slate-900 dark:text-white">
                {order.recipientName}
              </div>
              <div className="font-mono text-[11px] text-slate-500 mt-0.5 truncate">
                {order.recipientAddress}
              </div>
            </div>
          </div>

          {/* Progress Breakdown */}
          <div className="space-y-1.5">
            <div className="flex justify-between font-mono-numbers">
              <span className="text-slate-500">Filled vs. Remainder:</span>
              <span className="font-bold text-slate-900 dark:text-white">
                ${order.matchedAmount.toFixed(2)} / ${order.amount.toFixed(2)} USDC ({percentFilled.toFixed(0)}%)
              </span>
            </div>
            <div className="w-full bg-slate-100 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
              <div
                className="bg-indigo-600 h-full rounded-full transition-all duration-300"
                style={{ width: `${percentFilled}%` }}
              />
            </div>
            <div className="flex justify-between text-[11px] text-slate-400 font-mono-numbers">
              <span>Matched: ${order.matchedAmount.toFixed(2)}</span>
              <span>Remaining: ${order.remainingAmount.toFixed(2)}</span>
            </div>
          </div>

          {/* Match Fill History */}
          {order.matchHistory.length > 0 && (
            <div>
              <span className="font-semibold text-slate-800 dark:text-slate-200 block mb-2">
                Settled Match Records
              </span>
              <div className="space-y-1.5">
                {order.matchHistory.map((rec, i) => (
                  <div
                    key={i}
                    className="p-2.5 bg-slate-50 dark:bg-slate-900/60 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-between font-mono-numbers"
                  >
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-white">
                        Matched with {rec.matchedWithSender}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono truncate max-w-xs">
                        Tx: {rec.txHash.slice(0, 18)}...
                      </div>
                    </div>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">
                      +${rec.amount.toFixed(2)} USDC
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Cryptographic Hashes with StellarExpert Explorer links */}
          <div className="space-y-2 font-mono text-[11px] bg-slate-900 text-slate-300 p-3.5 rounded-xl border border-slate-800">
            <div className="flex justify-between items-center text-slate-400 text-[10px] uppercase font-sans font-semibold pb-1 border-b border-slate-800">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Stellar Testnet On-Chain Proofs
              </span>
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-500 shrink-0">Soroban Escrow:</span>
              <span className="text-indigo-400 truncate">{order.escrowContractId}</span>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-500 shrink-0">Deposit Tx:</span>
              <a
                href={`https://stellar.expert/explorer/testnet/tx/${order.depositTxHash.replace('0x', '')}`}
                target="_blank"
                rel="noreferrer"
                className="text-slate-300 hover:text-white hover:underline truncate flex items-center gap-1"
                title="View on StellarExpert Testnet"
              >
                <span>{order.depositTxHash.slice(0, 24)}...</span>
                <ExternalLink className="w-2.5 h-2.5 text-slate-500 shrink-0" />
              </a>
            </div>

            {order.settlementTxHash && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500 shrink-0">Settlement Tx:</span>
                <a
                  href={`https://stellar.expert/explorer/testnet/tx/${order.settlementTxHash.replace('0x', '')}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-emerald-400 hover:underline truncate flex items-center gap-1"
                  title="View Settlement on StellarExpert Testnet"
                >
                  <span>{order.settlementTxHash.slice(0, 24)}...</span>
                  <ExternalLink className="w-2.5 h-2.5 text-emerald-500 shrink-0" />
                </a>
              </div>
            )}

            {order.fallbackTxHash && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500 shrink-0">Fallback/Refund:</span>
                <a
                  href={`https://stellar.expert/explorer/testnet/tx/${order.fallbackTxHash.replace('0x', '')}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-amber-400 hover:underline truncate flex items-center gap-1"
                  title="View Fallback/Refund on StellarExpert Testnet"
                >
                  <span>{order.fallbackTxHash.slice(0, 24)}...</span>
                  <ExternalLink className="w-2.5 h-2.5 text-amber-500 shrink-0" />
                </a>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 dark:bg-slate-900 border-t border-slate-100 dark:border-slate-700 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-slate-800 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
