import type { OrderService } from './orders.ts';

/**
 * Background loop: when an order's matching window closes, resolve its unmatched remainder
 * (Soroban payout / release / fiat conversion) and retry transient payout failures.
 * Payouts run one at a time so the operator account's sequence number never races.
 */
export function startExpiryWorker(svc: OrderService, intervalMs: number) {
  let running = false;

  async function tick() {
    if (running) return;
    running = true;
    try {
      for (const id of svc.expiredIds()) {
        await svc.resolve(id).then(
          (o) => console.log(`[worker] ${o.public_id} expired -> ${o.status}${o.payout_tx_hash ? ` tx ${o.payout_tx_hash}` : ''}${o.payout_error ? ` (${o.payout_error})` : ''}`),
          (e) => console.warn(`[worker] resolve ${id} failed:`, (e as Error).message),
        );
      }
      for (const id of svc.retryablePayoutIds()) {
        await svc.resolve(id, 'payout').then(
          (o) => console.log(`[worker] retry ${o.public_id} -> ${o.status}`),
          (e) => console.warn(`[worker] retry ${id} failed:`, (e as Error).message),
        );
      }
    } finally {
      running = false;
    }
  }

  const timer = setInterval(tick, intervalMs);
  return { tick, stop: () => clearInterval(timer) };
}
