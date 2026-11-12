"""Settlement of MATCHED volume. Matched amounts never touch Soroban: two opposing orders cancel
out, so each side settles on domestic rails. Sender A pays in locally with the payment method
they chose; that local money is delivered to B's recipient, who lives in A's country, and vice
versa. Recipients collect through the partner network however they prefer.

This testnet demo SIMULATES the local rails: it issues realistic references and instructions
but charges no real card / bank / MoneyGram / mobile-money account. Replace funding_record with a
real payment / anchor integration (e.g. SEP-24/31) to go live."""
from __future__ import annotations

import secrets
from typing import Optional

from .amounts import from_units, round2
from .shared_data import CURRENCY_BY_COUNTRY, FUNDING_KINDS, FX_RATES, find_provider, mask_details

_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def _digits(n: int) -> str:
    return str(10 ** (n - 1) + secrets.randbelow(9 * 10 ** (n - 1)))


def _code(n: int) -> str:
    return "".join(secrets.choice(_CODE_ALPHABET) for _ in range(n))


def _money(country: str, usdc: float) -> dict:
    currency = CURRENCY_BY_COUNTRY.get(country, "USD")
    local = round2(usdc * FX_RATES.get(currency, {}).get("rate", 1))
    return {"currency": currency, "localAmount": local, "text": f"{currency} {local:,.2f}"}


def funding_record(side: dict, amount_units: int) -> dict:
    """How one side of a fill pays in its matched amount, and how its recipient is paid."""
    amount_usdc = from_units(amount_units)
    pay = _money(side["fromCountry"], amount_usdc)
    recv = _money(side["toCountry"], amount_usdc)
    sel: Optional[dict] = side.get("fundingMethod")
    provider = find_provider(side["fromCountry"], sel["providerId"]) if sel else None
    base = {
        "amountUsdc": amount_usdc,
        "currency": pay["currency"],
        "localAmount": pay["localAmount"],
        "details": mask_details(side["fromCountry"], sel) if sel and provider else {},
        "delivery": {
            "currency": recv["currency"],
            "localAmount": recv["localAmount"],
            "note": f"{recv['text']} delivered to {side['recipientName']} in {side['toCountry']} by the local "
            "partner network, collected however they prefer.",
        },
        "simulated": True,
    }
    if not provider or not sel:
        return {
            **base,
            "providerId": "unspecified",
            "providerName": "Funding method not specified",
            "kind": "unspecified",
            "kindLabel": "Unspecified",
            "reference": f"NET-{_code(8)}",
            "status": "pending",
            "instructions": f"{side['senderName']} pays {pay['text']} locally.",
        }

    d = sel.get("details") or {}
    m = base["details"]
    kind = provider["kind"]
    common = {
        **base,
        "providerId": provider["id"],
        "providerName": provider["name"],
        "kind": kind,
        "kindLabel": FUNDING_KINDS[kind]["label"],
    }
    if kind == "debit_card":
        ref = f"AUTH-{_digits(6)}"
        return {**common, "reference": ref, "status": "charged",
                "instructions": f"{pay['text']} charged to debit card ending {d.get('cardLast4')} ({d.get('payerName')}). Authorization {ref}."}
    if kind == "bank_account":
        ref = f"{pay['currency']}-PAD-{_digits(8)}"
        acct = m.get("accountNumber") or m.get("iban") or m.get("cbu") or ""
        return {**common, "reference": ref, "status": "debit_scheduled",
                "instructions": f"Pre-authorized debit of {pay['text']} from {d.get('bankName') or provider['name']} account {acct} ({provider['eta']}). Ref {ref}."}
    if kind == "instant_transfer":
        ref = f"CA{_code(6)}"
        return {**common, "reference": ref, "status": "requested",
                "instructions": f"{provider['name']} request for {pay['text']} sent to {m.get('contact')}. Approve it in your banking app. Ref {ref}."}
    if kind == "cash_deposit":
        ref = _digits(8 if provider["name"].startswith("MoneyGram") else 10)
        return {**common, "reference": ref, "status": "charged",
                "instructions": f"{pay['text']} paid from cash you deposited with {provider['name']} in {d.get('city')} ({d.get('payerName')}). Reference #{ref}."}
    # mobile_money
    ref = _code(10)
    return {**common, "reference": ref, "status": "requested",
            "instructions": f"{provider['name']} payment prompt for {pay['text']} sent to {m.get('phone') or m.get('cvu')}. Approve on your phone. Transaction {ref}."}


def offchain_netting(batch_id: str, index: int, amount_units: int, order_a: dict, order_b: dict) -> dict:
    return {
        "method": "offchain_netting",
        "status": "netted",
        "ref": f"NET-{batch_id}-{index + 1:02d}",
        "fundingA": funding_record(order_a, amount_units),
        "fundingB": funding_record(order_b, amount_units),
    }


def chain_routing(batch_id: str, index: int, amount_units: int, inbound: dict, outbound: dict, hub: str, route_id: str) -> dict:
    """Records for one chain fill: inbound = A -> hub order, outbound = hub -> C order.

    The hub-side sender pays locally in the hub (charged now) and that money is delivered to the
    inbound order's recipient there. The inbound sender is not charged now: their money becomes the
    routed transfer `route_id` (A -> C) to the outbound order's recipient."""
    origin, dest = inbound["fromCountry"], outbound["toCountry"]
    # Hub-side sender: an ordinary local payment; their recipient is paid by the routed leg.
    out_rec = funding_record(outbound, amount_units)
    out_rec["delivery"]["note"] = (
        f"{out_rec['delivery']['currency']} {out_rec['delivery']['localAmount']:,.2f} for {outbound['recipientName']} in {dest} "
        f"comes from a sender in {origin} through routed transfer {route_id}: matched locally in {dest} if possible, "
        "otherwise sent as USDC via Stellar Blockchain when its timer runs out."
    )
    # Inbound sender: recipient paid now from hub-side local money; their own payment moves to the routed leg.
    in_rec = funding_record(inbound, amount_units)
    pay = f"{in_rec['currency']} {in_rec['localAmount']:,.2f}"
    in_rec.update({
        "status": "routed",
        "reference": route_id,
        "instructions": (
            f"Not charged yet. Your {pay} now goes to {dest} as routed transfer {route_id} instead of to {hub}: "
            f"it is matched locally if a {dest} → {origin} transfer appears before the timer runs out, "
            "otherwise sent as USDC via Stellar Blockchain then."
        ),
    })
    in_rec["delivery"]["note"] = (
        f"{in_rec['delivery']['currency']} {in_rec['delivery']['localAmount']:,.2f} delivered to {inbound['recipientName']} "
        f"in {hub} from a {hub} sender's local payment (settled domestically, no cross-border leg)."
    )
    return {
        "method": "chain_routing",
        "status": "routed",
        "ref": f"RTE-{batch_id}-{index + 1:02d}",
        "fundingA": in_rec,
        "fundingB": out_rec,
    }
