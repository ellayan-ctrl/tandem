import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type OrderStatus =
  | 'open'
  | 'partially_matched'
  | 'settled' // fully matched and netted off-chain
  | 'payout_pending' // remainder payout submitted to Soroban
  | 'payout_failed'
  | 'fallback_executed' // remainder paid on Soroban
  | 'refunded' // remainder released; funds never left the sender
  | 'remainder_converted'
  | 'cancelled';

export type RemainderPolicy = 'direct_stellar_fallback' | 'refund_to_sender' | 'convert_to_fiat_bank';

export interface OrderRow {
  id: number;
  public_id: string;
  onchain_id: number;
  transfer_type: 'matched_pool' | 'direct_instant';
  sender_name: string;
  sender_address: string;
  recipient_name: string;
  recipient_address: string;
  from_country: string;
  to_country: string;
  from_flag: string;
  to_flag: string;
  amount: number;
  matched_amount: number;
  remaining_amount: number;
  status: OrderStatus;
  remainder_policy: RemainderPolicy;
  created_at: number;
  deadline_minutes: number;
  deadline_at: number;
  preauth_tx_hash: string | null;
  preauth_expiration_ledger: number | null;
  payout_amount: number | null;
  payout_tx_hash: string | null;
  payout_error: string | null;
  payout_attempts: number;
  payout_last_attempt_at: number | null;
  conversion_json: string | null;
  /** How the SENDER pays in the MATCHED amount (FundingSelection JSON). */
  funding_method_json: string | null;
  notes: string | null;
  account_id: number | null;
  fiat_currency: string | null;
  fx_rate: number | null;
  onramp_tx_hash: string | null;
  approve_tx_hash: string | null;
  /** Linked bank that pays the matched part. */
  bank_id: number | null;
  /** Linked bank the unmatched part is pulled from (converted to USDC). */
  remainder_bank_id: number | null;
}

export interface BankRow {
  id: number;
  account_id: number;
  provider_id: string;
  details_json: string;
  balance_minor: number;
  created_at: number;
}

export interface AccountRow {
  id: number;
  token_hash: string;
  display_name: string;
  country: string;
  currency: string;
  bank_provider_id: string;
  bank_details_json: string;
  bank_balance_minor: number;
  wallet_public: string;
  wallet_secret_enc: string;
  is_demo: number;
  created_at: number;
}

export interface FillRow {
  id: number;
  batch_id: string;
  order_a_id: number;
  order_b_id: number;
  amount: number;
  settlement_method: string;
  settlement_status: string;
  settlement_ref: string;
  /** Funding + delivery records (MatchedFunding JSON) for each side of the fill. */
  funding_a_json: string | null;
  funding_b_json: string | null;
  created_at: number;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS orders (
  id                        INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id                 TEXT    NOT NULL UNIQUE,
  onchain_id                INTEGER NOT NULL UNIQUE,  -- u64 order id passed to the Soroban contract
  transfer_type             TEXT    NOT NULL DEFAULT 'matched_pool',
  sender_name               TEXT    NOT NULL,
  sender_address            TEXT    NOT NULL,
  recipient_name            TEXT    NOT NULL,
  recipient_address         TEXT    NOT NULL,
  from_country              TEXT    NOT NULL,
  to_country                TEXT    NOT NULL,
  from_flag                 TEXT    NOT NULL DEFAULT '',
  to_flag                   TEXT    NOT NULL DEFAULT '',
  amount                    INTEGER NOT NULL CHECK (amount > 0),
  matched_amount            INTEGER NOT NULL DEFAULT 0 CHECK (matched_amount >= 0),
  remaining_amount          INTEGER NOT NULL CHECK (remaining_amount >= 0),
  status                    TEXT    NOT NULL,
  remainder_policy          TEXT    NOT NULL,
  created_at                INTEGER NOT NULL,
  deadline_minutes          INTEGER NOT NULL,
  deadline_at               INTEGER NOT NULL,
  preauth_tx_hash           TEXT,
  preauth_expiration_ledger INTEGER,
  payout_amount             INTEGER,
  payout_tx_hash            TEXT,
  payout_error              TEXT,
  payout_attempts           INTEGER NOT NULL DEFAULT 0,
  payout_last_attempt_at    INTEGER,
  conversion_json           TEXT,
  notes                     TEXT,
  CHECK (matched_amount <= amount)
);
CREATE INDEX IF NOT EXISTS orders_book ON orders (status, from_country, to_country, created_at);
CREATE INDEX IF NOT EXISTS orders_sender ON orders (sender_address, status);

CREATE TABLE IF NOT EXISTS fills (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id          TEXT    NOT NULL,
  order_a_id        INTEGER NOT NULL REFERENCES orders(id),
  order_b_id        INTEGER NOT NULL REFERENCES orders(id),
  amount            INTEGER NOT NULL CHECK (amount > 0),
  settlement_method TEXT    NOT NULL,
  settlement_status TEXT    NOT NULL,
  settlement_ref    TEXT    NOT NULL,
  created_at        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS fills_a ON fills (order_a_id);
CREATE INDEX IF NOT EXISTS fills_b ON fills (order_b_id);

-- A user = a linked bank account (simulated sandbox) + an invisible, server-held Stellar wallet.
CREATE TABLE IF NOT EXISTS accounts (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash         TEXT    NOT NULL UNIQUE,   -- sha256 of the bearer token the browser keeps
  display_name       TEXT    NOT NULL,
  country            TEXT    NOT NULL,
  currency           TEXT    NOT NULL,
  bank_provider_id   TEXT    NOT NULL,
  bank_details_json  TEXT    NOT NULL,
  bank_balance_minor INTEGER NOT NULL CHECK (bank_balance_minor >= 0), -- simulated bank balance, cents
  wallet_public      TEXT    NOT NULL UNIQUE,
  wallet_secret_enc  TEXT    NOT NULL,          -- AES-256-GCM, key derived from the operator secret
  is_demo            INTEGER NOT NULL DEFAULT 0,
  created_at         INTEGER NOT NULL
);

-- A user can link several bank accounts (same country). Each has its own simulated balance.
CREATE TABLE IF NOT EXISTS banks (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id    INTEGER NOT NULL REFERENCES accounts(id),
  provider_id   TEXT    NOT NULL,
  details_json  TEXT    NOT NULL,
  balance_minor INTEGER NOT NULL CHECK (balance_minor >= 0),
  created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS banks_account ON banks (account_id);
`;

export function openDb(path: string): DatabaseSync {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

/** Additive column migrations for databases created by earlier versions. */
function migrate(db: DatabaseSync) {
  const add = (table: string, column: string, type: string) => {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    if (!cols.some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  };
  add('orders', 'funding_method_json', 'TEXT');
  add('fills', 'funding_a_json', 'TEXT');
  add('fills', 'funding_b_json', 'TEXT');
  // Bank-account model
  add('orders', 'account_id', 'INTEGER REFERENCES accounts(id)');
  add('orders', 'fiat_currency', 'TEXT');
  add('orders', 'fx_rate', 'REAL'); // sender's local currency per 1 USD at order time
  add('orders', 'onramp_tx_hash', 'TEXT'); // treasury -> invisible wallet USDC (bank -> USDC on-ramp)
  add('orders', 'approve_tx_hash', 'TEXT');
  // Multiple linked banks: which bank pays the matched part, and which funds the unmatched part.
  add('orders', 'bank_id', 'INTEGER REFERENCES banks(id)');
  add('orders', 'remainder_bank_id', 'INTEGER REFERENCES banks(id)');
  // Move each account's original single bank into the banks table (once).
  db.exec(`INSERT INTO banks (account_id, provider_id, details_json, balance_minor, created_at)
           SELECT a.id, a.bank_provider_id, a.bank_details_json, a.bank_balance_minor, a.created_at
           FROM accounts a WHERE NOT EXISTS (SELECT 1 FROM banks b WHERE b.account_id = a.id)`);
}

/** Run `fn` inside BEGIN IMMEDIATE ... COMMIT, rolling back on error. */
export function tx<T>(db: DatabaseSync, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
