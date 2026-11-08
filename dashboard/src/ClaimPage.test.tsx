import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ClaimPage } from "./ClaimPage";
import {
  Reply,
  decidedClaim,
  heldClaim,
  policy,
  signedOffClaim,
  stubApi,
  waitingClaim,
} from "./testing";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function stubClaim(claim: typeof waitingClaim) {
  return stubApi({
    [`GET /api/claims/${claim.claim_id}`]: claim,
    [`GET /api/claims/${claim.claim_id}/steps`]: [],
    "GET /api/policies/POL-2001": policy,
    "GET /api/handlers": [],
  });
}

it("shows the claim in full", async () => {
  stubClaim(waitingClaim);
  render(<ClaimPage claimId="CLM-1001" />);

  expect(
    await screen.findByText("My flight home from Rome was canceled."),
  ).toBeDefined();
  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
    "CLM-1001 Flight home canceled by the airline",
  );
  expect(screen.getAllByText("Waiting")).not.toHaveLength(0);
  expect(screen.getByText("Airport hotel, one night")).toBeDefined();
  expect(screen.getByText("$245.00")).toBeDefined();
  expect(screen.getByText("Total claimed")).toBeDefined();
  expect(screen.getByText("Hotel receipt")).toBeDefined();
  expect(screen.getByText("Flight MA 611 was canceled.")).toBeDefined();
  expect(screen.getByText("Jun 18, 2026, Rome, Italy")).toBeDefined();
  expect(
    screen.getByText("The agent has not decided this claim yet."),
  ).toBeDefined();
});

it("shows the policy", async () => {
  stubClaim(waitingClaim);
  render(<ClaimPage claimId="CLM-1001" />);
  expect(await screen.findByText("UnderCover Premium")).toBeDefined();
  expect(
    screen.getByText("Rome, Italy, Jun 10, 2026 to Jun 18, 2026"),
  ).toBeDefined();
  expect(screen.getByText("None")).toBeDefined();
});

it("lists a policy's add-ons", async () => {
  stubApi({
    "GET /api/claims/CLM-1001": waitingClaim,
    "GET /api/claims/CLM-1001/steps": [],
    "GET /api/policies/POL-2001": {
      ...policy,
      add_ons: [
        { add_on: "electronics_plus", name: "Electronics Plus", effect: "" },
      ],
    },
  });
  render(<ClaimPage claimId="CLM-1001" />);
  expect(await screen.findByText("Electronics Plus")).toBeDefined();
});

it("shows the decision, its reasons and the payment", async () => {
  stubClaim(decidedClaim);
  render(<ClaimPage claimId="CLM-1001" />);

  expect(await screen.findByText("Approved")).toBeDefined();
  expect(
    screen.getByText(
      "The airline canceled the flight, so the delay is covered.",
    ),
  ).toBeDefined();
  expect(screen.getByText("Section 3, Trip Delay")).toBeDefined();
  expect(screen.getByText(/^Paid \$420\.00 on/)).toBeDefined();
});

it("shows that a large payout is held for sign-off", async () => {
  stubClaim(heldClaim);
  render(<ClaimPage claimId="CLM-1003" />);
  expect(
    await screen.findByText("Payment held until a handler signs off"),
  ).toBeDefined();
  expect(screen.getAllByText("Waiting for sign-off")).not.toHaveLength(0);
});

it("shows who signed off", async () => {
  stubClaim(signedOffClaim);
  render(<ClaimPage claimId="CLM-1003" />);
  expect(await screen.findByText(/^Dana Whitfield,/)).toBeDefined();
  expect(screen.getByText(/^Paid \$3,750\.00 on/)).toBeDefined();
});

it("shows an approval that is not paid yet", async () => {
  stubClaim({ ...decidedClaim, payment: null });
  render(<ClaimPage claimId="CLM-1001" />);
  expect(await screen.findByText("Not paid yet")).toBeDefined();
});

it("shows a decline with no payout", async () => {
  stubClaim({
    ...decidedClaim,
    decision: {
      decision: "decline",
      payout: 0,
      reasons: "The delay was too short.",
      policy_section: "Section 3, Trip Delay",
      decided_at: "2026-11-08T14:01:40+00:00",
    },
    payment: null,
  });
  render(<ClaimPage claimId="CLM-1001" />);
  expect(await screen.findByText("Declined")).toBeDefined();
  expect(screen.queryByText("Not paid yet")).toBeNull();
});

it("says when the claim cannot be found", async () => {
  stubApi({
    "GET /api/claims/CLM-0000": new Reply(404, { detail: "No claim CLM-0000" }),
  });
  render(<ClaimPage claimId="CLM-0000" />);
  expect(
    await screen.findByText("Could not load claim CLM-0000: No claim CLM-0000"),
  ).toBeDefined();
});
