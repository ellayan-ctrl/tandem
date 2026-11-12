from __future__ import annotations

from .amounts import from_units, now_ms
from .shared_data import CURRENCY_BY_COUNTRY, FX_RATES

ANCHOR_FEE = 0.0015  # 0.15% processing fee


def simulated_conversion(order) -> dict:
    """Simulated fiat conversion record for `convert` remainders (no on-chain movement)."""
    currency = CURRENCY_BY_COUNTRY.get(order["to_country"], "USD")
    fx = FX_RATES.get(currency) or FX_RATES["USD"]
    gross = from_units(order["remaining_amount"]) * fx["rate"]
    return {
        "fiatAmount": gross - gross * ANCHOR_FEE,
        "currency": currency,
        "exchangeRate": fx["rate"],
        "bankClearingRef": f"SIM-{currency}-{str(now_ms())[-6:]}",
        "conversionTxHash": "",
        "timestamp": now_ms(),
    }
