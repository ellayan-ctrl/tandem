/**
 * Verified cross-border & domestic transfer fee matrix (supplied research, Nov 2026).
 * Only the rows whose countries already exist in the app are kept; currencies key the lookup
 * ("European Union" in the app = "Eurozone" in the matrix).
 *
 * Overseas = what sending the matched amount abroad would cost with Wise (variable % + flat fee),
 * plus the traditional bank FX markup range. Domestic = the origin country's local rail.
 */

/** Keyed "SRC-DST" by currency. */
export const OVERSEAS_FEES = {
  'USD-KES': {
    provider: 'Wise',
    fundingMethod: 'Bank-funded / ACH to M-PESA',
    pct: 0.43,
    flat: 1.2,
    sample1000: 5.5,
    bankMarkup: [2.0, 3.0],
    sourceUrl: 'https://paybillke.com/wise/fees',
    note: 'Wise USD 1.20 flat + 0.43% variable',
  },
  'EUR-KES': {
    provider: 'Wise',
    fundingMethod: 'SEPA bank transfer to M-PESA',
    pct: 0.43,
    flat: 0.9,
    sample1000: 5.2,
    bankMarkup: [2.5, 3.0],
    sourceUrl: 'https://paybillke.com/wise',
    note: 'Wise ~EUR 0.90 flat + 0.43% variable',
  },
  'CAD-KES': {
    provider: 'Wise',
    fundingMethod: 'Bank transfer / Wise balance to M-PESA',
    pct: 0.43,
    flat: 1.2,
    sample1000: 14.85,
    bankMarkup: [2.5, 4.0],
    sourceUrl: 'https://wise.com/ca/send-money/send-money-to-kenya',
    note: 'Wise Canada quotes CAD 14.85 by bank transfer (CAD 13.80 from a Wise balance) on CAD 1,000; base schedule ~CAD 1.20 + 0.43%',
  },
  'CAD-EUR': {
    provider: 'Wise',
    fundingMethod: 'Low-cost bank transfer / Wise balance',
    pct: 0.45,
    flat: 1.87,
    sample1000: 6.34,
    bankMarkup: [2.5, 4.0],
    sourceUrl: 'https://wise.com/ca/send-money/',
    note: 'Wise Canada 0.45% + CAD 1.87 = CAD 6.34 on CAD 1,000',
  },
  'CAD-USD': {
    provider: 'Wise',
    fundingMethod: 'Low-cost bank transfer',
    pct: 0.74,
    flat: 0,
    sample1000: 7.41,
    bankMarkup: [2.5, 4.0],
    sourceUrl: 'https://exiap.ca/guides/wise-fees',
    note: 'Exiap verified CAD 7.41 on CAD 1,000',
  },
  'EUR-USD': {
    provider: 'Wise',
    fundingMethod: 'SEPA bank transfer',
    pct: 0.52,
    flat: 0,
    sample1000: 5.2,
    bankMarkup: [3.0, 3.0],
    sourceUrl: 'https://wise.com/en-es/blog/ing-international-transfers-guide',
    note: 'Wise ~0.52% + EUR 0',
  },
  'USD-EUR': {
    provider: 'Wise',
    fundingMethod: 'Direct debit / Wise balance / wire',
    pct: 0.55,
    flat: 0,
    sample1000: 5.47,
    bankMarkup: [2.5, 4.0],
    sourceUrl: 'https://wise.com/ca/send-money/send-money-by-wire-transfer',
    note: 'Wise quotes USD 5.47 by direct debit (USD 3.42 Wise balance, USD 9.87 wire) on USD 1,000',
  },
  'USD-PHP': {
    provider: 'Wise',
    fundingMethod: 'US low-cost bank transfer',
    pct: 0.49,
    flat: 7.02,
    sample1000: 11.92,
    bankMarkup: [2.5, 4.0],
    sourceUrl: 'https://wise.com/us/wishes/',
    note: 'Wise 0.49% + USD 7.02',
  },
};

/** Domestic rail by origin currency (same across every row with that origin). */
export const DOMESTIC_RAILS = {
  CAD: { rail: 'ACSS batch EFT / Interac e-Transfer', pct: 0, flat: 0.5, cap: 1.5 },
  USD: { rail: 'US ACH direct debit (Stripe)', pct: 0.8, flat: 0, cap: 5 },
  EUR: { rail: 'SEPA credit transfer / SEPA direct debit (Stripe)', pct: 0.8, flat: 0.3, cap: 6 },
  KES: {
    rail: 'PesaLink instant bank rail / M-PESA',
    pct: 0,
    flat: 50,
    cap: 108,
    freeUpTo: 1000,
    sourceUrl: 'https://familybank.co.ke/?ways-to-bank=pesalink-direct-transfers',
  },
};

export const overseasRow = (src, dst) => OVERSEAS_FEES[`${src}-${dst}`] ?? null;

const fmt = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(2));

/** "0.8%, capped at USD 5" / "CAD 0.50–1.50 flat" / "0.8% + EUR 0.30, capped at EUR 6" */
export function railLabel(r, currency) {
  let label;
  if (r.pct > 0) {
    label = `${r.pct}%${r.flat ? ` + ${currency} ${fmt(r.flat)}` : ''}, capped at ${currency} ${fmt(r.cap)}`;
  } else if (r.flat < r.cap) {
    label = `${currency} ${fmt(r.flat)}–${fmt(r.cap)} flat`;
  } else {
    label = r.flat ? `${currency} ${fmt(r.flat)} flat` : 'Free';
  }
  return r.freeUpTo ? `${label} (free up to ${currency} ${r.freeUpTo.toLocaleString('en-US')})` : label;
}

/** Highest fee the rail could charge on `amount` (conservative, for comparisons). */
export function railMaxFee(r, amount) {
  if (r.freeUpTo && amount <= r.freeUpTo) return 0;
  return r.pct > 0 ? Math.min(r.flat + (amount * r.pct) / 100, r.cap) : r.cap;
}
