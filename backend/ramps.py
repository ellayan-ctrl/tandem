"""Cash-in / cash-out services (Stellar anchors and ramps) for a country.

The list comes live from the Stellar Scout partner directory (https://stellarlight.xyz/api/partners), the
same public source the Raven MCP server's `scout.getPartners` reads. Results are cached in memory; if
Scout can't be reached, a dated snapshot in shared/ramp_partners_snapshot.json is served instead, and the
response says so. Nothing here is invented: every row is a published directory entry.
"""
from __future__ import annotations

import json
import logging
import time
from typing import Optional

import httpx

from .config import ROOT

log = logging.getLogger("twoway.ramps")

SCOUT_URL = "https://stellarlight.xyz/api/partners"
SCOUT_PARAMS = {"type": "anchor", "all": "1", "limit": "100"}  # type=anchor is the full anchor/ramp list
SNAPSHOT = ROOT / "shared" / "ramp_partners_snapshot.json"
CACHE_TTL_S = 6 * 3600

# The directory's region vocabulary (north-america, latam, europe, africa, mena, asia, oceania, global).
REGION_OF = {
    "Canada": "north-america",
    "United States": "north-america",
    "Kenya": "africa",
    "Nigeria": "africa",
    "European Union": "europe",
    "Argentina": "latam",
    "Philippines": "asia",
}

# Partners with physical cash points the user can walk into; the app links a map search for these.
CASH_POINTS = {"anchor-moneygram": "MoneyGram"}

_cache: dict = {"at": 0.0, "partners": None, "generatedAt": None}


def _load_snapshot() -> dict:
    data = json.loads(SNAPSHOT.read_text())
    return {"partners": data["partners"], "generatedAt": data.get("generatedAt"), "source": "snapshot"}


async def _directory() -> dict:
    """All anchors from Scout (cached), or the snapshot if Scout is unreachable."""
    if _cache["partners"] is not None and time.time() - _cache["at"] < CACHE_TTL_S:
        return {"partners": _cache["partners"], "generatedAt": _cache["generatedAt"], "source": "live"}
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            r = await client.get(SCOUT_URL, params=SCOUT_PARAMS)
            r.raise_for_status()
            body = r.json()
        partners = body["partners"]
        _cache.update(at=time.time(), partners=partners, generatedAt=(body.get("meta") or {}).get("generatedAt"))
        return {"partners": partners, "generatedAt": _cache["generatedAt"], "source": "live"}
    except Exception as e:  # noqa: BLE001 - any failure falls back to the dated snapshot
        log.warning("Scout partner directory unreachable (%s); serving the snapshot", e)
        return _load_snapshot()


def _row(p: dict, scope: str) -> dict:
    ramps = p.get("rampTypes") or []
    return {
        "slug": p.get("slug"),
        "name": p.get("name"),
        "tagline": p.get("tagline"),
        "country": p.get("country"),
        "regions": p.get("regions") or [],
        "cashIn": "on-ramp" in ramps,
        "cashOut": "off-ramp" in ramps,
        "rampsRecorded": bool(ramps),
        "assets": (p.get("assets") or [])[:6],
        "websiteUrl": p.get("websiteUrl"),
        "profileUrl": p.get("url"),
        "cashPoints": CASH_POINTS.get(p.get("slug") or ""),
        "scope": scope,  # in-country | regional | global
    }


def rank(partners: list, country: str) -> list:
    """In-country first, then the same region, then global; recorded ramps and pilots first within each."""
    region = REGION_OF.get(country)
    out = []
    for p in partners:
        if ((p.get("freshness") or {}).get("status")) == "archived":
            continue
        regions = p.get("regions") or []
        if p.get("country") == country:
            scope = "in-country"
        elif region and region in regions:
            scope = "regional"
        elif "global" in regions:
            scope = "global"
        else:
            continue
        out.append((p, scope))
    order = {"in-country": 0, "regional": 1, "global": 2}
    out.sort(key=lambda ps: (
        order[ps[1]],
        not ps[0].get("rampTypes"),
        not ps[0].get("pilot"),
        -((ps[0].get("trust") or {}).get("score") or 0),
        ps[0].get("name") or "",
    ))
    return [_row(p, scope) for p, scope in out]


async def ramps_for(country: Optional[str]) -> dict:
    d = await _directory()
    country = country if country in REGION_OF else None
    return {
        "country": country,
        "region": REGION_OF.get(country) if country else None,
        "services": rank(d["partners"], country) if country else [],
        "source": d["source"],  # live | snapshot
        "sourceName": "Stellar Scout partner directory (the source behind Raven's scout.getPartners)",
        "sourceUrl": "https://stellarlight.xyz/partners",
        "generatedAt": d["generatedAt"],
        "countries": list(REGION_OF),
    }
