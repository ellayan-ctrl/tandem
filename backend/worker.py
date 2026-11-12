"""Background loop: when an order's matching window closes, resolve its unmatched remainder
(Soroban payout / release / fiat conversion), send Full Crypto Transfers, and retry transient
payout failures. Payouts run one at a time so account sequence numbers never race."""
from __future__ import annotations

import asyncio
import logging

from .orders import OrderService

log = logging.getLogger("twoway.worker")


class ExpiryWorker:
    def __init__(self, svc: OrderService, interval_s: float):
        self.svc = svc
        self.interval_s = interval_s
        self._lock = asyncio.Lock()
        self._task = None

    async def tick(self) -> None:
        if self._lock.locked():
            return
        async with self._lock:
            for oid in self.svc.direct_ids() + self.svc.expired_ids():
                await self._run(oid, None, "expired")
            for oid in self.svc.retryable_payout_ids():
                await self._run(oid, "payout", "retry")

    async def _run(self, oid: int, action, label: str) -> None:
        try:
            o = await self.svc.resolve(oid, action)
            extra = f" tx {o['payout_tx_hash']}" if o["payout_tx_hash"] else ""
            extra += f" ({o['payout_error']})" if o["payout_error"] else ""
            log.info("%s %s -> %s%s", o["public_id"], label, o["status"], extra)
        except Exception as e:  # noqa: BLE001 - keep the loop alive
            log.warning("%s %s failed: %s", label, oid, getattr(e, "message", None) or e)

    def kick(self) -> None:
        """Run a tick soon, without waiting for it."""
        asyncio.get_running_loop().create_task(self.tick())

    async def _loop(self) -> None:
        while True:
            await asyncio.sleep(self.interval_s)
            await self.tick()

    def start(self) -> None:
        self._task = asyncio.get_running_loop().create_task(self._loop())

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
