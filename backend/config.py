"""Runtime configuration, read from .env.local / .env (written by scripts/deploy-contract.sh)."""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from stellar_sdk import Keypair, Network

ROOT = Path(__file__).resolve().parent.parent
# .env.local wins over .env (load_dotenv never overrides a variable that is already set).
load_dotenv(ROOT / ".env.local")
load_dotenv(ROOT / ".env")


def _required(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(
            f"{name} is not set. Run scripts/deploy-contract.sh to deploy the contract and write .env.local."
        )
    return value


@dataclass(frozen=True)
class Config:
    port: int
    api_port: int
    db_path: str
    rpc_url: str
    network_passphrase: str
    operator: Keypair
    settlement_contract_id: str
    usdc_contract_id: str
    # Circle testnet USDC (classic asset behind the SAC).
    usdc_issuer: str
    # Holds testnet USDC and stands in for the bank -> USDC on-ramp: it funds a user's invisible
    # wallet with exactly the unmatched remainder at settlement time (scripts/setup_treasury.py).
    treasury: Optional[Keypair]
    # Conservative ledger close time used to convert deadlines to ledgers.
    seconds_per_ledger: int
    worker_interval_s: float


def load() -> Config:
    treasury_secret = os.environ.get("TREASURY_SECRET")
    db_path = os.environ.get("DB_PATH", "data/twoway.db")
    return Config(
        port=int(os.environ.get("PORT", 3000)),
        api_port=int(os.environ.get("API_PORT", 8000)),
        db_path=db_path if db_path == ":memory:" or os.path.isabs(db_path) else str(ROOT / db_path),
        rpc_url=os.environ.get("SOROBAN_RPC_URL", "https://soroban-testnet.stellar.org"),
        network_passphrase=Network.TESTNET_NETWORK_PASSPHRASE,
        operator=Keypair.from_secret(_required("OPERATOR_SECRET")),
        settlement_contract_id=_required("SETTLEMENT_CONTRACT_ID"),
        usdc_contract_id=_required("USDC_CONTRACT_ID"),
        usdc_issuer="GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
        treasury=Keypair.from_secret(treasury_secret) if treasury_secret else None,
        seconds_per_ledger=5,
        worker_interval_s=5.0,
    )


config = load()
