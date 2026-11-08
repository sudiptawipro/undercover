import json

from backend import db

PERSONAL_FIELDS = ("email", "phone", "date_of_birth", "address", "street")


def test_queue_is_seeded_with_25_waiting_claims(client):
    claims = client.get("/api/claims").json()
    assert len(claims) == 25
    assert {c["status"] for c in claims} == {"waiting"}
    assert claims[0] == {
        "claim_id": "CLM-1001",
        "customer_name": "Maya Patel",
        "claim_type": "trip_delay",
        "summary": "Flight home canceled by the airline, rebooked the next morning",
        "amount_claimed": 420.0,
        "submitted_on": "2026-06-24",
        "status": "waiting",
        "decision": None,
        "payout": None,
    }


def test_get_claim(client):
    claim = client.get("/api/claims/CLM-1001").json()
    assert claim["customer_name"] == "Maya Patel"
    assert claim["story"].startswith("My flight home from Rome")
    assert len(claim["items"]) == 3
    assert len(claim["documents"]) == 4
    assert claim["status"] == "waiting"
    assert claim["decision"] is None
    assert claim["payment"] is None
    assert claim["sign_off"] is None


def test_get_policy_with_plan_and_add_ons(client):
    policy = client.get("/api/policies/POL-2001").json()
    assert policy["plan"]["name"] == "UnderCover Premium"
    assert policy["plan"]["trip_delay_max"] == 800.0
    assert policy["plan"]["deductible"] == 50.0
    assert policy["deductible_applies_to"] == ["baggage", "emergency_medical"]
    assert policy["travelers"] == ["Maya Patel"]


def test_policy_add_ons_are_spelled_out(client):
    policies = json.loads((db.DATA / "policies.json").read_text())
    with_electronics = next(p for p in policies if "electronics_plus" in p["add_ons"])
    policy = client.get(f"/api/policies/{with_electronics['policy_id']}").json()
    add_on = next(a for a in policy["add_ons"] if a["add_on"] == "electronics_plus")
    assert add_on["electronics_per_item_limit"] == 1200.0


def test_claim_history_holds_no_personal_data(client):
    response = client.get("/api/customers/CUS-3001/claims")
    assert response.json() == [
        {
            "claim_id": "CLM-0412",
            "filed_on": "2024-08-19",
            "incident_date": "2024-08-09",
            "claim_type": "baggage_delay",
            "summary": "Checked bag arrived 30 hours late in Lisbon",
            "outcome": "approved",
            "amount_paid": 140.0,
        }
    ]
    assert not any(field in response.text for field in PERSONAL_FIELDS)


def test_policy_wording(client):
    wording = client.get("/api/policy-wording").json()
    assert wording["version"] == "2026.1"
    assert "How we work out your payment" in wording["text"]


def test_instructions(client):
    text = client.get("/api/instructions").json()["text"]
    assert text.startswith("You are the UnderCover Agent.")
    assert "record_decision" in text


def test_handlers(client):
    handlers = client.get("/api/handlers").json()
    assert [h["name"] for h in handlers] == [
        "Dana Whitfield",
        "Marcus Oyelaran",
        "Priya Raman",
    ]
    assert not any("email" in h for h in handlers)


def test_unknown_ids_are_404(client):
    assert client.get("/api/claims/CLM-0000").status_code == 404
    assert client.get("/api/policies/POL-0000").status_code == 404
    assert client.get("/api/customers/CUS-0000/claims").status_code == 404


def test_seed_never_reads_the_answer_key_or_the_security_claim():
    assert all("/" not in name for name in db.SEED_FILES)
    assert not any(name.startswith(("evals", "security")) for name in db.SEED_FILES)


def test_no_response_carries_the_security_claim(client):
    security = (db.DATA / "security" / "claims.json").read_text()
    security_claim = json.loads(security)[0]
    responses = [client.get("/api/claims").text]
    responses += [
        client.get(f"/api/claims/{c['claim_id']}").text
        for c in client.get("/api/claims").json()
    ]
    assert not any(security_claim["claim_id"] in r for r in responses)
    assert client.get(f"/api/claims/{security_claim['claim_id']}").status_code == 404
    assert client.get(f"/api/policies/{security_claim['policy_id']}").status_code == 404


def test_seeding_again_adds_no_duplicates(client):
    db.init_db()
    assert len(client.get("/api/claims").json()) == 25
