"""Cash-outs: a user's received USDC -> local money through an anchor (SEP-24). See backend/anchor.py.

The flow per cash-out:
  start     -> the anchor's interactive form URL (the user fills it in, in a popup)
  process() -> (worker) once the anchor reports pending_user_transfer_start, send the USDC with its memo
               exactly once, then follow the anchor until a final status.
"""
from __future__ import annotations

import logging
import sqlite3
from decimal import Decimal, InvalidOperation

from . import anchor
from . import soroban as chain
from .accounts import AccountService
from .amounts import format_units, now_ms, to_units
from .errors import HttpError

log = logging.getLogger("twoway.cashouts")


class CashoutService:
    def __init__(self, db: sqlite3.Connection, accounts: AccountService):
        self.db = db
        self.accounts = accounts

    def list_for(self, account_id: int) -> list:
        return self.db.execute("SELECT * FROM cashouts WHERE account_id = ? ORDER BY id DESC LIMIT 20", (account_id,)).fetchall()

    def get(self, cid: int) -> sqlite3.Row:
        return self.db.execute("SELECT * FROM cashouts WHERE id = ?", (cid,)).fetchone()

    async def start(self, account: sqlite3.Row, amount: str) -> sqlite3.Row:
        """Check the amount against the wallet and the anchor's limits, then start a SEP-24 withdrawal."""
        try:
            units = to_units(str(amount))
        except ValueError as e:
            raise HttpError(400, str(e)) from e
        if units <= 0:
            raise HttpError(400, "Enter an amount to cash out.")
        info = await anchor.summary()
        if not info["usdcSupported"]:
            raise HttpError(400, f"{info['name']} doesn't cash out this USDC.")
        amt = Decimal(format_units(units))
        try:
            lo = Decimal(str(info["minAmount"])) if info["minAmount"] is not None else None
            hi = Decimal(str(info["maxAmount"])) if info["maxAmount"] is not None else None
        except InvalidOperation:
            lo = hi = None
        if (lo is not None and amt < lo) or (hi is not None and amt > hi):
            raise HttpError(400, f"{info['name']} cashes out between {lo} and {hi} USDC per transaction.")
        balance = await chain.usdc_balance(account["wallet_public"])
        if units > balance:
            raise HttpError(422, f"Your wallet holds {format_units(balance)} USDC; you can't cash out {format_units(units)}.")

        res = await anchor.start_withdrawal(self.accounts.keypair(account), format_units(units))
        now = now_ms()
        cur = self.db.execute(
            """INSERT INTO cashouts (account_id, anchor_domain, anchor_tx_id, amount_units, status, interactive_url, created_at, updated_at)
               VALUES (?,?,?,?,?,?,?,?)""",
            (account["id"], anchor.HOME_DOMAIN, res["id"], units, "incomplete", res["url"], now, now),
        )
        return self.get(cur.lastrowid)

    async def process(self) -> None:
        """Advance every open cash-out: pay the anchor when it's ready, then follow it to a final status."""
        rows = self.db.execute(
            f"SELECT * FROM cashouts WHERE status NOT IN ({','.join('?' * len(anchor.FINAL))}) AND created_at > ?",
            (*anchor.FINAL, now_ms() - 24 * 3600_000),
        ).fetchall()
        for c in rows:
            try:
                await self._advance(c)
            except Exception as e:  # noqa: BLE001 - keep going; record the problem on the cash-out
                log.warning("cash-out %s: %s", c["id"], e)
                self.db.execute("UPDATE cashouts SET error = ?, updated_at = ? WHERE id = ?", (str(e)[:300], now_ms(), c["id"]))

    async def _advance(self, c: sqlite3.Row) -> None:
        acct = self.accounts.get(c["account_id"])
        kp = self.accounts.keypair(acct)
        tx = await anchor.transaction(kp, c["anchor_tx_id"])
        status = tx["status"]
        if status == "pending_user_transfer_start" and not c["payment_tx_hash"]:
            # The user completed the anchor's form; send exactly what the anchor asked for, once.
            if to_units(str(tx.get("amount_in") or "0")) != c["amount_units"]:
                raise HttpError(409, f"The anchor asked for {tx.get('amount_in')} USDC, not {format_units(c['amount_units'])}; not paying.")
            claimed = self.db.execute(
                "UPDATE cashouts SET payment_tx_hash = 'sending', updated_at = ? WHERE id = ? AND payment_tx_hash IS NULL", (now_ms(), c["id"])
            )
            if claimed.rowcount == 0:
                return
            try:
                res = await anchor.pay(kp, tx)
            except Exception:
                self.db.execute("UPDATE cashouts SET payment_tx_hash = NULL WHERE id = ?", (c["id"],))
                raise
            self.db.execute("UPDATE cashouts SET payment_tx_hash = ? WHERE id = ?", (res["hash"], c["id"]))
            log.info("cash-out %s: paid %s USDC to the anchor, tx %s", c["id"], tx.get("amount_in"), res["hash"])
        self.db.execute(
            """UPDATE cashouts SET status = ?, amount_out = ?, amount_fee = ?, message = ?, error = NULL, updated_at = ? WHERE id = ?""",
            (status, tx.get("amount_out"), tx.get("amount_fee"), tx.get("message"), now_ms(), c["id"]),
        )


def view(c: sqlite3.Row) -> dict:
    paid = c["payment_tx_hash"] if c["payment_tx_hash"] not in (None, "sending") else None
    return {
        "id": c["id"],
        "anchor": c["anchor_domain"],
        "anchorTransactionId": c["anchor_tx_id"],
        "amount": float(format_units(c["amount_units"])),
        "status": c["status"],
        "interactiveUrl": c["interactive_url"] if c["status"] == "incomplete" else None,
        "paymentTxHash": paid,
        "amountOut": c["amount_out"],
        "amountFee": c["amount_fee"],
        "message": c["message"],
        "error": c["error"],
        "createdAt": c["created_at"],
        "final": anchor.is_final(c["status"]),
    }


__all__ = ["CashoutService", "view"]

