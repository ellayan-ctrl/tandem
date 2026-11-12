"""Accounts = linked payment methods (SIMULATED sandbox balances in the user's currency) plus an
invisible, server-held Stellar wallet. Users never see keys or USDC: they see their bank.

- Order time: only the payment-method balances are checked (minus holds for other open orders).
- Matched part: settled locally and debited from the method chosen to pay it.
- Unmatched part at expiry: debited from the "send from" method, the treasury sends that much
  testnet USDC into the invisible wallet (standing in for a bank -> USDC on-ramp), and the
  Soroban contract pays the recipient from it.

Wallet secrets are encrypted at rest (AES-256-GCM, key derived from the operator secret).
Custodial by design for this testnet demo; production would need regulated custody / a KMS."""
from __future__ import annotations

import base64
import hashlib
import json
import math
import os
import secrets
import sqlite3
from typing import Optional

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from stellar_sdk import Keypair

from . import soroban as chain
from .amounts import js_round, now_ms, round2
from .config import config
from .db import transaction
from .errors import HttpError
from .shared_data import (
    CURRENCY_BY_COUNTRY,
    FUNDING_KINDS,
    find_provider,
    fx_for,
    mask_details,
    providers_for,
    validate_selection,
)

_KEY = hashlib.sha256(f"twoway-wallet:{config.operator.secret}".encode()).digest()
_TAG = 16


def encrypt(plain: str) -> str:
    """"iv.tag.body", each base64: the same format the earlier Node server wrote."""
    iv = os.urandom(12)
    sealed = AESGCM(_KEY).encrypt(iv, plain.encode(), None)  # body || tag
    body, tag = sealed[:-_TAG], sealed[-_TAG:]
    return ".".join(base64.b64encode(b).decode() for b in (iv, tag, body))


def decrypt(enc: str) -> str:
    iv, tag, body = (base64.b64decode(s) for s in enc.split("."))
    return AESGCM(_KEY).decrypt(iv, body + tag, None).decode()


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def units_to_minor(units: int, rate: float) -> int:
    """USDC units (7 dp) -> local currency minor units (cents) at `rate`."""
    return js_round((units / 1e7) * rate * 100)


# Orders that still reserve money in a linked payment method.
HOLDING = "('open','partially_matched','payout_pending','payout_failed')"


class AccountService:
    def __init__(self, db: sqlite3.Connection):
        self.db = db

    def get(self, account_id: int) -> sqlite3.Row:
        row = self.db.execute("SELECT * FROM accounts WHERE id = ?", (account_id,)).fetchone()
        if not row:
            raise HttpError(404, "Account not found")
        return row

    def by_token(self, token: Optional[str]) -> Optional[sqlite3.Row]:
        if not token:
            return None
        return self.db.execute("SELECT * FROM accounts WHERE token_hash = ?", (hash_token(token),)).fetchone()

    def keypair(self, a: sqlite3.Row) -> Keypair:
        return Keypair.from_secret(decrypt(a["wallet_secret_enc"]))

    # ------------------------------------------------------------ payment methods

    def banks_of(self, account_id: int) -> list:
        return self.db.execute("SELECT * FROM banks WHERE account_id = ? ORDER BY id", (account_id,)).fetchall()

    def bank(self, bank_id: int) -> sqlite3.Row:
        row = self.db.execute("SELECT * FROM banks WHERE id = ?", (bank_id,)).fetchone()
        if not row:
            raise HttpError(404, "Payment method not found")
        return row

    def own_bank(self, account: sqlite3.Row, bank_id=None) -> sqlite3.Row:
        """A payment method that belongs to `account` (defaults to its first one)."""
        if bank_id is None:
            banks = self.banks_of(account["id"])
            if not banks:
                raise HttpError(400, "Link a payment method first.")
            return banks[0]
        b = self.bank(int(bank_id))
        if b["account_id"] != account["id"]:
            raise HttpError(403, "That payment method is not linked to you.")
        return b

    def held_minor(self, bank_id: int) -> int:
        """Money reserved for open orders, in minor units. An order reserves its remaining amount
        in the method paying the matched part AND in the method funding the unmatched part (once
        if they're the same), because until the window closes either one may need to cover it all."""
        rows = self.db.execute(
            f"""SELECT remaining_amount, fx_rate FROM orders
                 WHERE status IN {HOLDING} AND (bank_id = ? OR remainder_bank_id = ?)""",
            (bank_id, bank_id),
        ).fetchall()
        return sum(units_to_minor(r["remaining_amount"], r["fx_rate"] or 1) for r in rows)

    def available_minor(self, bank_id: int) -> int:
        return self.bank(bank_id)["balance_minor"] - self.held_minor(bank_id)

    def bank_view(self, country: str, b: sqlite3.Row) -> dict:
        provider = find_provider(country, b["provider_id"])
        details = json.loads(b["details_json"])
        held = self.held_minor(b["id"])
        return {
            "id": b["id"],
            "providerId": b["provider_id"],
            "kind": provider["kind"] if provider else "bank_account",
            "kindLabel": FUNDING_KINDS[provider["kind"]]["label"] if provider else "Bank account",
            "name": details.get("bankName") or (provider["name"] if provider else b["provider_id"]),
            "details": mask_details(country, {"providerId": b["provider_id"], "details": details}),
            "balance": b["balance_minor"] / 100,
            "held": held / 100,
            "available": max(0, b["balance_minor"] - held) / 100,
        }

    def view(self, a: sqlite3.Row) -> dict:
        banks = [self.bank_view(a["country"], b) for b in self.banks_of(a["id"])]
        total = lambda k: round2(sum(b[k] for b in banks))  # noqa: E731
        out = {
            "id": a["id"],
            "displayName": a["display_name"],
            "country": a["country"],
            "currency": a["currency"],
            "banks": banks,
            "balance": total("balance"),
            "held": total("held"),
            "available": total("available"),
            "simulatedBank": True,
            "wallet": {"publicKey": a["wallet_public"]},
        }
        if banks:
            out["bank"] = banks[0]  # first linked method, kept for simple displays
        return out

    def _validate_bank(self, country: str, provider_id, bank_details, starting_balance=None):
        provider = find_provider(country, provider_id or "")
        # Any payment method available in the account's country.
        if not provider:
            raise HttpError(400, f"Choose a payment method available in {country}.")
        bank_details = bank_details if isinstance(bank_details, dict) else {}
        err = validate_selection(country, {"providerId": provider["id"], "details": bank_details})
        if err:
            raise HttpError(400, err)
        details = {f["key"]: str(bank_details[f["key"]]).strip() for f in provider["fields"]}
        try:
            starting = float(2000 if starting_balance is None else starting_balance)
        except (TypeError, ValueError):
            starting = math.nan
        if not math.isfinite(starting) or starting < 0 or starting > 1_000_000:
            raise HttpError(400, "Invalid starting balance.")
        return provider, details, js_round(starting * 100)

    def _insert_bank(self, account_id: int, provider_id: str, details: dict, balance_minor: int) -> sqlite3.Row:
        cur = self.db.execute(
            "INSERT INTO banks (account_id, provider_id, details_json, balance_minor, created_at) VALUES (?,?,?,?,?)",
            (account_id, provider_id, json.dumps(details), balance_minor, now_ms()),
        )
        return self.bank(cur.lastrowid)

    async def link(self, body: dict, is_demo: bool = False) -> tuple:
        """Link a first (simulated) payment method and create the invisible Stellar wallet behind it."""
        name = str(body.get("displayName") or "").strip()
        if len(name) < 2 or len(name) > 80:
            raise HttpError(400, "Enter your name as it appears on the bank account.")
        country = body.get("country")
        if country not in CURRENCY_BY_COUNTRY:
            raise HttpError(400, "Unsupported country.")
        provider, details, starting_minor = self._validate_bank(
            country, body.get("bankProviderId"), body.get("bankDetails"), body.get("startingBalance")
        )

        kp = Keypair.random()
        await chain.create_wallet_on_chain(kp)

        token = secrets.token_urlsafe(32)
        with transaction(self.db):
            cur = self.db.execute(
                """INSERT INTO accounts (token_hash, display_name, country, currency, bank_provider_id, bank_details_json,
                     bank_balance_minor, wallet_public, wallet_secret_enc, is_demo, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    hash_token(token),
                    name,
                    country,
                    CURRENCY_BY_COUNTRY[country],
                    provider["id"],
                    json.dumps(details),
                    0,  # balances live in the banks table
                    kp.public_key,
                    encrypt(kp.secret),
                    1 if is_demo else 0,
                    now_ms(),
                ),
            )
            account_id = cur.lastrowid
            self._insert_bank(account_id, provider["id"], details, starting_minor)
        return token, self.get(account_id)

    def add_bank(self, a: sqlite3.Row, body: dict) -> sqlite3.Row:
        """Link another payment method (same country as the account)."""
        provider, details, starting_minor = self._validate_bank(
            a["country"], body.get("bankProviderId"), body.get("bankDetails"), body.get("startingBalance")
        )
        return self._insert_bank(a["id"], provider["id"], details, starting_minor)

    def sandbox_deposit(self, a: sqlite3.Row, bank_id, amount: float) -> sqlite3.Row:
        """Sandbox only: add money to one linked method's simulated balance."""
        if not math.isfinite(amount) or amount <= 0 or amount > 1_000_000:
            raise HttpError(400, "Invalid amount.")
        b = self.own_bank(a, bank_id)
        self.db.execute("UPDATE banks SET balance_minor = balance_minor + ? WHERE id = ?", (js_round(amount * 100), b["id"]))
        return self.get(a["id"])

    def debit(self, bank_id: int, minor: int) -> None:
        """Debit a linked method. Raises if it would overdraw."""
        cur = self.db.execute(
            "UPDATE banks SET balance_minor = balance_minor - ? WHERE id = ? AND balance_minor >= ?",
            (minor, bank_id, minor),
        )
        if cur.rowcount == 0:
            raise HttpError(422, "Insufficient funds in that payment method.")

    def credit(self, bank_id: int, minor: int) -> None:
        self.db.execute("UPDATE banks SET balance_minor = balance_minor + ? WHERE id = ?", (minor, bank_id))

    async def demo_account(self, country: str) -> sqlite3.Row:
        """Demo counterparty account for a country, created once (wallet setup takes a few seconds)."""
        existing = self.db.execute(
            "SELECT * FROM accounts WHERE is_demo = 1 AND country = ? ORDER BY id LIMIT 1", (country,)
        ).fetchone()
        if existing:
            return existing
        provider = next((p for p in providers_for(country) if p["kind"] == "bank_account"), None)
        if not provider:
            raise HttpError(400, f"No demo bank for {country}")
        sample = {
            "payerName": f"Demo account {country}",
            "bankName": "Demo bank",
            "transit": "12345",
            "institution": "003",
            "routing": "021000021",
            "accountNumber": "0123456789" if country == "Nigeria" else "1234567890",
            "iban": "DE89370400440532013000",
            "cbu": "0" * 22,
        }
        details = {f["key"]: sample.get(f["key"], "Demo") for f in provider["fields"]}
        _, account = await self.link(
            {
                "displayName": f"Demo account ({country})",
                "country": country,
                "bankProviderId": provider["id"],
                "bankDetails": details,
                "startingBalance": 1_000_000,
            },
            is_demo=True,
        )
        return account


__all__ = ["AccountService", "fx_for", "units_to_minor", "decrypt", "encrypt"]
