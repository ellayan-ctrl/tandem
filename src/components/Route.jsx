/**
 * The corridor route: a line between two stations, split by what happened to the money.
 *   local   (green)  matched, paid locally on both sides
 *   cross   (blue)   the remainder, sent across the border as USDC on Stellar
 *   waiting (hatch)  not matched yet and not sent yet
 * Used on Send (a live preview), on every My transfers row, and in the receipt.
 */
import { CODES } from '../data/corridors';

export const usd = (v) => `$${(v ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Two-letter station tag for a country ("PH"), set like a transit line code. */
export const Station = ({ country, size = 'md', tone = 'ink' }) => {
  const code = CODES[country] ?? country?.slice(0, 2).toUpperCase() ?? '··';
  const sizes = { sm: 'h-5 min-w-7 text-[11px] px-1', md: 'h-6 min-w-8 text-xs px-1.5', lg: 'h-8 min-w-10 text-sm px-2' };
  const tones = { ink: 'bg-ink text-white', line: 'bg-white text-ink ring-1 ring-inset ring-ink' };
  return (
    <span
      className={`inline-flex items-center justify-center font-[family-name:var(--font-label)] font-semibold tracking-wider rounded-xs ${sizes[size]} ${tones[tone]}`}
      title={country}
    >
      {code}
    </span>
  );
};

/**
 * The route strip. Amounts in any one unit; segments size by share of the total.
 * `labels` adds the station names under the stops.
 */
export const RouteStrip = ({ from, to, local = 0, cross = 0, waiting = 0, height = 'md', labels = false, className = '' }) => {
  const total = local + cross + waiting;
  const h = { sm: 'h-1.5', md: 'h-2.5', lg: 'h-3.5' }[height];
  const stop = { sm: 'w-2.5 h-2.5 border-2', md: 'w-3.5 h-3.5 border-[3px]', lg: 'w-4 h-4 border-[3px]' }[height];
  const grow = (v) => ({ flexGrow: total > 0 ? v / total : 0, flexBasis: 0 });
  const summary = [
    local > 0 && `${usd(local)} paid locally`,
    cross > 0 && `${usd(cross)} across on Stellar`,
    waiting > 0 && `${usd(waiting)} still waiting`,
  ]
    .filter(Boolean)
    .join(', ');
  return (
    <div className={className}>
      <div className="flex items-center gap-1.5" role="img" aria-label={`${from} to ${to}: ${summary || 'no amount'}`}>
        <span className={`shrink-0 rounded-full border-ink bg-white ${stop}`} />
        <div className={`flex-1 flex gap-px overflow-hidden rounded-[1px] ${h}`}>
          {total === 0 ? (
            <span className="flex-1 bg-slate-200" />
          ) : (
            <>
              <span className="route-seg bg-local" style={grow(local)} />
              <span className="route-seg hatch" style={grow(waiting)} />
              <span className="route-seg bg-cross" style={grow(cross)} />
            </>
          )}
        </div>
        <span className={`shrink-0 rounded-full border-ink bg-white ${stop}`} />
      </div>
      {labels && (
        <div className="flex justify-between mt-1.5 text-sm font-medium">
          <span>{from}</span>
          <span>{to}</span>
        </div>
      )}
    </div>
  );
};

const WAITING = ['open', 'partially_matched', 'payout_failed'];
const CROSSED = ['payout_pending', 'fallback_executed'];

/**
 * How an order's money split, for its route strip.
 * Once a remainder is resolved the server zeroes `remainingAmount` and records it in `payoutAmount`.
 */
export const splitOf = (o) => {
  if (o.transferType === 'direct_instant') return { local: 0, cross: o.amount, waiting: 0, released: 0 };
  const unmatched = o.remainingAmount > 0 ? o.remainingAmount : (o.payoutAmount ?? 0);
  const local = o.matchedAmount ?? 0;
  if (WAITING.includes(o.status)) return { local, cross: 0, waiting: unmatched, released: 0 };
  if (CROSSED.includes(o.status)) return { local, cross: unmatched, waiting: 0, released: 0 };
  return { local, cross: 0, waiting: 0, released: Math.max(0, o.amount - local) };
};

/** Legend line under a route: a swatch, a label and an amount. */
export const RouteKey = ({ kind, label, value, strong = false }) => {
  const swatch = { local: 'bg-local', cross: 'bg-cross', waiting: 'hatch' }[kind];
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-2 text-slate-600">
        <span className={`w-2.5 h-2.5 rounded-[1px] ${swatch}`} aria-hidden="true" />
        {label}
      </span>
      <span className={strong ? 'font-semibold text-ink' : 'text-ink'}>{value}</span>
    </div>
  );
};
