/**
 * How the SENDER pays in the MATCHED amount (netted off-chain, settled on local rails).
 * The sender only chooses where the money comes from — a debit card, their bank account,
 * an instant transfer, cash at an agent, or mobile money — in their own country. The
 * partner network then delivers to the recipient however the recipient prefers.
 * The unmatched remainder always settles in USDC on Soroban from the sender's Stellar wallet.
 *
 * The catalog itself lives in shared/funding_methods.json, read by both this module (forms, client-side
 * validation) and the Python server (backend/shared_data.py: validation, masking, funding records).
 * Funding rails are simulated in this testnet demo: realistic references and instructions,
 * but no real card processor / bank / MoneyGram / mobile-money API is called, and no full
 * card numbers are collected.
 */

import catalog from '../../shared/funding_methods.json';

/** @typedef {'debit_card' | 'bank_account' | 'instant_transfer' | 'cash_deposit' | 'mobile_money'} FundingKind */

/** Label + blurb per kind of payment method. */
export const FUNDING_KINDS = catalog.kinds;

/** Payment methods available to a sender, by sender country. Each has the fields its form collects. */
export const FUNDING_PROVIDERS = catalog.providers;

export const CURRENCY_BY_COUNTRY = catalog.currencyByCountry;

export function fundingProvidersFor(country) {
  return FUNDING_PROVIDERS[country] ?? [];
}

export function findFundingProvider(country, providerId) {
  return fundingProvidersFor(country).find((p) => p.id === providerId);
}

/**
 * "Pay from my linked bank": the client sends this id with no details; the server substitutes the
 * account's real bank provider and details (the browser only ever sees them masked).
 */
export const LINKED_BANK_ID = catalog.linkedBankId;

/** Returns an error message, or null when the selection is complete and valid. */
export function validateFundingSelection(country, sel) {
  if (!sel?.providerId) return 'Choose how you will pay in the matched amount.';
  if (sel.providerId === LINKED_BANK_ID) return null; // resolved server-side from the linked account
  const provider = findFundingProvider(country, sel.providerId);
  if (!provider) return `That payment method is not available in ${country}.`;
  for (const f of provider.fields) {
    const v = (sel.details?.[f.key] ?? '').trim();
    if (!v) return `${provider.name}: ${f.label} is required.`;
    if (f.pattern && !new RegExp(`^(?:${f.pattern})$`).test(v)) return `${provider.name}: ${f.label} looks invalid.`;
  }
  return null;
}

/** Copy of the details with sensitive values masked. */
export function maskFundingDetails(country, sel) {
  const provider = findFundingProvider(country, sel.providerId);
  const out = {};
  for (const [k, v] of Object.entries(sel.details ?? {})) {
    const sensitive = provider?.fields.find((f) => f.key === k)?.sensitive;
    if (!sensitive || v.length <= 4) out[k] = v;
    else if (v.includes('@')) out[k] = `${v[0]}••••@${v.split('@')[1]}`;
    else out[k] = `••••${v.replace(/\s/g, '').slice(-4)}`;
  }
  return out;
}
