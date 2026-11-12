"""Pure bilateral matching: FIFO per direction, partial fills, integer amounts.
No I/O; the caller persists the result inside a DB transaction."""
from __future__ import annotations

from dataclasses import dataclass, field, replace
from typing import Dict, List, Tuple


@dataclass
class BookOrder:
    id: int
    from_country: str
    to_country: str
    remaining: int  # integer units
    created_at: int


@dataclass(frozen=True)
class Fill:
    order_a_id: int  # A -> B side
    order_b_id: int  # B -> A side
    amount: int  # integer units


@dataclass
class MatchResult:
    fills: List[Fill] = field(default_factory=list)
    # New remaining amount per order id, only for orders that changed (insertion-ordered).
    remaining: Dict[int, int] = field(default_factory=dict)


def _fifo(o: BookOrder) -> Tuple[int, int]:
    return (o.created_at, o.id)


def match_pair(book: List[BookOrder], country_a: str, country_b: str) -> MatchResult:
    """Match the two directions between country_a and country_b, oldest orders first."""
    a_to_b = sorted(
        (replace(o) for o in book if o.from_country == country_a and o.to_country == country_b and o.remaining > 0),
        key=_fifo,
    )
    b_to_a = sorted(
        (replace(o) for o in book if o.from_country == country_b and o.to_country == country_a and o.remaining > 0),
        key=_fifo,
    )
    result = MatchResult()
    i = j = 0
    while i < len(a_to_b) and j < len(b_to_a):
        a, b = a_to_b[i], b_to_a[j]
        amount = min(a.remaining, b.remaining)
        a.remaining -= amount
        b.remaining -= amount
        result.remaining[a.id] = a.remaining
        result.remaining[b.id] = b.remaining
        result.fills.append(Fill(a.id, b.id, amount))
        if a.remaining == 0:
            i += 1
        if b.remaining == 0:
            j += 1
    return result


def pair_key(x: str, y: str) -> Tuple[str, str]:
    """Unordered country pair, e.g. ("Canada", "Kenya")."""
    return (x, y) if x < y else (y, x)


def crossed_pairs(book: List[BookOrder]) -> List[Tuple[str, str]]:
    """Every country pair that currently has resting volume in both directions."""
    directions = {(o.from_country, o.to_country) for o in book if o.remaining > 0}
    out: Dict[Tuple[str, str], None] = {}
    for frm, to in sorted(directions):
        if (to, frm) in directions:
            out[pair_key(frm, to)] = None
    return list(out)
