"""Live cost of sending money OVERSEAS, for comparison with paying the matched part domestically.

Source: Wise's public price-comparison endpoint, which returns current quotes (flat fee + FX
markup vs. the mid-market rate) from banks and money-transfer providers for a currency pair.
Wise is itself one of the providers compared. When a pair has no live quotes (e.g. KES -> CAD),
we fall back to the World Bank Remittance Prices Worldwide average."""
from __future__ import annotations

import time
from datetime import datetime, timezone

import httpx

from .amounts import js_round
from .shared_data import TRADITIONAL_REMITTANCE_PCT

CACHE_S = 10 * 60
_cache: dict = {}


async def overseas_pricing(source_currency: str, target_currency: str, amount: float, from_country: str, to_country: str) -> dict:
    amount = max(1, js_round(amount))
    # Quotes scale with amount; bucket the cache key so typing doesn't hammer the API.
    bucket = amount if amount < 100 else js_round(amount / 25) * 25
    key = f"{source_currency}-{target_currency}-{bucket}"
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < CACHE_S:
        return _rescale(hit[1], amount)

    value = None
    try:
        async with httpx.AsyncClient(timeout=8) as http:
            res = await http.get(
                "https://api.wise.com/v4/comparisons/",
                params={"sourceCurrency": source_currency, "targetCurrency": target_currency, "sendAmount": bucket},
                headers={"accept": "application/json"},
            )
        if res.status_code == 200:
            quotes = []
            collected_at = None
            for pr in res.json().get("providers") or []:
                q = (pr.get("quotes") or [None])[0]
                if not q:
                    continue
                fee = _num(q.get("fee"))
                markup = _num(q.get("markup"))
                total = fee + bucket * markup / 100
                quotes.append({"provider": pr.get("name"), "type": pr.get("type"), "fee": fee, "markupPct": markup,
                               "totalCost": total, "totalPct": total / bucket * 100, "_collectedAt": q.get("dateCollected")})
            quotes.sort(key=lambda x: x["totalCost"])
            if quotes:
                collected_at = quotes[0].pop("_collectedAt", None)
                for q in quotes:
                    q.pop("_collectedAt", None)
                value = {
                    "source": "live",
                    "sourceLabel": f"Live quotes from {len(quotes)} banks & transfer providers (via Wise's price comparison)",
                    "sourceUrl": f"https://wise.com/gb/compare/?sourceCurrency={source_currency}&targetCurrency={target_currency}&sendAmount={bucket}",
                    "collectedAt": collected_at or datetime.now(timezone.utc).isoformat(),
                    "amount": bucket,
                    "sourceCurrency": source_currency,
                    "targetCurrency": target_currency,
                    "quotes": quotes,
                    "cheapest": None,
                    "median": None,
                    "averagePct": None,
                }
    except (httpx.HTTPError, ValueError):
        pass  # fall through to the World Bank average

    if value is None:
        pct = TRADITIONAL_REMITTANCE_PCT.get(f"{from_country}->{to_country}", TRADITIONAL_REMITTANCE_PCT["default"])
        value = {
            "source": "world_bank_average",
            "sourceLabel": f"No live quotes for {source_currency} → {target_currency}; World Bank average remittance cost ({pct}%)",
            "sourceUrl": "https://remittanceprices.worldbank.org/",
            "collectedAt": None,
            "amount": bucket,
            "sourceCurrency": source_currency,
            "targetCurrency": target_currency,
            "quotes": [],
            "cheapest": None,
            "median": None,
            "averagePct": pct,
        }
    _cache[key] = (time.time(), value)
    return _rescale(value, amount)


def _num(v) -> float:
    try:
        return float(v) or 0.0
    except (TypeError, ValueError):
        return 0.0


def _rescale(v: dict, amount: int) -> dict:
    """Re-express cached quotes for the exact amount (fees are flat, markups are %)."""
    quotes = []
    for q in v["quotes"]:
        total = q["fee"] + amount * q["markupPct"] / 100
        quotes.append({**q, "totalCost": total, "totalPct": total / amount * 100})
    quotes.sort(key=lambda x: x["totalCost"])
    return {
        **v,
        "amount": amount,
        "quotes": quotes,
        "cheapest": quotes[0] if quotes else None,
        "median": quotes[(len(quotes) - 1) // 2] if quotes else None,
    }
