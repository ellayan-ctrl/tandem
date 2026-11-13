import { useState } from 'react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';

import { AutoDemo } from './AutoDemo';
import { RandomTest } from './RandomTest';

/** The demos and tests, and the tab each one is best watched on. */
export const RUN_OPTIONS = [
  {
    id: 'demo-two',
    kind: 'Guided demo',
    title: '2 countries',
    blurb: 'You send $10, someone sends $8 back. Only the unmatched $2 goes on-chain.',
    watchTab: 'dashboard',
    watchLabel: 'Live Orders',
  },
  {
    id: 'demo-three',
    kind: 'Guided demo',
    title: '3 countries',
    blurb: 'You send $10, $8 goes onward to a third country, $6 comes back. Only $4 of $24 goes on-chain.',
    watchTab: 'dashboard',
    watchLabel: 'Live Orders',
  },
  {
    id: 'random-direct',
    kind: 'Random test',
    title: '2 countries: direct matching',
    blurb: 'A random pair and amounts ($1–$20), graded against the blockchain.',
    watchTab: 'corridors',
    watchLabel: 'Transaction History (Global)',
  },
  {
    id: 'random-routing',
    kind: 'Random test',
    title: '3 countries: routing',
    blurb: 'A random chain of two pairs and amounts, graded against the blockchain.',
    watchTab: 'corridors',
    watchLabel: 'Transaction History (Global)',
  },
];

/**
 * Floating card at the bottom of the screen with the steps and progress of the running demo or test,
 * visible on every tab while you watch it happen. Closing it stops the run.
 */
export const RunCard = ({ run, onClose, account, corridors, ensureAccount, onRefresh, onSelectOrder, onFinished }) => {
  const [minimised, setMinimised] = useState(false);
  if (!run) return null;
  const opt = RUN_OPTIONS.find((o) => o.id === run.id);

  return (
    <div
      className="fixed bottom-4 left-4 z-40 w-[calc(100%-2rem)] sm:w-[440px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl text-xs"
      role="dialog"
      aria-label={`${opt.kind}: ${opt.title}`}
    >
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-slate-100 dark:border-slate-800">
        <div className="min-w-0">
          <span className="font-semibold text-slate-900 dark:text-white block truncate">
            {opt.kind} · {opt.title}
          </span>
          <span className="text-[10px] text-slate-400 block truncate">Live on Stellar testnet · watch it on {opt.watchLabel}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setMinimised(!minimised)}
            className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label={minimised ? 'Expand progress' : 'Minimise progress'}
            aria-expanded={!minimised}
          >
            {minimised ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
          </button>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Close and stop">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>
      </div>

      {/* Stays mounted while minimised so the run keeps going. */}
      <div hidden={minimised} className="max-h-[55vh] overflow-y-auto">
        {run.id === 'demo-two' && (
          <AutoDemo key={run.key} scenario="two" account={account} corridors={corridors} ensureAccount={ensureAccount} onRefresh={onRefresh} onSelectOrder={onSelectOrder} />
        )}
        {run.id === 'demo-three' && (
          <AutoDemo key={run.key} scenario="three" account={account} corridors={corridors} ensureAccount={ensureAccount} onRefresh={onRefresh} onSelectOrder={onSelectOrder} />
        )}
        {run.id.startsWith('random-') && (
          <RandomTest key={run.key} mode={run.id === 'random-direct' ? 'direct' : 'routing'} corridors={corridors} onFinished={onFinished} />
        )}
      </div>
    </div>
  );
};
