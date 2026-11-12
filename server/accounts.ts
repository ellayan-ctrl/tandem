/**
 * Accounts = a linked bank account (SIMULATED sandbox balance in the user's currency) plus an
 * invisible, server-held Stellar wallet. Users never see keys or USDC: they see their bank.
 *
 * - Order time: only the bank balance is checked (minus holds for other open orders).
 * - Matched part: settled locally; if paid "from my linked bank", the bank balance is debited.
 * - Unmatched part at expiry: debited from the bank, the treasury sends that much testnet USDC
 *   into the invisible wallet (standing in for a bank -> USDC on-ramp), and the Soroban contract
 *   pays the recipient from it.
 *
 * Wallet secrets are encrypted at rest (AES-256-GCM, key derived from the operator secret).
 * Custodial by design for this testnet demo; production would need regulated custody / a KMS.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { Keypair } from '@stellar/stellar-sdk';
import { tx, type AccountRow, type BankRow } from './db.ts';
import { config } from './config.ts';
import { HttpError } from './errors.ts';
import * as chain from './soroban.ts';
import {
  CURRENCY_BY_COUNTRY,
  findFundingProvider,
  fundingProvidersFor,
  FUNDING_KINDS,
  maskFundingDetails,
  validateFundingSelection,
} from '../src/data/fundingMethods.ts';
import { FX_RATES } from '../src/services/bankingService.ts';

const KEY = createHash('sha256').update(`twoway-wallet:${config.operator.secret()}`).digest();

function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', KEY, iv);
  const body = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), body].map((b) => b.toString('base64')).join('.');
}

function decrypt(enc: string): string {
  const [iv, tag, body] = enc.split('.').map((s) => Buffer.from(s, 'base64'));
  const d = createDecipheriv('aes-256-gcm', KEY, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(body), d.final()]).toString('utf8');
}

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/** Local currency per 1 USD for a country. */
export function fxFor(country: string): { currency: string; rate: number } {
  const currency = CURRENCY_BY_COUNTRY[country] ?? 'USD';
  return { currency, rate: FX_RATES[currency]?.rate ?? 1 };
}

/** USDC units (7 dp) -> local currency minor units (cents) at `rate`. */
export const unitsToMinor = (units: number, rate: number) => Math.round((units / 1e7) * rate * 100);

/** Orders that still reserve money in a linked bank. */
const HOLDING = `('open','partially_matched','payout_pending','payout_failed')`;

export interface LinkInput {
  displayName: string;
  country: string;
  bankProviderId: string;
  bankDetails: Record<string, string>;
  /** Simulated starting bank balance in the account currency (sandbox). */
  startingBalance?: number;
}

export interface AddBankInput {
  bankProviderId: string;
  bankDetails: Record<string, string>;
  startingBalance?: number;
}

export class AccountService {
  constructor(private db: DatabaseSync) {}

  get(id: number): AccountRow {
    const row = this.db.prepare('SELECT * FROM accounts WHERE id = ?').get(id) as AccountRow | undefined;
    if (!row) throw new HttpError(404, 'Account not found');
    return row;
  }

  byToken(token: string | undefined): AccountRow | undefined {
    if (!token) return undefined;
    return this.db.prepare('SELECT * FROM accounts WHERE token_hash = ?').get(hashToken(token)) as AccountRow | undefined;
  }

  byWallet(publicKey: string): AccountRow | undefined {
    return this.db.prepare('SELECT * FROM accounts WHERE wallet_public = ?').get(publicKey) as AccountRow | undefined;
  }

  keypair(a: AccountRow): Keypair {
    return Keypair.fromSecret(decrypt(a.wallet_secret_enc));
  }

  // ------------------------------------------------------------------ banks

  banksOf(accountId: number): BankRow[] {
    return this.db.prepare('SELECT * FROM banks WHERE account_id = ? ORDER BY id').all(accountId) as unknown as BankRow[];
  }

  bank(id: number): BankRow {
    const row = this.db.prepare('SELECT * FROM banks WHERE id = ?').get(id) as BankRow | undefined;
    if (!row) throw new HttpError(404, 'Payment method not found');
    return row;
  }

  /** A bank that belongs to `account` (defaults to its first bank). */
  ownBank(account: AccountRow, bankId?: number | null): BankRow {
    if (bankId == null) {
      const first = this.banksOf(account.id)[0];
      if (!first) throw new HttpError(400, 'Link a payment method first.');
      return first;
    }
    const b = this.bank(Number(bankId));
    if (b.account_id !== account.id) throw new HttpError(403, 'That payment method is not linked to you.');
    return b;
  }

  /**
   * Money reserved in a bank for open orders, in minor units. An order reserves its remaining
   * amount in the bank paying the matched part AND in the bank funding the unmatched part (once
   * if they're the same), because until the window closes either one may need to cover it all.
   */
  heldMinor(bankId: number): number {
    const rows = this.db
      .prepare(
        `SELECT remaining_amount, fx_rate FROM orders
          WHERE status IN ${HOLDING} AND (bank_id = ? OR remainder_bank_id = ?)`,
      )
      .all(bankId, bankId) as Array<{ remaining_amount: number; fx_rate: number | null }>;
    return rows.reduce((s, r) => s + unitsToMinor(r.remaining_amount, r.fx_rate ?? 1), 0);
  }

  availableMinor(bankId: number): number {
    return this.bank(bankId).balance_minor - this.heldMinor(bankId);
  }

  bankView(country: string, b: BankRow) {
    const provider = findFundingProvider(country, b.provider_id);
    const details = JSON.parse(b.details_json);
    const held = this.heldMinor(b.id);
    return {
      id: b.id,
      providerId: b.provider_id,
      kind: provider?.kind ?? 'bank_account',
      kindLabel: provider ? FUNDING_KINDS[provider.kind].label : 'Bank account',
      name: details.bankName ?? provider?.name ?? b.provider_id,
      details: maskFundingDetails(country, { providerId: b.provider_id, details }),
      balance: b.balance_minor / 100,
      held: held / 100,
      available: Math.max(0, b.balance_minor - held) / 100,
    };
  }

  view(a: AccountRow) {
    const banks = this.banksOf(a.id).map((b) => this.bankView(a.country, b));
    const sum = (k: 'balance' | 'held' | 'available') => Math.round(banks.reduce((s, b) => s + b[k], 0) * 100) / 100;
    return {
      id: a.id,
      displayName: a.display_name,
      country: a.country,
      currency: a.currency,
      banks,
      /** First linked bank (kept for simple displays). */
      bank: banks[0],
      balance: sum('balance'),
      held: sum('held'),
      available: sum('available'),
      simulatedBank: true,
      wallet: { publicKey: a.wallet_public },
    };
  }

  private validateBank(country: string, providerId: string, bankDetails: Record<string, string>, startingBalance?: number) {
    const provider = findFundingProvider(country, providerId);
    // Any payment method available in the account's country: bank, debit card, instant transfer, mobile money, cash at an agent.
    if (!provider) throw new HttpError(400, `Choose a payment method available in ${country}.`);
    const err = validateFundingSelection(country, { providerId: provider.id, details: bankDetails ?? {} });
    if (err) throw new HttpError(400, err);
    const details = Object.fromEntries(provider.fields.map((f) => [f.key, String(bankDetails[f.key]).trim()]));
    const starting = Number(startingBalance ?? 2000);
    if (!Number.isFinite(starting) || starting < 0 || starting > 1_000_000) throw new HttpError(400, 'Invalid starting balance.');
    return { provider, details, startingMinor: Math.round(starting * 100) };
  }

  private insertBank(accountId: number, providerId: string, details: Record<string, string>, balanceMinor: number) {
    const info = this.db
      .prepare('INSERT INTO banks (account_id, provider_id, details_json, balance_minor, created_at) VALUES (?,?,?,?,?)')
      .run(accountId, providerId, JSON.stringify(details), balanceMinor, Date.now());
    return this.bank(Number(info.lastInsertRowid));
  }

  /** Link a first (simulated) bank account and create the invisible Stellar wallet behind it. */
  async link(input: LinkInput, opts: { isDemo?: boolean } = {}) {
    const name = String(input.displayName ?? '').trim();
    if (name.length < 2 || name.length > 80) throw new HttpError(400, 'Enter your name as it appears on the bank account.');
    if (!CURRENCY_BY_COUNTRY[input.country]) throw new HttpError(400, 'Unsupported country.');
    const { provider, details, startingMinor } = this.validateBank(input.country, input.bankProviderId, input.bankDetails, input.startingBalance);

    const kp = Keypair.random();
    await chain.createWalletOnChain(kp);

    const token = randomBytes(32).toString('base64url');
    const account = tx(this.db, () => {
      const info = this.db
        .prepare(
          `INSERT INTO accounts (token_hash, display_name, country, currency, bank_provider_id, bank_details_json,
             bank_balance_minor, wallet_public, wallet_secret_enc, is_demo, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          hashToken(token),
          name,
          input.country,
          CURRENCY_BY_COUNTRY[input.country],
          provider.id,
          JSON.stringify(details),
          0, // balances live in the banks table
          kp.publicKey(),
          encrypt(kp.secret()),
          opts.isDemo ? 1 : 0,
          Date.now(),
        );
      const id = Number(info.lastInsertRowid);
      this.insertBank(id, provider.id, details, startingMinor);
      return this.get(id);
    });
    return { token, account };
  }

  /** Link another bank account (same country as the account). */
  addBank(a: AccountRow, input: AddBankInput) {
    const { provider, details, startingMinor } = this.validateBank(a.country, input.bankProviderId, input.bankDetails, input.startingBalance);
    return this.insertBank(a.id, provider.id, details, startingMinor);
  }

  /** Sandbox only: add money to one linked bank's simulated balance. */
  sandboxDeposit(a: AccountRow, bankId: number | undefined, amount: number) {
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) throw new HttpError(400, 'Invalid amount.');
    const b = this.ownBank(a, bankId);
    this.db.prepare('UPDATE banks SET balance_minor = balance_minor + ? WHERE id = ?').run(Math.round(amount * 100), b.id);
    return this.get(a.id);
  }

  /** Debit a linked bank. Throws if it would overdraw. */
  debit(bankId: number, minor: number) {
    const r = this.db
      .prepare('UPDATE banks SET balance_minor = balance_minor - ? WHERE id = ? AND balance_minor >= ?')
      .run(minor, bankId, minor);
    if (r.changes === 0) throw new HttpError(422, 'Insufficient funds in that payment method.');
  }

  credit(bankId: number, minor: number) {
    this.db.prepare('UPDATE banks SET balance_minor = balance_minor + ? WHERE id = ?').run(minor, bankId);
  }

  /** Demo counterparty account for a country, created once (wallet setup takes a few seconds). */
  async demoAccount(country: string): Promise<AccountRow> {
    const existing = this.db
      .prepare('SELECT * FROM accounts WHERE is_demo = 1 AND country = ? ORDER BY id LIMIT 1')
      .get(country) as AccountRow | undefined;
    if (existing) return existing;
    const provider = fundingProvidersFor(country).find((p) => p.kind === 'bank_account');
    if (!provider) throw new HttpError(400, `No demo bank for ${country}`);
    const sample: Record<string, string> = {
      payerName: `Demo account ${country}`,
      bankName: 'Demo bank',
      transit: '12345',
      institution: '003',
      routing: '021000021',
      accountNumber: country === 'Nigeria' ? '0123456789' : '1234567890',
      iban: 'DE89370400440532013000',
      cbu: '0'.repeat(22),
    };
    const details = Object.fromEntries(provider.fields.map((f) => [f.key, sample[f.key] ?? 'Demo']));
    const { account } = await this.link(
      { displayName: `Demo account (${country})`, country, bankProviderId: provider.id, bankDetails: details, startingBalance: 1_000_000 },
      { isDemo: true },
    );
    return account;
  }

  transaction<T>(fn: () => T): T {
    return tx(this.db, fn);
  }
}
