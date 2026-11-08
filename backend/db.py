"""The UnderCover database, seeded from data/ the first time the backend starts."""

import json
import os
import sqlite3
from collections.abc import Iterator
from datetime import UTC, datetime
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data"
DEFAULT_DB = Path(__file__).resolve().parent / "undercover.db"
SEED_FILES = ("claims.json", "policies.json", "customers.json", "handlers.json")

SCHEMA = """
CREATE TABLE IF NOT EXISTS claims (
    claim_id TEXT PRIMARY KEY,
    policy_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    status TEXT NOT NULL,
    thread_id TEXT,
    data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS policies (policy_id TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS customers (
    customer_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    previous_claims TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS handlers (handler_id TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS decisions (
    claim_id TEXT PRIMARY KEY,
    decision TEXT NOT NULL,
    payout REAL NOT NULL,
    reasons TEXT NOT NULL,
    policy_section TEXT NOT NULL,
    decided_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS payments (
    claim_id TEXT PRIMARY KEY,
    amount REAL NOT NULL,
    paid_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sign_offs (
    claim_id TEXT PRIMARY KEY,
    handler_id TEXT NOT NULL,
    signed_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS steps (
    step_id INTEGER PRIMARY KEY AUTOINCREMENT,
    claim_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at TEXT NOT NULL
);
"""


def db_path() -> str:
    """Return the database file, from UNDERCOVER_DB or the default."""
    return os.getenv("UNDERCOVER_DB", str(DEFAULT_DB))


def now() -> str:
    """Return the current time in UTC as an ISO 8601 string."""
    return datetime.now(UTC).isoformat(timespec="seconds")


def load(name: str) -> list[dict]:
    """Load one of the seed files from data/."""
    return json.loads((DATA / name).read_text(encoding="utf-8"))


def init_db() -> None:
    """Create the tables and add any seed records that are missing."""
    claims, policies, customers, handlers = (load(name) for name in SEED_FILES)
    with sqlite3.connect(db_path()) as conn:
        conn.executescript(SCHEMA)
        conn.executemany(
            "INSERT OR IGNORE INTO claims VALUES (?, ?, ?, 'waiting', NULL, ?)",
            [
                (c["claim_id"], c["policy_id"], c["customer_id"], json.dumps(c))
                for c in claims
            ],
        )
        conn.executemany(
            "INSERT OR IGNORE INTO policies VALUES (?, ?)",
            [(p["policy_id"], json.dumps(p)) for p in policies],
        )
        conn.executemany(
            "INSERT OR IGNORE INTO customers VALUES (?, ?, ?)",
            [
                (c["customer_id"], c["name"], json.dumps(c["previous_claims"]))
                for c in customers
            ],
        )
        conn.executemany(
            "INSERT OR IGNORE INTO handlers VALUES (?, ?)",
            [(h["handler_id"], json.dumps(h)) for h in handlers],
        )
    conn.close()


def get_db() -> Iterator[sqlite3.Connection]:
    """Open a connection for one request, committing its changes at the end.

    FastAPI may finish the request in a different thread from the one that
    opened the connection, so the connection must not be tied to one thread.
    """
    conn = sqlite3.connect(db_path(), timeout=10, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    try:
        with conn:
            yield conn
    finally:
        conn.close()
