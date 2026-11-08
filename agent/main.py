"""The UnderCover Agent."""

import argparse
import os
import uuid
from typing import Any, Literal

import httpx
from dotenv import load_dotenv
from langchain.agents import create_agent
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, BaseMessage, ToolMessage
from langchain_core.tools import BaseTool, tool
from langchain_openai import ChatOpenAI
from pydantic import SecretStr

load_dotenv(override=True)

BACKEND_URL = os.getenv("BACKEND_URL", "http://127.0.0.1:8000")
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
DEFAULT_MODEL = "openai/gpt-6-luna"
RECURSION_LIMIT = 40
RESULT_LENGTH = 200
LABELS = {
    "get_claim": "Read the claim",
    "get_policy": "Read the policy",
    "get_claim_history": "Read the claim history",
    "get_policy_wording": "Read the policy wording",
    "record_decision": "Record the decision",
    "pay_claim": "Pay the claim",
}


def backend() -> httpx.Client:
    """Return a client for the UnderCover backend."""
    return httpx.Client(base_url=BACKEND_URL, timeout=30)


def api_get(path: str) -> httpx.Response:
    """GET a path from the backend."""
    with backend() as client:
        return client.get(path)


def api_post(path: str, body: dict[str, Any]) -> httpx.Response:
    """POST a JSON body to a path on the backend."""
    with backend() as client:
        return client.post(path, json=body)


def refusal(response: httpx.Response) -> str:
    """Describe a request the backend refused, for the model to read."""
    return f"Refused: {response.json()['detail']}"


def read(path: str) -> str:
    """Read a path for the model: the JSON body, or why it was refused."""
    response = api_get(path)
    return refusal(response) if response.is_error else response.text


def claim_tools(claim_id: str) -> list[BaseTool]:
    """Return the agent's tools for one claim. The tools that write act on it alone."""

    @tool
    def get_claim() -> str:
        """Read the claim: the customer's story, the items claimed and the documents."""
        return read(f"/api/claims/{claim_id}")

    @tool
    def get_policy(policy_id: str) -> str:
        """Read a policy: its plan's limits, add-ons, covered trip and travelers."""
        return read(f"/api/policies/{policy_id}")

    @tool
    def get_claim_history(customer_id: str) -> str:
        """Read a customer's earlier claims."""
        return read(f"/api/customers/{customer_id}/claims")

    @tool
    def get_policy_wording() -> str:
        """Read the policy wording, which decides what the policy covers."""
        return api_get("/api/policy-wording").json()["text"]

    @tool
    def record_decision(
        decision: Literal["approve", "decline", "refer"],
        payout: float,
        reasons: str,
        policy_section: str,
    ) -> str:
        """Record your decision on the claim with the payout, reasons and section."""
        response = api_post(
            f"/api/claims/{claim_id}/decision",
            {
                "decision": decision,
                "payout": payout,
                "reasons": reasons,
                "policy_section": policy_section,
            },
        )
        if response.is_error:
            return refusal(response)
        recorded = response.json()
        if recorded["status"] == "awaiting_sign_off":
            return (
                "Decision recorded. The payment waits for a handler's sign-off, "
                "so do not pay it."
            )
        if decision == "approve":
            payout = recorded["decision"]["payout"]
            return f"Decision recorded. Now call pay_claim with {payout:.2f}."
        return "Decision recorded. There is nothing to pay."

    @tool
    def pay_claim(amount: float) -> str:
        """Pay the approved claim its payout."""
        response = api_post(f"/api/claims/{claim_id}/payments", {"amount": amount})
        return refusal(response) if response.is_error else f"Paid ${amount:,.2f}."

    return [
        get_claim,
        get_policy,
        get_claim_history,
        get_policy_wording,
        record_decision,
        pay_claim,
    ]


def model() -> ChatOpenAI:
    """Return the model named in MODEL_NAME, or GPT-6 Luna by default."""
    name = os.getenv("MODEL_NAME")
    return ChatOpenAI(
        model=name or DEFAULT_MODEL,
        base_url=OPENROUTER_BASE_URL,
        api_key=SecretStr(os.environ["OPENROUTER_API_KEY"]),
        reasoning_effort=None if name else "low",
    )


def record_step(claim_id: str, kind: str, text: str) -> None:
    """Record one of the agent's steps on the claim."""
    api_post(
        f"/api/claims/{claim_id}/steps", {"kind": kind, "text": text}
    ).raise_for_status()


def describe_call(name: str, args: dict[str, Any]) -> str:
    """Describe a tool call in a short line for the handlers."""
    label = LABELS.get(name, name)
    details = ", ".join(f"{key}={value}" for key, value in args.items())
    return f"{label}: {details}" if details else label


def record_message(claim_id: str, message: BaseMessage) -> str:
    """Record the steps in one message, and return the agent's final reply, if any.

    Only the final message, the one with no tool calls, is recorded as a reply,
    so a reply or an error step always marks the end of a run.
    """
    if isinstance(message, ToolMessage):
        text = message.text
        if len(text) > RESULT_LENGTH:
            text = text[:RESULT_LENGTH] + "..."
        record_step(claim_id, "tool_result", f"{message.name}: {text}")
        return ""
    if isinstance(message, AIMessage) and message.tool_calls:
        for call in message.tool_calls:
            record_step(
                claim_id, "tool_call", describe_call(call["name"], call["args"])
            )
        return ""
    if isinstance(message, AIMessage) and message.text:
        record_step(claim_id, "reply", message.text)
        return message.text
    return ""


def give_up(claim_id: str, reason: str) -> str:
    """Record why the run ended without a decision and put the claim back."""
    record_step(claim_id, "error", reason)
    api_post(f"/api/claims/{claim_id}/return", {}).raise_for_status()
    return reason


def run(claim_id: str, thread_id: str, llm: BaseChatModel | None = None) -> str:
    """Run the agent on one claim, recording each step, and return its final reply."""
    instructions = api_get("/api/instructions").raise_for_status().json()["text"]
    agent = create_agent(
        llm or model(), tools=claim_tools(claim_id), system_prompt=instructions
    )
    api_post(
        f"/api/claims/{claim_id}/start", {"thread_id": thread_id}
    ).raise_for_status()
    reply = ""
    try:
        for update in agent.stream(
            {
                "messages": [
                    {"role": "user", "content": f"Please decide claim {claim_id}."}
                ]
            },
            config={
                "configurable": {"thread_id": thread_id},
                "recursion_limit": RECURSION_LIMIT,
            },
            stream_mode="updates",
        ):
            for node in update.values():
                for message in (node or {}).get("messages", []):
                    reply = record_message(claim_id, message) or reply
    except Exception as error:
        return give_up(claim_id, f"The agent stopped with an error: {error}")
    status = api_get(f"/api/claims/{claim_id}").json()["status"]
    if status == "in_progress":
        return give_up(claim_id, "The agent finished without recording a decision.")
    if not reply:
        reply = "The agent finished."
        record_step(claim_id, "reply", reply)
    return reply


def waiting_claims() -> list[str]:
    """Return the ids of every waiting claim in the queue."""
    claims = api_get("/api/claims").raise_for_status().json()
    return [c["claim_id"] for c in claims if c["status"] == "waiting"]


def cli(argv: list[str]) -> None:
    """Run the agent on the claims named on the command line, or on the queue."""
    parser = argparse.ArgumentParser(
        prog="uv run -m agent", description="Run the UnderCover Agent on claims."
    )
    parser.add_argument("claim_ids", nargs="*", metavar="CLAIM_ID")
    parser.add_argument(
        "--queue", action="store_true", help="run every waiting claim in turn"
    )
    args = parser.parse_args(argv)
    claim_ids = waiting_claims() if args.queue else args.claim_ids
    if not claim_ids:
        parser.error("give a claim id, or --queue")
    for claim_id in claim_ids:
        reply = run(claim_id, str(uuid.uuid4()))
        status = api_get(f"/api/claims/{claim_id}").json()["status"]
        print(f"{claim_id} ({status}): {reply}")
