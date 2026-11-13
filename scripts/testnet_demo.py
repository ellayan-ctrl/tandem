"""End-to-end test on Stellar TESTNET, through the running app's API (start it first: `npm run dev`).

  .venv/bin/python scripts/testnet_demo.py        (or: npm run test:testnet)

What it does, with real testnet accounts and real USDC, for three countries A -> B -> C:
  1. Links a new sender in A and a new recipient in B (Friendbot wallets + USDC trustlines).
  2. The sender places a 10 USD A -> B "Transfer Matching" order.
  3. An anonymous B -> A order (3 USD) matches part of it: settled locally, nothing on-chain.
  4. An anonymous B -> C order (4 USD) chain-routes another part: the sender's 4 USD becomes a
     routed A -> C transfer.
  5. Checks that nothing has touched the chain yet.
  6. Closes both timers. Only the unmatched 3 USD (to B) and the routed 4 USD (to C) go through
     the Soroban contract. Each payout is checked on Horizon and printed with a Stellar Expert link.

Matching is first-in-first-out, so orders already sitting in the book (yours, from using the app)
would be matched first and distort the result. The test therefore picks a set of three countries
with no open orders, and never touches anything that is already there.
"""
from __future__ import annotations

import os
import sys
import time

import httpx

API = os.environ.get("TWOWAY_URL", "http://localhost:3000") + "/api"
HORIZON = "https://horizon-testnet.stellar.org"
EXPERT = "https://stellar.expert/explorer/testnet"
http = httpx.Client(timeout=180)
failures = []

# (A, B, C): A and B need a payment method the test can link; C only needs a demo account.
TRIOS = [("Canada", "Kenya", "Nigeria"), ("United States", "Philippines", "Argentina")]
SENDER_BANK = {
    "Canada": ("ca-rbc", {"transit": "12345", "institution": "003", "accountNumber": "7654321"}),
    "United States": ("us-chase", {"routing": "021000021", "accountNumber": "123456789"}),
}
RECIPIENT_BANK = {
    "Kenya": ("ke-mpesa", {"phone": "+254712345678"}),
    "Philippines": ("ph-bdo", {"accountNumber": "1234567890"}),
}
FLAGS = {"Canada": "🇨🇦", "Kenya": "🇰🇪", "Nigeria": "🇳🇬", "United States": "🇺🇸", "Philippines": "🇵🇭", "Argentina": "🇦🇷"}


def call(method, path, token=None, **kw):
    r = http.request(method, API + path, headers={"x-account-token": token} if token else {}, **kw)
    if r.status_code >= 400:
        sys.exit(f"{method} {path} failed: {r.status_code} {r.text}")
    return r.json()


def check(ok, label):
    print(f"   {'PASS' if ok else 'FAIL'}  {label}")
    if not ok:
        failures.append(label)


def order(token, oid):
    return next(o for o in call("GET", "/orders", token) if o["id"] == oid)


def wait_settled(token, oid):
    for _ in range(120):
        o = order(token, oid)
        if o["status"] not in ("open", "partially_matched", "payout_pending"):
            return o
        time.sleep(2)
    return o


def usdc_moves(tx_hash):
    effects = http.get(f"{HORIZON}/transactions/{tx_hash}/effects", params={"limit": 50}).json()["_embedded"]["records"]
    return [(e["type"], e["account"], e["amount"]) for e in effects
            if e["type"] in ("account_credited", "account_debited") and e.get("asset_code") == "USDC"]


def link(name, country, provider, extra, balance=500):
    details = {"payerName": name, **extra}
    return call("POST", "/accounts/link", json={"displayName": name, "country": country, "bankProviderId": provider,
                "bankDetails": details, "startingBalance": balance})


try:
    health = call("GET", "/health")
except httpx.ConnectError:
    sys.exit(f"Can't reach {API}. Start the app first: npm run dev")
cfg = call("GET", "/config")
print(f"Testnet ledger {health['latestLedger']}, settlement contract {cfg['settlementContractId']}")
print(f"   {EXPERT}/contract/{cfg['settlementContractId']}\n")

# Pick three countries nobody is waiting in, so first-in-first-out can't match someone else's orders.
busy = {c for o in call("GET", "/orders") if o["status"] in ("open", "partially_matched") for c in (o["fromCountry"], o["toCountry"])}
trio = next((t for t in TRIOS if not busy & set(t)), None)
if not trio:
    sys.exit(f"Every test country set has open orders ({sorted(busy)}). Let them expire or resolve them, then run again.")
A, B, C = trio
fa, fb, fc = FLAGS[A], FLAGS[B], FLAGS[C]
if busy:
    print(f"Open orders already exist in {sorted(busy)}; testing with {A} -> {B} -> {C} so they aren't touched.\n")

print(f"1. Linking a sender in {A} and a recipient in {B} (creates two testnet wallets, ~10s)...")
sp, sx = SENDER_BANK[A]
rp, rx = RECIPIENT_BANK[B]
sender = link("Testnet Demo Sender", A, sp, sx)
recipient = link("Testnet Demo Recipient", B, rp, rx)
token, wallet = sender["token"], sender["account"]["wallet"]["publicKey"]
b_wallet = recipient["account"]["wallet"]["publicKey"]
print(f"   sender wallet    {EXPERT}/account/{wallet}")
print(f"   recipient wallet {EXPERT}/account/{b_wallet}")

print(f"\n2. Sender places 10 USD {A} -> {B} (Transfer Matching, 30 min timer)...")
x = call("POST", "/orders", token, json={"recipientName": "Testnet Demo Recipient", "recipientAddress": b_wallet,
         "fromCountry": A, "toCountry": B, "fromFlag": fa, "toFlag": fb, "amount": "10",
         "deadlineMinutes": 30, "transferType": "matched_pool"})["order"]
print(f"   order {x['id']}: {x['status']}")

print(f"\n3. Anonymous {B} -> {A} sender, 3 USD (opposite direction)...")
r = call("POST", "/demo/counterparty-order", json={"fromCountry": B, "toCountry": A, "fromFlag": fb, "toFlag": fa, "amount": "3", "deadlineMinutes": 30})
print(f"   matched: {[(b['settlementMethod'], b['totalVolumeNetted']) for b in r['batches']]}")

print(f"\n4. Anonymous {B} -> {C} sender, 4 USD (onward: chain routing)...")
r = call("POST", "/demo/counterparty-order", json={"fromCountry": B, "toCountry": C, "fromFlag": fb, "toFlag": fc, "amount": "4", "deadlineMinutes": 20})
print(f"   matched: {[(b['settlementMethod'], b['corridorId'], b['totalVolumeNetted']) for b in r['batches']]}")

mine = call("GET", "/orders", token)
xo = next(o for o in mine if o["id"] == x["id"])
routes = [o for o in mine if o["transferType"] == "routed" and o["senderAddress"] == wallet]
print(f"   your order: matched {xo['matchedAmount']}, still unmatched {xo['remainingAmount']}")
for h in xo["matchHistory"]:
    print(f"     - {h['amount']} via {h['settlementMethod']} ({h['funding']['status'] if h.get('funding') else ''})")
for rt in routes:
    print(f"   routed leg {rt['id']}: {rt['fromCountry']} -> {rt['toCountry']} via {rt['routeVia']}, {rt['amount']} USD")

print("\n5. Before any timer runs out:")
check(abs(xo["matchedAmount"] - 7.0) < 1e-7, "7 of the 10 USD matched (3 opposite + 4 routed)")
check(len(routes) == 1 and routes[0]["toCountry"] == C, f"one routed {A} -> {C} leg was created")
check(all(not o.get("fallbackTxHash") for o in [xo, *routes]), "nothing has been sent on-chain yet")

print("\n6. Closing the timers (the server now converts only the unmatched amounts to USDC and pays via Soroban)...")
for o in [*routes, xo]:
    call("POST", f"/orders/{o['id']}/expire", token)
for o in [*routes, xo]:
    done = wait_settled(token, o["id"])
    label = f"{done['fromCountry']} -> {done['toCountry']}"
    if not done.get("fallbackTxHash"):
        check(False, f"{label}: payout ({done['status']}: {done.get('payoutError')})")
        continue
    moves = usdc_moves(done["fallbackTxHash"])
    sent = [m for m in moves if m[0] == "account_credited" and m[1] == done["recipientAddress"]]
    print(f"   {label}: {done['payoutAmount']} USDC  {EXPERT}/tx/{done['fallbackTxHash']}")
    check(len(sent) == 1 and abs(float(sent[0][2]) - o["remainingAmount"]) < 1e-7,
          f"{label}: Horizon shows exactly the unmatched {o['remainingAmount']} USDC reached the recipient")

me = call("GET", "/accounts/me", token)
print(f"\nSender's account: {me['currency']} {me['banks'][0]['balance']:.2f} left of 500.00 "
      f"(10 USD at the demo FX rate, each part rounded to the cent), {me['banks'][0]['held']:.2f} still held")
print("\nALL CHECKS PASSED" if not failures else f"\n{len(failures)} CHECK(S) FAILED: {failures}")
sys.exit(1 if failures else 0)
