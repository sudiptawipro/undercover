"""The UnderCover backend."""

import json
import sqlite3
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException

from backend.db import DATA, get_db, init_db
from backend.models import (
    Claim,
    ClaimSummary,
    Handler,
    Instructions,
    Payment,
    Policy,
    PreviousClaim,
    RecordedDecision,
    SignOff,
    Wording,
)

INSTRUCTIONS = Path(__file__).resolve().parent / "instructions.md"
COMPANY = json.loads((DATA / "company.json").read_text(encoding="utf-8"))
PLANS = json.loads((DATA / "plans.json").read_text(encoding="utf-8"))
WORDING = (DATA / "policy_wording.md").read_text(encoding="utf-8")

Db = Annotated[sqlite3.Connection, Depends(get_db)]


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    init_db()
    yield


app = FastAPI(title="UnderCover", lifespan=lifespan)


def find_claim(db: sqlite3.Connection, claim_id: str) -> sqlite3.Row:
    """Return a claim's row, or raise a 404."""
    row = db.execute("SELECT * FROM claims WHERE claim_id = ?", (claim_id,)).fetchone()
    if row is None:
        raise HTTPException(404, f"No claim {claim_id}")
    return row


def load_claim(db: sqlite3.Connection, claim_id: str) -> Claim:
    """Return a claim in full, with its decision, payment and sign-off."""
    row = find_claim(db, claim_id)
    customer = db.execute(
        "SELECT name FROM customers WHERE customer_id = ?", (row["customer_id"],)
    ).fetchone()
    decision = db.execute(
        "SELECT * FROM decisions WHERE claim_id = ?", (claim_id,)
    ).fetchone()
    payment = db.execute(
        "SELECT * FROM payments WHERE claim_id = ?", (claim_id,)
    ).fetchone()
    sign_off = db.execute(
        "SELECT s.handler_id, s.signed_at, h.data FROM sign_offs s "
        "JOIN handlers h USING (handler_id) WHERE s.claim_id = ?",
        (claim_id,),
    ).fetchone()
    return Claim(
        **json.loads(row["data"])
        | {
            "customer_name": customer["name"],
            "status": row["status"],
            "decision": RecordedDecision(**dict(decision)) if decision else None,
            "payment": Payment(**dict(payment)) if payment else None,
            "sign_off": SignOff(
                handler_id=sign_off["handler_id"],
                handler_name=json.loads(sign_off["data"])["name"],
                signed_at=sign_off["signed_at"],
            )
            if sign_off
            else None,
        }
    )


@app.get("/api/health", operation_id="health")
def health() -> dict[str, str]:
    """Check that the backend is running."""
    return {"status": "ok"}


@app.get("/api/claims", operation_id="list_claims")
def list_claims(db: Db) -> list[ClaimSummary]:
    """List every claim in the queue with where it stands."""
    rows = db.execute(
        "SELECT c.data, c.status, cu.name, d.decision, d.payout FROM claims c "
        "JOIN customers cu USING (customer_id) "
        "LEFT JOIN decisions d USING (claim_id) ORDER BY c.claim_id"
    ).fetchall()
    return [
        ClaimSummary(
            **json.loads(row["data"])
            | {
                "customer_name": row["name"],
                "status": row["status"],
                "decision": row["decision"],
                "payout": row["payout"],
            }
        )
        for row in rows
    ]


@app.get("/api/claims/{claim_id}", operation_id="get_claim")
def get_claim(claim_id: str, db: Db) -> Claim:
    """Read a claim in full, with its decision, payment and sign-off."""
    return load_claim(db, claim_id)


@app.get("/api/policies/{policy_id}", operation_id="get_policy")
def get_policy(policy_id: str, db: Db) -> Policy:
    """Read a policy with its plan's limits and its add-ons."""
    row = db.execute(
        "SELECT data FROM policies WHERE policy_id = ?", (policy_id,)
    ).fetchone()
    if row is None:
        raise HTTPException(404, f"No policy {policy_id}")
    policy = json.loads(row["data"])
    plan = next(p for p in PLANS["plans"] if p["plan"] == policy["plan"])
    add_ons = [a for a in PLANS["add_ons"] if a["add_on"] in policy["add_ons"]]
    return Policy(
        **policy
        | {
            "plan": plan,
            "add_ons": add_ons,
            "deductible_applies_to": PLANS["deductible_applies_to"],
        }
    )


@app.get("/api/customers/{customer_id}/claims", operation_id="get_claim_history")
def get_claim_history(customer_id: str, db: Db) -> list[PreviousClaim]:
    """Read a customer's earlier claims."""
    row = db.execute(
        "SELECT previous_claims FROM customers WHERE customer_id = ?", (customer_id,)
    ).fetchone()
    if row is None:
        raise HTTPException(404, f"No customer {customer_id}")
    return [PreviousClaim(**c) for c in json.loads(row["previous_claims"])]


@app.get("/api/policy-wording", operation_id="get_policy_wording")
def get_policy_wording() -> Wording:
    """Read the policy wording."""
    return Wording(version=COMPANY["policy_wording_version"], text=WORDING)


@app.get("/api/instructions", operation_id="get_instructions")
def get_instructions() -> Instructions:
    """Read the agent's instructions."""
    return Instructions(text=INSTRUCTIONS.read_text(encoding="utf-8"))


@app.get("/api/handlers", operation_id="list_handlers")
def list_handlers(db: Db) -> list[Handler]:
    """List the claims handlers."""
    rows = db.execute("SELECT data FROM handlers ORDER BY handler_id").fetchall()
    return [Handler(**json.loads(row["data"])) for row in rows]
