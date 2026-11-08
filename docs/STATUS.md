# Status

The pilot is being built from `docs/PLAN.md`. Phase 1 of 6 is done.

## What's built

- `backend/`: FastAPI on SQLite. On startup it creates `backend/undercover.db` and seeds it from `data/` (claims, policies, customers and handlers; never `data/evals/` or `data/security/`). Customers are stored with their name and claim history only. Read routes: `list_claims`, `get_claim`, `get_policy`, `get_claim_history`, `get_policy_wording`, `get_instructions`, `list_handlers` and `health`. The agent's instructions are in `backend/instructions.md`.
- `agent/`: still the skeleton's hello-world agent.
- `dashboard/`: still the skeleton's health page.
- `e2e/`: one test of the health page.

## How to run it

- `npm run dev` starts the backend on port 8000 and the dashboard on port 5173.
- To start again from the seed data, stop the backend and delete `backend/undercover.db`. `UNDERCOVER_DB` sets a different database file.
- `npm run check` runs every check.
