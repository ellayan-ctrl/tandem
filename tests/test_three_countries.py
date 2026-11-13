"""Three countries (A -> B, B -> C, C -> A): matching must send on-chain only what can't be netted.

The least that can go on-chain is the sum of each country's net INFLOW (money in minus money out,
counted where positive): everything else cancels within the cycle and is paid locally. This checks
that the matcher reaches that minimum whatever order the transfers arrive in, with unbalanced
amounts, and with short (15 s) as well as long matching windows."""
import itertools

import pytest

from tests.test_orders_offchain import _env, draft, make_account

LEGS = {"AB": ("Canada", "Kenya"), "BC": ("Kenya", "Nigeria"), "CA": ("Nigeria", "Canada")}
AMOUNTS = [
    {"AB": 10, "BC": 10, "CA": 10},  # balanced cycle: nothing on-chain
    {"AB": 10, "BC": 8, "CA": 6},
    {"AB": 6, "BC": 10, "CA": 8},
    {"AB": 10, "BC": 6, "CA": 8},
    {"AB": 5, "BC": 9, "CA": 7},
]


def place_all(amounts, arrival, minutes):
    db, _, svc, ca, ke = _env()
    ng = make_account(db, "Nigeria", "ng-gtbank", {"payerName": "Chidi Okafor", "accountNumber": "0123456789"}, 0)
    db.execute("UPDATE banks SET balance_minor = 10000000000")  # plenty of sandbox money
    who = {"Canada": ca, "Kenya": ke, "Nigeria": ng}
    for leg in arrival:
        frm, to = LEGS[leg]
        svc.place_for_account(who[frm], draft(frm, to, who[to]["wallet_public"], str(amounts[leg]), minutes=minutes))
    return db


def minimum_on_chain(amounts):
    net_in = {
        "Canada": amounts["CA"] - amounts["AB"],
        "Kenya": amounts["AB"] - amounts["BC"],
        "Nigeria": amounts["BC"] - amounts["CA"],
    }
    return sum(v for v in net_in.values() if v > 0)


@pytest.mark.parametrize("minutes", [30, 0.25])
@pytest.mark.parametrize("arrival", list(itertools.permutations(LEGS)))
@pytest.mark.parametrize("amounts", AMOUNTS)
def test_only_the_unavoidable_amount_goes_on_chain(amounts, arrival, minutes):
    db = place_all(amounts, arrival, minutes)
    on_chain = db.execute("SELECT COALESCE(SUM(remaining_amount), 0) FROM orders").fetchone()[0] / 10_000_000
    assert on_chain == minimum_on_chain(amounts)


def test_balanced_cycle_with_15_second_windows_settles_entirely_off_chain():
    db = place_all({"AB": 10, "BC": 10, "CA": 10}, ("AB", "BC", "CA"), 0.25)
    rows = db.execute("SELECT transfer_type, status, remaining_amount FROM orders ORDER BY id").fetchall()
    assert all(r["remaining_amount"] == 0 for r in rows)
    assert [r["transfer_type"] for r in rows].count("routed") == 1  # A -> C, then matched against C -> A
