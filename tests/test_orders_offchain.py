"""Order placement + matching against an in-memory database (no network: wallets are inserted
directly, and nothing here reaches Soroban, just like matched volume in production)."""
import pytest
from stellar_sdk import Keypair

from backend.accounts import AccountService, encrypt, hash_token
from backend.db import open_db
from backend.errors import HttpError
from backend.orders import OrderService


def make_account(db, country: str, provider_id: str, details: dict, balance_minor: int):
    kp = Keypair.random()
    cur = db.execute(
        """INSERT INTO accounts (token_hash, display_name, country, currency, bank_provider_id, bank_details_json,
             bank_balance_minor, wallet_public, wallet_secret_enc, is_demo, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
        (hash_token(kp.public_key), f"Test {country}", country, "X", provider_id, "{}", 0, kp.public_key, encrypt(kp.secret), 0, 0),
    )
    db.execute(
        "INSERT INTO banks (account_id, provider_id, details_json, balance_minor, created_at) VALUES (?,?,?,?,0)",
        (cur.lastrowid, provider_id, __import__("json").dumps(details), balance_minor),
    )
    return db.execute("SELECT * FROM accounts WHERE id = ?", (cur.lastrowid,)).fetchone()


@pytest.fixture
def env():
    db = open_db(":memory:")
    accounts = AccountService(db)
    svc = OrderService(db, accounts)
    ca = make_account(db, "Canada", "ca-rbc", {"payerName": "Jane Doe", "transit": "12345", "institution": "003", "accountNumber": "1234567"}, 100_000)
    ke = make_account(db, "Kenya", "ke-mpesa", {"phone": "+254712345678", "payerName": "Amina Otieno"}, 10_000_000)
    return db, accounts, svc, ca, ke


def draft(frm, to, recipient, amount, minutes=30):
    return {"fromCountry": frm, "toCountry": to, "recipientAddress": recipient, "amount": amount,
            "deadlineMinutes": minutes, "remainderPolicy": "direct_stellar_fallback"}


def test_matched_part_is_netted_off_chain_and_debited_locally(env):
    db, accounts, svc, ca, ke = env
    svc.place_for_account(ca, draft("Canada", "Kenya", ke["wallet_public"], "10"))
    order, batches = svc.place_for_account(ke, draft("Kenya", "Canada", ca["wallet_public"], "4"))
    assert order["status"] == "settled" and order["matched_amount"] == 40_000_000
    assert batches[0]["totalUnits"] == 40_000_000
    first = db.execute("SELECT * FROM orders ORDER BY id LIMIT 1").fetchone()
    assert (first["status"], first["remaining_amount"]) == ("partially_matched", 60_000_000)
    # 4 USD at 1.392 CAD = CAD 5.57 debited from the RBC account; nothing on-chain yet.
    ca_bank = accounts.banks_of(ca["id"])[0]
    assert ca_bank["balance_minor"] == 100_000 - 557
    assert first["onramp_tx_hash"] is None and first["payout_tx_hash"] is None
    # The unmatched 6 USD (CAD 8.35) stays reserved, not spent.
    assert accounts.held_minor(ca_bank["id"]) == 835


def test_insufficient_balance_is_rejected_before_anything_is_stored(env):
    db, _, svc, ca, ke = env
    with pytest.raises(HttpError) as e:
        svc.place_for_account(ca, draft("Canada", "Kenya", ke["wallet_public"], "1000"))
    assert e.value.status == 422
    assert db.execute("SELECT COUNT(*) FROM orders").fetchone()[0] == 0


def test_cannot_send_from_another_country(env):
    _, _, svc, ca, ke = env
    with pytest.raises(HttpError) as e:
        svc.place_for_account(ca, draft("Kenya", "Canada", ke["wallet_public"], "1"))
    assert e.value.status == 400


def test_expired_orders_are_picked_up_and_direct_transfers_too(env):
    _, _, svc, ca, ke = env
    o, _ = svc.place_for_account(ca, draft("Canada", "Kenya", ke["wallet_public"], "1"))
    assert svc.expired_ids() == []
    svc.expire_now([o["id"]])
    assert svc.expired_ids() == [o["id"]]
    d, _ = svc.place_for_account(ca, {**draft("Canada", "Kenya", ke["wallet_public"], "1"), "deadlineMinutes": 1}, direct=True)
    assert svc.direct_ids() == [d["id"]]
