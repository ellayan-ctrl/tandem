import { randomBytes, randomInt } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { StrKey } from '@stellar/stellar-sdk';
import { tx, type FillRow, type OrderRow, type RemainderPolicy } from './db.ts';
import { matchCorridor, crossedCorridors, corridorKey, type BookOrder } from './matching.ts';
import { fromUnits, formatUnits, toUnits } from './amounts.ts';
import { offchainNetting, type MatchedSettlementMethod } from './netting.ts';
import * as chain from './soroban.ts';
import { config } from './config.ts';
import { simulatedConversion } from './conversion.ts';
import { LINKED_BANK_ID, findFundingProvider, validateFundingSelection, type FundingSelection } from '../src/data/fundingMethods.ts';
import { HttpError } from './errors.ts';
import { fxFor, unitsToMinor, type AccountService } from './accounts.ts';
import type { AccountRow } from './db.ts';

export { HttpError };

const ACTIVE = `('open','partially_matched')`;
const POLICIES: RemainderPolicy[] = ['direct_stellar_fallback', 'refund_to_sender', 'convert_to_fiat_bank'];

export interface OrderDraft {
  senderName: string;
  senderAddress: string;
  recipientName: string;
  recipientAddress: string;
  fromCountry: string;
  toCountry: string;
  fromFlag?: string;
  toFlag?: string;
  amount: string | number; // USDC
  deadlineMinutes: number;
  remainderPolicy: RemainderPolicy;
  /** How the sender pays in the matched amount (required for pooled orders). */
  fundingMethod?: FundingSelection;
  notes?: string;
}


export interface MatchSummary {
  batchId: string;
  corridorId: string;
  fills: Array<{ orderA: OrderRow; orderB: OrderRow; amountUnits: number; ref: string }>;
  totalUnits: number;
}

export class OrderService {
  constructor(
    private db: DatabaseSync,
    private matchedSettlement: MatchedSettlementMethod = offchainNetting,
    private accounts?: AccountService,
  ) {}

  // ------------------------------------------------- bank-account orders

  /**
   * Place an order for a linked-bank account. Only bank balances are checked (minus reservations
   * for other open orders); no crypto moves now. `bankId` pays the matched part; `remainderBankId`
   * funds the unmatched part (converted to USDC at expiry); both default to the first linked bank.
   * `direct` skips matching and settles the whole amount on-chain right away.
   */
  placeForAccount(
    account: AccountRow,
    input: Omit<OrderDraft, 'senderAddress'>,
    opts: { autoMatch?: boolean; direct?: boolean; bankId?: number | null; remainderBankId?: number | null } = {},
  ) {
    if (!this.accounts) throw new HttpError(500, 'Accounts are not configured');
    if (input.fromCountry !== account.country) {
      throw new HttpError(400, `Your linked bank is in ${account.country}; send from ${account.country}.`);
    }
    const accounts = this.accounts;
    const matchedBank = accounts.ownBank(account, opts.bankId);
    const remainderBank = accounts.ownBank(account, opts.remainderBankId ?? matchedBank.id);
    // The matched part is paid from the chosen linked bank.
    const fundingMethod = { providerId: matchedBank.provider_id, details: JSON.parse(matchedBank.details_json) };
    const draft = this.validate({ ...input, fundingMethod, senderAddress: account.wallet_public }, !opts.direct);
    const { rate, currency } = fxFor(account.country);
    const needMinor = unitsToMinor(draft.amountUnits, rate);
    const deadlineAt = Date.now() + draft.deadlineMinutes * 60_000;

    const order = tx(this.db, () => {
      const fresh = accounts.get(account.id);
      // Until the window closes either bank may need to cover the whole amount, so both must have it.
      for (const b of new Map([[matchedBank.id, matchedBank], [remainderBank.id, remainderBank]]).values()) {
        const available = accounts.availableMinor(b.id);
        if (available < needMinor) {
          const name = accounts.bankView(account.country, b).name;
          throw new HttpError(
            422,
            `Not enough money in ${name}: ${currency} ${(available / 100).toFixed(2)} available, ` +
              `${currency} ${(needMinor / 100).toFixed(2)} needed.`,
          );
        }
      }
      const info = this.db
        .prepare(
          `INSERT INTO orders (public_id, onchain_id, transfer_type, sender_name, sender_address, recipient_name,
             recipient_address, from_country, to_country, from_flag, to_flag, amount, remaining_amount, status,
             remainder_policy, created_at, deadline_minutes, deadline_at, notes, funding_method_json, account_id,
             fiat_currency, fx_rate, bank_id, remainder_bank_id)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'open',?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          `ORD-${randomBytes(4).toString('hex').toUpperCase()}`,
          randomInt(1, 2 ** 47),
          opts.direct ? 'direct_instant' : 'matched_pool',
          draft.senderName || fresh.display_name,
          account.wallet_public,
          draft.recipientName || 'Recipient',
          draft.recipientAddress,
          draft.fromCountry,
          draft.toCountry,
          draft.fromFlag ?? '',
          draft.toFlag ?? '',
          draft.amountUnits,
          draft.amountUnits,
          'direct_stellar_fallback',
          Date.now(),
          draft.deadlineMinutes,
          opts.direct ? Date.now() : deadlineAt,
          draft.notes ?? null,
          draft.fundingMethod ? JSON.stringify(draft.fundingMethod) : null,
          account.id,
          currency,
          rate,
          matchedBank.id,
          remainderBank.id,
        );
      return this.get(Number(info.lastInsertRowid));
    });

    const matches = opts.direct || opts.autoMatch === false ? [] : this.match([[order.from_country, order.to_country]]);
    return { order: this.get(order.id), matches };
  }

  // ---------------------------------------------------------------- queries

  get(id: number): OrderRow {
    const row = this.db.prepare('SELECT * FROM orders WHERE id = ?').get(id) as OrderRow | undefined;
    if (!row) throw new HttpError(404, `Order ${id} not found`);
    return row;
  }

  getByPublicId(publicId: string): OrderRow {
    const row = this.db.prepare('SELECT * FROM orders WHERE public_id = ?').get(publicId) as OrderRow | undefined;
    if (!row) throw new HttpError(404, `Order ${publicId} not found`);
    return row;
  }

  list(): OrderRow[] {
    return this.db.prepare('SELECT * FROM orders ORDER BY created_at DESC, id DESC').all() as unknown as OrderRow[];
  }

  fillsFor(orderId: number): FillRow[] {
    return this.db
      .prepare('SELECT * FROM fills WHERE order_a_id = ? OR order_b_id = ? ORDER BY id')
      .all(orderId, orderId) as unknown as FillRow[];
  }

  // ------------------------------------------------------- order placement

  private validate(d: OrderDraft, requireFundingMethod = true): OrderDraft & { amountUnits: number } {
    const bad = (m: string) => new HttpError(400, m);
    if (!StrKey.isValidEd25519PublicKey(d.senderAddress ?? '')) throw bad('senderAddress must be a Stellar G... address');
    if (!StrKey.isValidEd25519PublicKey(d.recipientAddress ?? '')) throw bad('recipientAddress must be a Stellar G... address');
    if (d.senderAddress === d.recipientAddress) throw bad('Sender and recipient must differ');
    if (!d.fromCountry || !d.toCountry || d.fromCountry === d.toCountry) throw bad('Choose two different countries.');
    if (!POLICIES.includes(d.remainderPolicy)) throw bad('Invalid remainderPolicy');
    const minutes = Number(d.deadlineMinutes);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 7 * 24 * 60) throw bad('deadlineMinutes must be 1..10080');
    let amountUnits: number;
    try {
      amountUnits = toUnits(String(d.amount));
    } catch (e) {
      throw bad((e as Error).message);
    }
    if (amountUnits <= 0) throw bad('Amount must be positive');
    let fundingMethod: FundingSelection | undefined;
    if (requireFundingMethod) {
      // Funding options are local to the SENDER's country.
      const err = validateFundingSelection(d.fromCountry, d.fundingMethod);
      if (err) throw bad(err);
      // Keep only the provider's declared fields, trimmed.
      const provider = findFundingProvider(d.fromCountry, d.fundingMethod!.providerId)!;
      fundingMethod = {
        providerId: provider.id,
        details: Object.fromEntries(provider.fields.map((f) => [f.key, d.fundingMethod!.details[f.key].trim()])),
      };
    }
    return { ...d, deadlineMinutes: minutes, amountUnits, fundingMethod };
  }

  // --------------------------------------------------------------- matching

  /**
   * Match the given corridors (default: every corridor with two-way volume). Runs in one
   * DB transaction; matched volume is settled through the off-chain netting method.
   */
  match(corridors?: Array<[string, string]>): MatchSummary[] {
    return tx(this.db, () => {
      const now = Date.now();
      const rows = this.db
        .prepare(
          `SELECT * FROM orders WHERE status IN ${ACTIVE} AND transfer_type = 'matched_pool'
             AND remaining_amount > 0 AND deadline_at > ?`,
        )
        .all(now) as unknown as OrderRow[];
      const byId = new Map(rows.map((r) => [r.id, r]));
      const book: BookOrder[] = rows.map((r) => ({
        id: r.id,
        fromCountry: r.from_country,
        toCountry: r.to_country,
        remaining: r.remaining_amount,
        createdAt: r.created_at,
      }));

      const targets = (corridors ?? crossedCorridors(book)).map(([a, b]) => corridorKey(a, b));
      const seen = new Set<string>();
      const summaries: MatchSummary[] = [];
      const updateOrder = this.db.prepare(
        'UPDATE orders SET matched_amount = matched_amount + ?, remaining_amount = ?, status = ? WHERE id = ?',
      );
      const insertFill = this.db.prepare(
        `INSERT INTO fills (batch_id, order_a_id, order_b_id, amount, settlement_method, settlement_status,
           settlement_ref, funding_a_json, funding_b_json, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      );

      for (const [a, b] of targets) {
        const key = `${a}\u0000${b}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const result = matchCorridor(book, a, b);
        if (result.fills.length === 0) continue;

        const batchId = `B${now.toString(36).toUpperCase()}${randomBytes(2).toString('hex').toUpperCase()}`;
        const summary: MatchSummary = { batchId, corridorId: `${a}-${b}`, fills: [], totalUnits: 0 };
        const matchedDelta = new Map<number, number>();

        result.fills.forEach((f, index) => {
          const oa = byId.get(f.orderAId)!;
          const ob = byId.get(f.orderBId)!;
          const side = (o: OrderRow) => ({
            publicId: o.public_id,
            senderName: o.sender_name,
            recipientName: o.recipient_name,
            fromCountry: o.from_country,
            toCountry: o.to_country,
            fundingMethod: o.funding_method_json ? (JSON.parse(o.funding_method_json) as FundingSelection) : null,
          });
          const settled = this.matchedSettlement.settle({
            batchId,
            index,
            amountUnits: f.amount,
            orderA: side(oa),
            orderB: side(ob),
          });
          // Matched part is paid from the order's chosen linked bank: debit it now, in local currency.
          for (const o of [oa, ob]) {
            if (!o.bank_id || !this.accounts) continue;
            this.accounts.debit(o.bank_id, unitsToMinor(f.amount, o.fx_rate ?? fxFor(o.from_country).rate));
          }
          insertFill.run(
            batchId,
            oa.id,
            ob.id,
            f.amount,
            settled.method,
            settled.status,
            settled.ref,
            JSON.stringify(settled.fundingA),
            JSON.stringify(settled.fundingB),
            now,
          );
          matchedDelta.set(oa.id, (matchedDelta.get(oa.id) ?? 0) + f.amount);
          matchedDelta.set(ob.id, (matchedDelta.get(ob.id) ?? 0) + f.amount);
          summary.fills.push({ orderA: oa, orderB: ob, amountUnits: f.amount, ref: settled.ref });
          summary.totalUnits += f.amount;
        });

        for (const [id, delta] of matchedDelta) {
          const remaining = result.remaining.get(id)!;
          updateOrder.run(delta, remaining, remaining === 0 ? 'settled' : 'partially_matched', id);
          // keep the in-memory book in sync for later corridors in this pass
          const bo = book.find((o) => o.id === id)!;
          bo.remaining = remaining;
        }
        summaries.push(summary);
      }
      return summaries;
    });
  }

  // ------------------------------------------------- expiry & remainders

  /** Mark orders as expired now (UI "fast-forward" / force-settle). */
  expireNow(ids: number[]) {
    const stmt = this.db.prepare(`UPDATE orders SET deadline_at = ? WHERE id = ? AND status IN ${ACTIVE}`);
    const now = Date.now();
    tx(this.db, () => ids.forEach((id) => stmt.run(now, id)));
  }

  activeIdsInCorridor(a: string, b: string): number[] {
    return (
      this.db
        .prepare(
          `SELECT id FROM orders WHERE status IN ${ACTIVE} AND transfer_type = 'matched_pool' AND
             ((from_country = ? AND to_country = ?) OR (from_country = ? AND to_country = ?))`,
        )
        .all(a, b, b, a) as Array<{ id: number }>
    ).map((r) => r.id);
  }

  expiredIds(): number[] {
    return (
      this.db
        .prepare(
          `SELECT id FROM orders WHERE status IN ${ACTIVE} AND transfer_type = 'matched_pool'
             AND remaining_amount > 0 AND deadline_at <= ? ORDER BY deadline_at`,
        )
        .all(Date.now()) as Array<{ id: number }>
    ).map((r) => r.id);
  }

  /** Failed payouts eligible for an automatic retry (max 3 attempts, 30s apart). */
  retryablePayoutIds(): number[] {
    return (
      this.db
        .prepare(
          `SELECT id FROM orders WHERE status = 'payout_failed' AND remainder_policy = 'direct_stellar_fallback'
             AND payout_attempts < 3 AND COALESCE(payout_last_attempt_at, 0) <= ?`,
        )
        .all(Date.now() - 30_000) as Array<{ id: number }>
    ).map((r) => r.id);
  }

  /**
   * Resolve an order's unmatched remainder.
   *  - payout:  Soroban `payout_remainder` pulls the remainder from sender to recipient (real USDC).
   *  - release: nothing moves on-chain; the remainder simply stays in the sender's wallet.
   *  - convert: simulated fiat conversion (no on-chain movement).
   * `action` defaults to the order's remainder policy.
   */
  async resolve(id: number, action?: 'payout' | 'release' | 'convert', conversion?: unknown): Promise<OrderRow> {
    const order = this.get(id);
    const act =
      action ??
      ({ direct_stellar_fallback: 'payout', refund_to_sender: 'release', convert_to_fiat_bank: 'convert' } as const)[
        order.remainder_policy
      ];

    if (act === 'payout') return this.payout(order);
    if (act === 'convert' && !conversion) conversion = simulatedConversion(order);

    if (!['open', 'partially_matched', 'payout_failed'].includes(order.status) || order.remaining_amount === 0) {
      throw new HttpError(409, `Order ${order.public_id} has no unresolved remainder (status ${order.status}).`);
    }
    const remainder = formatUnits(order.remaining_amount);
    if (act === 'release') {
      this.db
        .prepare(
          `UPDATE orders SET status = 'refunded', payout_amount = remaining_amount, remaining_amount = 0,
             notes = COALESCE(notes || ' · ', '') || ? WHERE id = ?`,
        )
        .run(`Unmatched ${remainder} released; nothing was charged to the sender.`, id);
    } else {
      this.db
        .prepare(
          `UPDATE orders SET status = 'remainder_converted', payout_amount = remaining_amount, remaining_amount = 0,
             conversion_json = ?, notes = COALESCE(notes || ' · ', '') || ? WHERE id = ?`,
        )
        .run(
          conversion ? JSON.stringify(conversion) : null,
          `Unmatched ${remainder} USDC routed to fiat bank conversion (simulated).`,
          id,
        );
    }
    return this.get(id);
  }

  private inFlight = new Set<number>();

  private async payout(order: OrderRow): Promise<OrderRow> {
    if (!['open', 'partially_matched', 'payout_failed'].includes(order.status) || order.remaining_amount === 0) {
      throw new HttpError(409, `Order ${order.public_id} has no unpaid remainder (status ${order.status}).`);
    }
    if (this.inFlight.has(order.id)) throw new HttpError(409, 'Payout already in progress.');
    this.inFlight.add(order.id);
    const amount = order.remaining_amount;

    try {
      // Claim the order so matching / other resolvers leave it alone.
      const claimed = this.db
        .prepare(
          `UPDATE orders SET status = 'payout_pending', payout_amount = ?, payout_error = NULL,
             payout_attempts = payout_attempts + 1, payout_last_attempt_at = ?
             WHERE id = ? AND status IN ('open','partially_matched','payout_failed')`,
        )
        .run(amount, Date.now(), order.id);
      if (claimed.changes === 0) throw new HttpError(409, 'Order changed state; try again.');

      try {
        if (order.account_id) await this.onRampForPayout(order, amount);
        const res = await chain.payoutRemainder(
          { onchainId: order.onchain_id, from: order.sender_address, to: order.recipient_address, amountUnits: amount },
          (hash) => this.db.prepare('UPDATE orders SET payout_tx_hash = ? WHERE id = ?').run(hash, order.id),
        );
        this.markPaid(
          order.id,
          res.hash,
          `Unmatched ${formatUnits(amount)} sent as USDC via Stellar Blockchain (ledger ${res.ledger}).`,
        );
      } catch (e) {
        const err = e as chain.ChainError;
        if (err.code === 'AlreadyPaid') {
          this.markPaid(order.id, null, 'Remainder already paid on-chain (recovered).');
        } else {
          // On a timeout the tx may still land: keep its hash. A retry is safe because the
          // contract rejects a second payout for the same order (AlreadyPaid -> recovered above).
          const keepHash = err.code === 'Timeout';
          this.db
            .prepare(
              `UPDATE orders SET status = 'payout_failed', payout_error = ?,
                 payout_tx_hash = CASE WHEN ? THEN payout_tx_hash ELSE NULL END WHERE id = ?`,
            )
            .run(err.message ?? String(e), keepHash ? 1 : 0, order.id);
        }
      }
      return this.get(order.id);
    } finally {
      this.inFlight.delete(order.id);
    }
  }

  /**
   * Bank-account orders hold no USDC until now. Just in time for the payout: debit the unmatched
   * amount from the (simulated) bank, have the treasury send exactly that much testnet USDC into the
   * user's invisible wallet (standing in for a bank -> USDC on-ramp), and approve the settlement
   * contract to pull it. Retries skip the on-ramp if it already happened.
   */
  private async onRampForPayout(order: OrderRow, amount: number) {
    const accounts = this.accounts;
    if (!accounts) throw new chain.ChainError('Accounts are not configured.');
    const acct = accounts.get(order.account_id!);
    const wallet = accounts.keypair(acct);

    if (!this.get(order.id).onramp_tx_hash) {
      if (!config.treasury) throw new chain.ChainError('Treasury not configured: run `npx tsx scripts/setup-treasury.ts`.');
      const minor = unitsToMinor(amount, order.fx_rate ?? fxFor(acct.country).rate);
      const bankId = order.remainder_bank_id ?? order.bank_id ?? accounts.ownBank(acct).id;
      accounts.debit(bankId, minor); // throws if the bank balance is now too low
      try {
        const res = await chain.payUsdc(config.treasury, wallet.publicKey(), amount);
        this.db.prepare('UPDATE orders SET onramp_tx_hash = ? WHERE id = ?').run(res.hash, order.id);
      } catch (e) {
        accounts.credit(bankId, minor); // on-ramp failed: put the money back
        throw e;
      }
    }

    const ledger = await chain.latestLedger();
    const approved = await chain.approveWithKey(wallet, amount, ledger + 200);
    this.db.prepare('UPDATE orders SET approve_tx_hash = ? WHERE id = ?').run(approved.hash, order.id);
  }

  private markPaid(id: number, hash: string | null, note: string) {
    this.db
      .prepare(
        `UPDATE orders SET status = 'fallback_executed', remaining_amount = 0, payout_error = NULL,
           payout_tx_hash = COALESCE(?, payout_tx_hash), notes = COALESCE(notes || ' · ', '') || ? WHERE id = ?`,
      )
      .run(hash, note, id);
  }

  /** After a crash, settle any order stuck in payout_pending by asking the chain what happened. */
  async recoverPendingPayouts() {
    const stuck = this.db.prepare(`SELECT * FROM orders WHERE status = 'payout_pending'`).all() as unknown as OrderRow[];
    for (const o of stuck) {
      let paid = false;
      if (o.payout_tx_hash) paid = await chain.txLanded(o.payout_tx_hash).catch(() => false);
      if (!paid) paid = (await chain.paidAmount(o.onchain_id).catch(() => null)) != null;
      if (paid) this.markPaid(o.id, null, 'Payout confirmed on-chain after restart.');
      else
        this.db
          .prepare(`UPDATE orders SET status = 'payout_failed', payout_error = 'Interrupted by restart; retrying.' WHERE id = ?`)
          .run(o.id);
    }
  }

  /** Delete everything (demo reset). */
  reset() {
    tx(this.db, () => {
      this.db.exec('DELETE FROM fills; DELETE FROM orders;');
    });
  }
}
