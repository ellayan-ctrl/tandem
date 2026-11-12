from __future__ import annotations

from typing import Optional


class HttpError(Exception):
    """An error with an HTTP status, returned to the client as {"error": message}."""

    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


class ChainError(Exception):
    """A Stellar / Soroban failure, returned as 502 {"error", "code"}."""

    def __init__(self, message: str, code: Optional[str] = None):
        super().__init__(message)
        self.message = message
        self.code = code
