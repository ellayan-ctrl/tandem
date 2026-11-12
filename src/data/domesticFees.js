/**
 * What it costs the SENDER to pay in the matched amount on a DOMESTIC rail, by funding method.
 * Researched November 2026. Each entry says whether it is SOURCED (published figure) or an
 * ASSUMPTION (no reliable public figure), with a link where one exists.
 *
 * Used by the Send form to show, before signing, the fee for the matched part vs. what sending
 * that same amount overseas would cost (live provider quotes, see backend/pricing.py).
 */
import { findFundingProvider } from './fundingMethods';
import { DOMESTIC_RAILS, railLabel, railMaxFee } from './feeMatrix';

/** Tiered flat fee (local currency), e.g. M-Pesa send tariffs. */

const SRC = {
  interac: 'https://wealthnorth.ca/banking/moving-money/interac-e-transfer/',
  mpesa: 'https://businesstoday.co.ke/m-pesa-charges-2026-withdrawal-and-send-money-fees/',
  pesalink: 'https://techtrendske.co.ke/2026/08/18/ncba-cuts-pesalink-fees-joins-19-other-banks-in-flat-kes-20-pricing/',
  moneygramDomestic: 'https://www.gobankingrates.com/saving-money/shopping/moneygram-fee/',
};

/** Specific providers (by funding provider id). */
const BY_PROVIDER = {
  'ca-interac': {
    flat: 0,
    pct: 0,
    basis: 'sourced',
    sourceUrl: SRC.interac,
    note: 'Free on most chequing plans (RBC, Scotiabank); TD charges CAD 0.50–1.00 on some plans',
  },
  'ca-td': { flat: 0, pct: 0, basis: 'assumption', note: 'Pre-authorized debit from your own account; usually free' },
  'ke-mpesa': {
    // Safaricom person-to-person send tariffs (KES). Bands between published points are approximated.
    tiers: [
      { upTo: 100, fee: 0 },
      { upTo: 500, fee: 7 },
      { upTo: 1000, fee: 13 },
      { upTo: 5000, fee: 52 }, // assumption between published bands
      { upTo: 7500, fee: 78 },
      { upTo: 250000, fee: 108 }, // assumption above 7,500
    ],
    basis: 'sourced',
    sourceUrl: SRC.mpesa,
    note: 'M-Pesa send tariff (KES 0–13 up to 1,000; KES 78 for 5,001–7,500)',
  },
  'ke-airtel': {
    tiers: [
      { upTo: 100, fee: 0 },
      { upTo: 500, fee: 7 },
      { upTo: 1000, fee: 13 },
      { upTo: 250000, fee: 78 },
    ],
    basis: 'assumption',
    sourceUrl: SRC.mpesa,
    note: 'Assumed to track M-Pesa tariffs',
  },
};

/** Defaults by country + kind, then by kind. */
const BY_COUNTRY_KIND = {
  Canada: {
    bank_account: { flat: 0, pct: 0, basis: 'assumption', note: 'Pre-authorized debit / EFT from your own account; usually free' },
    cash_deposit: {
      flat: 8,
      pct: 0,
      basis: 'assumption',
      sourceUrl: SRC.moneygramDomestic,
      note: 'Based on MoneyGram US domestic pricing (~8 flat for 50–1,000)',
    },
  },
  Kenya: {
    bank_account: {
      flat: 20,
      pct: 0,
      basis: 'sourced',
      sourceUrl: SRC.pesalink,
      note: 'PesaLink bank transfer: KES 20 flat at KCB and 19 other banks (2026)',
    },
  },
  'United States': {
    cash_deposit: {
      flat: 8,
      pct: 0,
      basis: 'sourced',
      sourceUrl: SRC.moneygramDomestic,
      note: 'MoneyGram US domestic: ~USD 8 flat for 50–1,000',
    },
  },
};

const BY_KIND = {
  bank_account: { flat: 0, pct: 0.3, basis: 'assumption', note: 'Domestic bank transfer; low or no fee' },
  instant_transfer: { flat: 0, pct: 0.1, basis: 'assumption', note: 'Domestic instant transfer; usually free or a small flat fee' },
  debit_card: { flat: 0, pct: 1.5, basis: 'assumption', note: 'Card acceptance cost; no single published rate' },
  mobile_money: { flat: 0, pct: 1.3, basis: 'assumption', note: 'Typical mobile-money send fee' },
  cash_deposit: { flat: 0, pct: 1.5, basis: 'assumption', note: 'Agent cash-in commission; no published rate found' },
};

/** Kinds that settle on the origin country's domestic bank rail in the fee matrix. */
const RAIL_KINDS = ['bank_account', 'instant_transfer'];

/** The fee RULE (percentage and/or flat) for a method, independent of the amount. */
export function domesticRate(country, providerId, currency) {
  const provider = findFundingProvider(country, providerId);
  const kind = provider?.kind ?? 'bank_account';
  const rail = DOMESTIC_RAILS[currency];
  // The matrix's Kenya rail is PesaLink / M-PESA, so it covers mobile money there too.
  if (rail && (RAIL_KINDS.includes(kind) || (currency === 'KES' && kind === 'mobile_money'))) {
    return {
      flat: rail.flat,
      flatMax: rail.flat < rail.cap && rail.pct === 0 ? rail.cap : undefined,
      pct: rail.pct,
      tiered: false,
      label: railLabel(rail, currency),
      basis: 'sourced',
      note: rail.rail,
      sourceUrl: rail.sourceUrl,
      rail,
      maxFee: (a) => railMaxFee(rail, a),
    };
  }
  const rule = BY_PROVIDER[providerId] ?? BY_COUNTRY_KIND[country]?.[kind] ?? BY_KIND[kind];
  const meta = { basis: rule.basis, note: rule.note, sourceUrl: rule.sourceUrl };
  if ('tiers' in rule) {
    const fees = rule.tiers.map((t) => t.fee);
    const lo = Math.min(...fees);
    const hi = Math.max(...fees);
    const tiers = rule.tiers;
    return {
      ...meta,
      flat: lo,
      flatMax: hi,
      pct: 0,
      tiered: true,
      label: `${currency} ${lo}–${hi} flat, by amount (tiered)`,
      maxFee: (a) => (tiers.find((t) => a <= t.upTo) ?? tiers[tiers.length - 1]).fee,
    };
  }
  const parts = [rule.flat ? `${currency} ${rule.flat} flat` : '', rule.pct ? `${rule.pct}%` : ''].filter(Boolean);
  return {
    ...meta,
    flat: rule.flat,
    pct: rule.pct,
    tiered: false,
    label: parts.length ? parts.join(' + ') : 'Free',
    maxFee: (a) => rule.flat + (a * rule.pct) / 100,
  };
}

/** Domestic fee for paying `localAmount` (sender's currency) via `providerId` in `country`. */
export function domesticFee(country, providerId, localAmount, currency) {
  const provider = findFundingProvider(country, providerId);
  const kind = provider?.kind ?? 'bank_account';
  const rule = BY_PROVIDER[providerId] ?? BY_COUNTRY_KIND[country]?.[kind] ?? BY_KIND[kind];
  let fee;
  let label;
  if ('tiers' in rule) {
    fee = (rule.tiers.find((t) => localAmount <= t.upTo) ?? rule.tiers[rule.tiers.length - 1]).fee;
    label = `${currency} ${fee} for this amount (tiered)`;
  } else {
    fee = rule.flat + (localAmount * rule.pct) / 100;
    label =
      rule.flat === 0 && rule.pct === 0
        ? 'Free'
        : [rule.flat ? `${currency} ${rule.flat} flat` : '', rule.pct ? `${rule.pct}%` : ''].filter(Boolean).join(' + ');
  }
  return {
    fee: Math.round(fee * 100) / 100,
    pct: localAmount > 0 ? (fee / localAmount) * 100 : 0,
    rule: label,
    basis: rule.basis,
    note: rule.note,
    sourceUrl: rule.sourceUrl,
  };
}
