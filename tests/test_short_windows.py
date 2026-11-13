"""Matching windows under a minute: 15 seconds .. 7 days, in whole seconds."""
import pytest

from backend.errors import HttpError
from tests.test_orders_offchain import _env, draft


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
