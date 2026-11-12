"""Pure matching, no I/O (the caller persists results inside a DB transaction). Integer amounts.

1. Bilateral: A -> B against B -> A, FIFO per direction, partial fills. Both cross-border legs
   disappear: each sender's local money pays the other order's recipient domestically.
2. Chain routing: A -> B followed by B -> C (C != A). B's sender pays A->B's recipient locally in B,
   which leaves ONE cross-border leg, A -> C (A's sender to C's recipient), instead of two. That
   "routed leg" is a normal open order: a later C -> A order can match it bilaterally (closing the
   loop with nothing on-chain); otherwise only it settles via Stellar when its timer runs out."""
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
    deadline_at: int = 0  # ms; when the matching window closes
    # Routed legs can still match bilaterally but are not chained again (keeps routes to one hop).
    routable: bool = True
    sender: str = ""  # sender wallet
    recipient: str = ""  # recipient wallet


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


@dataclass(frozen=True)
class ChainFill:
    inbound_id: int  # X: A -> hub; its recipient is paid by the hub-side sender
    outbound_id: int  # Y: hub -> C; its recipient is paid by the routed leg A -> C
    amount: int
    hub: str


@dataclass
class ChainResult:
    fills: List[ChainFill] = field(default_factory=list)
    remaining: Dict[int, int] = field(default_factory=dict)


def match_chains(book: List[BookOrder], now_ms: int, min_window_ms: int) -> ChainResult:
    """Pair orders INTO a hub country with orders OUT of it, oldest first.

    "If the timers allow it": a chain is only formed while both windows are open with at least
    `min_window_ms` left, and the routed leg takes the EARLIER of the two deadlines, so neither
    recipient waits longer than their own sender agreed to. Pairs that are really opposite
    transfers (C == A) are left to bilateral matching."""
    work = {o.id: replace(o) for o in book if o.remaining > 0 and o.routable}
    hubs = sorted({o.to_country for o in work.values()} & {o.from_country for o in work.values()})
    result = ChainResult()
    for hub in hubs:
        inbound = sorted((o for o in work.values() if o.to_country == hub), key=_fifo)
        outbound = sorted((o for o in work.values() if o.from_country == hub), key=_fifo)
        for x in inbound:
            for y in outbound:
                if x.remaining == 0:
                    break
                if y.remaining == 0 or x.id == y.id:
                    continue
                if x.from_country == y.to_country:
                    continue  # opposite directions: bilateral matching handles it
                if min(x.deadline_at, y.deadline_at) - now_ms < min_window_ms:
                    continue  # not enough time left on one of the timers
                if x.sender and x.sender == y.recipient:
                    continue  # the routed leg would pay its own sender
                amount = min(x.remaining, y.remaining)
                x.remaining -= amount
                y.remaining -= amount
                result.remaining[x.id] = x.remaining
                result.remaining[y.id] = y.remaining
                result.fills.append(ChainFill(x.id, y.id, amount, hub))
    return result
