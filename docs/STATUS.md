# Status

The pilot is being built from `docs/PLAN.md`. Phases 1 to 3 of 6 are done.

## What's built

- `backend/`: FastAPI on SQLite. On startup it creates `backend/undercover.db` and seeds it from `data/` (claims, policies, customers and handlers; never `data/evals/` or `data/security/`). Customers are stored with their name and claim history only. Read routes: `list_claims`, `get_claim`, `get_policy`, `get_claim_history`, `get_policy_wording`, `get_instructions`, `list_handlers` and `health`. Write routes: `start_claim`, `record_step`, `list_steps`, `record_decision`, `pay_claim`, `sign_off`, `return_to_queue` and `run_agent` (starts the agent in the background). The agent's instructions are in `backend/instructions.md`.
- Claim states: `waiting`, `in_progress`, `awaiting_sign_off` and `decided`. An approval over the $1,000.00 limit in `data/company.json` waits for sign-off; `pay_claim` refuses it with 403 until a handler signs off, and the sign-off releases the payment. Payments are database rows only.
- `agent/`: the UnderCover Agent, LangChain's `create_agent` on OpenRouter (`openai/gpt-6-luna`, or `MODEL_NAME`). The entry point `run(claim_id, thread_id)` fetches its instructions from the backend, starts the claim, and records each tool call, result and reply as a step. If a run ends without a decision, or the model fails, it records an error step and puts the claim back in the queue. Its tools wrap the API: `get_claim`, `get_policy`, `get_claim_history`, `get_policy_wording`, `record_decision` and `pay_claim`; the two that write act only on the claim being worked. `BACKEND_URL` points it at a different backend.
- `dashboard/`: still the skeleton's health page.
- `e2e/`: one test of the health page.

## How to run it

- `npm run dev` starts the backend on port 8000 and the dashboard on port 5173.
- To start again from the seed data, stop the backend and delete `backend/undercover.db`. `UNDERCOVER_DB` sets a different database file.
- `uv run -m agent CLM-1001` runs the agent on one claim (the backend must be running); `uv run -m agent --queue` runs every waiting claim in turn.
- `npm run check` runs every check.
