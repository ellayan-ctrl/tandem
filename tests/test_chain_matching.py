"""Pure chain-routing algorithm (no database)."""
from backend.amounts import to_units
from backend.matching import BookOrder, ChainFill, match_chains

NOW = 1_000_000
HOUR = 3_600_000


def o(i, frm, to, usdc, deadline=NOW + HOUR, routable=True, sender="", recipient=""):
    return BookOrder(i, frm, to, to_units(usdc), 1000 + i, deadline, routable, sender, recipient)


def chains(book, min_window=1_000):
    return match_chains(book, NOW, min_window)


def test_a_to_b_plus_b_to_c_becomes_one_routed_leg():
    r = chains([o(1, "Canada", "Kenya", "10"), o(2, "Kenya", "Nigeria", "6")])
    assert r.fills == [ChainFill(1, 2, to_units("6"), "Kenya")]
    assert r.remaining == {1: to_units("4"), 2: 0}


def test_opposite_directions_are_left_to_bilateral_matching():
    assert chains([o(1, "Canada", "Kenya", "5"), o(2, "Kenya", "Canada", "5")]).fills == []


def test_fifo_and_partial_fills_across_several_orders():
    book = [o(1, "Canada", "Kenya", "3"), o(2, "Canada", "Kenya", "5"), o(3, "Kenya", "Nigeria", "6"), o(4, "Kenya", "Nigeria", "4")]
    r = chains(book)
    assert [(f.inbound_id, f.outbound_id, f.amount) for f in r.fills] == [
        (1, 3, to_units("3")),
        (2, 3, to_units("3")),
        (2, 4, to_units("2")),
    ]
    assert r.remaining[4] == to_units("2")


def test_timers_must_allow_it():
    # Seconds left still route: one cross-border payout instead of two.
    soon = NOW + 10_000
    assert len(chains([o(1, "Canada", "Kenya", "5", deadline=soon), o(2, "Kenya", "Nigeria", "5")]).fills) == 1
    assert len(chains([o(1, "Canada", "Kenya", "5"), o(2, "Kenya", "Nigeria", "5", deadline=soon)]).fills) == 1
    # Within the jitter margin, or expired: never.
    assert chains([o(1, "Canada", "Kenya", "5", deadline=NOW + 500), o(2, "Kenya", "Nigeria", "5")]).fills == []
    assert chains([o(1, "Canada", "Kenya", "5", deadline=NOW - 1), o(2, "Kenya", "Nigeria", "5")]).fills == []


def test_routed_legs_are_not_chained_again():
    book = [o(1, "Canada", "Nigeria", "5", routable=False), o(2, "Nigeria", "Philippines", "5")]
    assert chains(book).fills == []


def test_never_routes_money_back_to_its_own_sender():
    book = [o(1, "Canada", "Kenya", "5", sender="GSAME"), o(2, "Kenya", "Nigeria", "5", recipient="GSAME")]
    assert chains(book).fills == []


def test_input_book_is_not_mutated():
    book = [o(1, "Canada", "Kenya", "5"), o(2, "Kenya", "Nigeria", "5")]
    chains(book)
    assert [b.remaining for b in book] == [to_units("5"), to_units("5")]
