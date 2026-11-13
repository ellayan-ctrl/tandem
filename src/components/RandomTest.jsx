import { useEffect, useRef, useState } from 'react';
import { Check, ExternalLink, Loader2, Shuffle, X } from 'lucide-react';

import { COUNTRIES, isPair, partnersOf } from '../data/corridors';
import { api } from '../services/api';

const WINDOW_SECONDS = 20;
const STEP_PAUSE_MS = 1500; // how long a finished step stays in focus before the next starts
const GIVE_UP_MS = 150_000; // after the last deadline (failed payouts are retried every 30 s)
const HORIZON = 'https://horizon-testnet.stellar.org';
const EXPERT = 'https://stellar.expert/explorer/testnet';
const FINAL = ['fallback_executed', 'settled', 'refunded', 'remainder_converted'];

const $ = (cents) => `$${(cents / 100).toFixed(2)}`;
const toCents = (usd) => Math.round((usd ?? 0) * 100);
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const randInt = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/**
 * Random orders for a mode, using only the app's country pairs (shared/corridors.json) and only countries
 * that have no waiting orders (so nothing else interferes). Returns null if no such pair/chain exists.
 */
const rollOrders = (mode, quiet) => {
  const ok = new Set(quiet);
  const amt = () => randInt(100, 2000); // $1.00 .. $20.00
  let orders;
  if (mode === 'direct') {
    const pairs = quiet.flatMap((a) => partnersOf(a).filter((b) => ok.has(b)).map((b) => [a, b]));
    if (!pairs.length) return null;
    const [a, b] = shuffle(pairs)[0];
    orders = [
      { from: a, to: b, cents: amt() },
      { from: b, to: a, cents: amt() },
    ];
  } else {
    // A -> B -> C where A-B and B-C are pairs.
    const chains = quiet.flatMap((a) =>
      partnersOf(a)
        .filter((b) => ok.has(b))
        .flatMap((b) => partnersOf(b).filter((c) => c !== a && ok.has(c)).map((c) => [a, b, c])),
    );
    if (!chains.length) return null;
    const [a, b, c] = shuffle(chains)[0];
    orders = [
      { from: a, to: b, cents: amt() },
      { from: b, to: c, cents: amt() },
    ];
    // Sometimes close the loop, when C-A is also a pair.
    if (isPair(c, a) && Math.random() < 0.5) orders.push({ from: c, to: a, cents: amt() });
  }
  return shuffle(orders); // random arrival order
};

/**
 * What SHOULD happen, computed only from the random inputs (not from the matcher):
 * each country's net inflow = money sent to it - money sent from it. The least that can go on-chain
 * is the sum of positive net inflows, and at that least amount each country receives exactly its
 * positive net inflow on-chain.
 */
const expectationsFor = (orders) => {
  const net = {};
  orders.forEach(({ from, to, cents }) => {
    net[to] = (net[to] ?? 0) + cents;
    net[from] = (net[from] ?? 0) - cents;
  });
  const perCountry = Object.fromEntries(Object.entries(net).map(([c, v]) => [c, Math.max(0, v)]));
  return { net, perCountry, minimum: Object.values(perCountry).reduce((s, v) => s + v, 0) };
};

/** A payout transaction as Stellar's public Horizon API reports it (independent of this app). */
const horizonPayout = async (hash) => {
  const [tx, effects] = await Promise.all([
    fetch(`${HORIZON}/transactions/${hash}`).then((r) => r.json()),
    fetch(`${HORIZON}/transactions/${hash}/effects?limit=50`).then((r) => r.json()),
  ]);
  const usdc = (effects._embedded?.records ?? []).filter((e) => e.asset_code === 'USDC');
  const sum = (type) =>
    usdc.filter((e) => e.type === type).reduce((s, e) => s + Math.round(parseFloat(e.amount) * 100), 0);
  return {
    successful: tx.successful === true,
    closedAt: Date.parse(tx.created_at),
    credited: usdc.filter((e) => e.type === 'account_credited').map((e) => ({ account: e.account, cents: Math.round(parseFloat(e.amount) * 100) })),
    creditedCents: sum('account_credited'),
    debitedCents: sum('account_debited'),
  };
};

/**
 * One random test (mode 'direct' or 'routing'), run inside the floating progress card as a step-by-step
 * checklist (like the guided demos). Starts on mount; `onFinished` receives each finished run.
 */
export const RandomTest = ({ corridors, mode, onFinished }) => {
  const [steps, setSteps] = useState([]);
  const [running, setRunning] = useState(false);
  const [checks, setChecks] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [summary, setSummary] = useState(null); // { ok, text }
  const [error, setError] = useState(null);
  const runId = useRef(0);

  // Starts as soon as the card opens; stops if the card is closed mid-run.
  useEffect(() => {
    start();
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
  const label = (c) => `${flagOf[c] ?? ''} ${c}`;
  const perCountry = (m, keys) =>
    keys
      .map((c) => `${c} ${$(m[c] ?? 0)}`)
      .join(', ');

  const start = async () => {
    const me = ++runId.current;
    const stop = () => {
      if (runId.current !== me) throw new Error('Stopped.');
    };
    let i = 0;
    const setStep = (n, patch) => {
      i = n;
      setSteps((prev) => prev.map((s, j) => (j === n ? { ...s, ...patch } : s)));
    };
    setRunning(true);
    setError(null);
    setChecks([]);
    setPayouts([]);
    setSummary(null);
    setSteps(
      [
        'Pick random countries and amounts',
        'Prepare sandbox accounts',
        'Place the orders, in random order',
        'Match',
        `Timers run out (${WINDOW_SECONDS} s)`,
        'Check against the blockchain',
        'Result',
      ].map((title) => ({ title, state: 'pending', note: '' })),
    );

    try {
      // 1. Countries with no waiting orders, so only this test's orders can match each other.
      // Leftover sandbox orders from earlier demos/tests are closed first (real users' orders are untouched).
      setStep(0, { state: 'active', note: 'Clearing leftover sandbox orders, then finding country pairs with no waiting orders...' });
      await api.demoClear(COUNTRIES);
      const book = await api.orders();
      const now = Date.now();
      const busy = new Set(
        book
          .filter((o) => (o.status === 'open' || o.status === 'partially_matched') && o.remainingAmount > 0 && o.deadlineTimestamp > now)
          .flatMap((o) => [o.fromCountry, o.toCountry]),
      );
      const quiet = COUNTRIES.filter((c) => !busy.has(c));
      const orders = rollOrders(mode, quiet);
      if (!orders) {
        throw new Error(
          `No ${mode === 'direct' ? 'country pair' : 'chain of two country pairs'} is free right now (countries with waiting orders: ${[...busy].join(', ') || 'none'}). Wait for those orders to finish, then try again.`,
        );
      }
      const expect = expectationsFor(orders);
      const keys = Object.keys(expect.perCountry);
      const total = orders.reduce((s, o) => s + o.cents, 0);
      setStep(0, {
        state: 'done',
        note: `${orders.map((o) => `${label(o.from)} → ${label(o.to)} ${$(o.cents)}`).join(' · ')}. Expected on-chain, worked out from these inputs alone: ${$(expect.minimum)} of ${$(total)} (${perCountry(expect.perCountry, keys.filter((c) => expect.perCountry[c] > 0)) || 'nothing'}).`,
      });
      await pause(STEP_PAUSE_MS); // give each step a moment on screen
      stop();

      // 2. Sandbox accounts for each country (first time: a few seconds each).
      setStep(1, { state: 'active', note: '' });
      const countries = [...new Set(orders.flatMap((o) => [o.from, o.to]))];
      for (const c of countries) {
        setStep(1, { note: `Preparing the sandbox account in ${c}...` });
        await api.demoRecipient(c);
        stop();
      }
      setStep(1, { state: 'done', note: `${countries.join(', ')}. These are sandbox accounts, not yours.` });
      await pause(STEP_PAUSE_MS);
      stop();

      // 3. Place the orders in the random arrival order.
      setStep(2, { state: 'active', note: '' });
      const ids = [];
      for (const [k, o] of orders.entries()) {
        setStep(2, { note: `Order ${k + 1} of ${orders.length}: ${o.from} → ${o.to}, ${$(o.cents)}...` });
        const res = await api.demoTestOrder({
          fromCountry: o.from,
          toCountry: o.to,
          fromFlag: flagOf[o.from],
          toFlag: flagOf[o.to],
          amount: (o.cents / 100).toFixed(2),
          deadlineSeconds: WINDOW_SECONDS,
        });
        ids.push(res.order.id);
        stop();
        if (k < orders.length - 1) await pause(700); // short: the timers are already running
      }
      setStep(2, { state: 'done', note: `${ids.length} orders placed, each with a ${WINDOW_SECONDS}-second matching window.` });
      await pause(800);
      stop();

      // 4. Right after matching, while the timers run: nothing may be on-chain yet.
      setStep(3, { state: 'active', note: 'Reading the matches...' });
      const before = await api.demoTestOrders(ids);
      const earlyTx = before.filter((o) => o.fallbackTxHash);
      const routed = before.filter((o) => o.transferType === 'routed');
      const originals = before.filter((o) => o.transferType !== 'routed');
      const matchedCents = originals.reduce((s, o) => s + toCents(o.matchedAmount), 0);
      const unmatchedCents = before.filter((o) => o.remainingAmount > 0).reduce((s, o) => s + toCents(o.remainingAmount), 0);
      setStep(3, {
        state: 'done',
        note:
          `${$(matchedCents)} matched and paid locally` +
          (routed.length ? `, including ${routed.length} routed leg${routed.length > 1 ? 's' : ''} (${routed.map((o) => `${o.fromCountry} → ${o.toCountry} via ${o.routeVia}`).join(', ')})` : '') +
          `. ${$(unmatchedCents)} left unmatched. ${earlyTx.length ? 'Something is already on-chain!' : 'Nothing on-chain yet.'}`,
      });
      await pause(STEP_PAUSE_MS);
      stop();

      // 5. Wait for the timers; the server pays out unmatched parts on its own.
      setStep(4, { state: 'active', note: '' });
      let cur = before;
      while (true) {
        stop();
        cur = await api.demoTestOrders(ids);
        if (cur.every((o) => FINAL.includes(o.status))) break;
        const last = Math.max(...cur.map((o) => o.deadlineTimestamp));
        const left = Math.ceil((last - Date.now()) / 1000);
        const failing = cur.find((o) => o.status === 'payout_failed');
        if (failing && Date.now() - last > GIVE_UP_MS) break;
        setStep(4, {
          note:
            left > 0
              ? `${left}s left to find more matches. Still nothing on-chain.`
              : failing
                ? `The public testnet was busy (${failing.payoutError}). The server retries every 30 s...`
                : `Timers ran out. Sending the unmatched ${$(cur.reduce((s, o) => s + toCents(o.remainingAmount || 0), 0))} as USDC via the Soroban contract...`,
        });
        await pause(2000);
      }
      const paid = cur.filter((o) => o.fallbackTxHash);
      setStep(4, {
        state: 'done',
        note: paid.length
          ? `${paid.length} payout${paid.length > 1 ? 's' : ''} sent: ${paid.map((o) => `${o.fromCountry} → ${o.toCountry} ${$(toCents(o.payoutAmount))}`).join(', ')}.`
          : 'Everything matched locally, so nothing needed to go on-chain.',
      });

      // 6. Read every payout straight from Horizon and grade it against the expectation.
      setStep(5, { state: 'active', note: "Reading each payout from Stellar's public Horizon API..." });
      const fromHorizon = await Promise.all(paid.map(async (o) => ({ order: o, h: await horizonPayout(o.fallbackTxHash) })));
      stop();
      setPayouts(fromHorizon);
      const countryOf = Object.fromEntries(cur.map((o) => [o.recipientAddress, o.toCountry]));
      const received = {};
      fromHorizon.forEach(({ h }) =>
        h.credited.forEach(({ account, cents }) => {
          const c = countryOf[account];
          if (c) received[c] = (received[c] ?? 0) + cents;
        }),
      );
      const totalOnChain = fromHorizon.reduce((s, { h }) => s + h.creditedCents, 0);
      const results = [
        {
          ok: earlyTx.length === 0,
          text: 'Nothing went on-chain while the timers were running',
          detail: earlyTx.length ? `${earlyTx.map((o) => o.id).join(', ')} paid early` : '',
        },
        {
          ok: cur.every((o) => FINAL.includes(o.status)),
          text: 'Every order and routed leg finished (matched locally or paid out)',
          detail: cur.filter((o) => !FINAL.includes(o.status)).map((o) => `${o.id}: ${o.status}`).join(', '),
        },
        {
          ok: fromHorizon.every(({ h }) => h.successful),
          text: `Every payout transaction succeeded on Stellar (${fromHorizon.length} payout${fromHorizon.length === 1 ? '' : 's'})`,
        },
        {
          ok: fromHorizon.every(({ order, h }) => h.debitedCents === h.creditedCents && h.creditedCents === toCents(order.payoutAmount)),
          text: 'Each payout moved exactly the USDC the app reports, sender to recipient',
          detail: fromHorizon.map(({ order, h }) => `app ${$(toCents(order.payoutAmount))}, Horizon −${$(h.debitedCents)} / +${$(h.creditedCents)}`).join(' · '),
        },
        {
          ok: fromHorizon.every(({ order, h }) => h.closedAt >= Math.floor(order.deadlineTimestamp / 1000) * 1000),
          text: "Every payout landed after its order's timer ran out",
        },
        {
          ok: totalOnChain === expect.minimum,
          text: `Total on-chain is the least possible: expected ${$(expect.minimum)}, Horizon shows ${$(totalOnChain)}`,
        },
        {
          ok: keys.every((c) => (received[c] ?? 0) === expect.perCountry[c]),
          text: 'Each country received on-chain exactly its net inflow',
          detail: `expected ${perCountry(expect.perCountry, keys)} · Horizon ${perCountry(received, keys)}`,
        },
      ];
      setChecks(results);
      const passedCount = results.filter((r) => r.ok).length;
      const passed = passedCount === results.length;
      setStep(5, { state: passed ? 'done' : 'error', note: `${passedCount} of ${results.length} checks passed (details below).` });

      // 7. Result.
      setStep(6, {
        state: passed ? 'done' : 'error',
        note: passed
          ? `Verified on the Stellar testnet: ${$(totalOnChain)} moved on-chain out of ${$(total)} sent, the least possible.`
          : 'Some checks failed: see the details below.',
      });
      setSummary({ ok: passed });
      onFinished?.({ at: new Date(), mode, orders, minimum: expect.minimum, onChain: totalOnChain, passed });
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
    <section className="text-xs" aria-label={mode === 'direct' ? 'Random test, 2 countries' : 'Random test, 3 countries'}>
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

      {checks.length > 0 && (
        <ul className="mx-4 mb-3 p-2 rounded bg-slate-50 dark:bg-slate-800/50 space-y-1">
          {checks.map((c, k) => (
            <li key={k} className="flex gap-2 text-[11px]">
              {c.ok ? <Check className="w-3.5 h-3.5 shrink-0 text-emerald-600" /> : <X className="w-3.5 h-3.5 shrink-0 text-rose-600" />}
              <div>
                <span className={`font-semibold ${c.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}>
                  {c.ok ? 'PASS' : 'FAIL'}
                </span>{' '}
                {c.text}
                {c.detail && <div className="text-[10px] text-slate-500 font-mono-numbers">{c.detail}</div>}
              </div>
            </li>
          ))}
        </ul>
      )}

      {summary && (
        <div
          className={`mx-4 mb-3 p-2 rounded text-[11px] ${
            summary.ok ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300' : 'bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300'
          }`}
        >
          {summary.ok ? 'ALL CHECKS PASSED: verified on the Stellar testnet.' : 'Some checks failed.'}
        </div>
      )}
      {error && <div className="mx-4 mb-3 p-2 rounded bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 text-[11px]">{error}</div>}

      <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-t border-slate-100 dark:border-slate-800">
        {payouts.map(({ order }) => (
          <a
            key={order.id}
            href={`${EXPERT}/tx/${order.fallbackTxHash}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-semibold"
            title="Open this payout on Stellar Expert"
          >
            {order.fromCountry} → {order.toCountry}: {$(toCents(order.payoutAmount))} <ExternalLink className="w-3 h-3" />
          </a>
        ))}
        {!running ? (
          <button onClick={start} className="ml-auto inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 font-medium">
            <Shuffle className="w-3 h-3" /> Roll again
          </button>
        ) : (
          <span className="text-[11px] text-slate-400 ml-auto">Running on Stellar testnet…</span>
        )}
      </div>
    </section>
  );
};
