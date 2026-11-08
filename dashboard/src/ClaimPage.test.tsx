import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { Claim, Step } from "./api";
import { CLAIM_POLL_MS, ClaimPage } from "./ClaimPage";
import {
  Reply,
  decidedClaim,
  handlers,
  heldClaim,
  policy,
  signedOffClaim,
  steps,
  stubApi,
  waitingClaim,
} from "./testing";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
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

function calls(fetchMock: ReturnType<typeof stubApi>, key: string) {
  return fetchMock.mock.calls.filter(
    ([path, init]) => `${init?.method ?? "GET"} ${path}` === key,
  );
}

const reply: Step = {
  step_id: 3,
  kind: "reply",
  text: "I approved and paid the claim for $420.00.",
  created_at: "2026-11-08T14:01:43+00:00",
};

// What the backend shows at each stage of a run.
const stages: { claim: Claim; steps: Step[] }[] = [
  { claim: waitingClaim, steps: [] },
  {
    claim: { ...waitingClaim, status: "in_progress" },
    steps: steps.slice(0, 1),
  },
  { claim: { ...decidedClaim, payment: null }, steps },
  { claim: decidedClaim, steps: [...steps, reply] },
];

it("runs the agent and follows it until its run ends", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  let stage = 0;
  const fetchMock = stubApi({
    "GET /api/claims/CLM-1001": () => stages[stage]?.claim,
    "GET /api/claims/CLM-1001/steps": () => stages[stage]?.steps,
    "POST /api/claims/CLM-1001/run": () => {
      stage = 1;
      return new Reply(202, stages[1]?.claim);
    },
    "GET /api/policies/POL-2001": policy,
  });
  const advance = async () => {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CLAIM_POLL_MS);
    });
  };
  render(<ClaimPage claimId="CLM-1001" />);
  expect(await screen.findByText("No activity yet.")).toBeDefined();

  fireEvent.click(screen.getByRole("button", { name: "Run the agent" }));
  expect(await screen.findByRole("status")).toBeDefined();
  expect(screen.getByText("The agent is working on this claim…")).toBeDefined();
  expect(screen.getByText("Read the claim")).toBeDefined();
  expect(screen.getByText("Action")).toBeDefined();
  expect(screen.queryByRole("button", { name: "Run the agent" })).toBeNull();
  expect(calls(fetchMock, "POST /api/claims/CLM-1001/run")).toHaveLength(1);

  stage = 2;
  await advance();
  expect(await screen.findByText("Not paid yet")).toBeDefined();
  expect(screen.getByText("get_claim: {...}")).toBeDefined();
  expect(screen.getByRole("status")).toBeDefined();

  stage = 3;
  await advance();
  expect(await screen.findByText(/^Paid \$420\.00 on/)).toBeDefined();
  expect(
    screen.getByText("I approved and paid the claim for $420.00."),
  ).toBeDefined();
  expect(screen.queryByRole("status")).toBeNull();

  const loads = calls(fetchMock, "GET /api/claims/CLM-1001").length;
  await advance();
  await advance();
  expect(calls(fetchMock, "GET /api/claims/CLM-1001")).toHaveLength(loads);
});

it("shows why the agent could not start", async () => {
  stubApi({
    "GET /api/claims/CLM-1001": waitingClaim,
    "GET /api/claims/CLM-1001/steps": [],
    "GET /api/policies/POL-2001": policy,
    "GET /api/handlers": handlers,
    "POST /api/claims/CLM-1001/run": new Reply(409, {
      detail: "Claim CLM-1001 is in_progress, not waiting",
    }),
  });
  render(<ClaimPage claimId="CLM-1001" />);
  fireEvent.click(await screen.findByRole("button", { name: "Run the agent" }));
  expect(
    await screen.findByText("Claim CLM-1001 is in_progress, not waiting"),
  ).toBeDefined();
});

it("signs off a large payout as the chosen handler", async () => {
  let signed = false;
  const fetchMock = stubApi({
    "GET /api/claims/CLM-1003": () => (signed ? signedOffClaim : heldClaim),
    "GET /api/claims/CLM-1003/steps": [],
    "GET /api/policies/POL-2001": policy,
    "GET /api/handlers": handlers,
    "POST /api/claims/CLM-1003/sign-off": () => {
      signed = true;
      return signedOffClaim;
    },
  });
  render(<ClaimPage claimId="CLM-1003" />);

  const select = await screen.findByLabelText("Handler");
  await screen.findByRole("option", {
    name: "Marcus Oyelaran, Claims Handler",
  });
  fireEvent.change(select, { target: { value: "HND-02" } });
  fireEvent.click(screen.getByRole("button", { name: "Sign off and pay" }));

  expect(await screen.findByText(/^Paid \$3,750\.00 on/)).toBeDefined();
  expect(screen.getByText(/^Dana Whitfield,/)).toBeDefined();
  expect(screen.queryByRole("button", { name: "Sign off and pay" })).toBeNull();
  const [signOff] = calls(fetchMock, "POST /api/claims/CLM-1003/sign-off");
  expect(signOff[1]?.body).toBe(JSON.stringify({ handler_id: "HND-02" }));
});

it("signs off as the first handler unless another is chosen", async () => {
  const fetchMock = stubApi({
    "GET /api/claims/CLM-1003": heldClaim,
    "GET /api/claims/CLM-1003/steps": [],
    "GET /api/policies/POL-2001": policy,
    "GET /api/handlers": handlers,
    "POST /api/claims/CLM-1003/sign-off": signedOffClaim,
  });
  render(<ClaimPage claimId="CLM-1003" />);
  await screen.findByRole("option", {
    name: "Dana Whitfield, Senior Claims Handler",
  });
  fireEvent.click(screen.getByRole("button", { name: "Sign off and pay" }));
  await screen.findByText("Payment held until a handler signs off");
  const [signOff] = calls(fetchMock, "POST /api/claims/CLM-1003/sign-off");
  expect(signOff[1]?.body).toBe(JSON.stringify({ handler_id: "HND-01" }));
});

it("offers no actions on a decided claim", async () => {
  stubClaim(decidedClaim);
  render(<ClaimPage claimId="CLM-1001" />);
  await screen.findByText("Approved");
  expect(screen.queryByRole("button")).toBeNull();
  expect(screen.queryByLabelText("Handler")).toBeNull();
});

it("shows an error step from the agent", async () => {
  stubApi({
    "GET /api/claims/CLM-1001": waitingClaim,
    "GET /api/claims/CLM-1001/steps": [
      {
        step_id: 9,
        kind: "error",
        text: "The agent finished without recording a decision.",
        created_at: "2026-11-08T14:01:30+00:00",
      },
    ],
    "GET /api/policies/POL-2001": policy,
    "GET /api/handlers": handlers,
  });
  render(<ClaimPage claimId="CLM-1001" />);
  expect(
    await screen.findByText("The agent finished without recording a decision."),
  ).toBeDefined();
  expect(screen.getByText("Stopped")).toBeDefined();
});
