/** Plain-language order statuses and their badge colours (shared by My Transactions and Transaction History). */
export const STATUS = {
  open: { label: 'Waiting for a match', tone: 'amber' },
  partially_matched: { label: 'Partly matched, waiting', tone: 'amber' },
  settled: { label: 'Matched locally', tone: 'emerald' },
  fully_matched: { label: 'Matched locally', tone: 'emerald' },
  payout_pending: { label: 'Sending via Stellar', tone: 'sky' },
  payout_failed: { label: 'Payout failed, retrying', tone: 'rose' },
  fallback_executed: { label: 'Completed', tone: 'emerald' },
  remainder_converted: { label: 'Converted locally (simulated)', tone: 'slate' },
  refunded: { label: 'Unmatched part released', tone: 'slate' },
  cancelled: { label: 'Cancelled', tone: 'slate' },
};

export const TONE = {
  amber: 'bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  emerald: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  sky: 'bg-sky-50 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300',
  rose: 'bg-rose-50 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300',
  slate: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

export const statusOf = (s) => STATUS[s] ?? { label: s.replace(/_/g, ' '), tone: 'slate' };

/** Still waiting for its timer (or for its payout). */
export const isWaiting = (o) => ['open', 'partially_matched', 'payout_pending', 'payout_failed'].includes(o.status);
