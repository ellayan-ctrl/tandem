"""Cash-outs through an anchor (SEP-24), with the anchor faked: pay exactly once, only after the user has finished
the anchor's form, only the amount agreed, and never past the wallet balance or the anchor's limits."""
import asyncio

import pytest

from backend import anchor, cashouts
from backend.errors import HttpError
from tests.test_orders_offchain import _env


class FakeAnchor:
    def __init__(self):
        self.status = "incomplete"
        self.amount_in = "2"
        self.payments = []

    async def summary(self):
        return {"name": "Test anchor", "usdcSupported": True, "minAmount": 1, "maxAmount": 10}

    async def start_withdrawal(self, kp, amount):
        return {"id": "anchor-tx-1", "url": "https://anchor.example/form"}

    async def transaction(self, kp, tid):
        return {"status": self.status, "amount_in": self.amount_in, "withdraw_anchor_account": "GANCHOR", "withdraw_memo": "42",
                "withdraw_memo_type": "id", "amount_out": "1.8"}

    async def pay(self, kp, tx):
        self.payments.append(tx["amount_in"])
        return {"hash": f"tx{len(self.payments)}"}


@pytest.fixture
def env(monkeypatch):
    db, accounts, _svc, ca, _ke = _env()
    fake = FakeAnchor()
    for name in ("summary", "start_withdrawal", "transaction", "pay"):
        monkeypatch.setattr(anchor, name, getattr(fake, name))

    async def balance(_addr):
        return 5 * 10**7  # 5 USDC in the wallet

    monkeypatch.setattr(cashouts.chain, "usdc_balance", balance)
    return cashouts.CashoutService(db, accounts), ca, fake


def run(c):
    return asyncio.run(c)


def test_pays_once_only_after_the_user_completes_the_anchor_form(env):
    svc, ca, fake = env
    c = run(svc.start(ca, "2"))
    assert c["status"] == "incomplete" and c["interactive_url"] == "https://anchor.example/form"

    run(svc.process())  # user hasn't finished the form yet
    assert fake.payments == []

    fake.status = "pending_user_transfer_start"  # form done: the anchor waits for the USDC
    run(svc.process())
    run(svc.process())  # a second tick must not pay again
    assert fake.payments == ["2"]
    assert svc.get(c["id"])["payment_tx_hash"] == "tx1"

    fake.status = "completed"
    run(svc.process())
    done = svc.get(c["id"])
    assert done["status"] == "completed" and done["amount_out"] == "1.8"
    run(svc.process())  # final cash-outs are left alone
    assert fake.payments == ["2"]


def test_refuses_to_pay_a_different_amount_than_agreed(env):
    svc, ca, fake = env
    c = run(svc.start(ca, "2"))
    fake.status, fake.amount_in = "pending_user_transfer_start", "3"
    run(svc.process())
    assert fake.payments == []
    assert "not paying" in svc.get(c["id"])["error"]


@pytest.mark.parametrize("amount, why", [("0.5", "between"), ("11", "between"), ("6", "holds"), ("abc", "")])
def test_rejects_amounts_outside_the_anchor_limits_or_the_wallet(env, amount, why):
    svc, ca, _ = env
    with pytest.raises(HttpError) as e:
        run(svc.start(ca, amount))
    assert why in e.value.message
