"""Run the server.

  python -m backend --dev   API on :8000 + Vite dev server on :3000 (proxies /api), hot reload
  python -m backend         production: API + built front end (dist/) on :3000
"""
from __future__ import annotations

import argparse
import os
import shutil
import signal
import subprocess
import sys

import uvicorn

from .config import ROOT, config


def main() -> None:
    parser = argparse.ArgumentParser(prog="python -m backend")
    parser.add_argument("--dev", action="store_true", help="also start the Vite dev server for the front end")
    args = parser.parse_args()

    if not args.dev:
        from .app import create_app

        uvicorn.run(create_app(serve_frontend=True), host="0.0.0.0", port=config.port)
        return

    npx = shutil.which("npx")
    if not npx:
        sys.exit("npx not found: install Node.js to run the Vite dev server.")
    vite = subprocess.Popen(
        [npx, "vite", "--port", str(config.port), "--host", "0.0.0.0", "--strictPort"],
        cwd=ROOT,
        env={**os.environ, "API_PORT": str(config.api_port)},
    )
    print(f"TwoWay on http://localhost:{config.port}  (API on :{config.api_port})", flush=True)
    try:
        from .app import create_app

        uvicorn.run(create_app(), host="127.0.0.1", port=config.api_port)
    finally:
        vite.send_signal(signal.SIGTERM)
        vite.wait(timeout=10)


if __name__ == "__main__":
    main()
