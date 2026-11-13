import { useEffect, useRef, useState } from 'react';
import { Check, ExternalLink, Loader2, Play, X } from 'lucide-react';

import { api } from '../services/api';

/** The demo's numbers: an unbalanced pair, so part matches and a small remainder settles on-chain. */
const SEND_USD = 10;
const OPPOSING_USD = 8;
const WINDOW_MINUTES = 0.25; // 15 seconds

const EXPERT = 'https://stellar.expert/explorer/testnet';
const usd = (v) => `$${(v ?? 0).toFixed(2)}`;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

const STEP_TITLES = [
  'Account',
  `Send ${usd(SEND_USD)} with a 15-second matching window`,
  `Someone sends ${usd(OPPOSING_USD)} the other way`,
  'Matching window closes',
  'Unmatched part settles on Stellar',
];

/**
 * Runs the whole flow on the real testnet, step by step, with narration:
 * send 10 -> an anonymous opposite sender sends 8 -> 8 matches locally -> after 15 seconds only the
 * unmatched 2 goes on-chain as USDC via the Soroban contract.
 */
export const AutoDemo = ({ open, onClose, account, corridors, ensureAccount, onRefresh, onNavigate, onSelectOrder }) => {
  const [steps, setSteps] = useState([]);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const runId = useRef(0); // bumping it stops the current run
  const startedFor = useRef(false);

  const setStep = (i, patch) => setSteps((prev) => prev.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  const run = async () => {
    const me = ++runId.current;
    setRunning(true);
    setError(null);
    setResult(null);
    setSteps(STEP_TITLES.map((title) => ({ title, state: 'pending', note: '' })));
    let i = 0;
    const stop = () => {
      if (runId.current !== me) throw new Error('Demo stopped.');
    };
    try {
      // 1. Account: the user's own, or a demo one if none is linked.
      setStep(0, { state: 'active', note: account ? 'Using your linked account.' : 'Linking a demo Canada account (about 10 s)...' });
      const acct = account ?? (await ensureAccount());
      stop();
      const corridor = corridors.find((c) => c.countryA.name === acct.country || c.countryB.name === acct.country);
      if (!corridor) throw new Error(`The demo has no country pair for ${acct.country}.`);
      const from = corridor.countryA.name === acct.country ? corridor.countryA : corridor.countryB;
      const to = corridor.countryA.name === acct.country ? corridor.countryB : corridor.countryA;
      setStep(0, { state: 'done', note: `${acct.displayName}, ${from.flag} ${from.name}.` });

      // 2. Place the order.
      i = 1;
      setStep(1, { state: 'active', note: `Preparing a recipient in ${to.flag} ${to.name}...` });
      const recipient = await api.demoRecipient(to.name);
      stop();
      const before = await api.orders();
      const queueAhead = before.filter(
        (o) => o.fromCountry === from.name && o.toCountry === to.name && (o.status === 'open' || o.status === 'partially_matched') && o.remainingAmount > 0,
      ).length;
      const draft = {
        recipientName: recipient.name,
        recipientAddress: recipient.address,
        fromCountry: from.name,
        toCountry: to.name,
        fromFlag: from.flag,
        toFlag: to.flag,
        amount: SEND_USD.toFixed(7),
        deadlineMinutes: WINDOW_MINUTES,
        transferType: 'matched_pool',
        autoMatch: true,
        notes: 'Auto demo',
      };
      let placed;
      try {
        placed = await api.placeOrder(draft);
      } catch (e) {
        if (!/insufficient|balance/i.test(e.message)) throw e;
        // Sandbox money: top up the simulated bank and try again.
        const bank = acct.bank ?? acct.banks?.[0];
        await api.deposit(bank.id, 100000);
        placed = await api.placeOrder(draft);
      }
      stop();
      const orderId = placed.order.id;
      onNavigate('dashboard');
      await onRefresh();
      setStep(1, {
        state: 'done',
        note: `Order ${orderId}: ${from.name} → ${to.name}. Nothing charged and nothing on-chain yet.`,
      });
      await pause(2500);
      stop();

      // 3. The unbalanced opposite order.
      i = 2;
      setStep(2, {
        state: 'active',
        note: `An anonymous sender in ${to.name} sends ${usd(OPPOSING_USD)} to ${from.name}${queueAhead ? ` (${queueAhead} older order${queueAhead > 1 ? 's' : ''} in this direction are ahead in the queue)` : ''}...`,
      });
      await api.counterpartyOrder({
        fromCountry: to.name,
        toCountry: from.name,
        fromFlag: to.flag,
        toFlag: from.flag,
        amount: OPPOSING_USD.toFixed(2),
        deadlineMinutes: 30,
      });
      stop();
      await onRefresh();
      let mine = (await api.orders()).find((o) => o.id === orderId);
      setStep(2, {
        state: 'done',
        note: `${usd(mine.matchedAmount)} matched and paid locally in each country. ${usd(mine.remainingAmount)} is still unmatched.`,
      });
      await pause(1500);
      stop();

      // 4. Wait for the timer, then the server pays out on its own.
      i = 3;
      setStep(3, { state: 'active', note: '' });
      while (true) {
        stop();
        mine = (await api.orders()).find((o) => o.id === orderId) ?? mine;
        const left = Math.ceil((mine.deadlineTimestamp - Date.now()) / 1000);
        if (['fallback_executed', 'payout_failed', 'refunded', 'remainder_converted', 'settled'].includes(mine.status)) break;
        setStep(3, {
          note:
            left > 0
              ? `${left}s left to find more matches. Still nothing on-chain.`
              : `Window closed. Sending the unmatched ${usd(mine.remainingAmount || mine.payoutAmount)} as USDC via the Soroban contract...`,
        });
        await pause(1000);
      }
      await onRefresh();
      if (mine.status === 'payout_failed') throw new Error(mine.payoutError || 'The payout failed; the server will retry it.');
      setStep(3, { state: 'done', note: 'Window closed.' });

      // 5. Result.
      i = 4;
      if (mine.status === 'fallback_executed') {
        setStep(4, {
          state: 'done',
          note: `Exactly ${usd(mine.payoutAmount)} moved on-chain. The ${usd(mine.matchedAmount)} that matched never touched the blockchain.`,
        });
      } else {
        setStep(4, { state: 'done', note: 'Everything matched locally, so nothing needed to go on-chain.' });
      }
      setResult(mine);
    } catch (e) {
      if (runId.current === me) {
        setError(e.message);
        setStep(i, { state: 'error' });
      }
    } finally {
      if (runId.current === me) setRunning(false);
    }
  };

  // Start automatically when opened.
  useEffect(() => {
    if (open && !startedFor.current) {
      startedFor.current = true;
      run();
    }
    if (!open) {
      startedFor.current = false;
      runId.current += 1;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed bottom-4 left-4 z-40 w-[calc(100%-2rem)] sm:w-[400px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl text-xs"
      role="dialog"
      aria-label="Auto demo"
    >
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 dark:border-slate-800">
        <span className="font-semibold text-slate-900 dark:text-white">
          Auto demo · {usd(SEND_USD)} vs {usd(OPPOSING_USD)}, 15-second window
        </span>
        <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800" aria-label={running ? 'Stop demo' : 'Close demo'}>
          <X className="w-4 h-4 text-slate-500" />
        </button>
      </div>

      <ol className="px-4 py-3 space-y-2.5">
        {steps.map((s, idx) => (
          <li key={idx} className="flex gap-2.5">
            <span className="mt-0.5 shrink-0 w-4 h-4 flex items-center justify-center" aria-hidden="true">
              {s.state === 'done' && <Check className="w-4 h-4 text-emerald-600" />}
              {s.state === 'active' && <Loader2 className="w-4 h-4 text-sky-600 animate-spin" />}
              {s.state === 'error' && <X className="w-4 h-4 text-rose-600" />}
              {s.state === 'pending' && <span className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-600" />}
            </span>
            <div className="min-w-0">
              <div className={`font-medium ${s.state === 'pending' ? 'text-slate-400' : 'text-slate-900 dark:text-white'}`}>{s.title}</div>
              {s.note && <div className="text-[11px] text-slate-500 leading-snug">{s.note}</div>}
            </div>
          </li>
        ))}
      </ol>

      {error && <div className="mx-4 mb-3 p-2 rounded bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 text-[11px]">{error}</div>}

      <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-t border-slate-100 dark:border-slate-800">
        {result?.fallbackTxHash && (
          <a
            href={`${EXPERT}/tx/${result.fallbackTxHash}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-semibold"
          >
            See it on Stellar Expert <ExternalLink className="w-3 h-3" />
          </a>
        )}
        {result && (
          <button onClick={() => onSelectOrder(result)} className="px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 font-medium">
            Open receipt
          </button>
        )}
        {!running && (
          <button onClick={run} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 font-medium ml-auto">
            <Play className="w-3 h-3" /> Run again
          </button>
        )}
        {running && <span className="text-[11px] text-slate-400 ml-auto">Running on Stellar testnet…</span>}
      </div>
    </div>
  );
};
