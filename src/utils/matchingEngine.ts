import type { TransferOrder } from '../types';

// Matching now runs server-side against SQLite (server/matching.ts). This helper only
// estimates matchable volume for dashboard display.

/**
 * Calculates total volume that can be immediately netted across opposing queues in all corridors.
 */
export function calculateTotalMatchableVolume(orders: TransferOrder[]): {
  totalMatchable: number;
  corridorBreakdown: Array<{
    countryA: string;
    countryB: string;
    matchable: number;
  }>;
} {
  const corridorsSeen = new Set<string>();
  const breakdown: Array<{ countryA: string; countryB: string; matchable: number }> = [];
  let totalMatchable = 0;

  for (const o of orders) {
    if (o.status !== 'open' && o.status !== 'partially_matched') continue;
    if (o.remainingAmount <= 0) continue;

    // Standardize pair key
    const pair = [o.fromCountry, o.toCountry].sort().join('::');
    if (corridorsSeen.has(pair)) continue;
    corridorsSeen.add(pair);

    const [cA, cB] = pair.split('::');

    const volAtoB = orders
      .filter(
        (x) =>
          x.fromCountry === cA &&
          x.toCountry === cB &&
          (x.status === 'open' || x.status === 'partially_matched') &&
          x.remainingAmount > 0
      )
      .reduce((sum, x) => sum + x.remainingAmount, 0);

    const volBtoA = orders
      .filter(
        (x) =>
          x.fromCountry === cB &&
          x.toCountry === cA &&
          (x.status === 'open' || x.status === 'partially_matched') &&
          x.remainingAmount > 0
      )
      .reduce((sum, x) => sum + x.remainingAmount, 0);

    const matchable = Math.min(volAtoB, volBtoA);
    if (matchable > 0) {
      breakdown.push({ countryA: cA, countryB: cB, matchable });
      totalMatchable += matchable;
    }
  }

  return { totalMatchable, corridorBreakdown: breakdown };
}
