"""Orders: placement against linked payment-method balances, FIFO bilateral matching (matched
volume netted off-chain), and resolution of the unmatched remainder when the window closes:
only then is that exact amount converted to USDC and paid through the Soroban contract."""
from __future__ import annotations

import json
import math
import secrets
import sqlite3
from typing import List, Optional, Tuple

from stellar_sdk import StrKey

from . import soroban as chain
from .accounts import AccountService, units_to_minor
from .amounts import format_units, now_ms, to_units
from .config import config
from .conversion import simulated_conversion
from .db import transaction
from .errors import ChainError, HttpError
from .matching import BookOrder, crossed_pairs, match_chains, match_pair, pair_key
from .netting import chain_routing, offchain_netting
from .shared_data import find_provider, fx_for, validate_selection

ACTIVE = "('open','partially_matched')"
# Order types that wait in the book: user orders and routed legs created by chain routing.
MATCHABLE = "('matched_pool','routed')"
# A chain is formed only while both timers are still open (this is just a margin for clock jitter).
# Routing pays off even with seconds left: two cross-border payouts (A -> B, B -> C) become one
# (A -> C) and B is paid locally, so short windows (e.g. 15 s) route too. Expired orders never route.
MIN_ROUTE_WINDOW_MS = 1_000
# Shortest matching window: 15 seconds.
MIN_WINDOW_MINUTES = 0.25
POLICIES = ("direct_stellar_fallback", "refund_to_sender", "convert_to_fiat_bank")
POLICY_ACTION = {"direct_stellar_fallback": "payout", "refund_to_sender": "release", "convert_to_fiat_bank": "convert"}
UNRESOLVED = ("open", "partially_matched", "payout_failed")


def _base36(n: int) -> str:
    digits = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    out = ""
    while n:
        n, r = divmod(n, 36)
        out = digits[r] + out
    return out or "0"


def _number(v) -> float:
    """JavaScript-style Number(): NaN for anything that isn't numeric."""
    if isinstance(v, bool):
        return float(v)
    try:
        return float(v)
    except (TypeError, ValueError):
        return math.nan


class OrderService:
    def __init__(self, db: sqlite3.Connection, accounts: AccountService):
        self.db = db
        self.accounts = accounts
        self._in_flight: set = set()

    # --------------------------------------------------------- placement

    def place_for_account(
        self,
        account: sqlite3.Row,
        draft: dict,
        auto_match: bool = True,
        direct: bool = False,
        bank_id: Optional[int] = None,
        remainder_bank_id: Optional[int] = None,
    ) -> Tuple[sqlite3.Row, list]:
        """Place an order for a linked account. Only payment-method balances are checked (minus
        reservations for other open orders); no crypto moves now. `bank_id` pays the matched part;
        `remainder_bank_id` funds the unmatched part (converted to USDC at expiry); both default to
        the first linked method. `direct` skips matching and settles the whole amount on-chain now."""
        if draft.get("fromCountry") != account["country"]:
            raise HttpError(400, f"Your linked bank is in {account['country']}; send from {account['country']}.")
        accounts = self.accounts
        matched_bank = accounts.own_bank(account, bank_id)
        remainder_bank = accounts.own_bank(account, remainder_bank_id if remainder_bank_id is not None else matched_bank["id"])
        # The matched part is paid from the chosen linked method.
        funding_method = {"providerId": matched_bank["provider_id"], "details": json.loads(matched_bank["details_json"])}
        d = self._validate({**draft, "fundingMethod": funding_method, "senderAddress": account["wallet_public"]}, not direct)
        currency, rate = fx_for(account["country"])
        need_minor = units_to_minor(d["amountUnits"], rate)
        created = now_ms()
        deadline_at = created + round(d["deadlineMinutes"] * 60_000)

        with transaction(self.db):
            fresh = accounts.get(account["id"])
            # Until the window closes either method may need to cover the whole amount, so both must have it.
            for b in {matched_bank["id"]: matched_bank, remainder_bank["id"]: remainder_bank}.values():
                available = accounts.available_minor(b["id"])
                if available < need_minor:
                    name = accounts.bank_view(account["country"], b)["name"]
                    raise HttpError(
                        422,
                        f"Not enough money in {name}: {currency} {available / 100:.2f} available, "
                        f"{currency} {need_minor / 100:.2f} needed.",
                    )
            cur = self.db.execute(
                """INSERT INTO orders (public_id, onchain_id, transfer_type, sender_name, sender_address, recipient_name,
                     recipient_address, from_country, to_country, from_flag, to_flag, amount, remaining_amount, status,
                     remainder_policy, created_at, deadline_minutes, deadline_at, notes, funding_method_json, account_id,
                     fiat_currency, fx_rate, bank_id, remainder_bank_id)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'open',?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    f"ORD-{secrets.token_hex(4).upper()}",
                    1 + secrets.randbelow(2**47 - 1),
                    "direct_instant" if direct else "matched_pool",
                    d.get("senderName") or fresh["display_name"],
                    account["wallet_public"],
                    d.get("recipientName") or "Recipient",
                    d["recipientAddress"],
                    d["fromCountry"],
                    d["toCountry"],
                    d.get("fromFlag") or "",
                    d.get("toFlag") or "",
                    d["amountUnits"],
                    d["amountUnits"],
                    "direct_stellar_fallback",
                    created,
                    d["deadlineMinutes"],
                    created if direct else deadline_at,
                    d.get("notes"),
                    json.dumps(d["fundingMethod"]) if d.get("fundingMethod") else None,
                    account["id"],
                    currency,
                    rate,
                    matched_bank["id"],
                    remainder_bank["id"],
                ),
            )
            order_id = cur.lastrowid

        order = self.get(order_id)
        matches = [] if direct or not auto_match else self.match([(order["from_country"], order["to_country"])])
        return self.get(order_id), matches

    def _validate(self, d: dict, require_funding_method: bool = True) -> dict:
        def bad(m: str) -> HttpError:
            return HttpError(400, m)

        sender, recipient = d.get("senderAddress") or "", d.get("recipientAddress") or ""
        if not isinstance(sender, str) or not StrKey.is_valid_ed25519_public_key(sender):
            raise bad("senderAddress must be a Stellar G... address")
        if not isinstance(recipient, str) or not StrKey.is_valid_ed25519_public_key(recipient):
            raise bad("recipientAddress must be a Stellar G... address")
        if sender == recipient:
            raise bad("Sender and recipient must differ")
        if not d.get("fromCountry") or not d.get("toCountry") or d["fromCountry"] == d["toCountry"]:
            raise bad("Choose two different countries.")
        if d.get("remainderPolicy") not in POLICIES:
            raise bad("Invalid remainderPolicy")
        # Matching window: 15 seconds .. 7 days, in whole seconds (e.g. 0.5 = 30 seconds).
        minutes = _number(d.get("deadlineMinutes"))
        if (
            not math.isfinite(minutes)
            or abs(minutes * 60 - round(minutes * 60)) > 1e-6
            or minutes < MIN_WINDOW_MINUTES
            or minutes > 7 * 24 * 60
        ):
            raise bad("deadlineMinutes must be 0.25..10080 (15 seconds to 7 days, whole seconds)")
        minutes = int(minutes) if minutes.is_integer() else round(minutes * 60) / 60
        try:
            amount_units = to_units(d.get("amount") if d.get("amount") is not None else "")
        except ValueError as e:
            raise bad(str(e)) from e
        if amount_units <= 0:
            raise bad("Amount must be positive")
        funding_method = None
        if require_funding_method:
            # Funding options are local to the SENDER's country.
            err = validate_selection(d["fromCountry"], d.get("fundingMethod"))
            if err:
                raise bad(err)
            provider = find_provider(d["fromCountry"], d["fundingMethod"]["providerId"])
            # Keep only the provider's declared fields, trimmed.
            funding_method = {
                "providerId": provider["id"],
                "details": {f["key"]: str(d["fundingMethod"]["details"][f["key"]]).strip() for f in provider["fields"]},
            }
        return {**d, "deadlineMinutes": minutes, "amountUnits": amount_units, "fundingMethod": funding_method}

    # ----------------------------------------------------------- queries

    def get(self, order_id: int) -> sqlite3.Row:
        row = self.db.execute("SELECT * FROM orders WHERE id = ?", (order_id,)).fetchone()
        if not row:
            raise HttpError(404, f"Order {order_id} not found")
        return row

    def get_by_public_id(self, public_id: str) -> sqlite3.Row:
        row = self.db.execute("SELECT * FROM orders WHERE public_id = ?", (public_id,)).fetchone()
        if not row:
            raise HttpError(404, f"Order {public_id} not found")
        return row

    def list(self) -> list:
        return self.db.execute("SELECT * FROM orders ORDER BY created_at DESC, id DESC").fetchall()

    def list_for_wallet(self, wallet: str) -> list:
        """Orders this wallet sent or is the recipient of, newest first."""
        return self.db.execute(
            "SELECT * FROM orders WHERE sender_address = ? OR recipient_address = ? ORDER BY created_at DESC, id DESC",
            (wallet, wallet),
        ).fetchall()

    def fills_for(self, order_id: int) -> list:
        return self.db.execute(
            "SELECT * FROM fills WHERE order_a_id = ? OR order_b_id = ? ORDER BY id", (order_id, order_id)
        ).fetchall()

    # ---------------------------------------------------------- matching

    def match(self, pairs: Optional[List[Tuple[str, str]]] = None) -> list:
        """One DB transaction, three passes:
          1. bilateral: opposite transfers between the same two countries (no cross-border leg left),
          2. chain routing: A -> B + B -> C becomes one routed leg A -> C (one leg instead of two),
          3. bilateral again, so a new routed leg A -> C can immediately match a waiting C -> A.
        `pairs` limits pass 1 to those country pairs (default: every pair with two-way volume).
        Matched volume settles off-chain and is debited from each side's chosen payment method."""
        with transaction(self.db):
            now = now_ms()
            summaries = self._bilateral_pass(now, pairs)
            chains = self._chain_pass(now)
            if chains:
                summaries += chains + self._bilateral_pass(now, None)
            return summaries

    def _book(self, now: int) -> Tuple[dict, List[BookOrder]]:
        rows = self.db.execute(
            f"""SELECT * FROM orders WHERE status IN {ACTIVE} AND transfer_type IN {MATCHABLE}
                  AND remaining_amount > 0 AND deadline_at > ?""",
            (now,),
        ).fetchall()
        book = [
            BookOrder(
                r["id"], r["from_country"], r["to_country"], r["remaining_amount"], r["created_at"],
                deadline_at=r["deadline_at"], routable=r["transfer_type"] == "matched_pool",
                sender=r["sender_address"], recipient=r["recipient_address"],
            )
            for r in rows
        ]
        return {r["id"]: r for r in rows}, book

    @staticmethod
    def _side(o: sqlite3.Row) -> dict:
        return {
            "publicId": o["public_id"],
            "senderName": o["sender_name"],
            "recipientName": o["recipient_name"],
            "fromCountry": o["from_country"],
            "toCountry": o["to_country"],
            "fundingMethod": json.loads(o["funding_method_json"]) if o["funding_method_json"] else None,
        }

    def _debit_local(self, o: sqlite3.Row, units: int) -> None:
        """Debit an order's matched-part payment method, in its sender's currency."""
        if o["bank_id"]:
            self.accounts.debit(o["bank_id"], units_to_minor(units, o["fx_rate"] or fx_for(o["from_country"])[1]))

    def _insert_fill(self, batch_id, a_id, b_id, amount, method, status, ref, funding_a, funding_b, now) -> None:
        self.db.execute(
            """INSERT INTO fills (batch_id, order_a_id, order_b_id, amount, settlement_method, settlement_status,
                 settlement_ref, funding_a_json, funding_b_json, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)""",
            (batch_id, a_id, b_id, amount, method, status, ref, json.dumps(funding_a), json.dumps(funding_b), now),
        )

    def _apply_matched(self, matched_delta: dict, remaining: dict) -> None:
        for oid, delta in matched_delta.items():
            left = remaining[oid]
            self.db.execute(
                "UPDATE orders SET matched_amount = matched_amount + ?, remaining_amount = ?, status = ? WHERE id = ?",
                (delta, left, "settled" if left == 0 else "partially_matched", oid),
            )

    def _bilateral_pass(self, now: int, pairs: Optional[List[Tuple[str, str]]]) -> list:
        by_id, book = self._book(now)
        targets = [pair_key(a, b) for a, b in (pairs if pairs is not None else crossed_pairs(book))]
        seen: set = set()
        summaries = []
        for a, b in targets:
            if (a, b) in seen:
                continue
            seen.add((a, b))
            result = match_pair(book, a, b)
            if not result.fills:
                continue
            batch_id = f"B{_base36(now)}{secrets.token_hex(2).upper()}"
            summary = {"batchId": batch_id, "pairId": f"{a}-{b}", "method": "offchain_netting", "fills": [], "totalUnits": 0}
            matched_delta: dict = {}
            for index, f in enumerate(result.fills):
                oa, ob = by_id[f.order_a_id], by_id[f.order_b_id]
                settled = offchain_netting(batch_id, index, f.amount, self._side(oa), self._side(ob))
                # Matched part is paid from each order's chosen method: debit it now, in local currency.
                self._debit_local(oa, f.amount)
                self._debit_local(ob, f.amount)
                self._insert_fill(batch_id, oa["id"], ob["id"], f.amount, settled["method"], settled["status"],
                                  settled["ref"], settled["fundingA"], settled["fundingB"], now)
                matched_delta[oa["id"]] = matched_delta.get(oa["id"], 0) + f.amount
                matched_delta[ob["id"]] = matched_delta.get(ob["id"], 0) + f.amount
                summary["fills"].append({"amountUnits": f.amount, "ref": settled["ref"]})
                summary["totalUnits"] += f.amount
            self._apply_matched(matched_delta, result.remaining)
            for oid, left in result.remaining.items():  # keep the in-memory book in sync for later pairs
                next(o for o in book if o.id == oid).remaining = left
            summaries.append(summary)
        return summaries

    def _chain_pass(self, now: int) -> list:
        """A -> B + B -> C: B's sender pays A->B's recipient locally in B (debited now), and a routed
        leg A -> C (A's sender -> C's recipient) is created for the same amount. The routed leg is
        funded by the A -> B order's payment methods, takes the earlier of the two deadlines, can be
        matched like any order, and otherwise settles via the Soroban contract when its timer runs out."""
        by_id, book = self._book(now)
        result = match_chains(book, now, MIN_ROUTE_WINDOW_MS)
        if not result.fills:
            return []
        batch_id = f"R{_base36(now)}{secrets.token_hex(2).upper()}"
        summaries: dict = {}
        matched_delta: dict = {}
        for index, f in enumerate(result.fills):
            x, y = by_id[f.inbound_id], by_id[f.outbound_id]
            deadline = min(x["deadline_at"], y["deadline_at"])
            cur = self.db.execute(
                """INSERT INTO orders (public_id, onchain_id, transfer_type, sender_name, sender_address, recipient_name,
                     recipient_address, from_country, to_country, from_flag, to_flag, amount, remaining_amount, status,
                     remainder_policy, created_at, deadline_minutes, deadline_at, notes, funding_method_json, account_id,
                     fiat_currency, fx_rate, bank_id, remainder_bank_id, route_in_order_id, route_out_order_id, route_via)
                   VALUES (?,?,'routed',?,?,?,?,?,?,?,?,?,?,'open','direct_stellar_fallback',?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    f"RTE-{secrets.token_hex(4).upper()}",
                    1 + secrets.randbelow(2**47 - 1),
                    x["sender_name"], x["sender_address"], y["recipient_name"], y["recipient_address"],
                    x["from_country"], y["to_country"], x["from_flag"], y["to_flag"],
                    f.amount, f.amount, now, round(max(1_000, deadline - now) / 60_000, 4), deadline,
                    f"Routed: {x['from_country']} → {f.hub} and {f.hub} → {y['to_country']} became one {x['from_country']} → {y['to_country']} transfer.",
                    x["funding_method_json"], x["account_id"], x["fiat_currency"], x["fx_rate"],
                    x["bank_id"], x["remainder_bank_id"], x["id"], y["id"], f.hub,
                ),
            )
            route = self.get(cur.lastrowid)
            records = chain_routing(batch_id, index, f.amount, self._side(x), self._side(y), f.hub, route["public_id"])
            # B's sender pays A->B's recipient now, domestically in B. A's sender pays later, via the routed leg.
            self._debit_local(y, f.amount)
            self._insert_fill(batch_id, x["id"], y["id"], f.amount, records["method"], records["status"],
                              records["ref"], records["fundingA"], records["fundingB"], now)
            matched_delta[x["id"]] = matched_delta.get(x["id"], 0) + f.amount
            matched_delta[y["id"]] = matched_delta.get(y["id"], 0) + f.amount
            key = f"{x['from_country']}-{f.hub}-{y['to_country']}"
            summ = summaries.setdefault(key, {"batchId": batch_id, "pairId": key, "method": "chain_routing", "fills": [], "totalUnits": 0})
            summ["fills"].append({"amountUnits": f.amount, "ref": records["ref"]})
            summ["totalUnits"] += f.amount
        self._apply_matched(matched_delta, result.remaining)
        return list(summaries.values())

    # ------------------------------------------------ expiry & remainders

    def expire_now(self, ids: List[int]) -> None:
        """Close matching windows now (UI "fast-forward")."""
        now = now_ms()
        with transaction(self.db):
            for oid in ids:
                self.db.execute(f"UPDATE orders SET deadline_at = ? WHERE id = ? AND status IN {ACTIVE}", (now, oid))

    def active_ids_in_pair(self, a: str, b: str) -> List[int]:
        rows = self.db.execute(
            f"""SELECT id FROM orders WHERE status IN {ACTIVE} AND transfer_type IN {MATCHABLE} AND
                  ((from_country = ? AND to_country = ?) OR (from_country = ? AND to_country = ?))""",
            (a, b, b, a),
        ).fetchall()
        return [r["id"] for r in rows]

    def expired_ids(self) -> List[int]:
        rows = self.db.execute(
            f"""SELECT id FROM orders WHERE status IN {ACTIVE} AND transfer_type IN {MATCHABLE}
                  AND remaining_amount > 0 AND deadline_at <= ? ORDER BY deadline_at""",
            (now_ms(),),
        ).fetchall()
        return [r["id"] for r in rows]

    def direct_ids(self) -> List[int]:
        """Full Crypto Transfers waiting to go on-chain."""
        rows = self.db.execute(
            "SELECT id FROM orders WHERE status = 'open' AND transfer_type = 'direct_instant' AND remaining_amount > 0"
        ).fetchall()
        return [r["id"] for r in rows]

    def retryable_payout_ids(self) -> List[int]:
        """Failed payouts eligible for an automatic retry (max 3 attempts, 30s apart)."""
        rows = self.db.execute(
            """SELECT id FROM orders WHERE status = 'payout_failed' AND remainder_policy = 'direct_stellar_fallback'
                 AND payout_attempts < 3 AND COALESCE(payout_last_attempt_at, 0) <= ?""",
            (now_ms() - 30_000,),
        ).fetchall()
        return [r["id"] for r in rows]

    async def resolve(self, order_id: int, action: Optional[str] = None, conversion=None) -> sqlite3.Row:
        """Resolve an order's unmatched remainder:
          payout:  convert to USDC and settle via the Soroban contract (real testnet USDC; the
                   contract checks the deadline and that remainder = total - matched),
          release: nothing moves; the money never left the sender,
          convert: simulated fiat conversion (no on-chain movement).
        `action` defaults to the order's remainder policy."""
        order = self.get(order_id)
        act = action or POLICY_ACTION[order["remainder_policy"]]
        if act == "payout":
            if action == "payout" and order["status"] in ("open", "partially_matched") and order["deadline_at"] > now_ms():
                # The sender chose to send the rest now: close their matching window first. The
                # contract refuses to settle before the deadline, so the deadline must move to now.
                self.expire_now([order_id])
                order = self.get(order_id)
            return await self._payout(order)
        if act == "convert" and not conversion:
            conversion = simulated_conversion(order)
        if order["status"] not in UNRESOLVED or order["remaining_amount"] == 0:
            raise HttpError(409, f"Order {order['public_id']} has no unresolved remainder (status {order['status']}).")
        remainder = format_units(order["remaining_amount"])
        if act == "release":
            self.db.execute(
                """UPDATE orders SET status = 'refunded', payout_amount = remaining_amount, remaining_amount = 0,
                     notes = COALESCE(notes || ' · ', '') || ? WHERE id = ?""",
                (f"Unmatched {remainder} released; nothing was charged to the sender.", order_id),
            )
        else:
            self.db.execute(
                """UPDATE orders SET status = 'remainder_converted', payout_amount = remaining_amount, remaining_amount = 0,
                     conversion_json = ?, notes = COALESCE(notes || ' · ', '') || ? WHERE id = ?""",
                (
                    json.dumps(conversion) if conversion else None,
                    f"Unmatched {remainder} USDC routed to fiat bank conversion (simulated).",
                    order_id,
                ),
            )
        return self.get(order_id)

    async def _payout(self, order: sqlite3.Row) -> sqlite3.Row:
        if order["status"] not in UNRESOLVED or order["remaining_amount"] == 0:
            raise HttpError(409, f"Order {order['public_id']} has no unpaid remainder (status {order['status']}).")
        oid = order["id"]
        if oid in self._in_flight:
            raise HttpError(409, "Payout already in progress.")
        self._in_flight.add(oid)
        amount = order["remaining_amount"]
        try:
            # Claim the order so matching / other resolvers leave it alone.
            cur = self.db.execute(
                """UPDATE orders SET status = 'payout_pending', payout_amount = ?, payout_error = NULL,
                     payout_attempts = payout_attempts + 1, payout_last_attempt_at = ?
                     WHERE id = ? AND status IN ('open','partially_matched','payout_failed')""",
                (amount, now_ms(), oid),
            )
            if cur.rowcount == 0:
                raise HttpError(409, "Order changed state; try again.")
            try:
                total, matched = order["amount"], order["matched_amount"]
                if total - matched != amount:
                    raise ChainError(f"Order amounts are inconsistent: {total} - {matched} != {amount}.")
                # The contract refuses to settle before the deadline by the LEDGER clock, so wait for
                # it before anything touches the chain (on-ramp included).
                deadline_s = -(-order["deadline_at"] // 1000)  # ceil to whole seconds
                await chain.wait_for_ledger_time(deadline_s)
                if order["account_id"]:
                    await self._on_ramp_for_payout(order, amount)
                res = await chain.settle_remainder(
                    order["onchain_id"],
                    order["sender_address"],
                    order["recipient_address"],
                    total,
                    matched,
                    deadline_s,
                    lambda h: self.db.execute("UPDATE orders SET payout_tx_hash = ? WHERE id = ?", (h, oid)),
                )
                self._mark_paid(oid, res["hash"], f"Unmatched {format_units(amount)} sent as USDC via Stellar Blockchain (ledger {res['ledger']}).")
            except Exception as e:  # noqa: BLE001 - every failure is recorded on the order
                code = getattr(e, "code", None)
                if code == "AlreadyPaid":
                    self._mark_paid(oid, None, "Remainder already paid on-chain (recovered).")
                else:
                    # On a timeout the tx may still land: keep its hash. A retry is safe because the
                    # contract rejects a second payout for the same order (AlreadyPaid -> recovered above).
                    keep_hash = code == "Timeout"
                    self.db.execute(
                        """UPDATE orders SET status = 'payout_failed', payout_error = ?,
                             payout_tx_hash = CASE WHEN ? THEN payout_tx_hash ELSE NULL END WHERE id = ?""",
                        (getattr(e, "message", None) or str(e), 1 if keep_hash else 0, oid),
                    )
            return self.get(oid)
        finally:
            self._in_flight.discard(oid)

    async def _on_ramp_for_payout(self, order: sqlite3.Row, amount: int) -> None:
        """Account orders hold no USDC until now. Just in time for the payout: debit the unmatched
        amount from the (simulated) "send from" method, have the treasury send exactly that much
        testnet USDC into the user's invisible wallet (standing in for a bank -> USDC on-ramp), and
        approve the settlement contract to pull it. Retries skip the on-ramp if it already happened."""
        acct = self.accounts.get(order["account_id"])
        wallet = self.accounts.keypair(acct)

        if not self.get(order["id"])["onramp_tx_hash"]:
            if not config.treasury:
                raise ChainError("Treasury not configured: run `.venv/bin/python scripts/setup_treasury.py`.")
            minor = units_to_minor(amount, order["fx_rate"] or fx_for(acct["country"])[1])
            bank_id = order["remainder_bank_id"] or order["bank_id"] or self.accounts.own_bank(acct)["id"]
            self.accounts.debit(bank_id, minor)  # raises if the balance is now too low
            try:
                res = await chain.pay_usdc(config.treasury, wallet.public_key, amount)
                self.db.execute("UPDATE orders SET onramp_tx_hash = ? WHERE id = ?", (res["hash"], order["id"]))
            except BaseException:
                self.accounts.credit(bank_id, minor)  # on-ramp failed: put the money back
                raise

        ledger = await chain.latest_ledger()
        approved = await chain.approve_with_key(wallet, amount, ledger + 200)
        self.db.execute("UPDATE orders SET approve_tx_hash = ? WHERE id = ?", (approved["hash"], order["id"]))

    def _mark_paid(self, order_id: int, tx_hash: Optional[str], note: str) -> None:
        self.db.execute(
            """UPDATE orders SET status = 'fallback_executed', remaining_amount = 0, payout_error = NULL,
                 payout_tx_hash = COALESCE(?, payout_tx_hash), notes = COALESCE(notes || ' · ', '') || ? WHERE id = ?""",
            (tx_hash, note, order_id),
        )

    async def recover_pending_payouts(self) -> None:
        """After a crash, settle any order stuck in payout_pending by asking the chain what happened."""
        for o in self.db.execute("SELECT * FROM orders WHERE status = 'payout_pending'").fetchall():
            paid = False
            if o["payout_tx_hash"]:
                try:
                    paid = await chain.tx_landed(o["payout_tx_hash"])
                except Exception:  # noqa: BLE001
                    paid = False
            if not paid:
                try:
                    paid = (await chain.paid_amount(o["onchain_id"])) is not None
                except Exception:  # noqa: BLE001
                    paid = False
            if paid:
                self._mark_paid(o["id"], None, "Payout confirmed on-chain after restart.")
            else:
                self.db.execute(
                    "UPDATE orders SET status = 'payout_failed', payout_error = 'Interrupted by restart; retrying.' WHERE id = ?",
                    (o["id"],),
                )

    def reset(self) -> None:
        """Delete all orders and fills (demo reset)."""
        with transaction(self.db):
            self.db.execute("DELETE FROM fills")
            self.db.execute("DELETE FROM orders")
