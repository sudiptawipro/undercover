# Status

The pilot is being built from `docs/PLAN.md`. Phases 1 and 2 of 6 are done.

## What's built

- `backend/`: FastAPI on SQLite. On startup it creates `backend/undercover.db` and seeds it from `data/` (claims, policies, customers and handlers; never `data/evals/` or `data/security/`). Customers are stored with their name and claim history only. Read routes: `list_claims`, `get_claim`, `get_policy`, `get_claim_history`, `get_policy_wording`, `get_instructions`, `list_handlers` and `health`. Write routes: `start_claim`, `record_step`, `list_steps`, `record_decision`, `pay_claim`, `sign_off` and `return_to_queue`. The agent's instructions are in `backend/instructions.md`.
- Claim states: `waiting`, `in_progress`, `awaiting_sign_off` and `decided`. An approval over the $1,000.00 limit in `data/company.json` waits for sign-off; `pay_claim` refuses it with 403 until a handler signs off, and the sign-off releases the payment. Payments are database rows only.
- `agent/`: still the skeleton's hello-world agent.
- `dashboard/`: still the skeleton's health page.
- `e2e/`: one test of the health page.

## How to run it

- `npm run dev` starts the backend on port 8000 and the dashboard on port 5173.
- To start again from the seed data, stop the backend and delete `backend/undercover.db`. `UNDERCOVER_DB` sets a different database file.
- `npm run check` runs every check.
