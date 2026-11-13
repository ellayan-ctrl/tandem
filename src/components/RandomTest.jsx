import { useRef, useState } from 'react';
import { Check, ExternalLink, Loader2, Shuffle, X } from 'lucide-react';

import { COUNTRIES, isPair, partnersOf } from '../data/corridors';
import { api } from '../services/api';

const WINDOW_SECONDS = 20;
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

export const RandomTest = ({ corridors }) => {
  const [mode, setMode] = useState('routing');
  const [run, setRun] = useState(null); // { mode, orders, expect }
  const [phase, setPhase] = useState('idle'); // idle | running | done | error
  const [status, setStatus] = useState('');
  const [live, setLive] = useState([]);
  const [checks, setChecks] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState([]);
  const runId = useRef(0);

  const flagOf = {};
  corridors.forEach((c) => {
    flagOf[c.countryA.name] = c.countryA.flag;
    flagOf[c.countryB.name] = c.countryB.flag;
  });
  const label = (c) => `${flagOf[c] ?? ''} ${c}`;

  const start = async () => {
    const me = ++runId.current;
    const stop = () => {
      if (runId.current !== me) throw new Error('Stopped.');
    };
    setPhase('running');
    setError(null);
    setChecks([]);
    setPayouts([]);
    setLive([]);
    try {
      // 1. Countries with no waiting orders, so only this test's orders can match each other.
      setStatus('Finding countries with no waiting orders...');
      const book = await api.orders();
      const busy = new Set(
        book.filter((o) => (o.status === 'open' || o.status === 'partially_matched') && o.remainingAmount > 0).flatMap((o) => [o.fromCountry, o.toCountry]),
      );
      const quiet = COUNTRIES.filter((c) => !busy.has(c));
      // 2. Roll the dice and work out what should happen.
      const orders = rollOrders(mode, quiet);
      if (!orders) {
        throw new Error(
          `No ${mode === 'direct' ? 'country pair' : 'chain of two country pairs'} is free right now (countries with waiting orders: ${[...busy].join(', ') || 'none'}). Wait for those orders to finish, then try again.`,
        );
      }
      const expect = expectationsFor(orders);
      setRun({ mode, orders, expect });
      stop();

      // 3. Sandbox accounts for each country (first time: a few seconds each).
      const countries = [...new Set(orders.flatMap((o) => [o.from, o.to]))];
      for (const c of countries) {
        setStatus(`Preparing the sandbox account in ${c}...`);
        await api.demoRecipient(c);
        stop();
      }

      // 4. Place the orders in the random arrival order.
      const ids = [];
      for (const [k, o] of orders.entries()) {
        setStatus(`Placing order ${k + 1} of ${orders.length}: ${o.from} → ${o.to}, ${$(o.cents)}...`);
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
      }

      // 5. Right after matching, while the timers run: nothing may be on-chain yet.
      const before = await api.demoTestOrders(ids);
      setLive(before);
      const earlyTx = before.filter((o) => o.fallbackTxHash);

      // 6. Wait for the timers; the server pays out unmatched parts on its own.
      let cur = before;
      while (true) {
        stop();
        cur = await api.demoTestOrders(ids);
        setLive(cur);
        if (cur.every((o) => FINAL.includes(o.status))) break;
        const last = Math.max(...cur.map((o) => o.deadlineTimestamp));
        const left = Math.ceil((last - Date.now()) / 1000);
        const failing = cur.find((o) => o.status === 'payout_failed');
        if (failing && Date.now() - last > GIVE_UP_MS) break;
        setStatus(
          left > 0
            ? `Matched. ${left}s left on the timers; nothing on-chain yet.`
            : failing
              ? `The public testnet was busy (${failing.payoutError}). The server retries every 30 s...`
              : 'Timers ran out. Sending the unmatched parts as USDC via the Soroban contract...',
        );
        await pause(2000);
      }

      // 7. Read every payout straight from Horizon and grade it against the expectation.
      setStatus('Checking every payout on Horizon...');
      const paid = cur.filter((o) => o.fallbackTxHash);
      const fromHorizon = await Promise.all(paid.map(async (o) => ({ order: o, h: await horizonPayout(o.fallbackTxHash) })));
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
      const fmtMap = (m) =>
        Object.keys(expect.perCountry)
          .map((c) => `${c} ${$(m[c] ?? 0)}`)
          .join(', ');

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
          text: 'Each payout moved exactly the USDC the app reports, from sender to recipient',
          detail: fromHorizon.map(({ order, h }) => `${order.id}: app ${$(toCents(order.payoutAmount))}, Horizon −${$(h.debitedCents)} / +${$(h.creditedCents)}`).join(' · '),
        },
        {
          ok: fromHorizon.every(({ order, h }) => h.closedAt >= Math.floor(order.deadlineTimestamp / 1000) * 1000),
          text: "Every payout landed after its order's timer ran out (Horizon ledger time)",
        },
        {
          ok: totalOnChain === expect.minimum,
          text: `Total on-chain is the least possible: expected ${$(expect.minimum)}, Horizon shows ${$(totalOnChain)}`,
        },
        {
          ok: Object.entries(expect.perCountry).every(([c, v]) => (received[c] ?? 0) === v),
          text: 'Each country received on-chain exactly its net inflow',
          detail: `expected ${fmtMap(expect.perCountry)} · Horizon ${fmtMap(received)}`,
        },
      ];
      setChecks(results);
      const passed = results.every((r) => r.ok);
      setHistory((h) => [
        { at: new Date(), mode, orders, minimum: expect.minimum, onChain: totalOnChain, passed },
        ...h,
      ]);
      setStatus(passed ? 'All checks passed, verified on the Stellar testnet.' : 'Some checks failed: see below.');
      setPhase('done');
    } catch (e) {
      if (runId.current === me) {
        setError(e.message);
        setPhase('error');
      }
    }
  };

  const running = phase === 'running';

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-6">
      <div className="border-b border-slate-200 dark:border-slate-800 pb-5">
        <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">Random Test</h1>
        <p className="text-xs text-slate-500 mt-1 max-w-3xl">
          Picks random countries that have no waiting orders, random amounts from $1 to $20 and a random arrival order, places the orders
          between sandbox accounts (not yours), lets the real {WINDOW_SECONDS}-second timers run out, then checks the result against the
          blockchain. The expected numbers are worked out here from the random inputs alone: the least that can go on-chain is what each
          country takes in beyond what it sends. The actual numbers come from Stellar&apos;s public Horizon API, not from this app.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex gap-1 text-xs" role="radiogroup" aria-label="Test type">
          {[
            ['direct', '2 countries: direct matching'],
            ['routing', '3 countries: routing'],
          ].map(([id, text]) => (
            <button
              key={id}
              role="radio"
              aria-checked={mode === id}
              disabled={running}
              onClick={() => setMode(id)}
              className={`px-3 py-1.5 rounded-md border transition-colors ${
                mode === id
                  ? 'border-slate-900 dark:border-white bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-semibold'
                  : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
              }`}
            >
              {text}
            </button>
          ))}
        </div>
        <button
          onClick={start}
          disabled={running}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-md bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white"
        >
          {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Shuffle className="w-3.5 h-3.5" />}
          {running ? 'Running…' : run ? 'Roll again' : 'Run random test'}
        </button>
        {status && <span className="text-xs text-slate-500">{status}</span>}
      </div>

      {error && <div className="p-3 rounded-md bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 text-xs">{error}</div>}

      {run && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <section className="border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 p-4 text-xs space-y-3">
            <h2 className="font-semibold text-slate-900 dark:text-white">The random orders, in arrival order</h2>
            <ol className="space-y-1 font-mono-numbers">
              {run.orders.map((o, k) => (
                <li key={k}>
                  {k + 1}. {label(o.from)} → {label(o.to)} <span className="font-semibold">{$(o.cents)}</span>
                </li>
              ))}
            </ol>
            <h2 className="font-semibold text-slate-900 dark:text-white pt-2">Expected (from the inputs alone)</h2>
            <table className="w-full text-left">
              <thead className="text-slate-500">
                <tr>
                  <th className="font-medium py-1">Country</th>
                  <th className="font-medium py-1 text-right">Net inflow</th>
                  <th className="font-medium py-1 text-right">Should receive on-chain</th>
                </tr>
              </thead>
              <tbody className="font-mono-numbers">
                {Object.entries(run.expect.net).map(([c, v]) => (
                  <tr key={c} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="py-1 font-sans">{label(c)}</td>
                    <td className="py-1 text-right">{v >= 0 ? '+' : '−'}{$(Math.abs(v))}</td>
                    <td className="py-1 text-right">{$(run.expect.perCountry[c])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-slate-600 dark:text-slate-400">
              Least possible on-chain: <span className="font-semibold font-mono-numbers">{$(run.expect.minimum)}</span> of{' '}
              <span className="font-mono-numbers">{$(run.orders.reduce((s, o) => s + o.cents, 0))}</span> sent. Everything else should be
              matched and paid locally.
            </p>
          </section>

          <section className="border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 p-4 text-xs space-y-3">
            <h2 className="font-semibold text-slate-900 dark:text-white">What happened</h2>
            {live.length === 0 && <p className="text-slate-400">Waiting for the orders to be placed…</p>}
            <div className="space-y-1">
              {live.map((o) => (
                <div key={o.id} className="flex flex-wrap justify-between gap-x-3 font-mono-numbers">
                  <span>
                    {o.id} {o.fromCountry} → {o.toCountry}
                    {o.routeVia ? <span className="text-slate-500 font-sans"> (routed via {o.routeVia})</span> : ''}
                  </span>
                  <span className="text-slate-500">
                    {$(toCents(o.amount))}: {$(toCents(o.matchedAmount))} matched, {$(toCents(o.remainingAmount || o.payoutAmount))} unmatched ·{' '}
                    <span className="font-sans">{o.status.replace(/_/g, ' ')}</span>
                  </span>
                </div>
              ))}
            </div>

            {checks.length > 0 && (
              <ul className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                {checks.map((c, k) => (
                  <li key={k} className="flex gap-2">
                    {c.ok ? <Check className="w-4 h-4 shrink-0 text-emerald-600" /> : <X className="w-4 h-4 shrink-0 text-rose-600" />}
                    <div>
                      <span className={`font-semibold ${c.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}>
                        {c.ok ? 'PASS' : 'FAIL'}
                      </span>{' '}
                      {c.text}
                      {c.detail && <div className="text-[11px] text-slate-500 font-mono-numbers">{c.detail}</div>}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {payouts.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {payouts.map(({ order }) => (
                  <a
                    key={order.id}
                    href={`${EXPERT}/tx/${order.fallbackTxHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    {order.fromCountry} → {order.toCountry} {$(toCents(order.payoutAmount))} <ExternalLink className="w-3 h-3" />
                  </a>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {history.length > 0 && (
        <section className="border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 p-4 text-xs overflow-x-auto">
          <h2 className="font-semibold text-slate-900 dark:text-white mb-2">Runs this session</h2>
          <table className="w-full text-left min-w-[520px]">
            <thead className="text-slate-500">
              <tr>
                <th className="font-medium py-1">Time</th>
                <th className="font-medium py-1">Type</th>
                <th className="font-medium py-1">Orders</th>
                <th className="font-medium py-1 text-right">Least possible</th>
                <th className="font-medium py-1 text-right">On-chain</th>
                <th className="font-medium py-1 text-right">Result</th>
              </tr>
            </thead>
            <tbody className="font-mono-numbers">
              {history.map((h, k) => (
                <tr key={k} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="py-1">{h.at.toLocaleTimeString()}</td>
                  <td className="py-1 font-sans">{h.mode === 'direct' ? '2 countries' : '3 countries'}</td>
                  <td className="py-1 font-sans">{h.orders.map((o) => `${o.from}→${o.to} ${$(o.cents)}`).join(', ')}</td>
                  <td className="py-1 text-right">{$(h.minimum)}</td>
                  <td className="py-1 text-right">{$(h.onChain)}</td>
                  <td className={`py-1 text-right font-sans font-semibold ${h.passed ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}>
                    {h.passed ? 'PASS' : 'FAIL'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
};
