import { useCallback, useEffect, useState } from "react";
import { AgentActivity } from "./AgentActivity";
import {
  api,
  errorMessage,
  type Claim,
  type Handler,
  type Policy,
  type Step,
} from "./api";
import { ClaimDetails } from "./ClaimDetails";
import { DecisionPanel } from "./DecisionPanel";
import { date, money, sentenceCase } from "./format";
import { PolicyPanel } from "./PolicyPanel";
import { StatusBadge } from "./StatusBadge";
import { usePoll } from "./usePoll";

export const CLAIM_POLL_MS = 2000;

export function ClaimPage({ claimId }: Readonly<{ claimId: string }>) {
  const [claim, setClaim] = useState<Claim | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [handlers, setHandlers] = useState<Handler[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    void Promise.all([api.getClaim(claimId), api.listSteps(claimId)])
      .then(([loaded, loadedSteps]) => {
        setClaim(loaded);
        setSteps(loadedSteps);
        setError(null);
      })
      .catch((caught: unknown) => {
        setError(errorMessage(caught));
      });
  }, [claimId]);

  useEffect(load, [load]);
  // The agent can still be paying after its decision moves the claim on, and
  // every run ends with a reply or an error step.
  const lastKind = steps.at(-1)?.kind;
  const working =
    claim?.status === "in_progress" ||
    lastKind === "tool_call" ||
    lastKind === "tool_result";
  usePoll(load, CLAIM_POLL_MS, working);

  const needsSignOff = claim?.status === "awaiting_sign_off";
  useEffect(() => {
    if (needsSignOff) void api.listHandlers().then(setHandlers);
  }, [needsSignOff]);

  const policyId = claim?.policy_id;
  useEffect(() => {
    if (!policyId) return;
    void api.getPolicy(policyId).then(setPolicy);
  }, [policyId]);

  if (error && !claim) {
    return (
      <>
        <a href="#/">Back to the queue</a>
        <p className="alert">
          Could not load claim {claimId}: {error}
        </p>
      </>
    );
  }
  if (!claim) return <p className="muted">Loading claim {claimId}…</p>;

  return (
    <>
      <a href="#/">Back to the queue</a>
      <header className="claim-header">
        <h1>
          <span className="mono">{claim.claim_id}</span> {claim.summary}
        </h1>
        <StatusBadge status={claim.status} />
      </header>
      <dl className="facts facts-row">
        <dt>Customer</dt>
        <dd>{claim.customer_name}</dd>
        <dt>Type</dt>
        <dd>{sentenceCase(claim.claim_type)}</dd>
        <dt>Incident</dt>
        <dd>
          {date(claim.incident_date)}, {claim.incident_location}
        </dd>
        <dt>Submitted</dt>
        <dd>{date(claim.submitted_on)}</dd>
        <dt>Claimed</dt>
        <dd className="mono">{money(claim.amount_claimed)}</dd>
      </dl>
      <div className="claim-layout">
        <div className="stack">
          <ClaimDetails claim={claim} />
        </div>
        <div className="stack">
          <DecisionPanel claim={claim} handlers={handlers} onChange={load} />
          <AgentActivity steps={steps} working={working} />
          {policy && <PolicyPanel policy={policy} />}
        </div>
      </div>
    </>
  );
}
