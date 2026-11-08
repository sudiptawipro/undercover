# Status

The pilot is built: all six phases of `docs/PLAN.md` are done.

## What's built

- `backend/`: FastAPI on SQLite. On startup it creates `backend/undercover.db` and seeds it from `data/`: claims, policies, customers and handlers, never `data/evals/` or `data/security/`. Customers are stored with their name and claim history only.
  - Read routes: `list_claims`, `get_claim`, `get_policy`, `get_claim_history`, `get_policy_wording`, `get_instructions`, `list_handlers`, `list_steps` and `health`.
  - Write routes: `start_claim`, `record_step`, `record_decision`, `pay_claim`, `sign_off`, `return_to_queue` and `run_agent`, which starts the agent in the background.
  - Claim states: `waiting`, `in_progress`, `awaiting_sign_off` and `decided`. An approval over the $1,000.00 limit in `data/company.json` waits for sign-off. `pay_claim` refuses it with 403 until a handler signs off, and the sign-off releases the payment. Payments are database rows only.
  - The agent's instructions are in `backend/instructions.md`.
- `agent/`: the UnderCover Agent, LangChain's `create_agent` on OpenRouter (`openai/gpt-6-luna` with low reasoning effort, or `MODEL_NAME`).
  - The entry point `run(claim_id, thread_id)` fetches the instructions from the backend, starts the claim, and records each tool call, result and the final reply as a step. Every run ends with exactly one `reply` or `error` step.
  - If a run ends without a decision, or the model fails, it records an error step and puts the claim back in the queue.
  - Its tools wrap the API: `get_claim`, `get_policy`, `get_claim_history`, `get_policy_wording`, `record_decision` and `pay_claim`. The two that write act only on the claim being worked.
  - `BACKEND_URL` points it at a different backend.
- `dashboard/`: React in UnderCover's brand, with light and dark mode.
  - The queue (`#/`) shows the count of claims in each state and every claim with its status and decision. It refreshes every 5 seconds.
  - A claim's page (`#/claims/CLM-1001`) shows the story, the items, the documents, the policy, and the agent's decision, reasons, section, payment and sign-off. On a waiting claim, "Run the agent" starts the agent, and its activity updates every 2 seconds until the run's last step. On a claim waiting for sign-off, a handler can "Sign off and pay".
  - `#/instructions` shows the agent's instructions, read only.
- `e2e/`: Playwright tests of the queue, a claim's page, the instructions, the agent's steps and the sign-off rule. They run their own backend (port 8001, on a fresh `e2e/undercover-e2e.db`) and dashboard (port 5174), and stand in for the agent through the API, so they never call a model or touch the development database.

## How to run it

- `npm run dev` starts the backend on port 8000 and the dashboard on port 5173. The backend reloads when `backend/` or `agent/` changes.
- `uv run -m agent CLM-1001` runs the agent on one claim, with the backend running. `uv run -m agent --queue` runs every waiting claim in turn.
- To start again from the seed data, stop the backend and delete `backend/undercover.db`. `UNDERCOVER_DB` sets a different database file.
- `npm run check` runs every check.

## Not built yet

Checking the agent's decisions against `data/evals/`, which the spec keeps for later.
