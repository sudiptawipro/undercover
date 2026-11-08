import pytest

from backend import db


def start(client, claim_id, thread_id="thread-1"):
    return client.post(f"/api/claims/{claim_id}/start", json={"thread_id": thread_id})


def decide(client, claim_id, decision="approve", payout=420.0):
    return client.post(
        f"/api/claims/{claim_id}/decision",
        json={
            "decision": decision,
            "payout": payout,
            "reasons": "The delay is covered.",
            "policy_section": "Section 3, Trip Delay",
        },
    )


def pay(client, claim_id, amount):
    return client.post(f"/api/claims/{claim_id}/payments", json={"amount": amount})


def sign_off(client, claim_id, handler_id="HND-01"):
    return client.post(
        f"/api/claims/{claim_id}/sign-off", json={"handler_id": handler_id}
    )


def status(client, claim_id):
    return client.get(f"/api/claims/{claim_id}").json()["status"]


def test_start_moves_a_waiting_claim_to_in_progress(client):
    assert start(client, "CLM-1001").json()["status"] == "in_progress"
    assert start(client, "CLM-1001").status_code == 200
    assert start(client, "CLM-1001", "thread-2").status_code == 409


def test_start_an_unknown_claim_is_404(client):
    assert start(client, "CLM-0000").status_code == 404


def test_approve_and_pay_under_the_limit(client):
    start(client, "CLM-1001")
    claim = decide(client, "CLM-1001").json()
    assert claim["status"] == "decided"
    assert claim["decision"]["decision"] == "approve"
    assert claim["decision"]["payout"] == 420.0
    assert claim["decision"]["reasons"] == "The delay is covered."
    assert claim["decision"]["policy_section"] == "Section 3, Trip Delay"
    assert claim["payment"] is None

    paid = pay(client, "CLM-1001", 420.0)
    assert paid.status_code == 200
    assert paid.json()["payment"]["amount"] == 420.0
    assert paid.json()["status"] == "decided"
    again = pay(client, "CLM-1001", 420.0)
    assert again.status_code == 409
    assert again.json()["detail"] == "Claim CLM-1001 has already been paid"


def test_queue_shows_the_decision(client):
    start(client, "CLM-1001")
    decide(client, "CLM-1001")
    first = client.get("/api/claims").json()[0]
    assert first["status"] == "decided"
    assert first["decision"] == "approve"
    assert first["payout"] == 420.0


def test_payment_over_the_limit_is_blocked_until_sign_off(client):
    start(client, "CLM-1003")
    assert decide(client, "CLM-1003", payout=3750.0).json()["status"] == (
        "awaiting_sign_off"
    )
    blocked = pay(client, "CLM-1003", 3750.0)
    assert blocked.status_code == 403
    assert (
        blocked.json()["detail"] == "A payout over $1,000.00 needs a handler's sign-off"
    )
    assert client.get("/api/claims/CLM-1003").json()["payment"] is None

    signed = sign_off(client, "CLM-1003")
    assert signed.status_code == 200
    claim = signed.json()
    assert claim["status"] == "decided"
    assert claim["sign_off"]["handler_id"] == "HND-01"
    assert claim["sign_off"]["handler_name"] == "Dana Whitfield"
    assert claim["payment"]["amount"] == 3750.0
    assert sign_off(client, "CLM-1003").status_code == 409
    assert pay(client, "CLM-1003", 3750.0).status_code == 409


def test_payout_of_exactly_the_limit_needs_no_sign_off(client):
    start(client, "CLM-1002")
    assert decide(client, "CLM-1002", payout=1000.0).json()["status"] == "decided"
    assert pay(client, "CLM-1002", 1000.0).status_code == 200


def test_payout_a_cent_over_the_limit_needs_sign_off(client):
    start(client, "CLM-1002")
    assert decide(client, "CLM-1002", payout=1000.01).json()["status"] == (
        "awaiting_sign_off"
    )


@pytest.mark.parametrize("decision", ["decline", "refer"])
def test_decline_and_refer_are_decided_with_no_payout(client, decision):
    start(client, "CLM-1001")
    claim = decide(client, "CLM-1001", decision, 0).json()
    assert claim["status"] == "decided"
    assert claim["decision"]["payout"] == 0
    refused = pay(client, "CLM-1001", 420.0)
    assert refused.status_code == 409
    assert refused.json()["detail"] == "Claim CLM-1001 has not been approved"


def test_payment_must_match_the_payout(client):
    start(client, "CLM-1001")
    decide(client, "CLM-1001")
    refused = pay(client, "CLM-1001", 500.0)
    assert refused.status_code == 409
    assert refused.json()["detail"] == (
        "The amount must match the approved payout of $420.00"
    )


def test_paying_an_undecided_claim_is_refused(client):
    assert pay(client, "CLM-1001", 420.0).status_code == 409


@pytest.mark.parametrize(
    ("decision", "payout"), [("decline", 50), ("refer", 1), ("approve", -1)]
)
def test_invalid_payouts_are_422(client, decision, payout):
    start(client, "CLM-1001")
    assert decide(client, "CLM-1001", decision, payout).status_code == 422
    assert status(client, "CLM-1001") == "in_progress"


def test_decision_needs_reasons_and_a_section(client):
    start(client, "CLM-1001")
    response = client.post(
        "/api/claims/CLM-1001/decision",
        json={
            "decision": "decline",
            "payout": 0,
            "reasons": "",
            "policy_section": "",
        },
    )
    assert response.status_code == 422


def test_deciding_a_waiting_claim_is_409(client):
    response = decide(client, "CLM-1001")
    assert response.status_code == 409
    assert response.json()["detail"] == "Claim CLM-1001 is waiting, not in_progress"


def test_deciding_twice_is_409(client):
    start(client, "CLM-1001")
    decide(client, "CLM-1001")
    assert decide(client, "CLM-1001", "decline", 0).status_code == 409
    claim = client.get("/api/claims/CLM-1001").json()
    assert claim["decision"]["decision"] == "approve"


def test_sign_off_needs_a_known_handler_and_a_claim_waiting_for_it(client):
    start(client, "CLM-1003")
    decide(client, "CLM-1003", payout=3750.0)
    assert sign_off(client, "CLM-1003", "HND-99").status_code == 404
    assert sign_off(client, "CLM-1001").status_code == 409
    assert sign_off(client, "CLM-0000").status_code == 404


def test_sign_off_needs_a_handler_who_can_approve_over_the_limit(client):
    with db.sqlite3.connect(db.db_path()) as conn:
        conn.execute(
            "UPDATE handlers SET data = json_set(data, '$.can_approve_over_limit', "
            "json('false')) WHERE handler_id = 'HND-03'"
        )
    conn.close()
    start(client, "CLM-1003")
    decide(client, "CLM-1003", payout=3750.0)
    assert sign_off(client, "CLM-1003", "HND-03").status_code == 403
    assert status(client, "CLM-1003") == "awaiting_sign_off"


def test_steps_come_back_in_order(client):
    for kind, text in [("tool_call", "Read the claim"), ("reply", "Approved")]:
        posted = client.post(
            "/api/claims/CLM-1001/steps", json={"kind": kind, "text": text}
        )
        assert posted.status_code == 200
    steps = client.get("/api/claims/CLM-1001/steps").json()
    assert [(s["kind"], s["text"]) for s in steps] == [
        ("tool_call", "Read the claim"),
        ("reply", "Approved"),
    ]
    assert steps[0]["step_id"] < steps[1]["step_id"]
    assert client.get("/api/claims/CLM-1002/steps").json() == []


def test_steps_need_a_known_claim_kind_and_text(client):
    assert client.get("/api/claims/CLM-0000/steps").status_code == 404
    step = {"kind": "reply", "text": "Hi"}
    assert client.post("/api/claims/CLM-0000/steps", json=step).status_code == 404
    bad_kind = {"kind": "thought", "text": "Hi"}
    assert client.post("/api/claims/CLM-1001/steps", json=bad_kind).status_code == 422
    empty = {"kind": "reply", "text": ""}
    assert client.post("/api/claims/CLM-1001/steps", json=empty).status_code == 422


def test_return_to_queue(client):
    start(client, "CLM-1001")
    returned = client.post("/api/claims/CLM-1001/return")
    assert returned.json()["status"] == "waiting"
    assert client.post("/api/claims/CLM-1001/return").status_code == 409
    assert start(client, "CLM-1001", "thread-2").status_code == 200


def test_seeding_again_keeps_the_claims_as_they_are(client):
    start(client, "CLM-1001")
    db.init_db()
    assert status(client, "CLM-1001") == "in_progress"
