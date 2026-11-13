"""Matching windows under a minute: 15 seconds .. 7 days, in whole seconds."""
import pytest

from backend.errors import HttpError
from tests.test_orders_offchain import _env, draft, make_account


def test_a_30_second_window_closes_30_seconds_after_placing():
    _, _, svc, ca, ke = _env()
    o, _ = svc.place_for_account(ca, draft("Canada", "Kenya", ke["wallet_public"], "1", minutes=0.5))
    o = svc.get(o["id"])
    assert o["deadline_at"] - o["created_at"] == 30_000
    assert o["deadline_minutes"] == 0.5


@pytest.mark.parametrize("minutes", [0.25, 0.75, 1, 90, 10080])
def test_accepts_whole_seconds_from_15_seconds_to_7_days(minutes):
    _, _, svc, ca, ke = _env()
    svc.place_for_account(ca, draft("Canada", "Kenya", ke["wallet_public"], "1", minutes=minutes))


@pytest.mark.parametrize("minutes", [0, 0.1, 0.2, 0.51, 10081, "abc"])
def test_rejects_too_short_too_long_or_fractional_seconds(minutes):
    _, _, svc, ca, ke = _env()
    with pytest.raises(HttpError) as e:
        svc.place_for_account(ca, draft("Canada", "Kenya", ke["wallet_public"], "1", minutes=minutes))
    assert e.value.status == 400


def test_short_windows_still_match_directly():
    _, _, svc, ca, ke = _env()
    a, _ = svc.place_for_account(ca, draft("Canada", "Kenya", ke["wallet_public"], "10", minutes=0.5))
    _, batches = svc.place_for_account(ke, draft("Kenya", "Canada", ca["wallet_public"], "8", minutes=30))
    a = svc.get(a["id"])
    assert (a["matched_amount"], a["remaining_amount"]) == (80_000_000, 20_000_000)
    assert batches[0]["totalUnits"] == 80_000_000


def test_clearing_before_a_demo_closes_only_sandbox_orders_in_those_countries():
    db, _, svc, ca, ke = _env()
    db.execute("UPDATE accounts SET is_demo = 1 WHERE id = ?", (ke["id"],))  # Kenya is a sandbox account
    # A real user's order (Canada -> Kenya 20) and a sandbox order the other way (Kenya -> Canada 5):
    # 5 matches, so both stay open with an unmatched part (15 and 0 -> the sandbox one is settled).
    real, _ = svc.place_for_account(ca, draft("Canada", "Kenya", ke["wallet_public"], "20", minutes=30))
    settled, _ = svc.place_for_account(ke, draft("Kenya", "Canada", ca["wallet_public"], "5", minutes=30))
    # A sandbox account in Canada with an order that has nothing to match (same direction as the real
    # order), so it stays open with its whole amount.
    ca_sandbox = make_account(db, "Canada", "ca-rbc", {"payerName": "Demo Canada", "transit": "12345", "institution": "003", "accountNumber": "7654321"}, 100_000)
    db.execute("UPDATE accounts SET is_demo = 1 WHERE id = ?", (ca_sandbox["id"],))
    open_sandbox, _ = svc.place_for_account(ca_sandbox, draft("Canada", "Kenya", ke["wallet_public"], "3", minutes=30))

    assert svc.expire_sandbox_orders(["Philippines"]) == 0  # other countries: nothing closed
    assert svc.expire_sandbox_orders(["Canada", "Kenya"]) == 1  # only the open sandbox order
    expired = svc.expired_ids()
    assert open_sandbox["id"] in expired
    assert real["id"] not in expired  # the real user's open order keeps its window
    assert svc.get(real["id"])["status"] == "partially_matched"
    assert svc.get(settled["id"])["status"] == "settled"
