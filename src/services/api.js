/**
 * Client for the TwoWay server: linked bank accounts (simulated), the SQLite order book and
 * matching, and settlement of unmatched remainders as USDC via Stellar Blockchain.
 *
 * Users never handle keys: linking a bank creates an invisible, server-held Stellar wallet, and
 * the browser keeps only an opaque account token (localStorage) to identify itself.
 */

export class ApiError extends Error {}

const TOKEN_KEY = 'twoway_account_token';

export function getAccountToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAccountToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // storage unavailable: the session just won't persist
  }
}

async function call(path, init) {
  const headers = {};
  if (init?.body) headers['content-type'] = 'application/json';
  const token = getAccountToken();
  if (token) headers['x-account-token'] = token;
  const res = await fetch(`/api${path}`, {
    method: init?.method ?? (init?.body ? 'POST' : 'GET'),
    headers,
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data?.error ?? `Request failed (${res.status})`);
  return data;
}

export const api = {
  config: () => call('/config'),

  // ---- bank account
  linkBank: (input) => call('/accounts/link', { body: input }),
  me: () => call('/accounts/me'),
  addBank: (input) => call('/accounts/me/banks', { body: input }),
  deposit: (bankId, amount) => call('/accounts/me/deposit', { body: { bankId, amount } }),
  // What this account sent and received (each row has direction: 'sent' | 'received').
  myTransactions: () => call('/accounts/me/transactions'),

  // ---- cash in / cash out services (live from the Stellar Scout partner directory)
  ramps: (country) => call(country ? `/ramps?country=${encodeURIComponent(country)}` : '/ramps'),

  // ---- orders
  orders: () => call('/orders'),
  placeOrder: (input) => call('/orders', { body: input }),

  match: (body = {}) => call('/match', { body }),

  resolve: (orderId, action, conversion) => call(`/orders/${orderId}/resolve`, { body: { action, conversion } }),

  expire: (orderId) => call(`/orders/${orderId}/expire`, { method: 'POST' }),

  // ---- pricing
  overseas: (q) => call(`/pricing/overseas?${new URLSearchParams(Object.entries(q).map(([k, v]) => [k, String(v)]))}`),

  // ---- demo
  counterpartyOrder: (body) => call('/demo/counterparty-order', { body }),

  demoRecipient: (country) => call('/demo/recipient', { body: { country } }),

  resetDemo: (seedCanonical) => call('/demo/reset', { body: { seedCanonical } }),
};
