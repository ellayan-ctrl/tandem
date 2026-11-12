"""SQLite storage: orders, fills (matched volume), accounts and their linked payment methods.
Same schema as earlier versions, so an existing data/twoway.db keeps working."""
from __future__ import annotations

import os
import sqlite3
from contextlib import contextmanager
from typing import Iterator

SCHEMA = """
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

-- A user = linked payment methods (simulated sandbox balances) + an invisible, server-held Stellar wallet.
CREATE TABLE IF NOT EXISTS accounts (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash         TEXT    NOT NULL UNIQUE,   -- sha256 of the bearer token the browser keeps
  display_name       TEXT    NOT NULL,
  country            TEXT    NOT NULL,
  currency           TEXT    NOT NULL,
  bank_provider_id   TEXT    NOT NULL,
  bank_details_json  TEXT    NOT NULL,
  bank_balance_minor INTEGER NOT NULL CHECK (bank_balance_minor >= 0),
  wallet_public      TEXT    NOT NULL UNIQUE,
  wallet_secret_enc  TEXT    NOT NULL,          -- AES-256-GCM, key derived from the operator secret
  is_demo            INTEGER NOT NULL DEFAULT 0,
  created_at         INTEGER NOT NULL
);

-- Each linked payment method has its own simulated balance.
CREATE TABLE IF NOT EXISTS banks (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id    INTEGER NOT NULL REFERENCES accounts(id),
  provider_id   TEXT    NOT NULL,
  details_json  TEXT    NOT NULL,
  balance_minor INTEGER NOT NULL CHECK (balance_minor >= 0),
  created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS banks_account ON banks (account_id);
"""


def open_db(path: str) -> sqlite3.Connection:
    if path != ":memory:":
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    # Autocommit mode; multi-statement work goes through transaction() below.
    # The app runs on one asyncio event loop, so one connection is shared (like the old Node server).
    db = sqlite3.connect(path, isolation_level=None, check_same_thread=False)
    db.row_factory = sqlite3.Row
    db.executescript("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;")
    db.executescript(SCHEMA)
    _migrate(db)
    return db


def _migrate(db: sqlite3.Connection) -> None:
    """Additive column migrations for databases created by earlier versions."""

    def add(table: str, column: str, type_: str) -> None:
        cols = {r["name"] for r in db.execute(f"PRAGMA table_info({table})")}
        if column not in cols:
            db.execute(f"ALTER TABLE {table} ADD COLUMN {column} {type_}")

    add("orders", "funding_method_json", "TEXT")
    add("fills", "funding_a_json", "TEXT")
    add("fills", "funding_b_json", "TEXT")
    add("orders", "account_id", "INTEGER REFERENCES accounts(id)")
    add("orders", "fiat_currency", "TEXT")
    add("orders", "fx_rate", "REAL")  # sender's local currency per 1 USD at order time
    add("orders", "onramp_tx_hash", "TEXT")  # treasury -> invisible wallet USDC (bank -> USDC on-ramp)
    add("orders", "approve_tx_hash", "TEXT")
    # Which linked method pays the matched part, and which funds the unmatched part.
    add("orders", "bank_id", "INTEGER REFERENCES banks(id)")
    add("orders", "remainder_bank_id", "INTEGER REFERENCES banks(id)")
    # Move each account's original single bank into the banks table (once).
    db.execute(
        """INSERT INTO banks (account_id, provider_id, details_json, balance_minor, created_at)
           SELECT a.id, a.bank_provider_id, a.bank_details_json, a.bank_balance_minor, a.created_at
           FROM accounts a WHERE NOT EXISTS (SELECT 1 FROM banks b WHERE b.account_id = a.id)"""
    )


@contextmanager
def transaction(db: sqlite3.Connection) -> Iterator[None]:
    """BEGIN IMMEDIATE ... COMMIT, rolling back on error."""
    db.execute("BEGIN IMMEDIATE")
    try:
        yield
    except BaseException:
        db.execute("ROLLBACK")
        raise
    else:
        db.execute("COMMIT")
