export type Status =
  "waiting" | "in_progress" | "awaiting_sign_off" | "decided";
export type DecisionKind = "approve" | "decline" | "refer";
export type StepKind = "tool_call" | "tool_result" | "reply" | "error";

export interface ClaimSummary {
  claim_id: string;
  customer_name: string;
  claim_type: string;
  summary: string;
  amount_claimed: number;
  submitted_on: string;
  status: Status;
  decision: DecisionKind | null;
  payout: number | null;
}

export interface Item {
  description: string;
  category: string;
  amount: number;
}

export interface ClaimDocument {
  name: string;
  type: string;
  content: string;
}

export interface Decision {
  decision: DecisionKind;
  payout: number;
  reasons: string;
  policy_section: string;
  decided_at: string;
}

export interface Payment {
  amount: number;
  paid_at: string;
}

export interface SignOff {
  handler_id: string;
  handler_name: string;
  signed_at: string;
}

export interface Claim {
  claim_id: string;
  policy_id: string;
  customer_id: string;
  customer_name: string;
  claim_type: string;
  submitted_on: string;
  incident_date: string;
  incident_location: string;
  summary: string;
  story: string;
  items: Item[];
  amount_claimed: number;
  documents: ClaimDocument[];
  status: Status;
  decision: Decision | null;
  payment: Payment | null;
  sign_off: SignOff | null;
}

export interface Plan {
  plan: string;
  name: string;
  deductible: number;
  per_item_limit: number;
}

export interface AddOn {
  add_on: string;
  name: string;
  effect: string;
}

export interface Policy {
  policy_id: string;
  plan: Plan;
  add_ons: AddOn[];
  purchased_on: string;
  trip: {
    destination: string;
    departs_on: string;
    returns_on: string;
    trip_cost: number;
  };
  travelers: string[];
}

export interface Step {
  step_id: number;
  kind: StepKind;
  text: string;
  created_at: string;
}

export interface Handler {
  handler_id: string;
  name: string;
  role: string;
  can_approve_over_limit: boolean;
}

function detailOf(body: unknown): string | null {
  if (typeof body === "object" && body !== null && "detail" in body) {
    return typeof body.detail === "string" ? body.detail : null;
  }
  return null;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const body: unknown = await response.json();
  if (!response.ok) {
    throw new Error(
      detailOf(body) ?? `The request failed (${String(response.status)})`,
    );
  }
  return body as T;
}

function post<T>(path: string, body: object): Promise<T> {
  return request<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function claimPath(claimId: string): string {
  return `/api/claims/${encodeURIComponent(claimId)}`;
}

export const api = {
  listClaims: () => request<ClaimSummary[]>("/api/claims"),
  getClaim: (claimId: string) => request<Claim>(claimPath(claimId)),
  listSteps: (claimId: string) =>
    request<Step[]>(`${claimPath(claimId)}/steps`),
  getPolicy: (policyId: string) =>
    request<Policy>(`/api/policies/${encodeURIComponent(policyId)}`),
  listHandlers: () => request<Handler[]>("/api/handlers"),
  getInstructions: () => request<{ text: string }>("/api/instructions"),
  runAgent: (claimId: string) => post<Claim>(`${claimPath(claimId)}/run`, {}),
  signOff: (claimId: string, handlerId: string) =>
    post<Claim>(`${claimPath(claimId)}/sign-off`, { handler_id: handlerId }),
};

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
