"""Thin Stellar / Soroban RPC client for the on-chain touchpoints, all at a window's expiry:
  1. On-ramp: the treasury sends the unmatched amount of testnet USDC to the user's invisible wallet.
  2. The invisible wallet approves the settlement contract for exactly that amount (SEP-41 approve).
  3. The operator calls `settle_remainder` on the settlement contract. The contract itself checks
     that the window has closed (ledger time >= deadline) and that remainder = total - matched,
     records the settlement, and pulls exactly the remainder to the recipient.
"""
from __future__ import annotations

import asyncio
import re
import time
from typing import Callable, Optional

import httpx
from stellar_sdk import Asset, Keypair, SorobanServerAsync, TransactionBuilder, TransactionEnvelope, scval
from stellar_sdk.exceptions import AccountNotFoundException, PrepareTransactionException
from stellar_sdk.soroban_rpc import GetTransactionStatus, SendTransactionStatus

from .config import config
from .errors import ChainError

_server: Optional[SorobanServerAsync] = None


def server() -> SorobanServerAsync:
    # Created lazily so it binds to the running event loop.
    global _server
    if _server is None:
        _server = SorobanServerAsync(config.rpc_url)
    return _server


async def close() -> None:
    global _server
    if _server is not None:
        await _server.close()
        _server = None


CONTRACT_ERRORS = {"#1": "InvalidAmount", "#2": "AlreadyPaid", "#3": "SameAccount", "#4": "TooEarly", "#5": "Paused"}
USDC_ASSET = Asset("USDC", config.usdc_issuer)


def _explain_sim_error(raw: str, contract_id: Optional[str] = None) -> ChainError:
    m = re.search(r"Error\(Contract, (#\d+)\)", raw)
    # Simulation errors don't always name the contract, so also trust the contract we invoked.
    if m and (contract_id == config.settlement_contract_id or config.settlement_contract_id in raw):
        name = CONTRACT_ERRORS.get(m.group(1), m.group(1))
        return ChainError(f"Settlement contract rejected the call: {name}", name)
    if re.search(r"trustline|TrustlineMissing|#13", raw):
        return ChainError("Recipient account has no USDC trustline (or is not funded).", "NoTrustline")
    if re.search(r"allowance|#9|InsufficientAllowance", raw, re.I):
        return ChainError("Sender pre-authorization (allowance) is insufficient or expired.", "InsufficientAllowance")
    if re.search(r"balance|#10", raw, re.I):
        return ChainError("Sender USDC balance is insufficient.", "InsufficientBalance")
    return ChainError(f"Simulation failed: {raw.splitlines()[0][:300] if raw else 'unknown error'}")


def _i128(units: int):
    return scval.to_int128(units)


def _addr(a: str):
    return scval.to_address(a)


def _u64(v: int):
    return scval.to_uint64(v)


async def _simulate_read(contract_id: str, method: str, *args):
    source = await server().load_account(config.operator.public_key)
    tx = (
        TransactionBuilder(source, config.network_passphrase, base_fee=100)
        .append_invoke_contract_function_op(contract_id, method, list(args))
        .set_timeout(30)
        .build()
    )
    sim = await server().simulate_transaction(tx)
    if sim.error:
        raise _explain_sim_error(sim.error, contract_id)
    if not sim.results:
        return None
    return scval.to_native(sim.results[0].xdr)


async def latest_ledger() -> int:
    return (await server().get_latest_ledger()).sequence


async def latest_ledger_time() -> int:
    """Close time (unix seconds) of the latest ledger: the only clock a contract can see."""
    seq = await latest_ledger()
    res = await server().get_ledgers(start_ledger=seq, limit=1)
    return int(res.ledgers[0].ledger_close_time)


async def wait_for_ledger_time(unix_s: int, timeout_s: float = 90) -> None:
    """Block until the ledger clock reaches `unix_s`. Ledgers close every ~5s, so the ledger
    clock trails wall time slightly; the contract refuses settlement before the deadline."""
    deadline = time.monotonic() + timeout_s
    while await latest_ledger_time() < unix_s:
        if time.monotonic() > deadline:
            raise ChainError("Ledger clock has not reached the order deadline yet.", "TooEarly")
        await asyncio.sleep(2)


async def usdc_balance(account: str) -> int:
    """USDC balance in integer units (7 decimals)."""
    return int(await _simulate_read(config.usdc_contract_id, "balance", _addr(account)))


async def paid_amount(onchain_id: int) -> Optional[int]:
    """What the contract recorded as paid for an order id, or None if unpaid."""
    v = await _simulate_read(config.settlement_contract_id, "paid_amount", _u64(onchain_id))
    return None if v is None else int(v)


async def settlement(onchain_id: int) -> Optional[dict]:
    """The contract's settlement record for an order id (total, matched, remainder, deadline, ...)."""
    return await _simulate_read(config.settlement_contract_id, "settlement", _u64(onchain_id))


async def _prepare(source: str, contract_id: str, method: str, args: list) -> TransactionEnvelope:
    account = await server().load_account(source)
    tx = (
        TransactionBuilder(account, config.network_passphrase, base_fee=100)
        .append_invoke_contract_function_op(contract_id, method, args)
        .set_timeout(300)
        .build()
    )
    try:
        return await server().prepare_transaction(tx)
    except PrepareTransactionException as e:
        raise _explain_sim_error(str(e.simulate_transaction_response.error or e), contract_id) from e


async def submit_and_wait(tx: TransactionEnvelope) -> dict:
    """Submit a signed tx and wait for it to land. Returns {hash, ledger}; raises on failure."""
    sent = await server().send_transaction(tx)
    if sent.status in (SendTransactionStatus.ERROR, SendTransactionStatus.TRY_AGAIN_LATER):
        detail = (sent.error_result_xdr or sent.status.value)[:200]
        raise ChainError(f"Transaction rejected by network: {detail}")
    return await wait_for(sent.hash)


async def tx_landed(tx_hash: str) -> bool:
    """One-shot status lookup (no waiting)."""
    res = await server().get_transaction(tx_hash)
    return res.status == GetTransactionStatus.SUCCESS


async def wait_for(tx_hash: str, timeout_s: float = 60) -> dict:
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        res = await server().get_transaction(tx_hash)
        if res.status == GetTransactionStatus.SUCCESS:
            return {"hash": tx_hash, "ledger": res.ledger}
        if res.status == GetTransactionStatus.FAILED:
            raise ChainError(f"Transaction {tx_hash} failed on-chain.")
        await asyncio.sleep(1)
    raise ChainError(f"Timed out waiting for transaction {tx_hash}.", "Timeout")


async def settle_remainder(
    onchain_id: int,
    from_: str,
    to: str,
    total_units: int,
    matched_units: int,
    deadline_s: int,
    on_signed: Callable[[str], None],
) -> dict:
    """Operator-signed settlement of an expired order's unmatched remainder.
    The contract verifies the deadline and that remainder = total - matched, and moves only the
    remainder. `on_signed` receives the tx hash before submission so the caller can persist it
    (crash recovery can then look the tx up instead of paying twice; the contract also rejects a
    second settlement for the same order id)."""
    tx = await _prepare(
        config.operator.public_key,
        config.settlement_contract_id,
        "settle_remainder",
        [_u64(onchain_id), _addr(from_), _addr(to), _i128(total_units), _i128(matched_units), scval.to_uint64(deadline_s)],
    )
    tx.sign(config.operator)
    on_signed(tx.hash_hex())
    return await submit_and_wait(tx)


async def approve_with_key(keypair: Keypair, amount_units: int, expiration_ledger: int) -> dict:
    """SEP-41 approve(owner, settlement contract, amount, expiration) signed by a server-held key."""
    tx = await _prepare(
        keypair.public_key,
        config.usdc_contract_id,
        "approve",
        [_addr(keypair.public_key), _addr(config.settlement_contract_id), _i128(amount_units), scval.to_uint32(expiration_ledger)],
    )
    tx.sign(keypair)
    return await submit_and_wait(tx)


# ------------------------------------------------------------ invisible wallets & on-ramp


async def _send_classic(source: Keypair, add_ops: Callable[[TransactionBuilder], None]) -> dict:
    account = await server().load_account(source.public_key)
    b = TransactionBuilder(account, config.network_passphrase, base_fee=1000).set_timeout(120)
    add_ops(b)
    tx = b.build()
    tx.sign(source)
    return await submit_and_wait(tx)


async def create_wallet_on_chain(kp: Keypair) -> None:
    """Create a new invisible wallet on testnet: Friendbot XLM (fees/reserves) + a USDC trustline."""
    async with httpx.AsyncClient(timeout=30) as http:
        res = await http.get("https://friendbot.stellar.org", params={"addr": kp.public_key})
    if res.status_code >= 400:
        raise ChainError(f"Friendbot could not fund the new wallet ({res.status_code}).")
    for _ in range(20):
        try:
            await server().load_account(kp.public_key)
            break
        except AccountNotFoundException:
            await asyncio.sleep(1)
    await _send_classic(kp, lambda b: b.append_change_trust_op(USDC_ASSET))


async def pay_usdc(from_: Keypair, to: str, units: int) -> dict:
    """Classic USDC payment (the treasury -> invisible wallet on-ramp)."""
    whole, frac = divmod(units, 10**7)
    amount = f"{whole}.{frac:07d}"
    return await _send_classic(from_, lambda b: b.append_payment_op(to, USDC_ASSET, amount))
