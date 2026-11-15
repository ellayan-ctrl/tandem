import { useEffect, useRef, useState } from 'react';
import { Check, Copy, Download, ExternalLink, Printer, X } from 'lucide-react';

import { statusOf, TONE } from '../data/orderStatus';
import { RouteKey, RouteStrip, Station, splitOf, usd } from './Route';

const EXPERT = 'https://stellar.expert/explorer/testnet';
const PENDING = ['open', 'partially_matched'];

/** The stages every transfer passes, on one baseline: done, current, failed or not yet. */
const stagesOf = (o) => {
  const pending = PENDING.includes(o.status);
  const departed = ['payout_pending', 'payout_failed', 'fallback_executed', 'refunded', 'remainder_converted', 'settled'].includes(o.status);
  const paid = ['fallback_executed', 'refunded', 'remainder_converted', 'settled'].includes(o.status);
  if (o.transferType === 'direct_instant') {
    return [
      { label: 'Placed', state: 'done' },
      { label: 'Sent on Stellar', state: o.status === 'payout_failed' ? 'failed' : departed ? 'done' : 'current' },
      { label: 'Paid', state: paid ? 'done' : 'todo' },
    ];
  }
  return [
    { label: 'Placed', state: 'done' },
    { label: o.matchedAmount > 0 ? `Matched ${usd(o.matchedAmount)}` : 'Looking for a match', state: pending ? 'current' : 'done' },
    {
      label: 'Departed',
      state: o.status === 'payout_failed' ? 'failed' : o.status === 'payout_pending' ? 'current' : departed ? 'done' : 'todo',
    },
    { label: 'Paid', state: paid ? 'done' : 'todo' },
  ];
};

const Mark = ({ state }) => {
  const cls = {
    done: 'bg-ink border-ink',
    current: 'bg-white border-amber-500 ring-4 ring-amber-100',
    failed: 'bg-rose-600 border-rose-600',
    todo: 'bg-white border-slate-300',
  }[state];
  return <span className={`relative z-10 block w-3.5 h-3.5 rounded-full border-[3px] ${cls}`} aria-hidden="true" />;
};

const Address = ({ label, name, country, address, onCopy, copied }) => {
  const pub = address?.match(/G[A-Z2-7]{55}/)?.[0];
  return (
    <div className="min-w-0 space-y-1">
      <span className="label">{label}</span>
      <div className="font-semibold">
        {name} <span className="font-normal text-slate-600">· {country}</span>
      </div>
      {address && (
        <div className="flex items-start gap-1.5">
          {pub ? (
            <a
              href={`${EXPERT}/account/${pub}`}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-[13px] text-slate-700 break-all hover:underline"
              title="Open this account on Stellar Expert"
            >
              {address}
            </a>
          ) : (
            <span className="font-mono text-[13px] text-slate-700 break-all">{address}</span>
          )}
          <button onClick={onCopy} className="shrink-0 p-1 text-slate-500 hover:text-ink" aria-label={`Copy ${label.toLowerCase()} address`}>
            {copied ? <Check className="w-3.5 h-3.5 text-local" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
      )}
    </div>
  );
};

export const OrderReceiptModal = ({ order, onClose, onInstantSendRemainder, onInstantRefundRemainder, latestLedger = 0 }) => {
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [copiedKey, setCopiedKey] = useState(null);
  const closeRef = useRef(null);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Escape closes; focus starts on the close button.
  useEffect(() => {
    if (!order) return undefined;
    closeRef.current?.focus();
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [order?.id]);

  if (!order) return null;

  const isPending = PENDING.includes(order.status);
  const split = splitOf(order);
  const status = statusOf(order.status);
  const unmatchedAmount = order.remainingAmount > 0 ? order.remainingAmount : (order.payoutAmount ?? 0);
  const remainingMs = Math.max(0, order.deadlineTimestamp - currentTime);
  const totalMs = Math.max(1, order.deadlineMinutes * 60 * 1000);
  const elapsedPct = Math.min(100, Math.max(0, 100 - (remainingMs / totalMs) * 100));
  const h = Math.floor(remainingMs / 3_600_000);
  const m = Math.floor((remainingMs % 3_600_000) / 60_000);
  const s = Math.floor((remainingMs % 60_000) / 1000);
  const countdown = `${h > 0 ? `${h} h ` : ''}${String(m).padStart(2, '0')} min ${String(s).padStart(2, '0')} s`;
  const departure = new Date(order.deadlineTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  const created = new Date(order.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

  const copy = (text, key) => {
    navigator.clipboard?.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const downloadJson = () => {
    const record = {
      title: 'Tandem transfer receipt',
      orderId: order.id,
      timestamp: new Date(order.createdAt).toISOString(),
      network: 'Stellar Testnet',
      ledgerSequence: latestLedger,
      settlementContract: order.escrowContractId,
      totalUsd: order.amount,
      matchedLocallyUsd: order.matchedAmount,
      unmatchedUsd: unmatchedAmount,
      status: order.status,
      route: `${order.fromCountry} -> ${order.toCountry}`,
      routedVia: order.routeVia || null,
      sender: { name: order.senderName, address: order.senderAddress },
      recipient: { name: order.recipientName, address: order.recipientAddress },
      stellarPayoutTxHash: order.fallbackTxHash || null,
      matchHistory: order.matchHistory,
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(record, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `Tandem-receipt-${order.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const stages = stagesOf(order);
  const iconBtn = 'w-9 h-9 inline-flex items-center justify-center rounded-sm text-slate-600 hover:text-ink hover:bg-slate-100 transition-colors print:hidden';

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-0 sm:p-4 bg-ink/55 overflow-y-auto"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="receipt-h"
        className="bg-white w-full max-w-2xl sm:my-8 border-t-[3px] border-ink shadow-[0_16px_48px_rgb(15_34_51/0.35)] print:shadow-none"
      >
        {/* Title row */}
        <div className="flex items-start justify-between gap-4 px-5 sm:px-6 pt-5">
          <div className="min-w-0">
            <h2 id="receipt-h" className="text-xl font-semibold">
              Transfer receipt
            </h2>
            <p className="text-sm text-slate-600">
              <span className="font-mono">{order.id}</span> · {created}
            </p>
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            <button onClick={() => window.print()} className={iconBtn} aria-label="Print receipt" title="Print">
              <Printer className="w-4 h-4" />
            </button>
            <button onClick={downloadJson} className={iconBtn} aria-label="Download receipt as JSON" title="Download JSON">
              <Download className="w-4 h-4" />
            </button>
            <button ref={closeRef} onClick={onClose} className={iconBtn} aria-label="Close receipt" title="Close">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Route, amount, split */}
        <div className="px-5 sm:px-6 pt-5 pb-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-[40px] leading-none font-semibold tracking-[-0.02em]">{usd(order.amount)}</div>
              <p className="mt-1.5 text-slate-600">
                to <span className="font-semibold text-ink">{order.recipientName}</span> in {order.toCountry}
                {order.routeVia ? `, routed via ${order.routeVia}` : ''}
              </p>
            </div>
            <span className={`px-2 py-0.5 rounded-xs text-[13px] font-semibold ${TONE[status.tone]}`}>{status.label}</span>
          </div>

          <div className="mt-5 flex items-center justify-between text-sm font-semibold">
            <span className="flex items-center gap-2">
              <Station country={order.fromCountry} size="sm" /> {order.fromCountry}
            </span>
            <span className="flex items-center gap-2">
              {order.toCountry} <Station country={order.toCountry} size="sm" />
            </span>
          </div>
          <RouteStrip
            from={order.fromCountry}
            to={order.toCountry}
            local={split.local}
            cross={split.cross}
            waiting={split.waiting + split.released}
            height="lg"
            className="mt-2"
          />
          <div className="mt-4 grid sm:grid-cols-2 gap-x-8 gap-y-1.5">
            <RouteKey kind="local" label="Paid locally" value={usd(split.local)} />
            {order.transferType === 'direct_instant' || split.cross > 0 ? (
              <RouteKey kind="cross" label={order.status === 'payout_pending' ? 'Crossing on Stellar now' : 'Crossed on Stellar (USDC)'} value={usd(split.cross)} />
            ) : split.released > 0 ? (
              <RouteKey kind="waiting" label={order.status === 'remainder_converted' ? 'Converted locally (simulated)' : 'Released, never charged'} value={usd(split.released)} />
            ) : (
              <RouteKey kind="waiting" label="Still waiting for a match" value={usd(split.waiting)} />
            )}
          </div>

          {/* Stages on one baseline */}
          <ol className="mt-6 grid" style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(0, 1fr))` }}>
            {stages.map((st, i) => (
              <li key={st.label} className="relative">
                {i > 0 && (
                  <span
                    aria-hidden="true"
                    className={`absolute top-[6px] h-0.5 ${st.state === 'todo' ? 'bg-slate-200' : 'bg-ink'}`}
                    style={{ left: 'calc(-100% + 14px)', width: 'calc(100% - 14px)' }}
                  />
                )}
                <Mark state={st.state} />
                <span className={`block mt-2 pr-2 text-sm leading-snug ${st.state === 'todo' ? 'text-slate-500' : 'font-medium'} ${st.state === 'failed' ? 'text-rose-700' : ''}`}>
                  {st.label}
                  <span className="sr-only"> ({st.state === 'todo' ? 'not yet' : st.state})</span>
                </span>
              </li>
            ))}
          </ol>
          {order.status === 'payout_failed' && (
            <p role="alert" className="mt-3 text-sm text-rose-700 bg-rose-50 px-3 py-2 rounded-sm">
              The Stellar payment failed and will be retried automatically: {order.payoutError}
            </p>
          )}
        </div>

        {/* Departure: the countdown and the irreversible choices, set apart */}
        {isPending && (
          <div className="border-t border-slate-200 px-5 sm:px-6 py-5 bg-amber-50/60">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-semibold">{remainingMs > 0 ? `Departs in ${countdown}` : 'Departing now…'}</span>
              <span className="text-sm text-slate-700">at {departure}</span>
            </div>
            <div className="mt-2 h-1.5 bg-amber-100 rounded-[1px] overflow-hidden" aria-hidden="true">
              <div className="h-full bg-amber-500 transition-[width] duration-1000 ease-linear" style={{ width: `${elapsedPct}%` }} />
            </div>
            <p className="mt-2 text-sm text-slate-700">
              Nothing has been charged for the unmatched part yet. At departure, {usd(order.remainingAmount)} is converted to USDC and sent to{' '}
              {order.recipientName} on Stellar.
            </p>
            {order.remainingAmount > 0 && (onInstantSendRemainder || onInstantRefundRemainder) && (
              <div className="mt-5 flex flex-col sm:flex-row gap-3">
                {onInstantSendRemainder && (
                  <button
                    type="button"
                    onClick={() => onInstantSendRemainder(order.id)}
                    className="h-11 px-4 rounded-sm bg-ink text-white font-semibold hover:bg-slate-800 transition-colors"
                  >
                    Send the remaining {usd(order.remainingAmount)} now
                  </button>
                )}
                {onInstantRefundRemainder && (
                  <button
                    type="button"
                    onClick={() => onInstantRefundRemainder(order.id)}
                    className="h-11 px-4 rounded-sm ring-1 ring-inset ring-slate-400 font-semibold hover:bg-white transition-colors sm:ml-auto"
                  >
                    Cancel the unmatched part
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Matches */}
        <div className="border-t border-slate-200 px-5 sm:px-6 py-5">
          <h3 className="font-semibold">Matches</h3>
          {order.matchHistory?.length > 0 ? (
            <ul className="mt-2 divide-y divide-slate-200">
              {order.matchHistory.map((rec, i) => (
                <li key={i} className="py-2.5 flex items-start justify-between gap-4">
                  <div className="min-w-0 text-sm">
                    <div className="text-[15px] font-medium">
                      {rec.settlementMethod === 'chain_routing' ? 'Routed through another transfer' : `Matched with ${rec.matchedWithSender}`}
                    </div>
                    <div className="text-slate-600">
                      {new Date(rec.timestamp).toLocaleTimeString()} · paid out locally to {rec.recipientSettled}
                    </div>
                    {rec.funding && (
                      <div className="mt-1 text-slate-600">
                        You paid in via {rec.funding.providerName} ({rec.funding.kindLabel}), {rec.funding.currency}{' '}
                        {rec.funding.localAmount.toFixed(2)} · ref <span className="font-mono">{rec.funding.reference}</span> ·{' '}
                        {rec.funding.status.replace(/_/g, ' ')} (simulated rails)
                      </div>
                    )}
                  </div>
                  <span className="shrink-0 font-semibold text-emerald-700">{usd(rec.amount)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-slate-600">
              {isPending ? 'No one has matched this transfer yet. Matches appear here as they happen.' : 'Nothing matched, so the whole amount was the unmatched part.'}
            </p>
          )}
          {order.fundingMethod && (
            <p className="mt-3 text-sm text-slate-600">
              Matched part paid from <span className="font-medium text-ink">{order.fundingMethod.providerName}</span> ({order.fundingMethod.kindLabel}
              {order.fundingMethod.eta ? `, ${order.fundingMethod.eta.toLowerCase()}` : ''}).
            </p>
          )}
          {order.convertedRemainderFiat && (
            <p className="mt-3 text-sm text-slate-600">
              Remainder converted locally (simulated): {order.convertedRemainderFiat.currency}{' '}
              {order.convertedRemainderFiat.fiatAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })} at 1 USDC ={' '}
              {order.convertedRemainderFiat.exchangeRate.toFixed(2)} · ref <span className="font-mono">{order.convertedRemainderFiat.bankClearingRef}</span>
            </p>
          )}
        </div>

        {/* Parties */}
        <div className="border-t border-slate-200 px-5 sm:px-6 py-5 grid sm:grid-cols-2 gap-5">
          <Address
            label="Sender"
            name={order.senderName}
            country={order.fromCountry}
            address={order.senderAddress}
            onCopy={() => copy(order.senderAddress, 'sender')}
            copied={copiedKey === 'sender'}
          />
          <Address
            label="Recipient"
            name={order.recipientName}
            country={order.toCountry}
            address={order.recipientAddress}
            onCopy={() => copy(order.recipientAddress, 'recipient')}
            copied={copiedKey === 'recipient'}
          />
        </div>

        {/* Proof */}
        <div className="border-t border-slate-200 px-5 sm:px-6 py-5 space-y-2.5">
          <h3 className="font-semibold">Proof on Stellar</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex flex-wrap justify-between gap-x-4 gap-y-0.5">
              <dt className="text-slate-600">{order.transferType === 'direct_instant' ? 'USDC payment' : 'Remainder payment (settle_remainder)'}</dt>
              <dd>
                {order.fallbackTxHash ? (
                  <a href={`${EXPERT}/tx/${order.fallbackTxHash}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-cross hover:underline">
                    {order.fallbackTxHash.slice(0, 16)}… <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                ) : (
                  <span className="text-slate-600">{isPending ? 'Not yet: nothing goes on-chain before departure' : 'None'}</span>
                )}
              </dd>
            </div>
            {order.matchHistory?.length > 0 && (
              <div className="flex flex-wrap justify-between gap-x-4 gap-y-0.5">
                <dt className="text-slate-600">Matched part</dt>
                <dd className="text-slate-700">Settled locally, never on-chain</dd>
              </div>
            )}
            {order.escrowContractId && (
              <div className="flex flex-wrap justify-between gap-x-4 gap-y-0.5">
                <dt className="text-slate-600">Settlement contract</dt>
                <dd>
                  <a href={`${EXPERT}/contract/${order.escrowContractId}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-cross hover:underline">
                    {order.escrowContractId.slice(0, 12)}… <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </dd>
              </div>
            )}
            {latestLedger > 0 && (
              <div className="flex flex-wrap justify-between gap-x-4 gap-y-0.5">
                <dt className="text-slate-600">Testnet ledger at viewing</dt>
                <dd className="text-slate-700">{latestLedger.toLocaleString('en-US')}</dd>
              </div>
            )}
          </dl>
        </div>

        <div className="border-t border-slate-200 px-5 sm:px-6 py-4 flex justify-end print:hidden">
          <button onClick={onClose} className="h-10 px-5 rounded-sm bg-ink text-white font-semibold hover:bg-slate-800 transition-colors">
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
