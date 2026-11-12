"""FastAPI application: the /api routes, the expiry worker, and (in production) the built front end."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import soroban as chain
from .accounts import AccountService
from .api import build_router, install_error_handlers
from .config import ROOT, config
from .db import open_db
from .orders import OrderService
from .worker import ExpiryWorker

logging.basicConfig(level=logging.INFO, format="[%(name)s] %(message)s")
log = logging.getLogger("twoway")


def create_app(serve_frontend: bool = False) -> FastAPI:
    db = open_db(config.db_path)
    accounts = AccountService(db)
    svc = OrderService(db, accounts)
    worker = ExpiryWorker(svc, config.worker_interval_s)

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        await svc.recover_pending_payouts()
        worker.start()
        log.info("settlement contract %s", config.settlement_contract_id)
        log.info("operator            %s", config.operator.public_key)
        log.info("database            %s", config.db_path)
        yield
        await worker.stop()
        await chain.close()
        db.close()

    app = FastAPI(title="TwoWay Stellar", lifespan=lifespan, docs_url="/api/docs", openapi_url="/api/openapi.json")
    install_error_handlers(app)
    app.include_router(build_router(svc, accounts, worker.kick))

    if serve_frontend:
        dist = ROOT / "dist"
        if not (dist / "index.html").exists():
            raise RuntimeError("dist/ not found: run `npm run build` first.")
        app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

        @app.get("/{path:path}", include_in_schema=False)
        async def spa(path: str):
            f = (dist / path).resolve()
            if path and f.is_file() and dist.resolve() in f.parents:
                return FileResponse(f)
            return FileResponse(dist / "index.html")

    return app
