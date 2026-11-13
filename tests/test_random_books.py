"""Randomized checks of the matcher. Expected values are computed ONLY from the random inputs, with a
formula that does not use the matcher:

  net inflow of a country = money sent TO it - money sent FROM it (over the orders placed)
  the least that can go on-chain = the sum of the positive net inflows

and, when the total is that least amount, each country must receive on-chain exactly its positive
net inflow (and countries with a negative net inflow receive nothing). Then, for ANY random book,
conservation must hold: on-chain received - on-chain sent = net inflow, for every country (matching
and routing may not create or lose money).

What goes on-chain is read from the database after matching: every order's (or routed leg's)
remaining amount is what its timer will send from its from-country to its to-country.
"""
import json
import random

import pytest

from backend.accounts import AccountService
from backend.config import ROOT
from backend.db import open_db
from backend.orders import OrderService
from backend.shared_data import providers_for
from tests.test_orders_offchain import draft, make_account

# The app's country pairs (shared/corridors.json), the same list the Random Test tab uses.
_CORRIDORS = json.loads((ROOT / "shared" / "corridors.json").read_text())
PAIRS = [(p["a"], p["b"]) for p in _CORRIDORS["pairs"]]
COUNTRIES = list(_CORRIDORS["countries"])
DIRECTIONS = PAIRS + [(b, a) for a, b in PAIRS]
partners = lambda x: [b for a, b in DIRECTIONS if a == x]  # noqa: E731
is_pair = lambda x, y: (x, y) in DIRECTIONS  # noqa: E731
WINDOWS = [0.25, 1 / 3, 0.5, 30]  # 15 s, 20 s, 30 s, 30 min


# Valid sample bank details (the same values the server uses for its sandbox demo accounts).
SAMPLE = {"bankName": "Demo bank", "transit": "12345", "institution": "003", "routing": "021000021",
          "iban": "DE89370400440532013000", "cbu": "0" * 22}


def bank_for(country):
    p = next(p for p in providers_for(country) if p["kind"] == "bank_account")
    account_no = "0123456789" if country == "Nigeria" else "1234567890"
    details = {f["key"]: SAMPLE.get(f["key"], account_no if f["key"] == "accountNumber" else "Demo") for f in p["fields"]}
    return p["id"], {**details, "payerName": f"Test {country}"}


def fresh_book():
    db = open_db(":memory:")
    accounts = AccountService(db)
    svc = OrderService(db, accounts)
    who = {c: make_account(db, c, *bank_for(c), 0) for c in COUNTRIES}
    db.execute("UPDATE banks SET balance_minor = 100000000000")  # sandbox money for every account
    return db, svc, who


def place(svc, who, orders, window):
    for frm, to, cents in orders:
        svc.place_for_account(who[frm], draft(frm, to, who[to]["wallet_public"], f"{cents / 100:.2f}", minutes=window))


def net_inflow(orders):
    net = {}
    for frm, to, cents in orders:
        net[to] = net.get(to, 0) + cents
        net[frm] = net.get(frm, 0) - cents
    return net


def on_chain(db):
    """(received, sent) per country, in cents, from what is still unmatched after matching."""
    received, sent = {}, {}
    for r in db.execute("SELECT from_country, to_country, remaining_amount FROM orders WHERE remaining_amount > 0"):
        cents = r["remaining_amount"] // 100_000  # 7-decimal units -> cents
        received[r["to_country"]] = received.get(r["to_country"], 0) + cents
        sent[r["from_country"]] = sent.get(r["from_country"], 0) + cents
    return received, sent


def random_shape(rng, kind):
    """Same shapes as the Random Test tab: a pair both ways, or a chain A -> B -> C of two pairs."""
    amt = lambda: rng.randint(100, 2000)  # $1.00 .. $20.00  # noqa: E731
    if kind == "direct":
        a, b = rng.choice(DIRECTIONS)
        orders = [(a, b, amt()), (b, a, amt())]
    else:
        chains = [(a, b, c) for a, b in DIRECTIONS for c in partners(b) if c != a]
        a, b, c = rng.choice(chains)
        orders = [(a, b, amt()), (b, c, amt())]
        if is_pair(c, a) and rng.random() < 0.5:
            orders.append((c, a, amt()))  # close the loop
    rng.shuffle(orders)  # random arrival order
    return orders


@pytest.mark.parametrize("seed", range(150))
@pytest.mark.parametrize("kind", ["direct", "routing"])
def test_random_demo_shapes_send_only_the_minimum_on_chain(kind, seed):
    rng = random.Random(f"{kind}-{seed}")
    orders = random_shape(rng, kind)
    db, svc, who = fresh_book()
    place(svc, who, orders, rng.choice(WINDOWS))

    net = net_inflow(orders)
    received, _ = on_chain(db)
    assert sum(received.values()) == sum(v for v in net.values() if v > 0), orders
    for country, v in net.items():
        assert received.get(country, 0) == max(0, v), (country, orders)


@pytest.mark.parametrize("seed", range(150))
def test_random_books_conserve_money(seed):
    """Any mix of orders: matching and routing may never create or lose money in any country."""
    rng = random.Random(f"book-{seed}")
    orders = []
    for _ in range(rng.randint(2, 9)):
        frm, to = rng.choice(DIRECTIONS)
        orders.append((frm, to, rng.randint(100, 2000)))
    countries = sorted({c for o in orders for c in o[:2]})
    db, svc, who = fresh_book()
    place(svc, who, orders, rng.choice(WINDOWS))

    net = net_inflow(orders)
    received, sent = on_chain(db)
    total = sum(received.values())
    # Every order's books add up: matched + unmatched = amount, and its fills sum to what it matched.
    for o in db.execute("SELECT * FROM orders"):
        assert o["matched_amount"] + o["remaining_amount"] == o["amount"], dict(o)
        filled = db.execute(
            "SELECT COALESCE(SUM(amount), 0) FROM fills WHERE order_a_id = ? OR order_b_id = ?", (o["id"], o["id"])
        ).fetchone()[0]
        assert filled == o["matched_amount"], (dict(o), filled)
    for country in countries:
        assert received.get(country, 0) - sent.get(country, 0) == net.get(country, 0), (country, orders)
    assert total >= sum(v for v in net.values() if v > 0)  # never below the theoretical least
