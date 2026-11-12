"""All server-side amounts are integer "units" with 7 decimals (1 USDC = 10_000_000), matching
Stellar/Soroban token precision, so matching never accumulates floating-point dust."""
from __future__ import annotations

import math
import re
import time

DECIMALS = 7
UNIT = 10**DECIMALS
MAX_SAFE_INTEGER = 2**53 - 1  # amounts are sent to the browser as JSON numbers
_AMOUNT = re.compile(r"^(\d+)(?:\.(\d+))?$")


def to_units(value) -> int:
    """Parse a decimal USDC string/number ("12.5") into integer units without float math."""
    if isinstance(value, bool):
        raise ValueError(f"Invalid amount: {value}")
    if isinstance(value, (int, float)):
        s = str(int(value)) if float(value).is_integer() else repr(float(value))
    else:
        s = str(value).strip()
    m = _AMOUNT.match(s)
    if not m:
        raise ValueError(f"Invalid amount: {value}")
    frac = (m.group(2) or "").ljust(DECIMALS, "0")
    if len(frac) > DECIMALS and frac[DECIMALS:].strip("0"):
        raise ValueError(f"Amount has more than {DECIMALS} decimal places: {value}")
    units = int(m.group(1)) * UNIT + int(frac[:DECIMALS])
    if units > MAX_SAFE_INTEGER:
        raise ValueError(f"Amount too large: {value}")
    return units


def from_units(units: int) -> float:
    """Integer units -> USDC number for the UI (display only)."""
    return units / UNIT


def format_units(units: int) -> str:
    """Integer units -> exact decimal string (for notes / memos)."""
    whole, frac = divmod(units, UNIT)
    frac_s = str(frac).rjust(DECIMALS, "0").rstrip("0")
    return f"{whole}.{frac_s}" if frac_s else str(whole)


def js_round(x: float) -> int:
    """Round half up, like JavaScript's Math.round (Python's round() is banker's rounding)."""
    return math.floor(x + 0.5)


def round2(x: float) -> float:
    return js_round(x * 100) / 100


def now_ms() -> int:
    return int(time.time() * 1000)
