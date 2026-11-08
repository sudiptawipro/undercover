import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { App } from "./App";
import { policy, stubApi, summaries, waitingClaim } from "./testing";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.location.hash = "";
});

function stubAll() {
  stubApi({
    "GET /api/claims": summaries,
    "GET /api/claims/CLM-1001": waitingClaim,
    "GET /api/claims/CLM-1001/steps": [],
    "GET /api/policies/POL-2001": policy,
    "GET /api/handlers": [],
    "GET /api/instructions": { text: "You are the UnderCover Agent." },
  });
}

it("shows the queue by default", async () => {
  stubAll();
  render(<App />);
  expect(
    await screen.findByRole("heading", { name: "Claims queue" }),
  ).toBeDefined();
  expect(
    screen.getByRole("link", { name: "Queue" }).getAttribute("aria-current"),
  ).toBe("page");
});

it("follows links to a claim and back", async () => {
  stubAll();
  render(<App />);
  await screen.findByRole("heading", { name: "Claims queue" });

  act(() => {
    window.location.hash = "#/claims/CLM-1001";
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
  expect(
    await screen.findByText("My flight home from Rome was canceled."),
  ).toBeDefined();

  act(() => {
    window.location.hash = "#/";
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
  expect(
    await screen.findByRole("heading", { name: "Claims queue" }),
  ).toBeDefined();
});
