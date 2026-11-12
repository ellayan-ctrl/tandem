"""Data shared with the JavaScript front end (shared/*.json) and the helpers built on it:
payment-method lookup, validation and masking, FX rates, remittance averages."""
from __future__ import annotations

import json
import re
from functools import lru_cache
from typing import Optional

from .config import ROOT

_SHARED = ROOT / "shared"


def _load(name: str) -> dict:
    with open(_SHARED / name, encoding="utf-8") as f:
        return json.load(f)


_funding = _load("funding_methods.json")
LINKED_BANK_ID: str = _funding["linkedBankId"]
CURRENCY_BY_COUNTRY: dict = _funding["currencyByCountry"]
FUNDING_KINDS: dict = _funding["kinds"]
FUNDING_PROVIDERS: dict = _funding["providers"]
FX_RATES: dict = _load("fx_rates.json")["rates"]
TRADITIONAL_REMITTANCE_PCT: dict = _load("remittance_averages.json")["pct"]


def providers_for(country: str) -> list:
    return FUNDING_PROVIDERS.get(country, [])


def find_provider(country: str, provider_id: str) -> Optional[dict]:
    return next((p for p in providers_for(country) if p["id"] == provider_id), None)


@lru_cache(maxsize=None)
def _pattern(source: str) -> re.Pattern:
    return re.compile(f"^(?:{source})$")


def validate_selection(country: str, sel: Optional[dict]) -> Optional[str]:
    """Returns an error message, or None when the selection is complete and valid."""
    if not isinstance(sel, dict) or not sel.get("providerId"):
        return "Choose how you will pay in the matched amount."
    if sel["providerId"] == LINKED_BANK_ID:
        return None  # resolved server-side from the linked account
    provider = find_provider(country, sel["providerId"])
    if not provider:
        return f"That payment method is not available in {country}."
    details = sel.get("details") or {}
    for f in provider["fields"]:
        v = str(details.get(f["key"]) or "").strip()
        if not v:
            return f"{provider['name']}: {f['label']} is required."
        if f.get("pattern") and not _pattern(f["pattern"]).match(v):
            return f"{provider['name']}: {f['label']} looks invalid."
    return None


def mask_details(country: str, sel: dict) -> dict:
    """Copy of the details with sensitive values masked."""
    provider = find_provider(country, sel.get("providerId", ""))
    sensitive_keys = {f["key"] for f in (provider or {}).get("fields", []) if f.get("sensitive")}
    out = {}
    for k, v in (sel.get("details") or {}).items():
        v = str(v)
        if k not in sensitive_keys or len(v) <= 4:
            out[k] = v
        elif "@" in v:
            out[k] = f"{v[0]}••••@{v.split('@')[1]}"
        else:
            out[k] = "••••" + re.sub(r"\s", "", v)[-4:]
    return out


def fx_for(country: str) -> tuple:
    """(currency, local currency per 1 USD) for a country."""
    currency = CURRENCY_BY_COUNTRY.get(country, "USD")
    return currency, FX_RATES.get(currency, {}).get("rate", 1)
