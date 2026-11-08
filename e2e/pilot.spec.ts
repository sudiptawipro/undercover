import { expect, test, type APIRequestContext } from "@playwright/test";

// The tests stand in for the agent by calling the backend's API directly,
// so no model is called. Each test works on its own claim.

async function decide(
  request: APIRequestContext,
  claimId: string,
  payout: number,
) {
  const started = await request.post(`/api/claims/${claimId}/start`, {
    data: { thread_id: `e2e-${claimId}` },
  });
  expect(started.status()).toBe(200);
  const decided = await request.post(`/api/claims/${claimId}/decision`, {
    data: {
      decision: "approve",
      payout,
      reasons: "The treatment was necessary and the documents support it.",
      policy_section: "Section 7, Emergency Medical",
    },
  });
  expect(decided.status()).toBe(200);
}

test("the queue shows every claim", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Claims queue" }),
  ).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(25);
  await expect(
    page.getByRole("list", { name: "Claims by state" }).getByRole("listitem"),
  ).toHaveCount(4);
});

test("a claim's page shows its story and documents", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "CLM-1001" }).click();
  await expect(page).toHaveURL(/#\/claims\/CLM-1001$/);
  await expect(page.getByText(/^My flight home from Rome/)).toBeVisible();
  await expect(page.locator(".documents li")).toHaveCount(4);
  await expect(page.getByText("UnderCover Premium")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Run the agent" }),
  ).toBeVisible();
});

test("the instructions page shows the agent's instructions", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Instructions" }).click();
  await expect(
    page.getByRole("heading", { name: "The agent's instructions" }),
  ).toBeVisible();
  await expect(page.getByText(/^You are the UnderCover Agent\./)).toBeVisible();
});

test("the agent's steps appear on the claim's page", async ({
  page,
  request,
}) => {
  for (const step of [
    { kind: "tool_call", text: "Read the claim" },
    { kind: "reply", text: "Declined: the passport was not lost." },
  ]) {
    const posted = await request.post("/api/claims/CLM-1005/steps", {
      data: step,
    });
    expect(posted.status()).toBe(200);
  }
  await page.goto("/#/claims/CLM-1005");
  await expect(page.getByText("Read the claim")).toBeVisible();
  await expect(
    page.getByText("Declined: the passport was not lost."),
  ).toBeVisible();
});

test("a payout over $1,000 waits for a handler's sign-off", async ({
  page,
  request,
}) => {
  await decide(request, "CLM-1003", 3750);

  await page.goto("/");
  const row = page.locator("tbody tr", { hasText: "CLM-1003" });
  await expect(row.getByText("Waiting for sign-off")).toBeVisible();
  await expect(row.getByText("Approved $3,750.00")).toBeVisible();

  const payment = await request.post("/api/claims/CLM-1003/payments", {
    data: { amount: 3750 },
  });
  expect(payment.status()).toBe(403);

  await row.getByRole("link", { name: "CLM-1003" }).click();
  await expect(
    page.getByText("Payment held until a handler signs off"),
  ).toBeVisible();
  await page.getByLabel("Handler").selectOption("HND-01");
  await page.getByRole("button", { name: "Sign off and pay" }).click();

  await expect(page.getByText(/^Paid \$3,750\.00 on/)).toBeVisible();
  await expect(page.getByText(/^Dana Whitfield,/)).toBeVisible();
  await expect(page.locator(".claim-header .badge")).toHaveText("Decided");
  await expect(
    page.getByRole("button", { name: "Sign off and pay" }),
  ).toHaveCount(0);
});
