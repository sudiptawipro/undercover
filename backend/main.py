"""The UnderCover backend."""

import json
import sqlite3
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated

from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException

from agent import main as agent
from backend.db import DATA, get_db, init_db, now
from backend.models import (
    Claim,
    ClaimSummary,
    DecisionRequest,
    Handler,
    Instructions,
    Payment,
    PaymentRequest,
    Policy,
    PreviousClaim,
    RecordedDecision,
    SignOff,
    SignOffRequest,
    StartRequest,
    Status,
    Step,
    StepRequest,
    Wording,
)

INSTRUCTIONS = Path(__file__).resolve().parent / "instructions.md"
COMPANY = json.loads((DATA / "company.json").read_text(encoding="utf-8"))
PLANS = json.loads((DATA / "plans.json").read_text(encoding="utf-8"))
WORDING = (DATA / "policy_wording.md").read_text(encoding="utf-8")
LIMIT: float = COMPANY["payout_approval_limit"]

# "function" commits each request's changes before its response is sent.
Db = Annotated[sqlite3.Connection, Depends(get_db, scope="function")]


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


def money(amount: float) -> str:
    """Format an amount in US dollars, such as $1,250.00."""
    return f"${amount:,.2f}"


def move_claim(
    db: sqlite3.Connection, claim_id: str, from_status: Status, to_status: Status
) -> None:
    """Move a claim from one state to another, or raise a 409 if it isn't there."""
    moved = db.execute(
        "UPDATE claims SET status = ? WHERE claim_id = ? AND status = ?",
        (to_status, claim_id, from_status),
    ).rowcount
    if not moved:
        status = find_claim(db, claim_id)["status"]
        raise HTTPException(409, f"Claim {claim_id} is {status}, not {from_status}")


def begin_work(db: sqlite3.Connection, claim_id: str, thread_id: str) -> None:
    """Move a waiting claim to in progress in a thread, or raise a 409.

    Starting again in the same thread is allowed, so a run the backend started
    can call start_claim itself.
    """
    started = db.execute(
        "UPDATE claims SET status = 'in_progress', thread_id = ? WHERE claim_id = ? "
        "AND (status = 'waiting' OR (status = 'in_progress' AND thread_id = ?))",
        (thread_id, claim_id, thread_id),
    ).rowcount
    if not started:
        status = find_claim(db, claim_id)["status"]
        raise HTTPException(409, f"Claim {claim_id} is {status}, not waiting")


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


@app.post("/api/claims/{claim_id}/start", operation_id="start_claim")
def start_claim(claim_id: str, body: StartRequest, db: Db) -> Claim:
    """Start work on a waiting claim in the given thread."""
    begin_work(db, claim_id, body.thread_id)
    return load_claim(db, claim_id)


@app.get("/api/claims/{claim_id}/steps", operation_id="list_steps")
def list_steps(claim_id: str, db: Db) -> list[Step]:
    """List the agent's steps on a claim, oldest first."""
    find_claim(db, claim_id)
    rows = db.execute(
        "SELECT step_id, kind, text, created_at FROM steps WHERE claim_id = ? "
        "ORDER BY step_id",
        (claim_id,),
    ).fetchall()
    return [Step(**dict(row)) for row in rows]


@app.post("/api/claims/{claim_id}/steps", operation_id="record_step")
def record_step(claim_id: str, body: StepRequest, db: Db) -> Step:
    """Record one step the agent took on a claim."""
    find_claim(db, claim_id)
    created_at = now()
    cursor = db.execute(
        "INSERT INTO steps (claim_id, kind, text, created_at) VALUES (?, ?, ?, ?)",
        (claim_id, body.kind, body.text, created_at),
    )
    return Step(
        step_id=cursor.lastrowid or 0,
        kind=body.kind,
        text=body.text,
        created_at=created_at,
    )


@app.post("/api/claims/{claim_id}/decision", operation_id="record_decision")
def record_decision(claim_id: str, body: DecisionRequest, db: Db) -> Claim:
    """Record the decision on a claim in progress, with its payout and reasons."""
    payout = round(body.payout, 2)
    over_limit = body.decision == "approve" and payout > LIMIT
    move_claim(
        db, claim_id, "in_progress", "awaiting_sign_off" if over_limit else "decided"
    )
    db.execute(
        "INSERT INTO decisions VALUES (?, ?, ?, ?, ?, ?)",
        (claim_id, body.decision, payout, body.reasons, body.policy_section, now()),
    )
    return load_claim(db, claim_id)


@app.post("/api/claims/{claim_id}/payments", operation_id="pay_claim")
def pay_claim(claim_id: str, body: PaymentRequest, db: Db) -> Claim:
    """Pay an approved claim its payout, once any sign-off it needs is given."""
    claim = load_claim(db, claim_id)
    if claim.decision is None or claim.decision.decision != "approve":
        raise HTTPException(409, f"Claim {claim_id} has not been approved")
    if claim.decision.payout > LIMIT and claim.sign_off is None:
        raise HTTPException(
            403, f"A payout over {money(LIMIT)} needs a handler's sign-off"
        )
    if round(body.amount, 2) != claim.decision.payout:
        raise HTTPException(
            409,
            f"The amount must match the approved payout of "
            f"{money(claim.decision.payout)}",
        )
    paid = db.execute(
        "INSERT OR IGNORE INTO payments VALUES (?, ?, ?)",
        (claim_id, claim.decision.payout, now()),
    ).rowcount
    if not paid:
        raise HTTPException(409, f"Claim {claim_id} has already been paid")
    return load_claim(db, claim_id)


@app.post("/api/claims/{claim_id}/sign-off", operation_id="sign_off")
def sign_off(claim_id: str, body: SignOffRequest, db: Db) -> Claim:
    """Sign off a payout over the limit as a handler, which releases its payment."""
    find_claim(db, claim_id)
    row = db.execute(
        "SELECT data FROM handlers WHERE handler_id = ?", (body.handler_id,)
    ).fetchone()
    if row is None:
        raise HTTPException(404, f"No handler {body.handler_id}")
    if not json.loads(row["data"])["can_approve_over_limit"]:
        raise HTTPException(403, f"{body.handler_id} cannot sign off this payout")
    move_claim(db, claim_id, "awaiting_sign_off", "decided")
    signed_at = now()
    db.execute(
        "INSERT INTO sign_offs VALUES (?, ?, ?)", (claim_id, body.handler_id, signed_at)
    )
    db.execute(
        "INSERT INTO payments SELECT claim_id, payout, ? FROM decisions "
        "WHERE claim_id = ?",
        (signed_at, claim_id),
    )
    return load_claim(db, claim_id)


@app.post("/api/claims/{claim_id}/return", operation_id="return_to_queue")
def return_to_queue(claim_id: str, db: Db) -> Claim:
    """Put a claim in progress back in the queue, waiting."""
    move_claim(db, claim_id, "in_progress", "waiting")
    return load_claim(db, claim_id)


@app.post("/api/claims/{claim_id}/run", operation_id="run_agent", status_code=202)
def run_agent(claim_id: str, background_tasks: BackgroundTasks, db: Db) -> Claim:
    """Start the agent on a waiting claim; it works in the background."""
    thread_id = str(uuid.uuid4())
    begin_work(db, claim_id, thread_id)
    background_tasks.add_task(agent.run, claim_id, thread_id)
    return load_claim(db, claim_id)
