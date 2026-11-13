import { useEffect, useRef, useState } from 'react';
import { Check, ExternalLink, Loader2, Play, X } from 'lucide-react';

import { COUNTRIES, isPair, partnersOf } from '../data/corridors';
import { api } from '../services/api';

const WINDOW_MINUTES = 0.25; // 15 seconds
const EXPERT = 'https://stellar.expert/explorer/testnet';
const usd = (v) => `$${(v ?? 0).toFixed(2)}`;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
// Final states. (payout_failed is not final: the server retries it automatically, 30 s apart.)
const DONE = ['fallback_executed', 'refunded', 'remainder_converted', 'settled'];
const GIVE_UP_MS = 150_000; // after the last deadline
const QUIET_WAIT_MS = 45_000; // longest the demo waits for earlier orders in its countries to finish
const isOpen = (o) => o.status === 'open' || o.status === 'partially_matched';

/**
 * Two scenarios, both on the real testnet with 15-second windows and unbalanced amounts:
 *  - two:   you send 10 A -> B; someone sends 8 B -> A. 8 matches locally, 2 goes on-chain.
 *  - three: you send 10 A -> B; someone sends 8 B -> C, which routes 8 of your money A -> C and pays
 *           your B recipient locally; someone sends 6 C -> A, which matches 6 of that routed leg.
 *           On-chain: 2 to B and 2 to C = 4 of 24 in total, the least possible (each country's net
 *           inflow: B +2, C +2).
 */
const SCENARIOS = {
  two: {
    label: '2 countries',
    blurb: 'You send $10, someone sends $8 back. Only the unmatched $2 goes on-chain.',
    steps: ['Account', 'You send $10.00 (15-second matching window)', 'Someone sends $8.00 the other way', 'Matching window closes', 'Result on Stellar'],
  },
  three: {
    label: '3 countries',
    blurb: 'You send $10 A→B, someone sends $8 B→C, someone else $6 C→A. Only $4 of $24 goes on-chain.',
    steps: [
      'Account',
      'You send $10.00 (15-second matching window)',
      'Someone sends $8.00 onward to a third country',
      'Someone in the third country sends $6.00 to yours',
      'Matching windows close',
      'Result on Stellar',
    ],
  },
};

/** One guided demo (scenario 'two' or 'three'), run inside the floating progress card. Starts on mount. */
export const AutoDemo = ({ scenario: fixedScenario, account, corridors, ensureAccount, onRefresh, onSelectOrder }) => {
  const [scenario, setScenario] = useState(null); // set once a run starts
  const [steps, setSteps] = useState([]);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState([]); // [{ label, order }]
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(null);
  const runId = useRef(0); // bumping it stops the current run

  // Starts as soon as the card opens; stops if the card is closed mid-run.
  useEffect(() => {
    run(fixedScenario);
    return () => {
      runId.current += 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flagOf = {};
  corridors.forEach((c) => {
    flagOf[c.countryA.name] = c.countryA.flag;
    flagOf[c.countryB.name] = c.countryB.flag;
  });

  const run = async (which) => {
    const me = ++runId.current;
    const stop = () => {
      if (runId.current !== me) throw new Error('Demo stopped.');
    };
    let i = 0;
    const setStep = (n, patch) => {
      i = n;
      setSteps((prev) => prev.map((s, j) => (j === n ? { ...s, ...patch } : s)));
    };
    setScenario(which);
    setRunning(true);
    setError(null);
    setResults([]);
    setSummary(null);
    setSteps(SCENARIOS[which].steps.map((title) => ({ title, state: 'pending', note: '' })));

    const fetchMine = async (ids) => {
      const all = await api.orders();
      return ids.map((id) => all.find((o) => o.id === id));
    };

    try {
      // Account and countries.
      setStep(0, { state: 'active', note: account ? 'Using your linked account.' : 'Linking a demo Canada account (about 10 s)...' });
      const acct = account ?? (await ensureAccount());
      stop();
      // Countries come from the app's pairs (shared/corridors.json). The 3-country demo needs a triangle:
      // A-B, B-C and C-A must all be pairs, so the loop can close.
      const A = acct.country;
      const partners = partnersOf(A);
      if (!partners.length) throw new Error(`${A} is not in any of the app's country pairs.`);
      let B = partners[0];
      let C = null;
      if (which === 'three') {
        const tri = partners.flatMap((b) => partnersOf(b).filter((c) => c !== A && isPair(c, A)).map((c) => [b, c]))[0];
        if (!tri) {
          throw new Error(
            `${A}'s country pairs don't form a triangle, so a 3-country loop isn't possible from ${A}. Link an account in one of: ${COUNTRIES.filter(
              (x) => partnersOf(x).some((b) => partnersOf(b).some((c) => c !== x && isPair(c, x))),
            ).join(', ')}.`,
          );
        }
        [B, C] = tri;
      }
      setStep(0, { state: 'done', note: `${acct.displayName}, ${flagOf[A]} ${A}.` });

      // You send 10 A -> B. First make sure no earlier orders in these countries can match first (matching
      // is first-come-first-served), so the numbers come out exactly as described.
      const used = which === 'two' ? [A, B] : [A, B, C];
      setStep(1, { state: 'active', note: `Clearing leftover sandbox orders in ${used.join(', ')}...` });
      await api.demoClear(used);
      const waitStart = Date.now();
      let waiting = [];
      while (true) {
        stop();
        const now = Date.now();
        waiting = (await api.orders()).filter(
          (o) => isOpen(o) && o.remainingAmount > 0 && o.deadlineTimestamp > now && (used.includes(o.fromCountry) || used.includes(o.toCountry)),
        );
        if (!waiting.length || now - waitStart > QUIET_WAIT_MS) break;
        const left = Math.ceil((Math.min(...waiting.map((o) => o.deadlineTimestamp)) - now) / 1000);
        setStep(1, {
          note: `Waiting for ${waiting.length} earlier order${waiting.length > 1 ? 's' : ''} in these countries to finish (next timer ends in ${left}s), so nothing else can match first...`,
        });
        await pause(1500);
      }
      setStep(1, { note: `Preparing a recipient in ${flagOf[B]} ${B}...` });
      const recipient = await api.demoRecipient(B);
      stop();
      const draft = {
        recipientName: recipient.name,
        recipientAddress: recipient.address,
        fromCountry: A,
        toCountry: B,
        fromFlag: flagOf[A],
        toFlag: flagOf[B],
        amount: (10).toFixed(7),
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
        const bank = acct.bank ?? acct.banks?.[0];
        await api.deposit(bank.id, 100000); // sandbox money
        placed = await api.placeOrder(draft);
      }
      stop();
      const myId = placed.order.id;
      await onRefresh();
      setStep(1, {
        state: 'done',
        note:
          `Order ${myId}: ${A} → ${B}. Nothing charged and nothing on-chain yet.` +
          (waiting.length ? ` Note: ${waiting.length} earlier order${waiting.length > 1 ? 's are' : ' is'} still waiting in these countries and may match first.` : ''),
      });
      await pause(2000);
      stop();

      // The anonymous counterparties use the same short window, so nothing of theirs lingers in the book.
      const counterparty = (frm, to, amount) =>
        api.counterpartyOrder({ fromCountry: frm, toCountry: to, fromFlag: flagOf[frm], toFlag: flagOf[to], amount: amount.toFixed(2), deadlineMinutes: WINDOW_MINUTES });

      let watch = [myId];
      if (which === 'two') {
        setStep(2, { state: 'active', note: `An anonymous sender in ${B} sends $8.00 to ${A}...` });
        await counterparty(B, A, 8);
        stop();
        await onRefresh();
        const [mine] = await fetchMine([myId]);
        setStep(2, {
          state: 'done',
          note: `${usd(mine.matchedAmount)} matched: each sender pays the other's recipient locally. ${usd(mine.remainingAmount)} still unmatched.`,
        });
      } else {
        setStep(2, {
          state: 'active',
          note: `An anonymous sender in ${B} sends $8.00 to ${C}...`,
        });
        await counterparty(B, C, 8);
        stop();
        await onRefresh();
        let all = await api.orders();
        // Routed legs this run created from your money (older orders waiting in the same queue can add one).
        const legs = () =>
          all.filter(
            (o) => o.transferType === 'routed' && o.senderAddress === acct.wallet.publicKey && o.routeVia === B && o.createdAt >= placed.order.createdAt,
          );
        const mine = all.find((o) => o.id === myId);
        if (!legs().length) throw new Error(`No route was formed through ${B} (another order may have taken it first). Try again.`);
        const routedTotal = legs().reduce((s, o) => s + o.amount, 0);
        setStep(2, {
          state: 'done',
          note: `Routed: your ${B} recipient is paid ${usd(mine.matchedAmount)} locally by senders in ${B}, and ${usd(routedTotal)} of your money now goes ${A} → ${C} instead. Two cross-border payments became one.`,
        });
        await pause(2000);
        stop();

        setStep(3, { state: 'active', note: `An anonymous sender in ${C} sends $6.00 to ${A}...` });
        await counterparty(C, A, 6);
        stop();
        await onRefresh();
        all = await api.orders();
        const m2 = all.find((o) => o.id === myId);
        const rl = legs();
        watch = [myId, ...rl.map((o) => o.id)];
        setStep(3, {
          state: 'done',
          note: `${usd(rl.reduce((s, o) => s + o.matchedAmount, 0))} of the ${A} → ${C} money matched it: paid locally both ways. Left unmatched: ${usd(m2.remainingAmount)} to ${B} and ${usd(rl.reduce((s, o) => s + o.remainingAmount, 0))} to ${C}.`,
        });
      }
      await pause(1500);
      stop();

      // Wait for the timers; the server pays out on its own.
      const waitStep = which === 'two' ? 3 : 4;
      setStep(waitStep, { state: 'active', note: '' });
      let orders;
      while (true) {
        stop();
        orders = (await fetchMine(watch)).filter(Boolean);
        if (orders.every((o) => DONE.includes(o.status))) break;
        const lastDeadline = Math.max(...orders.map((o) => o.deadlineTimestamp));
        const left = Math.ceil((lastDeadline - Date.now()) / 1000);
        const pending = orders.reduce((s, o) => s + (o.remainingAmount || o.payoutAmount || 0), 0);
        const retrying = orders.find((o) => o.status === 'payout_failed');
        if (retrying && Date.now() - lastDeadline > GIVE_UP_MS) {
          throw new Error(`${retrying.payoutError || 'A payout failed'}. The server keeps retrying; check Live Orders later.`);
        }
        setStep(waitStep, {
          note:
            left > 0
              ? `${left}s left to find more matches. Still nothing on-chain.`
              : retrying
                ? `The public testnet was busy (${retrying.payoutError || 'payout failed'}). The server retries automatically every 30 s...`
                : `Windows closed. Sending the unmatched ${usd(pending)} as USDC via the Soroban contract...`,
        });
        await pause(1000);
      }
      await onRefresh();
      setStep(waitStep, { state: 'done', note: 'Windows closed.' });

      // Result.
      // Everything below is computed from the actual orders, not fixed text.
      const onChain = orders.reduce((s, o) => s + (o.status === 'fallback_executed' ? o.payoutAmount ?? 0 : 0), 0);
      const flows = which === 'two' ? [[A, B, 10], [B, A, 8]] : [[A, B, 10], [B, C, 8], [C, A, 6]];
      const net = {};
      flows.forEach(([f, t, v]) => {
        net[t] = (net[t] ?? 0) + v;
        net[f] = (net[f] ?? 0) - v;
      });
      const least = Object.values(net).reduce((s, v) => s + Math.max(0, v), 0);
      const total = flows.reduce((s, [, , v]) => s + v, 0);
      const mineFinal = orders.find((o) => o.id === myId);
      setResults(
        orders.map((o) => ({
          label: o.id === myId ? `${A} → ${B}` : `${A} → ${C} (routed)`,
          order: o,
        })),
      );
      const isLeast = Math.abs(onChain - least) < 0.005;
      setSummary(
        `${usd(onChain)} moved on-chain out of ${usd(total)} sent by everyone in this demo. ` +
          (isLeast
            ? `That's the least possible (${Object.entries(net)
                .filter(([, v]) => v > 0)
                .map(([c, v]) => `${c} takes in ${usd(v)} more than it sends`)
                .join(', ')}); everything else, including your ${usd(mineFinal?.matchedAmount)} matched, was paid locally.`
            : `The least possible was ${usd(least)}: other orders in the book took part in the matching this time.`),
      );
      setStep(waitStep + 1, { state: 'done', note: '' });
    } catch (e) {
      if (runId.current === me) {
        setError(e.message);
        setSteps((prev) => prev.map((s, j) => (j === i ? { ...s, state: 'error' } : s)));
      }
    } finally {
      if (runId.current === me) setRunning(false);
    }
  };

  return (
    <section className="text-xs" aria-label={`Guided demo, ${SCENARIOS[fixedScenario].label}`}>

      {scenario && (
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
      )}

      {summary && <div className="mx-4 mb-3 p-2 rounded bg-emerald-50 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300 text-[11px]">{summary}</div>}
      {error && <div className="mx-4 mb-3 p-2 rounded bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 text-[11px]">{error}</div>}

      {scenario && (
        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-t border-slate-100 dark:border-slate-800">
          {results.map(({ label, order }) =>
            order.fallbackTxHash ? (
              <a
                key={order.id}
                href={`${EXPERT}/tx/${order.fallbackTxHash}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-semibold"
                title="Open this payout on Stellar Expert"
              >
                {label}: {usd(order.payoutAmount)} <ExternalLink className="w-3 h-3" />
              </a>
            ) : null,
          )}
          {results[0] && (
            <button onClick={() => onSelectOrder(results[0].order)} className="px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 font-medium">
              Open receipt
            </button>
          )}
          {!running && (
            <span className="ml-auto flex gap-2">
              <button onClick={() => run(scenario)} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 font-medium">
                <Play className="w-3 h-3" /> Run again
              </button>
            </span>
          )}
          {running && <span className="text-[11px] text-slate-400 ml-auto">Running on Stellar testnet…</span>}
        </div>
      )}
    </section>
  );
};
