"""My Transactions: an account sees what it sent and what it received, and a recipient never sees the
sender's payment method. Plus the ranking of cash-in / cash-out services by country."""
import asyncio

from backend import ramps
from backend.api import serialize, serialize_received
from tests.test_orders_offchain import _env, draft, make_account


def test_lists_sent_and_received_for_one_wallet_only():
    db, _, svc, ca, ke = _env()
    ng = make_account(db, "Nigeria", "ng-gtbank", {"payerName": "Chidi Okafor", "accountNumber": "0123456789"}, 10_000_000)
    sent, _ = svc.place_for_account(ca, draft("Canada", "Kenya", ke["wallet_public"], "5"))
    got, _ = svc.place_for_account(ke, draft("Kenya", "Canada", ca["wallet_public"], "2"))
    unrelated, _ = svc.place_for_account(ke, draft("Kenya", "Nigeria", ng["wallet_public"], "1"))

    mine = svc.list_for_wallet(ca["wallet_public"])
    # Kenya -> Nigeria chain-routed part of the Canadian's money into a new Canada -> Nigeria leg. That
    # leg is the Canadian's money too, so it is listed as theirs.
    routed = [o for o in mine if o["transfer_type"] == "routed"]
    assert len(routed) == 1 and routed[0]["sender_address"] == ca["wallet_public"]
    assert {o["id"] for o in mine} == {sent["id"], got["id"], routed[0]["id"]}
    assert unrelated["id"] not in {o["id"] for o in mine}


def test_recipient_view_hides_the_senders_private_details():
    _, _, svc, ca, ke = _env()
    o, _ = svc.place_for_account(ca, draft("Canada", "Kenya", ke["wallet_public"], "5"))
    o = svc.get(o["id"])
    fills = svc.fills_for(o["id"])

    as_sender = serialize(o, fills, ca["wallet_public"])
    as_recipient = serialize_received(o, fills)
    as_stranger = serialize(o, fills, ke["wallet_public"])

    assert "fundingMethod" in as_sender
    assert "fundingMethod" not in as_recipient and "notes" not in as_recipient
    assert as_recipient["recipientAddress"] == ke["wallet_public"]  # the recipient sees it was sent to them
    assert as_recipient["amount"] == 5.0
    assert as_stranger["recipientAddress"] == ""  # the general order book stays anonymous


PARTNERS = [
    {"slug": "ke-local", "name": "Kenya Local", "country": "Kenya", "regions": ["africa"], "rampTypes": ["on-ramp", "off-ramp"]},
    {"slug": "africa-wide", "name": "Africa Wide", "country": None, "regions": ["africa"], "rampTypes": None},
    {"slug": "anchor-moneygram", "name": "Moneygram", "country": None, "regions": ["global"], "rampTypes": ["on-ramp", "off-ramp"]},
    {"slug": "latam-only", "name": "Latam Only", "country": "Argentina", "regions": ["latam"], "rampTypes": ["off-ramp"]},
    {"slug": "old", "name": "Old", "country": "Kenya", "regions": ["africa"], "rampTypes": ["off-ramp"], "freshness": {"status": "archived"}},
]


def test_ramps_rank_in_country_then_region_then_global():
    rows = ramps.rank(PARTNERS, "Kenya")
    assert [(r["name"], r["scope"]) for r in rows] == [
        ("Kenya Local", "in-country"),
        ("Africa Wide", "regional"),
        ("Moneygram", "global"),
    ]
    assert rows[0]["cashIn"] and rows[0]["cashOut"]
    assert rows[1]["rampsRecorded"] is False
    assert rows[2]["cashPoints"] == "MoneyGram"


def test_ramps_fall_back_to_the_snapshot_when_scout_is_unreachable(monkeypatch):
    monkeypatch.setattr(ramps, "SCOUT_URL", "http://127.0.0.1:9/unreachable")
    monkeypatch.setitem(ramps._cache, "partners", None)
    res = asyncio.run(ramps.ramps_for("Kenya"))
    assert res["source"] == "snapshot"
    assert any(s["name"] == "Honey Coin" and s["scope"] == "in-country" for s in res["services"])


def test_unknown_country_returns_no_services(monkeypatch):
    monkeypatch.setattr(ramps, "SCOUT_URL", "http://127.0.0.1:9/unreachable")
    monkeypatch.setitem(ramps._cache, "partners", None)
    res = asyncio.run(ramps.ramps_for("Atlantis"))
    assert res["country"] is None and res["services"] == []
