import { useCallback, useEffect, useState } from "react";
import { api, errorMessage, type ClaimSummary } from "./api";
import {
  DECISION_LABELS,
  STATUSES,
  STATUS_LABELS,
  date,
  money,
  sentenceCase,
} from "./format";
import { claimHref } from "./route";
import { StatusBadge } from "./StatusBadge";
import { usePoll } from "./usePoll";

export const QUEUE_POLL_MS = 5000;

function outcome(claim: ClaimSummary): string {
  if (!claim.decision) return "";
  const label = DECISION_LABELS[claim.decision];
  return claim.decision === "approve" && claim.payout !== null
    ? `${label} ${money(claim.payout)}`
    : label;
}

export function QueuePage() {
  const [claims, setClaims] = useState<ClaimSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    void api
      .listClaims()
      .then((loaded) => {
        setClaims(loaded);
        setError(null);
      })
      .catch((caught: unknown) => {
        setError(errorMessage(caught));
      });
  }, []);

  useEffect(load, [load]);
  usePoll(load, QUEUE_POLL_MS, true);

  if (error && !claims) {
    return <p className="alert">Could not load the queue: {error}</p>;
  }
  if (!claims) return <p className="muted">Loading the queue…</p>;

  return (
    <>
      <h1>Claims queue</h1>
      <ul className="counts" aria-label="Claims by state">
        {STATUSES.map((status) => (
          <li key={status} className="panel count">
            <span className={`dot dot-${status}`} aria-hidden="true" />
            <span>{STATUS_LABELS[status]}</span>
            <strong className="mono">
              {claims.filter((claim) => claim.status === status).length}
            </strong>
          </li>
        ))}
      </ul>
      <div className="panel table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">Claim</th>
              <th scope="col">Customer</th>
              <th scope="col">Type</th>
              <th scope="col">Summary</th>
              <th scope="col">Submitted</th>
              <th scope="col" className="number">
                Claimed
              </th>
              <th scope="col">Status</th>
              <th scope="col">Decision</th>
            </tr>
          </thead>
          <tbody>
            {claims.map((claim) => (
              <tr key={claim.claim_id}>
                <td className="nowrap">
                  <a className="mono" href={claimHref(claim.claim_id)}>
                    {claim.claim_id}
                  </a>
                </td>
                <td>{claim.customer_name}</td>
                <td>{sentenceCase(claim.claim_type)}</td>
                <td className="summary">{claim.summary}</td>
                <td className="nowrap">{date(claim.submitted_on)}</td>
                <td className="number mono">{money(claim.amount_claimed)}</td>
                <td>
                  <StatusBadge status={claim.status} />
                </td>
                <td className="nowrap">{outcome(claim)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
