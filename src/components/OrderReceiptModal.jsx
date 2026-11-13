import { useState, useEffect } from 'react';
import {
  X,
  ArrowRight,
  Clock,
  ExternalLink,
  Printer,
  Download,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Building2,
} from 'lucide-react';

export const OrderReceiptModal = ({
  order,
  onClose,
  onInstantSendRemainder,
  onInstantRefundRemainder,
  onFastForwardExpiry,
  latestLedger = 48922450,
}) => {
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [copiedKey, setCopiedKey] = useState(null);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (!order) return null;

  const percent = order.amount > 0 ? (order.matchedAmount / order.amount) * 100 : 0;
  const isPending = order.status === 'open' || order.status === 'partially_matched';
  // Once a remainder is resolved the server zeroes `remainingAmount` and records what happened in
  // `payoutAmount`, so the unmatched part is whichever of the two is set.
  const unmatchedAmount = order.remainingAmount > 0 ? order.remainingAmount : (order.payoutAmount ?? 0);
  const usd = (v) => `$${v.toFixed(2)}`;
  // What the unmatched part became, per status.
  const unmatched = {
    open: { label: 'Unmatched, still waiting', usdc: false },
    partially_matched: { label: 'Unmatched, still waiting', usdc: false },
    payout_pending: { label: 'Being sent as USDC via Stellar Blockchain', usdc: true },
    payout_failed: { label: 'Unmatched, payout failed (will retry)', usdc: false },
    fallback_executed: { label: 'Sent as USDC via Stellar Blockchain', usdc: true },
    remainder_converted: { label: 'Converted to local money (simulated)', usdc: false },
    refunded: { label: 'Released, nothing was charged', usdc: false },
    settled: { label: 'Unmatched', usdc: false },
  }[order.status] ?? { label: 'Unmatched', usdc: false };
  const principalNote = isPending
    ? 'Nothing has been charged yet'
    : order.matchedAmount > 0 && unmatchedAmount > 0
      ? `${usd(order.matchedAmount)} matched locally · ${usd(unmatchedAmount)} unmatched`
      : order.matchedAmount > 0
        ? 'Fully matched locally'
        : 'None of it matched';
  const remainingMs = Math.max(0, order.deadlineTimestamp - currentTime);
  const totalDurationMs = Math.max(1, order.deadlineMinutes * 60 * 1000);
  const countdownPercent = Math.min(100, Math.max(0, (remainingMs / totalDurationMs) * 100));

  const hours = Math.floor(remainingMs / (1000 * 60 * 60));
  const minutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((remainingMs % (1000 * 60)) / 1000);
  const formattedCountdown = `${hours > 0 ? `${hours}h ` : ''}${minutes
    .toString()
    .padStart(2, '0')}m ${seconds.toString().padStart(2, '0')}s`;

  const deadlineDate = new Date(order.deadlineTimestamp);
  const formattedDeadlineDate = deadlineDate.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const createdDate = new Date(order.createdAt).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const handleCopy = (text, label) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(label);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadJson = () => {
    const auditData = {
      title: 'Stellar Settlement Audit & Transfer Receipt',
      orderId: order.id,
      timestamp: new Date(order.createdAt).toISOString(),
      network: 'Stellar Testnet',
      ledgerSequence: latestLedger,
      settlementContract: order.escrowContractId,
      totalUsd: order.amount,
      matchedLocallyUsd: order.matchedAmount,
      unmatchedUsd: unmatchedAmount,
      unmatchedOutcome: unmatched.label,
      route: `${order.fromCountry} -> ${order.toCountry}`,
      routedVia: order.routeVia || null,
      sender: { name: order.senderName, address: order.senderAddress },
      recipient: { name: order.recipientName, address: order.recipientAddress },
      status: order.status,
      stellarPayoutTxHash: order.fallbackTxHash || null,
      matchHistory: order.matchHistory,
    };

    const blob = new Blob([JSON.stringify(auditData, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Settlement-Audit-${order.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-2xl w-full my-8 overflow-hidden print:border-none print:shadow-none print:w-full print:max-w-none">
        {/* Audit Header Banner */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-600/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-500/30">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Settlement Audit Report & Receipt</h3>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-semibold">
                  Testnet Validated
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                Stellar Horizon Ledger #{latestLedger} · Settlement contract {order.escrowContractId}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={handlePrint}
              className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-white rounded hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors print:hidden"
              title="Print Official Audit Receipt"
            >
              <Printer className="w-4 h-4" />
            </button>
            <button
              onClick={handleDownloadJson}
              className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-white rounded hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors print:hidden"
              title="Download JSON Audit Record"
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors print:hidden"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-5 text-xs">
          {/* Top Status & Core Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
              <span className="text-[11px] text-slate-500 block mb-0.5">Order ID & Status</span>
              <div className="font-mono font-bold text-slate-900 dark:text-white">{order.id}</div>
              <div className="mt-1">
                {order.status === 'settled' && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
                    <CheckCircle2 className="w-3 h-3" /> 100% Settled & Delivered
                  </span>
                )}
                {isPending && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400 font-semibold">
                    <Clock className="w-3 h-3" /> In Matching Window
                  </span>
                )}
                {order.status === 'remainder_converted' && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400 font-semibold">
                    <CheckCircle2 className="w-3 h-3" /> Remainder Converted to Bank Fiat
                  </span>
                )}
                {order.status === 'fallback_executed' && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-sky-600 dark:text-sky-400 font-semibold">
                    <CheckCircle2 className="w-3 h-3" /> Remainder Paid (USDC via Stellar Blockchain)
                  </span>
                )}
                {order.status === 'refunded' && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-slate-600 dark:text-slate-400 font-semibold">
                    <CheckCircle2 className="w-3 h-3" /> Remainder Released (nothing was charged)
                  </span>
                )}
                {order.status === 'payout_pending' && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-sky-600 dark:text-sky-400 font-semibold">
                    <Clock className="w-3 h-3" /> Paying Remainder (USDC via Stellar Blockchain)…
                  </span>
                )}
                {order.status === 'payout_failed' && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-rose-600 dark:text-rose-400 font-semibold">
                    Payout failed: {order.payoutError}
                  </span>
                )}
              </div>
            </div>

            <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
              <span className="text-[11px] text-slate-500 block mb-0.5">Transfer Amount</span>
              <div className="text-base font-bold font-mono-numbers text-slate-900 dark:text-white">{usd(order.amount)}</div>
              <span className="text-[10px] text-slate-400">{principalNote}</span>
            </div>

            <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
              <span className="text-[11px] text-slate-500 block mb-0.5">Route</span>
              <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                <span>
                  {order.fromFlag} {order.fromCountry}
                </span>
                <ArrowRight className="w-3 h-3 text-slate-400" />
                <span>
                  {order.toFlag} {order.toCountry}
                </span>
              </div>
              {order.routeVia && (
                <span className="text-[10px] text-violet-600 dark:text-violet-400 block">Routed via {order.routeVia}</span>
              )}
              <span className="text-[10px] text-slate-400">Created: {createdDate}</span>
            </div>
          </div>

          {/* Active Countdown Timer (if pending matching) */}
          {isPending && (
            <div className="p-3.5 border border-amber-200 dark:border-amber-900/60 rounded-lg bg-amber-50/40 dark:bg-amber-950/20 space-y-2">
              <div className="flex justify-between items-baseline">
                <span className="font-semibold text-amber-900 dark:text-amber-200 flex items-center gap-1.5 text-xs">
                  <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 animate-pulse" />
                  Two-Way Matching Window Active
                </span>
                <span className="font-mono font-bold text-amber-900 dark:text-amber-200 text-sm">
                  {remainingMs > 0 ? formattedCountdown : 'Deadline reached - resolving...'}
                </span>
              </div>

              <div className="w-full bg-amber-200 dark:bg-amber-950 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-amber-600 dark:bg-amber-400 h-full transition-all duration-1000"
                  style={{ width: `${countdownPercent}%` }}
                />
              </div>

              <div className="flex justify-between text-[11px] text-amber-800 dark:text-amber-300">
                <span>Closes automatically at {formattedDeadlineDate}</span>
                <span>
                  Policy:{' '}
                  {order.remainderPolicy === 'direct_stellar_fallback'
                    ? 'Auto-dispatch remainder directly via Stellar'
                    : 'Auto-refund remainder to sender wallet'}
                </span>
              </div>
            </div>
          )}

          {/* Settlement & Netting Audit Breakdown */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
            <div className="bg-slate-50 dark:bg-slate-800/60 px-4 py-2 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
              <span className="font-semibold text-slate-900 dark:text-white text-[11px] uppercase tracking-wider">
                Netting Audit & Settlement Ledger
              </span>
              <span className="text-[11px] font-mono text-slate-500">{percent.toFixed(0)}% matched locally</span>
            </div>

            <div className="p-4 space-y-3 font-mono-numbers">
              <div className="flex justify-between items-center py-1 border-b border-slate-100 dark:border-slate-800 text-xs">
                <span className="text-slate-600 dark:text-slate-400">Total amount:</span>
                <span className="font-semibold text-slate-900 dark:text-white">{usd(order.amount)}</span>
              </div>

              <div className="flex justify-between items-center py-1 border-b border-slate-100 dark:border-slate-800 text-xs">
                <span className="text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  Matched locally (no blockchain):
                </span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">{usd(order.matchedAmount)}</span>
              </div>

              <div className="flex justify-between items-center py-1 border-b border-slate-100 dark:border-slate-800 text-xs">
                <span className="text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-slate-400" />
                  {unmatched.label}:
                </span>
                <span className="font-semibold text-slate-900 dark:text-white">
                  {usd(unmatchedAmount)}
                  {unmatched.usdc ? ' USDC' : ''}
                </span>
              </div>

              {/* How the sender pays in the matched amount */}
              {order.fundingMethod && (
                <div className="mt-3 p-2.5 rounded bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 text-[11px] font-sans">
                  <span className="text-slate-500 block">Matched amount paid by the sender via</span>
                  <span className="font-semibold text-slate-900 dark:text-white">{order.fundingMethod.providerName}</span>{' '}
                  <span className="text-slate-500">
                    ({order.fundingMethod.kindLabel}
                    {order.fundingMethod.eta ? ` · ${order.fundingMethod.eta}` : ''})
                  </span>
                  <span className="block text-[10px] text-slate-400 font-mono mt-0.5">
                    {Object.values(order.fundingMethod.details).join(' · ')}
                  </span>
                  <span className="block text-[10px] text-slate-400 mt-0.5">
                    Recipient collects through the partner network however they prefer. Any unmatched amount is sent as USDC via Stellar
                    Blockchain.
                  </span>
                </div>
              )}

              {/* Match History Log */}
              {order.matchHistory && order.matchHistory.length > 0 ? (
                <div className="mt-3 pt-2">
                  <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 block mb-1.5 font-sans">
                    Opposing Peer Match Log:
                  </span>
                  <div className="space-y-1.5">
                    {order.matchHistory.map((rec, i) => (
                      <div
                        key={i}
                        className="p-2 rounded bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 text-[11px] flex justify-between items-center"
                      >
                        <div className="font-sans">
                          <span className="text-slate-900 dark:text-white font-medium">Matched with {rec.matchedWithSender}</span>
                          <span className="text-slate-400 block font-mono text-[10px]">
                            {new Date(rec.timestamp).toLocaleTimeString()} · Payout to {rec.recipientSettled}
                          </span>
                          {rec.funding && (
                            <span className="block mt-1 text-[11px] text-slate-600 dark:text-slate-300">
                              Paid in via <strong>{rec.funding.providerName}</strong> ({rec.funding.kindLabel}) · {rec.funding.currency}{' '}
                              {rec.funding.localAmount.toFixed(2)} · <span className="font-mono">Ref {rec.funding.reference}</span> ·{' '}
                              {rec.funding.status.replace(/_/g, ' ')}
                              <span className="block text-[10px] text-slate-400 mt-0.5">{rec.funding.instructions}</span>
                              <span className="block text-[10px] text-slate-400 mt-0.5">{rec.funding.delivery.note} (simulated rails)</span>
                            </span>
                          )}
                        </div>
                        <span className="font-bold text-emerald-600 dark:text-emerald-400">+{usd(rec.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-2.5 rounded bg-slate-50 dark:bg-slate-800/30 text-slate-500 text-[11px] font-sans flex items-center gap-2">
                  <AlertCircle className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>
                    {isPending
                      ? 'No opposing peer has matched this order yet. If matching occurs, it will automatically offset here.'
                      : 'Nothing was matched, so the whole amount was handled as the unmatched part above.'}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Remainder Immediate Actions (if order still pending) */}
          {isPending && order.remainingAmount > 0 && (
            <div className="p-3.5 border border-slate-200 dark:border-slate-800 rounded-lg bg-slate-50 dark:bg-slate-800/30 space-y-2.5">
              <div className="flex justify-between items-baseline">
                <div>
                  <span className="font-semibold text-slate-900 dark:text-white text-xs block">
                    The Rest of the Money ({usd(order.remainingAmount)} still unmatched)
                  </span>
                  <span className="text-[10px] text-slate-500">
                    Counterparty matching active. Choose how to resolve the remaining balance right now:
                  </span>
                </div>
                <span className="text-[10px] text-slate-400 font-mono">1-Click Action</span>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                {onInstantSendRemainder && (
                  <button
                    type="button"
                    onClick={() => {
                      onInstantSendRemainder(order.id);
                    }}
                    className="flex-1 py-2 px-3 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 rounded-md text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 shadow-xs"
                  >
                    <span>Send the Rest via Direct USDC</span>
                  </button>
                )}
                {onInstantRefundRemainder && (
                  <button
                    type="button"
                    onClick={() => {
                      onInstantRefundRemainder(order.id);
                    }}
                    className="flex-1 py-2 px-3 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-md text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center justify-center gap-1.5"
                  >
                    <span>Refund the Rest to Wallet</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Domestic Bank Clearing & Remainder Conversion Receipt */}
          {order.convertedRemainderFiat && (
            <div className="p-3.5 rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50/50 dark:bg-amber-950/20 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-amber-900 dark:text-amber-200 flex items-center gap-1.5 text-xs">
                  <Building2 className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  Domestic Bank Clearing & Remainder Conversion Receipt
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-semibold">
                  Cleared to Bank
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] font-mono-numbers">
                <div className="p-2 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <span className="text-slate-400 block text-[10px]">Net Fiat Deposited</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">
                    {order.convertedRemainderFiat.currency}{' '}
                    {order.convertedRemainderFiat.fiatAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="p-2 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <span className="text-slate-400 block text-[10px]">Applied Anchor FX</span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    1 USDC = {order.convertedRemainderFiat.exchangeRate.toFixed(2)}
                  </span>
                </div>
                <div className="p-2 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 col-span-2 sm:col-span-1">
                  <span className="text-slate-400 block text-[10px]">Bank Clearing Ref</span>
                  <span className="font-mono text-[10px] text-slate-700 dark:text-slate-300 break-all">
                    {order.convertedRemainderFiat.bankClearingRef}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Parties & Addresses */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-1">
              <span className="text-slate-400 text-[11px] block">Sender (Origin Account)</span>
              <div className="font-semibold text-slate-900 dark:text-white flex items-center justify-between">
                <span>
                  {order.senderName} ({order.fromCountry})
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy(order.senderAddress, 'sender')}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  title="Copy address"
                >
                  {copiedKey === 'sender' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                </button>
              </div>
              <div className="font-mono text-[11px] text-slate-500 break-all select-all">
                {(() => {
                  const pub = order.senderAddress.match(/G[A-Z2-7]{55}/)?.[0];
                  return pub ? (
                    <a
                      href={`https://stellar.expert/explorer/testnet/account/${pub}`}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:underline flex items-center gap-1 text-slate-600 dark:text-slate-300 group"
                      title="View account on StellarExpert Testnet"
                    >
                      <span>{order.senderAddress}</span>
                      <ExternalLink className="w-3 h-3 text-slate-400 group-hover:text-slate-700 dark:group-hover:text-white shrink-0" />
                    </a>
                  ) : (
                    <span>{order.senderAddress}</span>
                  );
                })()}
              </div>
            </div>

            <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-1">
              <span className="text-slate-400 text-[11px] block">Recipient (Destination Account)</span>
              <div className="font-semibold text-slate-900 dark:text-white flex items-center justify-between">
                <span>
                  {order.recipientName} ({order.toCountry})
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy(order.recipientAddress, 'recipient')}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  title="Copy address"
                >
                  {copiedKey === 'recipient' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                </button>
              </div>
              <div className="font-mono text-[11px] text-slate-500 break-all select-all">
                {(() => {
                  const pub = order.recipientAddress.match(/G[A-Z2-7]{55}/)?.[0];
                  return pub ? (
                    <a
                      href={`https://stellar.expert/explorer/testnet/account/${pub}`}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:underline flex items-center gap-1 text-slate-600 dark:text-slate-300 group"
                      title="View account on StellarExpert Testnet"
                    >
                      <span>{order.recipientAddress}</span>
                      <ExternalLink className="w-3 h-3 text-slate-400 group-hover:text-slate-700 dark:group-hover:text-white shrink-0" />
                    </a>
                  ) : (
                    <span>{order.recipientAddress}</span>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* Stellar Blockchain Hashes */}
          <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 font-mono text-[11px] space-y-2 text-slate-600 dark:text-slate-400">
            <div className="flex justify-between items-center font-sans font-semibold text-slate-900 dark:text-white text-xs">
              <span>Cryptographic Proofs (Stellar Testnet Explorer)</span>
              <span className="text-[10px] text-slate-400 font-mono">Horizon Live</span>
            </div>

            {order.matchHistory.length > 0 && (
              <div className="flex justify-between items-center pt-1 border-t border-slate-100 dark:border-slate-800">
                <span className="text-slate-500">Matched part (settled locally, not on-chain):</span>
                <span className="text-slate-900 dark:text-white font-mono font-medium">
                  {order.matchHistory.map((m) => m.txHash).join(', ')}
                </span>
              </div>
            )}

            {order.fallbackTxHash && (
              <div className="flex justify-between items-center pt-1 border-t border-slate-100 dark:border-slate-800">
                <span className="text-slate-500">
                  {order.transferType === 'direct_instant' ? 'Direct USDC Payment Tx:' : 'Soroban Remainder Payout Tx:'}
                </span>
                <a
                  href={`https://stellar.expert/explorer/testnet/tx/${order.fallbackTxHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-slate-900 dark:text-white hover:underline flex items-center gap-1 font-mono font-medium"
                >
                  <span>{order.fallbackTxHash.slice(0, 18)}...</span>
                  <ExternalLink className="w-3 h-3 text-slate-400" />
                </a>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30 flex items-center justify-between print:hidden">
          <button
            onClick={handleDownloadJson}
            className="text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-medium flex items-center gap-1"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export JSON Audit</span>
          </button>

          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-md bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 transition-colors shadow-xs"
          >
            Done & View Live Orders
          </button>
        </div>
      </div>
    </div>
  );
};
