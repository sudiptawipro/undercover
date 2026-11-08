import { vi } from "vitest";
import type { Claim, ClaimSummary, Handler, Policy, Step } from "./api";

export class Reply {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {}
}

/** Stub fetch with replies keyed by "METHOD /path"; a function gives a fresh reply per call. */
export function stubApi(routes: Record<string, unknown>) {
  const fetchMock = vi.fn((input: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${input}`;
    const route: unknown =
      key in routes
        ? routes[key]
        : new Reply(404, { detail: `No stub for ${key}` });
    const value: unknown =
      typeof route === "function" ? (route as () => unknown)() : route;
    const reply = value instanceof Reply ? value : new Reply(200, value);
    return Promise.resolve(
      new Response(JSON.stringify(reply.body), { status: reply.status }),
    );
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

export const summaries: ClaimSummary[] = [
  {
    claim_id: "CLM-1001",
    customer_name: "Maya Patel",
    claim_type: "trip_delay",
    summary: "Flight home canceled by the airline",
    amount_claimed: 420,
    submitted_on: "2026-06-24",
    status: "decided",
    decision: "approve",
    payout: 420,
  },
  {
    claim_id: "CLM-1002",
    customer_name: "Sam Ortiz",
    claim_type: "baggage",
    summary: "Suitcase lost on a connecting flight",
    amount_claimed: 1150,
    submitted_on: "2026-06-25",
    status: "waiting",
    decision: null,
    payout: null,
  },
  {
    claim_id: "CLM-1003",
    customer_name: "Aiko Tanaka",
    claim_type: "emergency_medical",
    summary: "Hospital visit abroad after a fall",
    amount_claimed: 3800,
    submitted_on: "2026-06-26",
    status: "awaiting_sign_off",
    decision: "approve",
    payout: 3750,
  },
  {
    claim_id: "CLM-1013",
    customer_name: "Lee Chan",
    claim_type: "trip_delay",
    summary: "Seven hour delay leaving Chicago",
    amount_claimed: 123,
    submitted_on: "2026-06-27",
    status: "decided",
    decision: "decline",
    payout: 0,
  },
];

export const waitingClaim: Claim = {
  claim_id: "CLM-1001",
  policy_id: "POL-2001",
  customer_id: "CUS-3001",
  customer_name: "Maya Patel",
  claim_type: "trip_delay",
  submitted_on: "2026-06-24",
  incident_date: "2026-06-18",
  incident_location: "Rome, Italy",
  summary: "Flight home canceled by the airline",
  story: "My flight home from Rome was canceled.",
  items: [
    {
      description: "Airport hotel, one night",
      category: "accommodation",
      amount: 245,
    },
    { description: "Dinner and breakfast", category: "meals", amount: 95 },
    { description: "Taxis", category: "transport", amount: 80 },
  ],
  amount_claimed: 420,
  documents: [
    {
      name: "Hotel receipt",
      type: "receipt",
      content: "Hotel Aurelia. Total paid: $245.00.",
    },
    {
      name: "Cancellation notice",
      type: "carrier_report",
      content: "Flight MA 611 was canceled.",
    },
  ],
  status: "waiting",
  decision: null,
  payment: null,
  sign_off: null,
};

export const decidedClaim: Claim = {
  ...waitingClaim,
  status: "decided",
  decision: {
    decision: "approve",
    payout: 420,
    reasons: "The airline canceled the flight, so the delay is covered.",
    policy_section: "Section 3, Trip Delay",
    decided_at: "2026-11-08T14:01:40+00:00",
  },
  payment: { amount: 420, paid_at: "2026-11-08T14:01:42+00:00" },
};

export const heldClaim: Claim = {
  ...waitingClaim,
  claim_id: "CLM-1003",
  status: "awaiting_sign_off",
  decision: {
    decision: "approve",
    payout: 3750,
    reasons: "The treatment was necessary and is covered.",
    policy_section: "Section 7, Emergency Medical",
    decided_at: "2026-11-08T14:02:01+00:00",
  },
};

export const signedOffClaim: Claim = {
  ...heldClaim,
  status: "decided",
  payment: { amount: 3750, paid_at: "2026-11-08T15:00:00+00:00" },
  sign_off: {
    handler_id: "HND-01",
    handler_name: "Dana Whitfield",
    signed_at: "2026-11-08T15:00:00+00:00",
  },
};

export const policy: Policy = {
  policy_id: "POL-2001",
  plan: {
    plan: "premium",
    name: "UnderCover Premium",
    deductible: 50,
    per_item_limit: 300,
  },
  add_ons: [],
  purchased_on: "2026-04-22",
  trip: {
    destination: "Rome, Italy",
    departs_on: "2026-06-10",
    returns_on: "2026-06-18",
    trip_cost: 3100,
  },
  travelers: ["Maya Patel"],
};

export const handlers: Handler[] = [
  {
    handler_id: "HND-01",
    name: "Dana Whitfield",
    role: "Senior Claims Handler",
    can_approve_over_limit: true,
  },
  {
    handler_id: "HND-02",
    name: "Marcus Oyelaran",
    role: "Claims Handler",
    can_approve_over_limit: true,
  },
];

export const steps: Step[] = [
  {
    step_id: 1,
    kind: "tool_call",
    text: "Read the claim",
    created_at: "2026-11-08T14:01:30+00:00",
  },
  {
    step_id: 2,
    kind: "tool_result",
    text: "get_claim: {...}",
    created_at: "2026-11-08T14:01:31+00:00",
  },
];
