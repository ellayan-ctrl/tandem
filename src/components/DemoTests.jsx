import { Play, Shuffle } from 'lucide-react';

import { RUN_OPTIONS } from './RunCard';

const $ = (cents) => `$${(cents / 100).toFixed(2)}`;

/**
 * The Demo & Tests tab: pick one of the four. Running it takes you to the tab where it happens live,
 * with its steps and progress in a floating card at the bottom of the screen.
 */
export const DemoTests = ({ activeRun, onRun, onShowRun, testHistory }) => {
  const running = activeRun ? RUN_OPTIONS.find((o) => o.id === activeRun.id) : null;

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-6">
      <div className="border-b border-slate-200 dark:border-slate-800 pb-5">
        <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">Demo &amp; Tests</h1>
        <p className="text-xs text-slate-500 mt-1 max-w-3xl">
          Everything here runs on the real Stellar testnet with short timers. Pick one: you&apos;ll be taken to the tab where it happens, with its
          steps and progress in a card at the bottom of the screen. Guided demos run from your account and show on Live Orders; random tests run
          between sandbox accounts, show on Transaction History, and are checked against the blockchain.
        </p>
      </div>

      {running && (
        <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30 text-xs">
          <span className="text-emerald-800 dark:text-emerald-300">
            Running now: <strong>{running.kind} · {running.title}</strong>
          </span>
          <button onClick={onShowRun} className="font-semibold underline text-emerald-800 dark:text-emerald-300">
            Watch it on {running.watchLabel}
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {RUN_OPTIONS.map((o) => {
          const Icon = o.kind === 'Guided demo' ? Play : Shuffle;
          return (
            <div key={o.id} className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs flex flex-col gap-2">
              <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide font-semibold text-slate-500">
                <Icon className="w-3 h-3" /> {o.kind}
              </span>
              <span className="font-semibold text-slate-900 dark:text-white">{o.title}</span>
              <span className="text-[11px] text-slate-500 flex-1">{o.blurb}</span>
              <span className="text-[10px] text-slate-400">Watch it on: {o.watchLabel}</span>
              <button
                onClick={() => onRun(o.id)}
                className="mt-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 font-semibold rounded-md bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <Icon className="w-3.5 h-3.5" /> Run
              </button>
            </div>
          );
        })}
      </div>
      {running && <p className="text-[11px] text-slate-400">Starting another one stops the current run.</p>}

      {testHistory.length > 0 && (
        <section className="border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 p-4 text-xs overflow-x-auto">
          <h2 className="font-semibold text-slate-900 dark:text-white mb-2">Random test runs this session</h2>
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
              {testHistory.map((h, k) => (
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
