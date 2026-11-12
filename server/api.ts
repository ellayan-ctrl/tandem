import express, { type NextFunction, type Request, type Response } from 'express';
import type { FillRow, OrderRow } from './db.ts';
import { HttpError, type MatchSummary, type OrderService } from './orders.ts';
import type { AccountService } from './accounts.ts';
import { ChainError } from './soroban.ts';
import * as chain from './soroban.ts';
import { fromUnits } from './amounts.ts';
import { config } from './config.ts';
import { overseasPricing } from './pricing.ts';
import {
  FUNDING_KINDS,
  findFundingProvider,
  fundingProvidersFor,
  maskFundingDetails,
  type FundingSelection,
} from '../src/data/fundingMethods.ts';

const parseJson = (s: string | null) => (s ? JSON.parse(s) : undefined);

/** How a server-signed demo counterparty pays in its matched amount (by the SENDER's country). */
function demoFundingMethod(fromCountry: string, senderName: string): FundingSelection | undefined {
  if (fromCountry === 'Kenya') return { providerId: 'ke-mpesa', details: { phone: '+254712345678', payerName: senderName } };
  if (fromCountry === 'Canada') {
    return { providerId: 'ca-interac', details: { payerName: senderName, contact: 'payer@example.com' } };
  }
  const card = fundingProvidersFor(fromCountry).find((p) => p.kind === 'debit_card');
  return card && { providerId: card.id, details: { payerName: senderName, cardLast4: '4242' } };
}

/** The sender's chosen funding method for the matched amount, with sensitive fields masked. */
function fundingMethodView(o: OrderRow) {
  const sel = parseJson(o.funding_method_json) as FundingSelection | undefined;
  if (!sel) return undefined;
  const p = findFundingProvider(o.from_country, sel.providerId);
  return {
    providerId: sel.providerId,
    providerName: p?.name ?? sel.providerId,
    kind: p?.kind,
    kindLabel: p ? FUNDING_KINDS[p.kind].label : undefined,
    eta: p?.eta,
    details: maskFundingDetails(o.from_country, sel),
  };
}

const ANON_COUNTERPARTY = 'Anonymous counterparty';

/**
 * DB row -> the TransferOrder shape the React app renders.
 * Matching is anonymous: a viewer sees full details only for orders they sent; other
 * people's orders show corridor, amounts and status only, and a matched counterparty's
 * identity is never revealed.
 */
function serialize(o: OrderRow, fills: FillRow[], viewer: string | undefined) {
  const full = serializeFull(o, fills);
  if (viewer && o.sender_address === viewer) return full;
  return {
    ...full,
    senderName: 'Anonymous sender',
    senderAddress: '',
    recipientName: 'Anonymous recipient',
    recipientAddress: '',
    matchHistory: full.matchHistory.map((m) => ({
      ...m,
      recipientSettled: '',
      txHash: '',
      funding: undefined,
    })),
    fundingMethod: undefined,
    depositTxHash: '',
    fallbackTxHash: undefined,
    payoutError: undefined,
    convertedRemainderFiat: undefined,
    notes: undefined,
  };
}

function serializeFull(o: OrderRow, fills: FillRow[]) {
  return {
    id: o.public_id,
    senderName: o.sender_name,
    senderAddress: o.sender_address,
    recipientName: o.recipient_name,
    recipientAddress: o.recipient_address,
    fromCountry: o.from_country,
    toCountry: o.to_country,
    fromFlag: o.from_flag,
    toFlag: o.to_flag,
    amount: fromUnits(o.amount),
    matchedAmount: fromUnits(o.matched_amount),
    remainingAmount: fromUnits(o.remaining_amount),
    status: o.status,
    createdAt: o.created_at,
    deadlineMinutes: o.deadline_minutes,
    deadlineTimestamp: o.deadline_at,
    remainderPolicy: o.remainder_policy,
    transferType: o.transfer_type,
    matchHistory: fills.map((f) => {
      return {
        // The counterparty is never identified to the sender.
        matchedWithOrderId: '',
        matchedWithSender: ANON_COUNTERPARTY,
        amount: fromUnits(f.amount),
        timestamp: f.created_at,
        recipientSettled: o.recipient_name,
        txHash: f.settlement_ref, // off-chain netting reference, not a chain tx
        settlementMethod: f.settlement_method,
        // How THIS order's sender paid in the matched amount, and how its recipient is paid.
        funding: parseJson(f.order_a_id === o.id ? f.funding_a_json : f.funding_b_json),
      };
    }),
    fundingMethod: fundingMethodView(o),
    escrowContractId: config.settlementContractId,
    depositTxHash: o.preauth_tx_hash ?? '',
    preauthExpirationLedger: o.preauth_expiration_ledger,
    fallbackTxHash: o.payout_tx_hash ?? undefined,
    payoutAmount: o.payout_amount != null ? fromUnits(o.payout_amount) : undefined,
    payoutError: o.payout_error ?? undefined,
    convertedRemainderFiat: o.conversion_json ? JSON.parse(o.conversion_json) : undefined,
    notes: o.notes ?? undefined,
  };
}

function serializeBatch(s: MatchSummary) {
  return {
    batchId: s.batchId,
    timestamp: Date.now(),
    corridorId: s.corridorId,
    // Identities are not exposed in match results; both sides are anonymous to each other.
    matchedPairs: s.fills.map((f) => ({
      orderAId: '',
      orderBId: '',
      settledAmount: fromUnits(f.amountUnits),
      senderA: 'Anonymous',
      senderB: 'Anonymous',
      recipientA: 'Anonymous',
      recipientB: 'Anonymous',
      nettingRef: f.ref,
    })),
    totalVolumeNetted: fromUnits(s.totalUnits),
    settlementMethod: 'offchain_netting',
    stroopsGasCost: 0, // matched volume never goes on-chain
    stellarLedgerSeq: 0,
    txHash: '',
    remaindersProcessed: [],
  };
}

const wrap =
  (fn: (req: Request, res: Response) => Promise<unknown> | unknown) => (req: Request, res: Response, next: NextFunction) =>
    Promise.resolve(fn(req, res)).then((body) => res.json(body), next);

export function apiRouter(svc: OrderService, accounts: AccountService, kickWorker: () => void) {
  const r = express.Router();
  r.use(express.json({ limit: '256kb' }));

  /** The linked account behind the request's bearer token (`x-account-token`), if any. */
  const accountOf = (req: Request) => accounts.byToken(req.get('x-account-token') || undefined);
  const requireAccount = (req: Request) => {
    const a = accountOf(req);
    if (!a) throw new HttpError(401, 'Link a bank account first.');
    return a;
  };
  /** Whoever is viewing: full details are shown only for this account's own orders. */
  const viewerOf = (req: Request) => accountOf(req)?.wallet_public;
  const allOrders = (req: Request) => svc.list().map((o) => serialize(o, svc.fillsFor(o.id), viewerOf(req)));
  const one = (req: Request, row: OrderRow) => serialize(row, svc.fillsFor(row.id), viewerOf(req));

  // --------------------------------------------------------- bank accounts

  /** Link a (simulated) bank account; creates the invisible Stellar wallet. Returns the bearer token once. */
  r.post('/accounts/link', wrap(async (req) => {
    const { token, account } = await accounts.link(req.body ?? {});
    return { token, account: accounts.view(account) };
  }));

  r.get('/accounts/me', wrap((req) => accounts.view(requireAccount(req))));

  /** Link another bank account (same country) to pull money from. */
  r.post('/accounts/me/banks', wrap((req) => {
    const account = requireAccount(req);
    accounts.addBank(account, req.body ?? {});
    return accounts.view(accounts.get(account.id));
  }));

  /** Sandbox only: add money to one linked bank's simulated balance. */
  r.post('/accounts/me/deposit', wrap((req) =>
    accounts.view(accounts.sandboxDeposit(requireAccount(req), req.body?.bankId != null ? Number(req.body.bankId) : undefined, Number(req.body?.amount))),
  ));

  /** Place an order from the linked bank account. Only the bank balance is checked; no crypto moves yet. */
  r.post('/orders', wrap(async (req) => {
    const account = requireAccount(req);
    const b = req.body ?? {};
    const direct = b.transferType === 'direct_instant';
    const { order, matches } = svc.placeForAccount(
      account,
      {
        senderName: account.display_name,
        recipientName: b.recipientName,
        recipientAddress: b.recipientAddress,
        fromCountry: b.fromCountry,
        toCountry: b.toCountry,
        fromFlag: b.fromFlag,
        toFlag: b.toFlag,
        amount: b.amount,
        deadlineMinutes: direct ? 1 : Number(b.deadlineMinutes),
        remainderPolicy: 'direct_stellar_fallback',
        notes: b.notes,
      },
      {
        autoMatch: b.autoMatch !== false,
        direct,
        bankId: b.bankId != null ? Number(b.bankId) : null,
        remainderBankId: b.remainderBankId != null ? Number(b.remainderBankId) : null,
      },
    );
    if (direct) kickWorker(); // whole amount goes on-chain now
    return { order: one(req, order), batches: matches.map(serializeBatch), account: accounts.view(accounts.get(account.id)) };
  }));

  r.get('/config', () => ({
    network: 'testnet',
    rpcUrl: config.rpcUrl,
    settlementContractId: config.settlementContractId,
    usdcContractId: config.usdcContractId,
    operator: config.operator.publicKey(),
  }));

  r.get('/health', wrap(async () => ({ ok: true, latestLedger: await chain.latestLedger() })));

  r.get('/orders', wrap((req) => allOrders(req)));

  /** Live cost of sending `amount` (source currency) overseas, to compare with paying the matched part domestically. */
  r.get('/pricing/overseas', wrap(async (req) => {
    const q = req.query;
    return overseasPricing({
      sourceCurrency: String(q.sourceCurrency ?? 'CAD').toUpperCase(),
      targetCurrency: String(q.targetCurrency ?? 'KES').toUpperCase(),
      amount: Number(q.amount ?? 100),
      fromCountry: String(q.fromCountry ?? ''),
      toCountry: String(q.toCountry ?? ''),
    });
  }));

  r.post('/match', wrap(async (req) => {
    const { countryA, countryB, forceSettleRemainders } = req.body ?? {};
    const corridors = countryA && countryB ? ([[String(countryA), String(countryB)]] as Array<[string, string]>) : undefined;
    const batches = svc.match(corridors).map(serializeBatch);
    if (forceSettleRemainders && countryA && countryB) {
      svc.expireNow(svc.activeIdsInCorridor(String(countryA), String(countryB)));
      kickWorker();
    }
    return {
      batches,
      totalVolumeNetted: batches.reduce((s, b) => s + b.totalVolumeNetted, 0),
      orders: allOrders(req),
    };
  }));

  /** Resolve a remainder now: payout (Soroban), release (no movement) or convert (simulated fiat). */
  r.post('/orders/:id/resolve', wrap(async (req) => {
    const row = svc.getByPublicId(String(req.params.id));
    const action = req.body?.action as 'payout' | 'release' | 'convert' | undefined;
    if (action && !['payout', 'release', 'convert'].includes(action)) throw new HttpError(400, 'Invalid action');
    return one(req, await svc.resolve(row.id, action, req.body?.conversion));
  }));

  /** "Fast-forward": close the matching window now; the worker resolves the remainder. */
  r.post('/orders/:id/expire', wrap(async (req) => {
    const row = svc.getByPublicId(String(req.params.id));
    svc.expireNow([row.id]);
    kickWorker();
    return one(req, svc.get(row.id));
  }));

  // ----------------------------------------------------------- demo helpers
  // Counterparties are demo bank-linked accounts (sandbox balances, invisible wallets), so their
  // orders go through exactly the same path as a real user's.

  r.post('/demo/counterparty-order', wrap(async (req) => {
    const b = req.body ?? {};
    const fromCountry = String(b.fromCountry ?? 'Kenya');
    const toCountry = String(b.toCountry ?? 'Canada');
    const [sender, recipient] = await Promise.all([accounts.demoAccount(fromCountry), accounts.demoAccount(toCountry)]);
    const { order, matches } = svc.placeForAccount(sender, {
      senderName: sender.display_name,
      recipientName: recipient.display_name,
      recipientAddress: recipient.wallet_public,
      fromCountry,
      toCountry,
      fromFlag: b.fromFlag,
      toFlag: b.toFlag,
      amount: String(b.amount ?? '10'),
      deadlineMinutes: Number(b.deadlineMinutes ?? 45),
      remainderPolicy: 'direct_stellar_fallback',
      fundingMethod: demoFundingMethod(fromCountry, `Demo Sender ${fromCountry}`),
      notes: 'Demo counterparty order.',
    });
    // The counterparty is someone else: the caller only sees it anonymized.
    return { order: one(req, order), batches: matches.map(serializeBatch) };
  }));

  r.post('/demo/reset', wrap(async (req) => {
    svc.reset();
    if (req.body?.seedCanonical) {
      const [canada, kenya] = await Promise.all([accounts.demoAccount('Canada'), accounts.demoAccount('Kenya')]);
      const toKenya = { fromFlag: '🇨🇦', toFlag: '🇰🇪', fromCountry: 'Canada', toCountry: 'Kenya', recipientAddress: kenya.wallet_public };
      const toCanada = { fromFlag: '🇰🇪', toFlag: '🇨🇦', fromCountry: 'Kenya', toCountry: 'Canada', recipientAddress: canada.wallet_public };
      const common = { remainderPolicy: 'direct_stellar_fallback' as const };
      svc.placeForAccount(canada, {
        ...toKenya, ...common, senderName: 'Demo sender 1 (Canada)', recipientName: 'Demo recipient 1 (Kenya)',
        amount: '5', deadlineMinutes: 3, notes: 'Canonical scenario: priority 1.',
        fundingMethod: { providerId: 'ca-debit', details: { payerName: 'Demo Sender One', cardLast4: '4242' } },
      });
      svc.placeForAccount(kenya, {
        ...toCanada, ...common, senderName: 'Demo sender 2 (Kenya)', recipientName: 'Demo recipient 2 (Canada)',
        amount: '2', deadlineMinutes: 45, notes: 'Canonical scenario: priority 2.',
        fundingMethod: { providerId: 'ke-mpesa', details: { phone: '+254712345678', payerName: 'Demo Sender Two' } },
      });
      svc.placeForAccount(canada, {
        ...toKenya, ...common, senderName: 'Demo sender 3 (Canada)', recipientName: 'Demo recipient 3 (Kenya)',
        amount: '3', deadlineMinutes: 10, notes: 'Canonical scenario: priority 3.',
        fundingMethod: { providerId: 'ca-moneygram', details: { payerName: 'Demo Sender Three', city: 'Toronto' } },
      });
    }
    return { orders: allOrders(req) };
  }));

  r.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    if (err instanceof ChainError) return res.status(502).json({ error: err.message, code: err.code });
    console.error('[api] unexpected error', err);
    res.status(500).json({ error: (err as Error)?.message ?? 'Internal error' });
  });

  return r;
}
