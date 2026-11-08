from backend import main


def test_run_agent_starts_the_agent_on_a_waiting_claim(client, monkeypatch):
    runs = []
    monkeypatch.setattr(main.agent, "run", lambda *args: runs.append(args))
    response = client.post("/api/claims/CLM-1001/run")
    assert response.status_code == 202
    assert response.json()["status"] == "in_progress"
    assert len(runs) == 1
    claim_id, thread_id = runs[0]
    assert claim_id == "CLM-1001"
    assert thread_id


def test_run_agent_refuses_a_claim_that_is_not_waiting(client, monkeypatch):
    monkeypatch.setattr(main.agent, "run", lambda *args: None)
    client.post("/api/claims/CLM-1001/run")
    again = client.post("/api/claims/CLM-1001/run")
    assert again.status_code == 409
    assert again.json()["detail"] == "Claim CLM-1001 is in_progress, not waiting"
    assert client.post("/api/claims/CLM-0000/run").status_code == 404
