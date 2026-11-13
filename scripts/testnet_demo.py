"""End-to-end test on Stellar TESTNET, through the running app's API (start it first: `npm run dev`).

  .venv/bin/python scripts/testnet_demo.py        (or: npm run test:testnet)

What it does, with real testnet accounts and real USDC:
  1. Links a new Canadian sender and a new Kenyan recipient (Friendbot wallets + USDC trustlines).
  2. Sender places a 10 USD Canada -> Kenya "Transfer Matching" order.
  3. An anonymous Kenya -> Canada order (3 USD) matches part of it: settled locally, nothing on-chain.
  4. An anonymous Kenya -> Nigeria order (4 USD) chain-routes another part: the sender's 4 USD
     becomes a routed Canada -> Nigeria transfer.
  5. Checks that nothing has touched the chain yet.
  6. Closes both timers. Only the unmatched 3 USD (to Kenya) and the routed 4 USD (to Nigeria)
     go through the Soroban contract. Each payout is checked on Horizon and printed with a
     Stellar Expert link.
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


def bank(name):
    return {"payerName": name, "transit": "12345", "institution": "003", "accountNumber": "7654321"}


try:
    health = call("GET", "/health")
except httpx.ConnectError:
    sys.exit(f"Can't reach {API}. Start the app first: npm run dev")
cfg = call("GET", "/config")
print(f"Testnet ledger {health['latestLedger']}, settlement contract {cfg['settlementContractId']}")
print(f"   {EXPERT}/contract/{cfg['settlementContractId']}\n")

print("1. Linking a Canadian sender and a Kenyan recipient (creates two testnet wallets, ~10s)...")
sender = call("POST", "/accounts/link", json={"displayName": "Testnet Demo Sender", "country": "Canada",
              "bankProviderId": "ca-rbc", "bankDetails": bank("Testnet Demo Sender"), "startingBalance": 500})
recipient = call("POST", "/accounts/link", json={"displayName": "Testnet Demo Recipient", "country": "Kenya",
                 "bankProviderId": "ke-mpesa", "bankDetails": {"phone": "+254712345678", "payerName": "Testnet Demo Recipient"}})
token, wallet = sender["token"], sender["account"]["wallet"]["publicKey"]
kenya_wallet = recipient["account"]["wallet"]["publicKey"]
print(f"   sender wallet    {EXPERT}/account/{wallet}")
print(f"   recipient wallet {EXPERT}/account/{kenya_wallet}")

print("\n2. Sender places 10 USD Canada -> Kenya (Transfer Matching, 30 min timer)...")
x = call("POST", "/orders", token, json={"recipientName": "Testnet Demo Recipient", "recipientAddress": kenya_wallet,
         "fromCountry": "Canada", "toCountry": "Kenya", "fromFlag": "🇨🇦", "toFlag": "🇰🇪", "amount": "10",
         "deadlineMinutes": 30, "transferType": "matched_pool"})["order"]
print(f"   order {x['id']}: {x['status']}")

print("\n3. Anonymous Kenya -> Canada sender, 3 USD (opposite direction)...")
r = call("POST", "/demo/counterparty-order", json={"fromCountry": "Kenya", "toCountry": "Canada", "amount": "3", "deadlineMinutes": 30})
print(f"   matched: {[(b['settlementMethod'], b['totalVolumeNetted']) for b in r['batches']]}")

print("\n4. Anonymous Kenya -> Nigeria sender, 4 USD (onward: chain routing)...")
r = call("POST", "/demo/counterparty-order", json={"fromCountry": "Kenya", "toCountry": "Nigeria", "amount": "4", "deadlineMinutes": 20})
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
check(all(not o.get("fallbackTxHash") for o in [xo, *routes]), "nothing has been sent on-chain yet")
check(len(routes) == 1, "one routed Canada -> Nigeria leg was created")

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
print(f"\nSender's bank: CAD {me['banks'][0]['balance']:.2f} left of CAD 500.00 (10 USD ≈ CAD 13.92, each part rounded to the cent), "
      f"CAD {me['banks'][0]['held']:.2f} still held")
print("\nALL CHECKS PASSED" if not failures else f"\n{len(failures)} CHECK(S) FAILED: {failures}")
sys.exit(1 if failures else 0)
