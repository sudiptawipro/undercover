import { useCallback, useEffect, useState } from "react";
import { api, errorMessage, type Claim, type Policy } from "./api";
import { ClaimDetails } from "./ClaimDetails";
import { DecisionPanel } from "./DecisionPanel";
import { date, money, sentenceCase } from "./format";
import { PolicyPanel } from "./PolicyPanel";
import { StatusBadge } from "./StatusBadge";

export function ClaimPage({ claimId }: Readonly<{ claimId: string }>) {
  const [claim, setClaim] = useState<Claim | null>(null);
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    void api
      .getClaim(claimId)
      .then((loaded) => {
        setClaim(loaded);
        setError(null);
      })
      .catch((caught: unknown) => {
        setError(errorMessage(caught));
      });
  }, [claimId]);

  useEffect(load, [load]);

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
          <DecisionPanel claim={claim} />
          {policy && <PolicyPanel policy={policy} />}
        </div>
      </div>
    </>
  );
}
