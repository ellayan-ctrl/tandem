"""Create (or top up) the testnet TREASURY account that stands in for the bank -> USDC on-ramp:
when an order's unmatched remainder settles, the treasury sends that much testnet USDC into the
user's invisible wallet, which then pays the recipient via the Soroban contract.

  .venv/bin/python scripts/setup_treasury.py [target_usdc=3000]

Writes TREASURY_SECRET to .env.local on first run.
"""
from __future__ import annotations

import math
import re
import sys
from decimal import Decimal
from pathlib import Path

import httpx
from stellar_sdk import Asset, Keypair, Network, Server, TransactionBuilder
from stellar_sdk.exceptions import NotFoundError

HORIZON = Server("https://horizon-testnet.stellar.org")
USDC = Asset("USDC", "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5")
ENV = Path(__file__).resolve().parent.parent / ".env.local"


def usdc_balance(account: dict):
    for b in account["balances"]:
        if b.get("asset_code") == "USDC" and b.get("asset_issuer") == USDC.issuer:
            return Decimal(b["balance"])
    return None


def submit(treasury: Keypair, add_op) -> None:
    source = HORIZON.load_account(treasury.public_key)
    b = TransactionBuilder(source, Network.TESTNET_NETWORK_PASSPHRASE, base_fee=1000).set_timeout(60)
    add_op(b)
    tx = b.build()
    tx.sign(treasury)
    HORIZON.submit_transaction(tx)


def main() -> None:
    target = Decimal(sys.argv[1]) if len(sys.argv) > 1 else Decimal(3000)
    env_text = ENV.read_text() if ENV.exists() else ""
    m = re.search(r"^TREASURY_SECRET=(S[A-Z2-7]{55})$", env_text, re.M)
    treasury = Keypair.from_secret(m.group(1)) if m else Keypair.random()
    if not m:
        sep = "" if not env_text or env_text.endswith("\n") else "\n"
        ENV.write_text(f"{env_text}{sep}TREASURY_SECRET={treasury.secret}\n")
    print(f"Treasury {treasury.public_key} ({'existing' if m else 'new, saved to .env.local'})")

    try:
        account = HORIZON.accounts().account_id(treasury.public_key).call()
    except NotFoundError:
        r = httpx.get("https://friendbot.stellar.org", params={"addr": treasury.public_key}, timeout=30)
        r.raise_for_status()
        account = HORIZON.accounts().account_id(treasury.public_key).call()
        print("Funded with Friendbot XLM")

    if usdc_balance(account) is None:
        submit(treasury, lambda b: b.append_change_trust_op(USDC))
        account = HORIZON.accounts().account_id(treasury.public_key).call()
        print("Added USDC trustline")

    remaining = max(Decimal(0), target - usdc_balance(account))
    # Swap in chunks so a thin order book doesn't fail the whole top-up.
    while remaining > Decimal("0.5"):
        chunk = min(Decimal(500), remaining)
        submit(
            treasury,
            lambda b, c=chunk: b.append_path_payment_strict_receive_op(
                destination=treasury.public_key,
                send_asset=Asset.native(),
                send_max=str(math.ceil(c * Decimal("1.6"))),
                dest_asset=USDC,
                dest_amount=f"{c:.7f}",
                path=[],
            ),
        )
        remaining -= chunk
        print(f"Swapped XLM -> {chunk} USDC")

    account = HORIZON.accounts().account_id(treasury.public_key).call()
    print(f"Treasury USDC balance: {usdc_balance(account)}")


if __name__ == "__main__":
    main()
