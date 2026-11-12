import pytest

from backend.amounts import format_units, to_units
from backend.matching import BookOrder, Fill, crossed_pairs, match_pair

_seq = 0


def o(frm: str, to: str, usdc: str) -> BookOrder:
    global _seq
    _seq += 1
    return BookOrder(_seq, frm, to, to_units(usdc), 1000 + _seq)


@pytest.fixture(autouse=True)
def reset_seq():
    global _seq
    _seq = 0


def test_canonical_scenario_fifo_with_partial_fill():
    book = [o("Canada", "Kenya", "500"), o("Kenya", "Canada", "200"), o("Canada", "Kenya", "300")]
    r = match_pair(book, "Canada", "Kenya")
    assert r.fills == [Fill(1, 2, to_units("200"))]
    assert r.remaining[1] == to_units("300")
    assert r.remaining[2] == 0
    assert 3 not in r.remaining, "the later order stays untouched behind the first"


def test_argument_order_of_the_pair_does_not_matter():
    book = [o("United States", "Nigeria", "100"), o("Nigeria", "United States", "60")]
    r = match_pair(book, "Nigeria", "United States")
    assert r.fills[0].amount == to_units("60")
    assert r.remaining[1] == to_units("40")


def test_decimal_amounts_settle_exactly():
    r1 = match_pair([o("A", "B", "0.1"), o("A", "B", "0.2"), o("B", "A", "0.3")], "A", "B")
    assert list(r1.remaining.values()) == [0, 0, 0]
    r2 = match_pair([o("A", "B", "10.1"), o("B", "A", "10.07"), o("B", "A", "0.03")], "A", "B")
    assert all(v == 0 for v in r2.remaining.values())


def test_many_to_many_fills_conserve_volume():
    book = [o("A", "B", "7"), o("A", "B", "3"), o("B", "A", "4"), o("B", "A", "4"), o("B", "A", "4")]
    r = match_pair(book, "A", "B")
    assert format_units(sum(f.amount for f in r.fills)) == "10"
    assert r.remaining[5] == to_units("2")


def test_one_sided_pair_produces_no_fills():
    assert match_pair([o("US", "Mexico", "100")], "US", "Mexico").fills == []


def test_input_book_is_not_mutated():
    book = [o("A", "B", "5"), o("B", "A", "5")]
    match_pair(book, "A", "B")
    assert [b.remaining for b in book] == [to_units("5"), to_units("5")]


def test_crossed_pairs_finds_only_pairs_with_two_way_volume():
    book = [o("Canada", "Kenya", "1"), o("Kenya", "Canada", "1"), o("US", "Mexico", "1")]
    assert crossed_pairs(book) == [("Canada", "Kenya")]
