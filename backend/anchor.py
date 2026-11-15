"""Cash-out through a real Stellar anchor (SEP-1, SEP-10, SEP-24).

When a transfer's unmatched remainder settles, the recipient's hidden wallet holds USDC. Cashing it out goes
through an anchor, a regulated business that converts USDC to local money:

  1. SEP-1:  read the anchor's stellar.toml for its endpoints and signing key.
  2. SEP-10: prove control of the wallet (sign the anchor's challenge, verified first) and get a session token.
  3. SEP-24: start an interactive withdrawal. The anchor returns a URL to ITS OWN web form, where the user
             enters their bank details and passes the anchor's checks. Tandem never sees those details.
  4. When the anchor is ready (status pending_user_transfer_start) it gives an account and memo; Tandem sends
     the USDC from the wallet with that memo (the user already approved it in the anchor's form).
  5. The anchor confirms the payment and pays out local money (status completed).

Default anchor: SDF's public reference anchor on Testnet (testanchor.stellar.org). Set ANCHOR_HOME_DOMAIN to
use another SEP-24 anchor that supports Circle USDC.
"""
from __future__ import annotations

import base64
import os
import time
from typing import Optional

import httpx
from stellar_sdk import Keypair, TransactionBuilder, TransactionEnvelope
from stellar_sdk.sep.stellar_toml import fetch_stellar_toml_async
from stellar_sdk.sep.stellar_web_authentication import read_challenge_transaction

from . import soroban as chain
from .config import config
from .errors import ChainError

HOME_DOMAIN = os.environ.get("ANCHOR_HOME_DOMAIN", "testanchor.stellar.org")
ASSET_CODE = "USDC"
FINAL = ("completed", "refunded", "expired", "error", "no_market", "too_small", "too_large")

_toml: dict = {"at": 0.0, "data": None}
_tokens: dict = {}  # wallet public key -> (jwt, expires_at)


class AnchorError(ChainError):
    pass


async def info() -> dict:
    """SEP-1: the anchor's stellar.toml (cached for 10 minutes)."""
    if _toml["data"] is None or time.time() - _toml["at"] > 600:
        try:
            _toml["data"] = await fetch_stellar_toml_async(HOME_DOMAIN)
        except Exception as e:  # noqa: BLE001
            raise AnchorError(f"Could not read {HOME_DOMAIN}'s stellar.toml: {e}") from e
        _toml["at"] = time.time()
    t = _toml["data"]
    for key in ("WEB_AUTH_ENDPOINT", "SIGNING_KEY", "TRANSFER_SERVER_SEP0024"):
        if not t.get(key):
            raise AnchorError(f"{HOME_DOMAIN} does not offer SEP-24 cash-outs (no {key} in its stellar.toml).")
    return t


def _usdc_listed(t: dict) -> bool:
    return any(c.get("code") == ASSET_CODE and c.get("issuer") == config.usdc_issuer for c in t.get("CURRENCIES", []))


async def summary() -> dict:
    """What the app shows about the connected anchor: name, limits, supported SEPs."""
    t = await info()
    async with httpx.AsyncClient(timeout=20) as http:
        r = await http.get(f"{t['TRANSFER_SERVER_SEP0024']}/info")
        r.raise_for_status()
        w = (r.json().get("withdraw") or {}).get(ASSET_CODE) or {}
    seps = [n for n, k in (("SEP-6", "TRANSFER_SERVER"), ("SEP-10", "WEB_AUTH_ENDPOINT"), ("SEP-12", "KYC_SERVER"),
                           ("SEP-24", "TRANSFER_SERVER_SEP0024"), ("SEP-31", "DIRECT_PAYMENT_SERVER"), ("SEP-38", "ANCHOR_QUOTE_SERVER")) if t.get(k)]
    doc = t.get("DOCUMENTATION") or {}
    return {
        "homeDomain": HOME_DOMAIN,
        "name": doc.get("ORG_NAME") or HOME_DOMAIN,
        "network": "testnet" if "Test" in (t.get("NETWORK_PASSPHRASE") or "") else "public",
        "seps": seps,
        "usdcSupported": _usdc_listed(t) and bool(w.get("enabled")),
        "minAmount": w.get("min_amount"),
        "maxAmount": w.get("max_amount"),
    }


async def _token(kp: Keypair) -> str:
    """SEP-10: sign the anchor's challenge (after verifying it is genuine) and return a session JWT."""
    cached = _tokens.get(kp.public_key)
    if cached and cached[1] > time.time() + 60:
        return cached[0]
    t = await info()
    async with httpx.AsyncClient(timeout=30) as http:
        r = await http.get(t["WEB_AUTH_ENDPOINT"], params={"account": kp.public_key, "home_domain": HOME_DOMAIN})
        r.raise_for_status()
        challenge = r.json()["transaction"]
        web_auth_domain = httpx.URL(t["WEB_AUTH_ENDPOINT"]).host
        # Refuses a challenge that isn't signed by the anchor's SIGNING_KEY or isn't for this domain.
        read_challenge_transaction(challenge, t["SIGNING_KEY"], HOME_DOMAIN, web_auth_domain, config.network_passphrase)
        env = TransactionEnvelope.from_xdr(challenge, config.network_passphrase)
        env.sign(kp)
        r = await http.post(t["WEB_AUTH_ENDPOINT"], json={"transaction": env.to_xdr()})
        if r.status_code >= 400:
            raise AnchorError(f"The anchor refused the sign-in ({r.status_code}): {r.text[:200]}")
        token = r.json()["token"]
    _tokens[kp.public_key] = (token, time.time() + 23 * 3600)
    return token


async def start_withdrawal(kp: Keypair, amount: str) -> dict:
    """SEP-24: start an interactive USDC withdrawal; returns {id, url} (url = the anchor's own form)."""
    t = await info()
    jwt = await _token(kp)
    async with httpx.AsyncClient(timeout=30) as http:
        r = await http.post(
            f"{t['TRANSFER_SERVER_SEP0024']}/transactions/withdraw/interactive",
            headers={"Authorization": f"Bearer {jwt}"},
            json={"asset_code": ASSET_CODE, "asset_issuer": config.usdc_issuer, "account": kp.public_key, "amount": amount, "lang": "en"},
        )
    if r.status_code >= 400:
        raise AnchorError(f"The anchor could not start the withdrawal ({r.status_code}): {r.text[:200]}")
    body = r.json()
    return {"id": body["id"], "url": body["url"]}


async def transaction(kp: Keypair, anchor_tx_id: str) -> dict:
    """SEP-24: the anchor's view of one withdrawal (status, payment instructions, amounts)."""
    t = await info()
    jwt = await _token(kp)
    async with httpx.AsyncClient(timeout=30) as http:
        r = await http.get(f"{t['TRANSFER_SERVER_SEP0024']}/transaction", headers={"Authorization": f"Bearer {jwt}"}, params={"id": anchor_tx_id})
    if r.status_code >= 400:
        raise AnchorError(f"Could not read the withdrawal from the anchor ({r.status_code}).")
    return r.json()["transaction"]


async def pay(kp: Keypair, tx: dict) -> dict:
    """Send the USDC the anchor asked for, to its account, with its memo (classic payment)."""
    dest, memo, memo_type, amount = tx.get("withdraw_anchor_account"), tx.get("withdraw_memo"), tx.get("withdraw_memo_type"), tx.get("amount_in")
    if not dest or not amount:
        raise AnchorError("The anchor has not given payment instructions yet.")

    def build(b: TransactionBuilder) -> None:
        b.append_payment_op(dest, chain.USDC_ASSET, amount)
        if memo:
            if memo_type == "hash":
                b.add_hash_memo(base64.b64decode(memo))
            elif memo_type == "id":
                b.add_id_memo(int(memo))
            else:
                b.add_text_memo(memo)

    return await chain._send_classic(kp, build)


def is_final(status: Optional[str]) -> bool:
    return status in FINAL
