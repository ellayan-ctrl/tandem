import { useEffect, useState } from 'react';
import { Check, ExternalLink, Landmark, Loader2, X } from 'lucide-react';

import { api } from '../services/api';

const EXPERT = 'https://stellar.expert/explorer/testnet';
const usdc = (v) => `${Number(v ?? 0).toFixed(2)} USDC`;

/** SEP-24 statuses in plain words, in the order a cash-out goes through them. */
const STATUS = {
  incomplete: 'Waiting for you to finish the anchor’s form',
  pending_user_transfer_start: 'Sending your USDC to the anchor…',
  pending_user_transfer_complete: 'Anchor received the USDC, paying out…',
  pending_anchor: 'Anchor is processing…',
  pending_external: 'Anchor is sending the money to your bank…',
  pending_stellar: 'Anchor is processing…',
  completed: 'Completed: the anchor paid out to your bank',
  refunded: 'Refunded by the anchor',
  expired: 'Expired: the anchor’s form wasn’t completed in time',
  error: 'The anchor reported an error',
};

/**
 * Cash out received USDC through a real Stellar anchor (SEP-24). The anchor's own web form opens in a popup;
 * Tandem then sends the USDC to the anchor with the memo it asked for, and follows it until it's paid out.
 */
export const AnchorCashOut = ({ account }) => {
  const [info, setInfo] = useState(null);
  const [infoError, setInfoError] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [list, setList] = useState([]);
  const [amount, setAmount] = useState('2');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [incoming, setIncoming] = useState(null); // demo incoming transfer in progress

  useEffect(() => {
    api.anchorInfo().then(setInfo).catch((e) => setInfoError(e.message));
  }, []);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const [w, l] = await Promise.all([api.myWallet(), api.myCashouts()]);
        if (alive) {
          setWallet(w);
          setList(l);
        }
      } catch {
        // keep last values
      }
    };
    load();
    const t = setInterval(load, 3000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [account?.id]);

  // Clear the "incoming" note once the USDC has arrived.
  useEffect(() => {
    if (incoming && wallet && wallet.usdc > incoming.before) setIncoming(null);
  }, [wallet, incoming]);

  const start = async () => {
    setError(null);
    // Open the popup now (inside the click), so browsers don't block it; point it at the anchor once ready.
    const popup = window.open('', 'tandem-anchor', 'width=480,height=720');
    if (popup) popup.document.write('<p style="font-family:sans-serif;padding:24px">Opening the anchor…</p>');
    setBusy(true);
    try {
      const c = await api.startCashout(amount);
      setList((l) => [c, ...l]);
      if (popup) popup.location.href = c.interactiveUrl;
      else window.open(c.interactiveUrl, '_blank');
    } catch (e) {
      setError(e.message);
      popup?.close();
    } finally {
      setBusy(false);
    }
  };

  const receiveTest = async () => {
    setError(null);
    try {
      await api.demoIncoming('5');
      setIncoming({ before: wallet?.usdc ?? 0 });
    } catch (e) {
      setError(e.message);
    }
  };

  const limits = info && info.minAmount != null ? `${info.minAmount}–${info.maxAmount} USDC per cash-out` : '';
  const amt = parseFloat(amount) || 0;
  const tooMuch = wallet && amt > wallet.usdc;

  return (
    <section className="panel px-5 py-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">
            Cash out to your bank
          </h2>
          <p className="mt-0.5 text-slate-600 max-w-2xl">
            Turn USDC you&apos;ve received into money in your bank, through a real Stellar anchor. You fill in the anchor&apos;s own form (Tandem
            never sees your bank details); Tandem then sends the USDC to the anchor and follows it until it pays out.
          </p>
        </div>
        <div className="sm:text-right shrink-0">
          <div className="text-slate-600">Your USDC balance</div>
          <div className="text-2xl font-semibold">{wallet ? usdc(wallet.usdc) : '…'}</div>
        </div>
      </div>

      {infoError && <div className="text-rose-600">Could not reach the anchor: {infoError}</div>}
      {info && (
        <details className="text-sm text-slate-600">
          <summary className="disclose cursor-pointer font-medium text-ink w-fit">About this anchor</summary>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span>
            Connected anchor: <strong>{info.name}</strong> ({info.homeDomain}, {info.network})
          </span>
          <span className="flex flex-wrap gap-1">
            {info.seps.map((s) => (
              <span key={s} className={`px-1.5 py-0.5 rounded-xs text-[12px] font-semibold ${s === 'SEP-24' || s === 'SEP-10' ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
                {s}
              </span>
            ))}
          </span>
          {limits && <span>{limits}</span>}
          </div>
        </details>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="label">Amount</span>
          <div className="flex items-center gap-2 mt-1.5">
            <input
              type="number"
              min={info?.minAmount ?? 1}
              max={info?.maxAmount ?? 10}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="field !w-28"
            />
            <span className="text-slate-600">USDC</span>
          </div>
        </label>
        <button
          onClick={start}
          disabled={busy || !info?.usdcSupported || !wallet || wallet.usdc <= 0 || tooMuch || amt <= 0}
          className="inline-flex h-11 items-center gap-2 px-4 font-semibold rounded-sm bg-ink text-white hover:bg-slate-800 disabled:bg-slate-300 disabled:text-slate-600 transition-colors"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Landmark className="w-3.5 h-3.5" />} Cash out
        </button>
        {wallet && wallet.usdc <= 0 && !incoming && (
          <span className="pb-2.5 text-sm text-slate-600">
            No USDC yet: it arrives when a transfer to you settles on-chain.{' '}
            <button onClick={receiveTest} className="font-semibold text-cross hover:underline">
              Receive a $5 test transfer
            </button>
          </span>
        )}
        {incoming && (
          <span className="pb-2.5 text-sm text-slate-600 inline-flex items-center gap-1.5">
            <Loader2 className="w-3 h-3 animate-spin" /> Someone abroad is sending you $5 through Tandem: it arrives as USDC in about 30 s…
          </span>
        )}
        {tooMuch && wallet.usdc > 0 && <span className="pb-2.5 text-sm text-rose-700">That is more than your balance.</span>}
      </div>
      {error && <div className="text-rose-600">{error}</div>}

      {list.length > 0 && (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800 border-t border-slate-100 dark:border-slate-800">
          {list.map((c) => {
            const ok = c.status === 'completed';
            const bad = ['error', 'expired', 'refunded'].includes(c.status);
            return (
              <li key={c.id} className="py-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="w-4 h-4 flex items-center justify-center" aria-hidden="true">
                  {ok ? <Check className="w-4 h-4 text-emerald-600" /> : bad ? <X className="w-4 h-4 text-rose-600" /> : <Loader2 className="w-4 h-4 text-sky-600 animate-spin" />}
                </span>
                <span className="font-mono-numbers font-semibold text-slate-900 dark:text-white">{usdc(c.amount)}</span>
                <span className="text-slate-600 dark:text-slate-300">{STATUS[c.status] ?? c.status.replace(/_/g, ' ')}</span>
                {ok && c.amountOut && <span className="text-slate-500">You receive {c.amountOut} (after the anchor&apos;s fee)</span>}
                {c.status === 'incomplete' && c.interactiveUrl && (
                  <a href={c.interactiveUrl} target="tandem-anchor" rel="noreferrer" className="underline text-sky-700 dark:text-sky-400">
                    Reopen the anchor&apos;s form
                  </a>
                )}
                {c.paymentTxHash && (
                  <a href={`${EXPERT}/tx/${c.paymentTxHash}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sky-700 dark:text-sky-400 hover:underline">
                    USDC to anchor on Stellar Expert <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                {c.error && !ok && <span className="text-rose-600 text-[11px]">{c.error}</span>}
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-sm text-slate-600">
        Testnet: the anchor is the Stellar Development Foundation&apos;s reference anchor, and its bank payout is simulated. With a production
        SEP-24 anchor, the same flow pays out real money.
      </p>
    </section>
  );
};
