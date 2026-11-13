"""HTTP API under /api. Same routes and JSON shapes the front end has always used.

Matching is anonymous: a viewer sees full details only for orders they sent; other people's
orders show countries, amounts and status only, and a counterparty is never identified."""
from __future__ import annotations

import json
import logging
import math
import sqlite3
from typing import Optional

from fastapi import APIRouter, FastAPI, Request
from fastapi.responses import JSONResponse

from . import soroban as chain
from .accounts import AccountService
from .amounts import from_units, now_ms
from .config import config
from .errors import ChainError, HttpError
from .orders import OrderService
from .pricing import overseas_pricing
from .ramps import REGION_OF, ramps_for
from .shared_data import FUNDING_KINDS, find_provider, mask_details

log = logging.getLogger("twoway.api")
ANON_COUNTERPARTY = "Anonymous counterparty"


def _json(s: Optional[str]):
    return json.loads(s) if s else None


def _compact(d: dict) -> dict:
    """Drop None values (the JS server left these fields undefined, i.e. absent)."""
    return {k: v for k, v in d.items() if v is not None}


def _funding_method_view(o: sqlite3.Row) -> Optional[dict]:
    """The sender's chosen payment method for the matched amount, sensitive fields masked."""
    sel = _json(o["funding_method_json"])
    if not sel:
        return None
    p = find_provider(o["from_country"], sel["providerId"])
    return _compact({
        "providerId": sel["providerId"],
        "providerName": p["name"] if p else sel["providerId"],
        "kind": p["kind"] if p else None,
        "kindLabel": FUNDING_KINDS[p["kind"]]["label"] if p else None,
        "eta": p["eta"] if p else None,
        "details": mask_details(o["from_country"], sel),
    })


def _serialize_full(o: sqlite3.Row, fills: list) -> dict:
    history = []
    for f in fills:
        history.append(_compact({
            # The counterparty is never identified to the sender.
            "matchedWithOrderId": "",
            "matchedWithSender": ANON_COUNTERPARTY,
            "amount": from_units(f["amount"]),
            "timestamp": f["created_at"],
            "recipientSettled": o["recipient_name"],
            "txHash": f["settlement_ref"],  # off-chain netting reference, not a chain tx
            "settlementMethod": f["settlement_method"],
            # How THIS order's sender paid in the matched amount, and how its recipient is paid.
            "funding": _json(f["funding_a_json"] if f["order_a_id"] == o["id"] else f["funding_b_json"]),
        }))
    out = {
        "id": o["public_id"],
        "senderName": o["sender_name"],
        "senderAddress": o["sender_address"],
        "recipientName": o["recipient_name"],
        "recipientAddress": o["recipient_address"],
        "fromCountry": o["from_country"],
        "toCountry": o["to_country"],
        "fromFlag": o["from_flag"],
        "toFlag": o["to_flag"],
        "amount": from_units(o["amount"]),
        "matchedAmount": from_units(o["matched_amount"]),
        "remainingAmount": from_units(o["remaining_amount"]),
        "status": o["status"],
        "createdAt": o["created_at"],
        "deadlineMinutes": o["deadline_minutes"],
        "deadlineTimestamp": o["deadline_at"],
        "remainderPolicy": o["remainder_policy"],
        "transferType": o["transfer_type"],
        # Routed legs (chain routing): the country the route skipped, e.g. Canada -> Nigeria via Kenya.
        "routeVia": o["route_via"],
        "matchHistory": history,
        "escrowContractId": config.settlement_contract_id,
        "depositTxHash": o["preauth_tx_hash"] or "",
        "preauthExpirationLedger": o["preauth_expiration_ledger"],
    }
    out.update(_compact({
        "fundingMethod": _funding_method_view(o),
        "fallbackTxHash": o["payout_tx_hash"],
        "payoutAmount": from_units(o["payout_amount"]) if o["payout_amount"] is not None else None,
        "payoutError": o["payout_error"],
        "convertedRemainderFiat": _json(o["conversion_json"]),
        "notes": o["notes"],
    }))
    return out


_PRIVATE = ("fundingMethod", "fallbackTxHash", "payoutError", "convertedRemainderFiat", "notes")


def serialize(o: sqlite3.Row, fills: list, viewer: Optional[str]) -> dict:
    full = _serialize_full(o, fills)
    if viewer and o["sender_address"] == viewer:
        return full
    anon = {k: v for k, v in full.items() if k not in _PRIVATE}
    anon.update({
        "senderName": "Anonymous sender",
        "senderAddress": "",
        "recipientName": "Anonymous recipient",
        "recipientAddress": "",
        "depositTxHash": "",
        "matchHistory": [
            {**{k: v for k, v in m.items() if k != "funding"}, "recipientSettled": "", "txHash": ""}
            for m in full["matchHistory"]
        ],
    })
    return anon


def serialize_received(o: sqlite3.Row, fills: list) -> dict:
    """An order as its RECIPIENT sees it: who sent it and what arrived, without the sender's payment
    method, notes or errors. The payout transaction is public on-chain anyway, so it is included."""
    full = _serialize_full(o, fills)
    view = {k: v for k, v in full.items() if k not in ("fundingMethod", "payoutError", "convertedRemainderFiat", "notes", "depositTxHash")}
    view["matchHistory"] = [{k: v for k, v in m.items() if k != "funding"} for m in full["matchHistory"]]
    return view


def serialize_batch(s: dict) -> dict:
    return {
        "batchId": s["batchId"],
        "timestamp": now_ms(),
        "corridorId": s["pairId"],
        # Identities are not exposed in match results; both sides are anonymous to each other.
        "matchedPairs": [
            {
                "orderAId": "", "orderBId": "", "settledAmount": from_units(f["amountUnits"]),
                "senderA": "Anonymous", "senderB": "Anonymous", "recipientA": "Anonymous", "recipientB": "Anonymous",
                "nettingRef": f["ref"],
            }
            for f in s["fills"]
        ],
        "totalVolumeNetted": from_units(s["totalUnits"]),
        "settlementMethod": s.get("method", "offchain_netting"),
        "stroopsGasCost": 0,  # nothing here goes on-chain (routed legs settle later, at their own expiry)
        "stellarLedgerSeq": 0,
        "txHash": "",
        "remaindersProcessed": [],
    }


async def _body(req: Request) -> dict:
    try:
        b = await req.json()
    except (ValueError, UnicodeDecodeError):
        return {}
    return b if isinstance(b, dict) else {}


def _int_or_none(v) -> Optional[int]:
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError) as e:
        raise HttpError(400, "Invalid payment method id.") from e
    if not math.isfinite(f):
        raise HttpError(400, "Invalid payment method id.")
    return int(f)


def _float(v) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return math.nan


def build_router(svc: OrderService, accounts: AccountService, kick_worker) -> APIRouter:
    r = APIRouter(prefix="/api")

    def account_of(req: Request):
        return accounts.by_token(req.headers.get("x-account-token") or None)

    def require_account(req: Request):
        a = account_of(req)
        if not a:
            raise HttpError(401, "Link a bank account first.")
        return a

    def viewer_of(req: Request) -> Optional[str]:
        a = account_of(req)
        return a["wallet_public"] if a else None

    def all_orders(req: Request) -> list:
        viewer = viewer_of(req)
        return [serialize(o, svc.fills_for(o["id"]), viewer) for o in svc.list()]

    def one(req: Request, row: sqlite3.Row) -> dict:
        return serialize(row, svc.fills_for(row["id"]), viewer_of(req))

    # ------------------------------------------------------- accounts

    @r.post("/accounts/link")
    async def link(req: Request):
        """Link a (simulated) payment method; creates the invisible Stellar wallet. Returns the token once."""
        token, account = await accounts.link(await _body(req))
        return {"token": token, "account": accounts.view(account)}

    @r.get("/accounts/me")
    async def me(req: Request):
        return accounts.view(require_account(req))

    @r.post("/accounts/me/banks")
    async def add_bank(req: Request):
        account = require_account(req)
        accounts.add_bank(account, await _body(req))
        return accounts.view(accounts.get(account["id"]))

    @r.get("/accounts/me/transactions")
    async def my_transactions(req: Request):
        """Everything this account sent or received. Sent orders show in full; received ones without
        the sender's private details."""
        wallet = require_account(req)["wallet_public"]
        out = []
        for o in svc.list_for_wallet(wallet):
            fills = svc.fills_for(o["id"])
            if o["sender_address"] == wallet:
                out.append({"direction": "sent", **serialize(o, fills, wallet)})
            else:
                out.append({"direction": "received", **serialize_received(o, fills)})
        return out

    @r.post("/accounts/me/deposit")
    async def deposit(req: Request):
        """Sandbox only: add money to one linked method's simulated balance."""
        b = await _body(req)
        account = require_account(req)
        return accounts.view(accounts.sandbox_deposit(account, _int_or_none(b.get("bankId")), _float(b.get("amount"))))

    # --------------------------------------------------------- orders

    @r.post("/orders")
    async def place(req: Request):
        """Place an order from linked payment methods. Only balances are checked; no crypto moves yet."""
        account = require_account(req)
        b = await _body(req)
        direct = b.get("transferType") == "direct_instant"
        order, matches = svc.place_for_account(
            account,
            {
                "senderName": account["display_name"],
                "recipientName": b.get("recipientName"),
                "recipientAddress": b.get("recipientAddress"),
                "fromCountry": b.get("fromCountry"),
                "toCountry": b.get("toCountry"),
                "fromFlag": b.get("fromFlag"),
                "toFlag": b.get("toFlag"),
                "amount": b.get("amount"),
                "deadlineMinutes": 1 if direct else b.get("deadlineMinutes"),
                "remainderPolicy": "direct_stellar_fallback",
                "notes": b.get("notes"),
            },
            auto_match=b.get("autoMatch") is not False,
            direct=direct,
            bank_id=_int_or_none(b.get("bankId")),
            remainder_bank_id=_int_or_none(b.get("remainderBankId")),
        )
        if direct:
            kick_worker()  # whole amount goes on-chain now
        return {
            "order": one(req, order),
            "batches": [serialize_batch(m) for m in matches],
            "account": accounts.view(accounts.get(account["id"])),
        }

    @r.get("/config")
    async def get_config():
        return {
            "network": "testnet",
            "rpcUrl": config.rpc_url,
            "settlementContractId": config.settlement_contract_id,
            "usdcContractId": config.usdc_contract_id,
            "operator": config.operator.public_key,
        }

    @r.get("/ramps")
    async def ramps(req: Request):
        """Cash-in / cash-out services for a country (default: the signed-in account's country)."""
        country = req.query_params.get("country")
        if not country:
            a = account_of(req)
            country = a["country"] if a else None
        return await ramps_for(country)

    @r.get("/health")
    async def health():
        return {"ok": True, "latestLedger": await chain.latest_ledger()}

    @r.get("/orders")
    async def orders(req: Request):
        return all_orders(req)

    @r.get("/pricing/overseas")
    async def pricing(req: Request):
        """Live cost of sending `amount` overseas, to compare with paying the matched part domestically."""
        q = req.query_params
        amount = _float(q.get("amount", 100))
        return await overseas_pricing(
            q.get("sourceCurrency", "CAD").upper(),
            q.get("targetCurrency", "KES").upper(),
            amount if math.isfinite(amount) else 100,
            q.get("fromCountry", ""),
            q.get("toCountry", ""),
        )

    @r.post("/match")
    async def match(req: Request):
        b = await _body(req)
        a, c = b.get("countryA"), b.get("countryB")
        pairs = [(str(a), str(c))] if a and c else None
        batches = [serialize_batch(s) for s in svc.match(pairs)]
        if b.get("forceSettleRemainders") and a and c:
            svc.expire_now(svc.active_ids_in_pair(str(a), str(c)))
            kick_worker()
        return {
            "batches": batches,
            "totalVolumeNetted": sum(x["totalVolumeNetted"] for x in batches),
            "orders": all_orders(req),
        }

    @r.post("/orders/{public_id}/resolve")
    async def resolve(public_id: str, req: Request):
        """Resolve a remainder now: payout (Soroban), release (no movement) or convert (simulated fiat)."""
        row = svc.get_by_public_id(public_id)
        b = await _body(req)
        action = b.get("action")
        if action and action not in ("payout", "release", "convert"):
            raise HttpError(400, "Invalid action")
        return one(req, await svc.resolve(row["id"], action, b.get("conversion")))

    @r.post("/orders/{public_id}/expire")
    async def expire(public_id: str, req: Request):
        """"Fast-forward": close the matching window now; the worker resolves the remainder."""
        row = svc.get_by_public_id(public_id)
        svc.expire_now([row["id"]])
        kick_worker()
        return one(req, svc.get(row["id"]))

    # ---------------------------------------------------- demo helpers
    # Counterparties are demo accounts (sandbox balances, invisible wallets), so their orders go
    # through exactly the same path as a real user's.

    @r.post("/demo/counterparty-order")
    async def counterparty_order(req: Request):
        b = await _body(req)
        from_country = str(b.get("fromCountry") or "Kenya")
        to_country = str(b.get("toCountry") or "Canada")
        sender = await accounts.demo_account(from_country)
        recipient = await accounts.demo_account(to_country)
        order, matches = svc.place_for_account(sender, {
            "senderName": sender["display_name"],
            "recipientName": recipient["display_name"],
            "recipientAddress": recipient["wallet_public"],
            "fromCountry": from_country,
            "toCountry": to_country,
            "fromFlag": b.get("fromFlag"),
            "toFlag": b.get("toFlag"),
            "amount": str(b.get("amount") if b.get("amount") is not None else "10"),
            "deadlineMinutes": b.get("deadlineMinutes") if b.get("deadlineMinutes") is not None else 45,
            "remainderPolicy": "direct_stellar_fallback",
            "notes": "Demo counterparty order.",
        })
        # The counterparty is someone else: the caller only sees it anonymized.
        return {"order": one(req, order), "batches": [serialize_batch(m) for m in matches]}

    @r.post("/demo/recipient")
    async def demo_recipient(req: Request):
        """A demo recipient wallet in a country (has a USDC trustline, so payouts can land). Used by
        the website's auto demo. Created once; the first call takes a few seconds."""
        country = str((await _body(req)).get("country") or "")
        if country not in REGION_OF:  # the app's countries
            raise HttpError(400, "Unknown country.")
        acct = await accounts.demo_account(country)
        return {"name": acct["display_name"], "address": acct["wallet_public"]}

    @r.post("/demo/reset")
    async def reset(req: Request):
        b = await _body(req)
        svc.reset()
        if b.get("seedCanonical"):
            canada = await accounts.demo_account("Canada")
            kenya = await accounts.demo_account("Kenya")
            to_kenya = {"fromFlag": "🇨🇦", "toFlag": "🇰🇪", "fromCountry": "Canada", "toCountry": "Kenya", "recipientAddress": kenya["wallet_public"]}
            to_canada = {"fromFlag": "🇰🇪", "toFlag": "🇨🇦", "fromCountry": "Kenya", "toCountry": "Canada", "recipientAddress": canada["wallet_public"]}
            common = {"remainderPolicy": "direct_stellar_fallback"}
            svc.place_for_account(canada, {**to_kenya, **common, "senderName": "Demo sender 1 (Canada)",
                                           "recipientName": "Demo recipient 1 (Kenya)", "amount": "5", "deadlineMinutes": 3,
                                           "notes": "Canonical scenario: priority 1."})
            svc.place_for_account(kenya, {**to_canada, **common, "senderName": "Demo sender 2 (Kenya)",
                                          "recipientName": "Demo recipient 2 (Canada)", "amount": "2", "deadlineMinutes": 45,
                                          "notes": "Canonical scenario: priority 2."})
            svc.place_for_account(canada, {**to_kenya, **common, "senderName": "Demo sender 3 (Canada)",
                                           "recipientName": "Demo recipient 3 (Kenya)", "amount": "3", "deadlineMinutes": 10,
                                           "notes": "Canonical scenario: priority 3."})
        return {"orders": all_orders(req)}

    return r


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(HttpError)
    async def _http(_req: Request, e: HttpError):
        return JSONResponse({"error": e.message}, status_code=e.status)

    @app.exception_handler(ChainError)
    async def _chain(_req: Request, e: ChainError):
        return JSONResponse(_compact({"error": e.message, "code": e.code}), status_code=502)

    @app.exception_handler(Exception)
    async def _other(_req: Request, e: Exception):
        log.exception("unexpected error")
        return JSONResponse({"error": str(e) or "Internal error"}, status_code=500)
