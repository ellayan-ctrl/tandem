"""Verify TwoWay on Stellar TESTNET, end to end, with real timers. Run it yourself.

    npm run test:testnet                    matching + settlement, real 1-minute timer   (~2 min)
    npm run test:testnet -- --routing       also chain routing, real 3-4 minute timers    (~6 min)
    npm run test:testnet -- --fast          close timers early instead of waiting
    npm run test:testnet -- --check         only check the setup; creates and spends nothing

The app must be running (`npm run dev`). The script drives the app like a user would, then checks
the RESULT directly on the blockchain, without trusting the app:
  * the Soroban contract's own settlement record (total, matched, remainder, deadline, who paid whom),
  * the payment transaction on Horizon (it succeeded, and exactly the unmatched amount of USDC moved),
  * the recipient's USDC balance (only the unmatched amount, never the matched part),
  * that nothing moved on-chain before the timer ran out, and that the payout came after the deadline.

Every wallet and transaction is printed as a Stellar Expert link you can open yourself.
Exit code 0 = everything verified, 1 = something failed.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import sqlite3
import sys
import time
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from backend import soroban as chain  # noqa: E402  (reads .env.local; sets up TLS certificates)
from backend.config import config  # noqa: E402

API = os.environ.get("TWOWAY_URL", "http://localhost:3000") + "/api"
HORIZON = "https://horizon-testnet.stellar.org"
EXPERT = "https://stellar.expert/explorer/testnet"
USDC_ISSUER = config.usdc_issuer
TREASURY = config.treasury.public_key if config.treasury else None
UNIT = 10_000_000

http = httpx.Client(timeout=180)
loop = asyncio.new_event_loop()
failures: list = []

# Country sets (A -> B -> C) from the app's pairs (shared/corridors.json): A-B and B-C are both pairs.
# A and B need a payment method this script can link; C only a demo account.
_CORRIDORS = json.loads((ROOT / "shared" / "corridors.json").read_text())
FLAGS = {name: c["flag"] for name, c in _CORRIDORS["countries"].items()}
TRIOS = [("Canada", "United States", "European Union"), ("European Union", "United States", "Philippines"), ("United States", "Canada", "Kenya")]
SENDER_BANK = {
    "Canada": ("ca-rbc", {"transit": "12345", "institution": "003", "accountNumber": "7654321"}),
    "United States": ("us-chase", {"routing": "021000021", "accountNumber": "123456789"}),
    "European Union": ("eu-sepa", {"bankName": "Demo Bank", "iban": "DE89370400440532013000"}),
}
RECIPIENT_BANK = {
    "United States": ("us-chase", {"routing": "021000021", "accountNumber": "987654321"}),
    "Canada": ("ca-rbc", {"transit": "54321", "institution": "004", "accountNumber": "1234567"}),
}
_pairs = {(p["a"], p["b"]) for p in _CORRIDORS["pairs"]} | {(p["b"], p["a"]) for p in _CORRIDORS["pairs"]}
assert all((a, b) in _pairs and (b, c) in _pairs for a, b, c in TRIOS), "every trio must be two of the app's pairs"


# ------------------------------------------------------------------------------ helpers
def say(msg=""):
    print(msg, flush=True)


def check(ok, label, detail=""):
    say(f"   {'PASS' if ok else 'FAIL'}  {label}" + (f"  ({detail})" if detail else ""))
    if not ok:
        failures.append(label)
    return ok


def call(method, path, token=None, **kw):
    r = http.request(method, API + path, headers={"x-account-token": token} if token else {}, **kw)
    if r.status_code >= 400:
        sys.exit(f"\nThe app rejected {method} {path}: {r.status_code} {r.text}")
    return r.json()


def chain_call(coro):
    return loop.run_until_complete(coro)


def usdc_balance(account):
    r = http.get(f"{HORIZON}/accounts/{account}")
    if r.status_code == 404:
        return 0.0
    for b in r.json()["balances"]:
        if b.get("asset_code") == "USDC" and b.get("asset_issuer") == USDC_ISSUER:
            return float(b["balance"])
    return 0.0


def horizon_tx(tx_hash):
    tx = http.get(f"{HORIZON}/transactions/{tx_hash}").json()
    effects = http.get(f"{HORIZON}/transactions/{tx_hash}/effects", params={"limit": 50}).json()["_embedded"]["records"]
    ops = http.get(f"{HORIZON}/transactions/{tx_hash}/operations").json()["_embedded"]["records"]
    moves = [(e["type"].replace("account_", ""), e["account"], float(e["amount"])) for e in effects
             if e["type"] in ("account_credited", "account_debited") and e.get("asset_code") == "USDC"]
    return tx, ops, moves


def link(name, country, provider, extra):
    return call("POST", "/accounts/link", json={"displayName": name, "country": country, "bankProviderId": provider,
                "bankDetails": {"payerName": name, **extra}, "startingBalance": 500})


def onchain_id(public_id):
    """The u64 id the contract knows this order by (stored locally; used only to read the contract)."""
    db = sqlite3.connect(f"file:{config.db_path}?mode=ro", uri=True)
    row = db.execute("select onchain_id from orders where public_id = ?", (public_id,)).fetchone()
    return row[0] if row else None


def wait_until_paid(token, oid, deadline_ms, fast):
    """Wait for the server's background worker to pay out. Never asks the server to hurry unless --fast."""
    start = time.time()
    last = 0
    while time.time() - start < 600:
        o = next(x for x in call("GET", "/orders", token) if x["id"] == oid)
        if o["status"] not in ("open", "partially_matched", "payout_pending"):
            return o
        if time.time() - last > 15:
            left = max(0, (deadline_ms - time.time() * 1000) / 1000)
            say(f"   ...{oid} still {o['status']}; timer has {left:0.0f}s left" if left else f"   ...{oid} timer ended, waiting for the payout")
            last = time.time()
        time.sleep(3)
    return o


def verify_settlement(label, order, expect_total, expect_matched, sender, recipient, fast):
    """Check one paid-out order against the contract's own record and Horizon."""
    say(f"\n   {label}")
    tx_hash = order.get("fallbackTxHash")
    if not check(order["status"] == "fallback_executed" and bool(tx_hash), "the app reports it paid out via Stellar",
                 f"{order['status']} {order.get('payoutError') or ''}".strip()):
        return
    say(f"   transaction: {EXPERT}/tx/{tx_hash}")
    expect_rem = expect_total - expect_matched

    # 1. The contract's own record (read straight from the Soroban RPC).
    oc = onchain_id(order["id"])
    rec = chain_call(chain.settlement(oc)) if oc is not None else None
    if rec is None:
        check(False, "the contract has a settlement record for this order")
    else:
        check(rec["total"] == round(expect_total * UNIT) and rec["matched"] == round(expect_matched * UNIT)
              and rec["remainder"] == round(expect_rem * UNIT),
              f"contract record: total {rec['total'] / UNIT:g}, matched {rec['matched'] / UNIT:g}, remainder {rec['remainder'] / UNIT:g}")
        # The SDK decodes addresses to Address objects; compare the G... strings, not their repr.
        check(rec["from"].address == sender and rec["to"].address == recipient, "contract record: paid the right sender -> recipient")
        check(rec["settled_at"] >= rec["deadline"], "contract record: settled only after the deadline",
              f"deadline {rec['deadline']}, settled {rec['settled_at']}")

    # 2. The transaction on Horizon.
    tx, ops, moves = horizon_tx(tx_hash)
    check(tx.get("successful") is True, "Horizon: transaction succeeded")
    check(ops and ops[0].get("type") == "invoke_host_function" and tx.get("source_account") == config.operator.public_key,
          "Horizon: it was the settlement contract call, signed by the operator")
    got = sum(a for t, acc, a in moves if t == "credited" and acc == recipient)
    took = sum(a for t, acc, a in moves if t == "debited" and acc == sender)
    check(abs(got - expect_rem) < 1e-7 and abs(took - expect_rem) < 1e-7,
          f"Horizon: exactly the unmatched {expect_rem:g} USDC moved, sender -> recipient", f"credited {got:g}, debited {took:g}")
    if not fast and rec:
        check(tx["created_at"] >= time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(rec["deadline"])),
              "Horizon: the payment came after the timer ran out")


# ------------------------------------------------------------------------------ preflight
def preflight():
    say("Checking the setup (nothing is created or spent)...")
    ok = True

    def item(good, text, fix=""):
        nonlocal ok
        say(f"   {'OK  ' if good else 'FIX '} {text}" + (f"\n          -> {fix}" if not good and fix else ""))
        ok = ok and good

    try:
        health = http.get(API + "/health", timeout=15).json()
        item(health.get("ok") is True, f"the app is running ({API}), latest ledger {health.get('latestLedger')}")
        live = http.get(API + "/config", timeout=15).json()
        item(live["settlementContractId"] == config.settlement_contract_id, "the app uses the contract from .env.local",
             "restart the app: stop `npm run dev` and start it again")
    except Exception as e:  # noqa: BLE001
        item(False, f"the app is not reachable ({type(e).__name__})", "start it in another terminal: npm run dev")
        return False, None

    try:
        st = chain_call(chain.stats())
        item(True, f"the contract answers on testnet: {st['settlements']} settlements so far, "
                   f"{st['settled_volume'] / UNIT:g} USDC settled on-chain")
        say(f"          {EXPERT}/contract/{config.settlement_contract_id}")
    except Exception as e:  # noqa: BLE001
        item(False, f"can't read the contract ({e})", "check your internet connection and SETTLEMENT_CONTRACT_ID in .env.local")
    op = http.get(f"{HORIZON}/accounts/{config.operator.public_key}")
    xlm = next((float(b["balance"]) for b in op.json().get("balances", []) if b["asset_type"] == "native"), 0) if op.status_code == 200 else 0
    item(xlm >= 5, f"the operator account has {xlm:g} XLM for fees", "fund it: stellar keys fund twoway-operator --network testnet")
    if TREASURY:
        usdc = usdc_balance(TREASURY)
        item(usdc >= 30, f"the treasury has {usdc:g} USDC (this test uses ~10)", "top it up: npm run setup:treasury -- 3000")
    else:
        item(False, "no treasury is configured", "npm run setup:treasury -- 3000")

    busy = {c for o in call("GET", "/orders") if o["status"] in ("open", "partially_matched") for c in (o["fromCountry"], o["toCountry"])}
    trio = next((t for t in TRIOS if not busy & set(t)), None)
    item(trio is not None, f"found countries with no open orders: {' -> '.join(trio) if trio else ''}",
         "open orders already exist in every test country; let them expire, then retry (the test never touches existing orders)")
    return ok, trio


# ------------------------------------------------------------------------------ scenarios
def scenario_matching(trio, fast):
    A, B, _ = trio
    say(f"\n=== Matching + settlement: {A} -> {B} (real {'fast-forwarded' if fast else '1-minute'} timer) ===")
    say(f"1. Creating a sender in {A} and a recipient in {B} (two real testnet wallets, ~15s)...")
    sp, sx = SENDER_BANK[A]
    rp, rx = RECIPIENT_BANK[B]
    sender = link("Verify Sender", A, sp, sx)
    recipient = link("Verify Recipient", B, rp, rx)
    token, wallet = sender["token"], sender["account"]["wallet"]["publicKey"]
    rwallet = recipient["account"]["wallet"]["publicKey"]
    say(f"   sender    {EXPERT}/account/{wallet}\n   recipient {EXPERT}/account/{rwallet}")

    say(f"\n2. The sender sends 10 USD {A} -> {B} with a 1-minute matching window...")
    x = call("POST", "/orders", token, json={"recipientName": "Verify Recipient", "recipientAddress": rwallet, "fromCountry": A, "toCountry": B,
             "fromFlag": FLAGS[A], "toFlag": FLAGS[B], "amount": "10", "deadlineMinutes": 1, "transferType": "matched_pool"})["order"]
    say(f"   order {x['id']} placed")
    say(f"3. An anonymous {B} -> {A} sender sends 3 USD the other way: this part should match and settle locally...")
    call("POST", "/demo/counterparty-order", json={"fromCountry": B, "toCountry": A, "fromFlag": FLAGS[B], "toFlag": FLAGS[A],
         "amount": "3", "deadlineMinutes": 30})
    xo = next(o for o in call("GET", "/orders", token) if o["id"] == x["id"])

    say("\n4. Before the timer runs out:")
    check(abs(xo["matchedAmount"] - 3.0) < 1e-7, "3 of the 10 USD matched locally", f"matched {xo['matchedAmount']:g}")
    check(not xo.get("fallbackTxHash") and usdc_balance(rwallet) == 0.0, "nothing is on the blockchain yet: the recipient holds 0 USDC")

    say(f"\n5. Now the timer runs out{' (fast-forwarded)' if fast else ' by itself: the server pays out on its own, about a minute'}...")
    if fast:
        call("POST", f"/orders/{x['id']}/expire", token)
    done = wait_until_paid(token, x["id"], xo["deadlineTimestamp"], fast)

    say("\n6. Checking the result on the blockchain:")
    verify_settlement("the unmatched 7 USD", done, 10, 3, wallet, rwallet, fast)
    check(abs(usdc_balance(rwallet) - 7.0) < 1e-7, "the recipient's wallet holds exactly 7 USDC (not 10: the matched 3 never went on-chain)",
          f"balance {usdc_balance(rwallet):g}")
    say(f"   recipient: {EXPERT}/account/{rwallet}")


def scenario_routing(trio, fast):
    A, B, C = trio
    say(f"\n=== Chain routing: {A} -> {B} and {B} -> {C} (real timers, about 4 minutes) ===")
    say(f"1. Creating a sender in {A} and a recipient in {B}...")
    sp, sx = SENDER_BANK[A]
    rp, rx = RECIPIENT_BANK[B]
    sender = link("Verify Route Sender", A, sp, sx)
    recipient = link("Verify Route Recipient", B, rp, rx)
    token, wallet = sender["token"], sender["account"]["wallet"]["publicKey"]
    bwallet = recipient["account"]["wallet"]["publicKey"]

    say(f"2. The sender sends 10 USD {A} -> {B} (4-minute window)...")
    x = call("POST", "/orders", token, json={"recipientName": "Verify Route Recipient", "recipientAddress": bwallet, "fromCountry": A,
             "toCountry": B, "fromFlag": FLAGS[A], "toFlag": FLAGS[B], "amount": "10", "deadlineMinutes": 4, "transferType": "matched_pool"})["order"]
    say(f"3. Anonymous {B} -> {A} (3 USD, opposite) and {B} -> {C} (4 USD, onward) senders arrive...")
    call("POST", "/demo/counterparty-order", json={"fromCountry": B, "toCountry": A, "fromFlag": FLAGS[B], "toFlag": FLAGS[A], "amount": "3", "deadlineMinutes": 30})
    call("POST", "/demo/counterparty-order", json={"fromCountry": B, "toCountry": C, "fromFlag": FLAGS[B], "toFlag": FLAGS[C], "amount": "4", "deadlineMinutes": 3})
    mine = call("GET", "/orders", token)
    xo = next(o for o in mine if o["id"] == x["id"])
    routes = [o for o in mine if o["transferType"] == "routed" and o["senderAddress"] == wallet]

    say("\n4. Before any timer runs out:")
    check(abs(xo["matchedAmount"] - 7.0) < 1e-7, "7 of the 10 USD matched (3 opposite + 4 routed)", f"matched {xo['matchedAmount']:g}")
    if not check(len(routes) == 1 and routes[0]["toCountry"] == C, f"one routed {A} -> {C} transfer was created (via {B})"):
        return
    route = routes[0]
    cwallet = route["recipientAddress"]
    check(route["deadlineTimestamp"] <= xo["deadlineTimestamp"], "the routed transfer kept the EARLIER of the two deadlines")
    check(usdc_balance(bwallet) == 0.0, f"nothing is on the blockchain yet: the {B} recipient holds 0 USDC")
    # The routed recipient in C is a shared demo wallet that earlier runs already paid, so measure the
    # change in its balance. (That its payment came after the timer is checked on Horizon below.)
    c_before = usdc_balance(cwallet)

    say("\n5. Timers run out...")
    if fast:
        call("POST", f"/orders/{route['id']}/expire", token)
        call("POST", f"/orders/{x['id']}/expire", token)
    r_done = wait_until_paid(token, route["id"], route["deadlineTimestamp"], fast)
    x_done = wait_until_paid(token, x["id"], xo["deadlineTimestamp"], fast)

    say("\n6. Checking the results on the blockchain:")
    verify_settlement(f"the routed {A} -> {C} transfer (4 USD)", r_done, 4, 0, wallet, cwallet, fast)
    verify_settlement(f"the original order's own unmatched part (3 USD to {B})", x_done, 10, 7, wallet, bwallet, fast)
    c_gain = usdc_balance(cwallet) - c_before
    check(abs(c_gain - 4.0) < 1e-7, f"the {C} recipient received exactly 4 USDC", f"{c_before:g} -> {c_before + c_gain:g}")
    check(abs(usdc_balance(bwallet) - 3.0) < 1e-7, f"the {B} recipient holds exactly 3 USDC")


# ------------------------------------------------------------------------------ main
def run(args):
    say(f"Stellar testnet · contract {config.settlement_contract_id}\n")
    ok, trio = preflight()
    if not ok:
        say("\nFix the items marked FIX above, then run this again. Nothing was created or spent.")
        return 1
    if args.check:
        say("\nSetup looks good. Run without --check to run the real test.")
        return 0

    before = chain_call(chain.stats())
    say()
    scenario_matching(trio, args.fast)
    if args.routing:
        scenario_routing(trio, args.fast)

    after = chain_call(chain.stats())
    say(f"\nContract totals now: {after['settlements']} settlements, {after['settled_volume'] / UNIT:g} USDC settled on-chain "
        f"(+{(after['settled_volume'] - before['settled_volume']) / UNIT:g} USDC during this test), "
        f"{after['matched_volume'] / UNIT:g} USDC matched off-chain.")
    say("\n" + ("ALL CHECKS PASSED: verified on the Stellar testnet." if not failures else f"{len(failures)} CHECK(S) FAILED:\n  - " + "\n  - ".join(failures)))
    return 1 if failures else 0


def main():
    ap = argparse.ArgumentParser(description="Verify TwoWay on Stellar testnet")
    ap.add_argument("--routing", action="store_true", help="also test chain routing (about 4 more minutes)")
    ap.add_argument("--fast", action="store_true", help="close timers early instead of waiting for them")
    ap.add_argument("--check", action="store_true", help="only check the setup; creates and spends nothing")
    args = ap.parse_args()
    code = 1
    try:
        code = run(args)
    except KeyboardInterrupt:
        say("\nStopped.")
    finally:  # always close the network connections cleanly
        try:
            chain_call(chain.close())
        finally:
            loop.close()
            http.close()
    sys.exit(code)


if __name__ == "__main__":
    main()
