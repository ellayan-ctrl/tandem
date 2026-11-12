"""Order placement + matching against an in-memory database (no network: wallets are inserted
directly, and nothing here reaches Soroban, just like matched volume in production)."""
import pytest
from stellar_sdk import Keypair

from backend.accounts import AccountService, encrypt, hash_token
from backend.db import open_db
from backend.errors import HttpError
from backend.amounts import now_ms
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


@pytest.fixture
def three():
    """Accounts in Canada, Kenya and Nigeria."""
    db, accounts, svc, ca, ke = _env()
    ng = make_account(db, "Nigeria", "ng-gtbank", {"payerName": "Chidi Okafor", "accountNumber": "0123456789"}, 10_000_000)
    return db, accounts, svc, ca, ke, ng


def _env():
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


# ------------------------------------------------------------------ chain routing


def test_chain_creates_one_routed_leg_and_pays_the_middle_locally(three):
    db, accounts, svc, ca, ke, ng = three
    x, _ = svc.place_for_account(ca, draft("Canada", "Kenya", ke["wallet_public"], "10"))
    y, batches = svc.place_for_account(ke, draft("Kenya", "Nigeria", ng["wallet_public"], "6"))

    assert [b["method"] for b in batches] == ["chain_routing"]
    x, y = svc.get(x["id"]), svc.get(y["id"])
    assert (x["status"], x["matched_amount"], x["remaining_amount"]) == ("partially_matched", 60_000_000, 40_000_000)
    assert (y["status"], y["remaining_amount"]) == ("settled", 0)

    route = db.execute("SELECT * FROM orders WHERE transfer_type = 'routed'").fetchone()
    assert (route["from_country"], route["to_country"], route["route_via"]) == ("Canada", "Nigeria", "Kenya")
    assert route["amount"] == 60_000_000 and route["status"] == "open"
    # Sent by the Canadian sender's wallet to the Nigerian recipient, funded by the Canadian's methods.
    assert route["sender_address"] == ca["wallet_public"] and route["recipient_address"] == ng["wallet_public"]
    assert (route["bank_id"], route["remainder_bank_id"]) == (x["bank_id"], x["remainder_bank_id"])
    # The routed leg keeps the EARLIER deadline of the two orders.
    assert route["deadline_at"] == min(x["deadline_at"], y["deadline_at"])

    # The Kenyan sender paid 6 USD locally (KES 777); the Canadian has not been charged yet...
    assert accounts.banks_of(ke["id"])[0]["balance_minor"] == 10_000_000 - 77_700
    ca_bank = accounts.banks_of(ca["id"])[0]
    assert ca_bank["balance_minor"] == 100_000
    # ...but still has the full 10 USD reserved: 4 on the original order + 6 on the routed leg.
    assert accounts.held_minor(ca_bank["id"]) == 1_392
    # Nothing has touched the chain.
    assert route["onramp_tx_hash"] is None and route["payout_tx_hash"] is None


def test_a_full_cycle_settles_entirely_off_chain(three):
    db, accounts, svc, ca, ke, ng = three
    svc.place_for_account(ca, draft("Canada", "Kenya", ke["wallet_public"], "5"))
    svc.place_for_account(ke, draft("Kenya", "Nigeria", ng["wallet_public"], "5"))
    # The routed leg Canada -> Nigeria now meets a Nigeria -> Canada order: the loop closes.
    z, batches = svc.place_for_account(ng, draft("Nigeria", "Canada", ca["wallet_public"], "5"))

    assert z["status"] == "settled"
    statuses = {r["transfer_type"] + ":" + r["status"] for r in db.execute("SELECT * FROM orders")}
    assert statuses == {"matched_pool:settled", "routed:settled"}
    assert svc.expired_ids() == [] and svc.direct_ids() == []
    # Every sender paid exactly 5 USD locally; nobody has anything left reserved or on-chain.
    assert accounts.banks_of(ca["id"])[0]["balance_minor"] == 100_000 - 696
    assert accounts.banks_of(ke["id"])[0]["balance_minor"] == 10_000_000 - 64_750
    assert accounts.banks_of(ng["id"])[0]["balance_minor"] == 10_000_000 - 740_000
    assert all(accounts.held_minor(b["id"]) == 0 for a in (ca, ke, ng) for b in accounts.banks_of(a["id"]))


def test_unmatched_routed_leg_settles_on_chain_at_its_own_expiry(three):
    db, _, svc, ca, ke, ng = three
    svc.place_for_account(ca, draft("Canada", "Kenya", ke["wallet_public"], "5", minutes=30))
    svc.place_for_account(ke, draft("Kenya", "Nigeria", ng["wallet_public"], "5", minutes=10))
    route = db.execute("SELECT * FROM orders WHERE transfer_type = 'routed'").fetchone()
    assert svc.expired_ids() == []
    svc.expire_now([route["id"]])
    assert svc.expired_ids() == [route["id"]]  # the worker would now settle it via settle_remainder


def test_no_chain_when_a_timer_is_nearly_out(three):
    db, _, svc, ca, ke, ng = three
    x, _ = svc.place_for_account(ca, draft("Canada", "Kenya", ke["wallet_public"], "5"))
    db.execute("UPDATE orders SET deadline_at = ? WHERE id = ?", (now_ms() + 20_000, x["id"]))
    _, batches = svc.place_for_account(ke, draft("Kenya", "Nigeria", ng["wallet_public"], "5"))
    assert batches == []
    assert db.execute("SELECT COUNT(*) FROM orders WHERE transfer_type = 'routed'").fetchone()[0] == 0


def test_bilateral_is_preferred_over_chains(three):
    db, _, svc, ca, ke, ng = three
    svc.place_for_account(ke, draft("Kenya", "Canada", ca["wallet_public"], "5"))
    svc.place_for_account(ke, draft("Kenya", "Nigeria", ng["wallet_public"], "5"))
    _, batches = svc.place_for_account(ca, draft("Canada", "Kenya", ke["wallet_public"], "5"))
    assert [b["method"] for b in batches] == ["offchain_netting"]
    assert db.execute("SELECT COUNT(*) FROM orders WHERE transfer_type = 'routed'").fetchone()[0] == 0
