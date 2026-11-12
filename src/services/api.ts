/**
 * Client for the TwoWay server: linked bank accounts (simulated), the SQLite order book and
 * matching, and settlement of unmatched remainders as USDC via Stellar Blockchain.
 *
 * Users never handle keys: linking a bank creates an invisible, server-held Stellar wallet, and
 * the browser keeps only an opaque account token (localStorage) to identify itself.
 */
import type { AccountView, BatchSettlementResult, TransferOrder } from '../types';
export interface OverseasQuote {
  provider: string;
  type: string;
  fee: number;
  markupPct: number;
  totalCost: number;
  totalPct: number;
}

export interface OverseasPricing {
  source: 'live' | 'world_bank_average';
  sourceLabel: string;
  sourceUrl: string;
  collectedAt: string | null;
  amount: number;
  sourceCurrency: string;
  targetCurrency: string;
  quotes: OverseasQuote[];
  cheapest: OverseasQuote | null;
  median: OverseasQuote | null;
  averagePct: number | null;
}

export class ApiError extends Error {}

const TOKEN_KEY = 'twoway_account_token';

export function getAccountToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAccountToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // storage unavailable: the session just won't persist
  }
}

async function call<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const headers: Record<string, string> = {};
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
  return data as T;
}

export interface LinkBankInput {
  displayName: string;
  country: string;
  bankProviderId: string;
  bankDetails: Record<string, string>;
  startingBalance: number;
}

export interface PlaceOrderInput {
  recipientName: string;
  recipientAddress: string;
  fromCountry: string;
  toCountry: string;
  fromFlag?: string;
  toFlag?: string;
  amount: string;
  deadlineMinutes: number;
  /** Linked bank that pays the matched part. */
  bankId?: number;
  /** Linked bank the unmatched part is pulled from (converted to USDC at expiry). */
  remainderBankId?: number;
  transferType: 'matched_pool' | 'direct_instant';
  autoMatch?: boolean;
  notes?: string;
}

export interface PlaceResult {
  order: TransferOrder;
  batches: BatchSettlementResult[];
}

export const api = {
  config: () =>
    call<{ settlementContractId: string; usdcContractId: string; operator: string; rpcUrl: string }>('/config'),

  // ---- bank account
  linkBank: (input: LinkBankInput) => call<{ token: string; account: AccountView }>('/accounts/link', { body: input }),
  me: () => call<AccountView>('/accounts/me'),
  addBank: (input: { bankProviderId: string; bankDetails: Record<string, string>; startingBalance: number }) =>
    call<AccountView>('/accounts/me/banks', { body: input }),
  deposit: (bankId: number, amount: number) => call<AccountView>('/accounts/me/deposit', { body: { bankId, amount } }),

  // ---- orders
  orders: () => call<TransferOrder[]>('/orders'),
  placeOrder: (input: PlaceOrderInput) =>
    call<PlaceResult & { account: AccountView }>('/orders', { body: input }),

  match: (body: { countryA?: string; countryB?: string; forceSettleRemainders?: boolean } = {}) =>
    call<{ batches: BatchSettlementResult[]; totalVolumeNetted: number; orders: TransferOrder[] }>('/match', { body }),

  resolve: (orderId: string, action?: 'payout' | 'release' | 'convert', conversion?: unknown) =>
    call<TransferOrder>(`/orders/${orderId}/resolve`, { body: { action, conversion } }),

  expire: (orderId: string) => call<TransferOrder>(`/orders/${orderId}/expire`, { method: 'POST' }),

  // ---- pricing
  overseas: (q: { sourceCurrency: string; targetCurrency: string; amount: number; fromCountry: string; toCountry: string }) =>
    call<OverseasPricing>(`/pricing/overseas?${new URLSearchParams(Object.entries(q).map(([k, v]) => [k, String(v)]))}`),

  // ---- demo
  counterpartyOrder: (body: { fromCountry: string; toCountry: string; amount: string; fromFlag?: string; toFlag?: string }) =>
    call<PlaceResult>('/demo/counterparty-order', { body }),

  resetDemo: (seedCanonical: boolean) =>
    call<{ orders: TransferOrder[] }>('/demo/reset', { body: { seedCanonical } }),
};
