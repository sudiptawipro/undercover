import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { QUEUE_POLL_MS, QueuePage } from "./QueuePage";
import { Reply, stubApi, summaries } from "./testing";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("shows every claim with where it stands", async () => {
  stubApi({ "GET /api/claims": summaries });
  render(<QueuePage />);

  const rows = await screen.findAllByRole("row");
  expect(rows).toHaveLength(summaries.length + 1);
  const first = within(rows[1]);
  expect(
    first.getByRole("link", { name: "CLM-1001" }).getAttribute("href"),
  ).toBe("#/claims/CLM-1001");
  expect(first.getByText("Maya Patel")).toBeDefined();
  expect(first.getByText("Trip delay")).toBeDefined();
  expect(first.getByText("Jun 24, 2026")).toBeDefined();
  expect(first.getByText("Approved $420.00")).toBeDefined();
  expect(screen.getByText("Declined")).toBeDefined();
  expect(screen.getByText("Approved $3,750.00")).toBeDefined();
});

it("counts the claims in each state", async () => {
  stubApi({ "GET /api/claims": summaries });
  render(<QueuePage />);

  const counts = within(
    await screen.findByRole("list", { name: "Claims by state" }),
  );
  const count = (label: string) =>
    counts.getByText(label).parentElement?.querySelector("strong")?.textContent;
  expect(count("Waiting")).toBe("1");
  expect(count("In progress")).toBe("0");
  expect(count("Waiting for sign-off")).toBe("1");
  expect(count("Decided")).toBe("2");
});

it("refreshes the queue while it is open", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  let calls = 0;
  stubApi({
    "GET /api/claims": () => {
      calls += 1;
      return calls === 1
        ? summaries
        : summaries.map((claim) => ({ ...claim, status: "in_progress" }));
    },
  });
  render(<QueuePage />);
  await screen.findByText("Approved $420.00");

  await act(async () => {
    await vi.advanceTimersByTimeAsync(QUEUE_POLL_MS);
  });
  expect(await screen.findAllByText("In progress")).toHaveLength(
    summaries.length + 1,
  );
});

it("says when the queue cannot be loaded", async () => {
  stubApi({
    "GET /api/claims": new Reply(500, { detail: "Database is down" }),
  });
  render(<QueuePage />);
  expect(
    await screen.findByText("Could not load the queue: Database is down"),
  ).toBeDefined();
});

it("reports a failed request without a detail", async () => {
  stubApi({ "GET /api/claims": new Reply(502, {}) });
  render(<QueuePage />);
  expect(
    await screen.findByText(
      "Could not load the queue: The request failed (502)",
    ),
  ).toBeDefined();
});
