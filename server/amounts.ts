/**
 * All server-side amounts are integer "units" with 7 decimals (1 USDC = 10_000_000),
 * matching Stellar/Soroban token precision. This avoids the floating-point dust that
 * left orders stuck in `partially_matched` in the old client-side engine.
 */
export const DECIMALS = 7;
export const UNIT = 10 ** DECIMALS;

/** Parse a decimal USDC string/number ("12.5") into integer units without float math. */
export function toUnits(value: string | number): number {
  const s = typeof value === 'number' ? value.toFixed(DECIMALS) : value.trim();
  const m = /^(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) throw new Error(`Invalid amount: ${value}`);
  const frac = (m[2] ?? '').padEnd(DECIMALS, '0');
  if (frac.length > DECIMALS && /[^0]/.test(frac.slice(DECIMALS))) {
    throw new Error(`Amount has more than ${DECIMALS} decimal places: ${value}`);
  }
  const units = Number(m[1]) * UNIT + Number(frac.slice(0, DECIMALS));
  if (!Number.isSafeInteger(units)) throw new Error(`Amount too large: ${value}`);
  return units;
}

/** Integer units -> USDC number for the UI (display only). */
export function fromUnits(units: number): number {
  return units / UNIT;
}

/** Integer units -> exact decimal string (for logs / memos). */
export function formatUnits(units: number): string {
  const whole = Math.trunc(units / UNIT);
  const frac = String(units % UNIT).padStart(DECIMALS, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : `${whole}`;
}
