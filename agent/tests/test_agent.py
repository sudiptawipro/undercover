import pytest
from fastapi.testclient import TestClient
from langchain_core.language_models.fake_chat_models import GenericFakeChatModel
from langchain_core.messages import AIMessage

from agent import main
from backend.main import app

POLICY_SECTION = "Section 3, Trip Delay"


class StubModel(GenericFakeChatModel):
    """A chat model that gives scripted replies in place of a real model."""

    def bind_tools(self, tools, **kwargs):
        return self


class BrokenModel(StubModel):
    """A chat model that fails, as a real one can when its service is down."""

    def _generate(self, *args, **kwargs):
        raise RuntimeError("model unavailable")


@pytest.fixture(autouse=True)
def backend(tmp_path, monkeypatch):
    monkeypatch.setenv("UNDERCOVER_DB", str(tmp_path / "test.db"))
    monkeypatch.setattr(main, "backend", lambda: TestClient(app))


def call(name, **args):
    return AIMessage(content="", tool_calls=[{"name": name, "args": args, "id": name}])


def stub(*replies):
    return StubModel(messages=iter(replies))


def decide(payout):
    return call(
        "record_decision",
        decision="approve",
        payout=payout,
        reasons="The delay is covered.",
        policy_section=POLICY_SECTION,
    )


def claim(claim_id):
    return main.api_get(f"/api/claims/{claim_id}").json()


def steps(claim_id):
    return main.api_get(f"/api/claims/{claim_id}/steps").json()


def test_read_tools_return_the_records():
    tools = {t.name: t for t in main.claim_tools("CLM-1001")}
    assert '"claim_id":"CLM-1001"' in tools["get_claim"].invoke({})
    assert "UnderCover Premium" in tools["get_policy"].invoke({"policy_id": "POL-2001"})
    assert "CLM-0412" in tools["get_claim_history"].invoke({"customer_id": "CUS-3001"})
    assert "How we work out your payment" in tools["get_policy_wording"].invoke({})


def test_tools_return_refusals_to_the_model():
    tools = {t.name: t for t in main.claim_tools("CLM-1001")}
    assert tools["get_policy"].invoke({"policy_id": "POL-0000"}) == (
        "Refused: No policy POL-0000"
    )
    assert tools["pay_claim"].invoke({"amount": 420.0}) == (
        "Refused: Claim CLM-1001 has not been approved"
    )


def test_run_approves_and_pays_a_claim_under_the_limit():
    model = stub(
        call("get_claim"),
        call("get_policy", policy_id="POL-2001"),
        call("get_claim_history", customer_id="CUS-3001"),
        call("get_policy_wording"),
        decide(420.0),
        call("pay_claim", amount=420.0),
        AIMessage(content="Approved CLM-1001 for $420.00."),
    )
    assert main.run("CLM-1001", "thread-1", model) == "Approved CLM-1001 for $420.00."

    result = claim("CLM-1001")
    assert result["status"] == "decided"
    assert result["decision"]["payout"] == 420.0
    assert result["decision"]["policy_section"] == POLICY_SECTION
    assert result["payment"]["amount"] == 420.0

    recorded = steps("CLM-1001")
    assert [s["kind"] for s in recorded] == ["tool_call", "tool_result"] * 6 + ["reply"]
    texts = [s["text"] for s in recorded]
    assert texts[0] == "Read the claim"
    assert texts[2] == "Read the policy: policy_id=POL-2001"
    assert texts[7].endswith("...")
    assert texts[9] == (
        "record_decision: Decision recorded. Now call pay_claim with 420.00."
    )
    assert texts[10] == "Pay the claim: amount=420.0"
    assert texts[11] == "pay_claim: Paid $420.00."
    assert texts[12] == "Approved CLM-1001 for $420.00."


def test_payment_over_the_limit_is_refused_even_when_the_agent_tries():
    model = stub(
        decide(3750.0),
        call("pay_claim", amount=3750.0),
        AIMessage(content="Approved; the payment waits for sign-off."),
    )
    main.run("CLM-1003", "thread-1", model)

    result = claim("CLM-1003")
    assert result["status"] == "awaiting_sign_off"
    assert result["payment"] is None
    texts = [s["text"] for s in steps("CLM-1003")]
    assert (
        "record_decision: Decision recorded. The payment waits for a handler's "
        "sign-off, so do not pay it." in texts
    )
    assert (
        "pay_claim: Refused: A payout over $1,000.00 needs a handler's "
        "sign-off" in texts
    )


def test_an_invalid_decision_is_refused_and_the_claim_goes_back():
    model = stub(
        call(
            "record_decision",
            decision="decline",
            payout=50.0,
            reasons="Not covered.",
            policy_section=POLICY_SECTION,
        ),
        AIMessage(content="Declined."),
    )
    main.run("CLM-1001", "thread-1", model)
    recorded = steps("CLM-1001")
    assert recorded[1]["text"].startswith("record_decision: Refused:")
    assert claim("CLM-1001")["status"] == "waiting"


def test_a_run_without_a_decision_goes_back_to_the_queue():
    reply = main.run(
        "CLM-1001", "thread-1", stub(call("get_claim"), AIMessage(content="Hmm."))
    )
    assert reply == "The agent finished without recording a decision."
    assert claim("CLM-1001")["status"] == "waiting"
    last = steps("CLM-1001")[-1]
    assert last["kind"] == "error"
    assert last["text"] == reply


def test_a_failing_model_puts_the_claim_back():
    reply = main.run("CLM-1001", "thread-1", BrokenModel(messages=iter([])))
    assert reply == "The agent stopped with an error: model unavailable"
    assert claim("CLM-1001")["status"] == "waiting"
    last = steps("CLM-1001")[-1]
    assert last["kind"] == "error"
    assert last["text"] == reply


def test_a_run_the_backend_started_continues_in_its_thread(monkeypatch):
    real_run = main.run
    started = []
    monkeypatch.setattr(main, "run", lambda *args: started.append(args))
    with TestClient(app) as client:
        assert client.post("/api/claims/CLM-1001/run").status_code == 202

    claim_id, thread_id = started[0]
    model = stub(decide(420.0), AIMessage(content="Approved."))
    assert real_run(claim_id, thread_id, model) == "Approved."
    assert claim("CLM-1001")["status"] == "decided"


def test_a_claim_in_another_thread_cannot_be_started():
    main.run("CLM-1001", "thread-1", stub(decide(420.0), AIMessage(content="Done.")))
    with pytest.raises(Exception, match="409 Conflict"):
        main.run("CLM-1001", "thread-2", stub(AIMessage(content="Again.")))


def test_cli_runs_the_named_claims(monkeypatch, capsys):
    ran = []
    monkeypatch.setattr(main, "run", lambda claim_id, _: ran.append(claim_id) or "ok")
    main.cli(["CLM-1001", "CLM-1002"])
    assert ran == ["CLM-1001", "CLM-1002"]
    assert capsys.readouterr().out == (
        "CLM-1001 (waiting): ok\nCLM-1002 (waiting): ok\n"
    )


def test_cli_runs_the_queue(monkeypatch):
    ran = []
    monkeypatch.setattr(main, "run", lambda claim_id, _: ran.append(claim_id) or "ok")
    main.cli(["--queue"])
    assert len(ran) == 25
    assert ran[0] == "CLM-1001"


def test_cli_needs_a_claim(capsys):
    with pytest.raises(SystemExit):
        main.cli([])
    assert "give a claim id, or --queue" in capsys.readouterr().err


def test_model_name(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    monkeypatch.delenv("MODEL_NAME", raising=False)
    assert main.model().model_name == "openai/gpt-6-luna"
    monkeypatch.setenv("MODEL_NAME", "openrouter/free")
    assert main.model().model_name == "openrouter/free"


def test_a_decline_tells_the_agent_there_is_nothing_to_pay():
    tools = {t.name: t for t in main.claim_tools("CLM-1001")}
    main.api_post("/api/claims/CLM-1001/start", {"thread_id": "thread-1"})
    result = tools["record_decision"].invoke(
        {
            "decision": "decline",
            "payout": 0,
            "reasons": "Not covered.",
            "policy_section": POLICY_SECTION,
        }
    )
    assert result == "Decision recorded. There is nothing to pay."


def test_a_run_ends_with_one_reply_step():
    narrating = AIMessage(
        content="Let me record the decision.",
        tool_calls=[
            {
                "name": "record_decision",
                "args": {
                    "decision": "decline",
                    "payout": 0,
                    "reasons": "Not covered.",
                    "policy_section": POLICY_SECTION,
                },
                "id": "1",
            }
        ],
    )
    assert main.run("CLM-1001", "thread-1", stub(narrating, AIMessage(content="")))
    recorded = steps("CLM-1001")
    assert [s["kind"] for s in recorded] == ["tool_call", "tool_result", "reply"]
    assert recorded[-1]["text"] == "The agent finished."


def test_a_model_failure_after_the_decision_keeps_the_decision():
    def decide_then_fail():
        yield decide(3750.0)
        raise RuntimeError("Rate limit exceeded: free-models-per-day")

    reply = main.run("CLM-1003", "thread-1", StubModel(messages=decide_then_fail()))
    assert reply == (
        "The agent stopped with an error: Rate limit exceeded: free-models-per-day"
    )
    result = claim("CLM-1003")
    assert result["status"] == "awaiting_sign_off"
    assert result["decision"]["payout"] == 3750.0
    last = steps("CLM-1003")[-1]
    assert last["kind"] == "error"
    assert last["text"] == reply
