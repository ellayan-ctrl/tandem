"""TwoWay Stellar server: SQLite order book, bilateral matching, off-chain netting of matched
volume, and Soroban settlement of only the unmatched remainder when a matching window closes."""

import os as _os

import certifi as _certifi

# Some Python installs (e.g. python.org builds on macOS) ship without root certificates. Use
# certifi's bundle unless the environment says otherwise. This must run before aiohttp is first
# imported (it builds its TLS context at import time), hence here rather than in config.py.
_os.environ.setdefault("SSL_CERT_FILE", _certifi.where())
