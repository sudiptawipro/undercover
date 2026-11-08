import { defineConfig } from "@playwright/test";

// The tests get their own backend, on a fresh database, and their own
// dashboard, so they never touch the development servers or database.
const BACKEND_URL = "http://127.0.0.1:8001";
const DASHBOARD_URL = "http://localhost:5174";

export default defineConfig({
  testDir: "e2e",
  outputDir: "e2e/test-results",
  reporter: "list",
  use: { baseURL: DASHBOARD_URL },
  webServer: [
    {
      command:
        "node e2e/reset-db.ts && uv run -m uvicorn backend.main:app --port 8001",
      url: `${BACKEND_URL}/api/health`,
      env: { UNDERCOVER_DB: "e2e/undercover-e2e.db" },
      reuseExistingServer: false,
    },
    {
      command: "npx vite dashboard --port 5174 --strictPort",
      url: DASHBOARD_URL,
      env: { BACKEND_URL },
      reuseExistingServer: false,
    },
  ],
});
