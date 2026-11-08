import type { Claim } from "./api";
import { DECISION_LABELS, dateTime, money } from "./format";

function PaymentLine({ claim }: Readonly<{ claim: Claim }>) {
  if (claim.payment) {
    return (
      <p className="paid">
        Paid {money(claim.payment.amount)} on {dateTime(claim.payment.paid_at)}
      </p>
    );
  }
  if (claim.status === "awaiting_sign_off") {
    return <p className="alert">Payment held until a handler signs off</p>;
  }
  if (claim.decision?.decision === "approve") {
    return <p className="muted">Not paid yet</p>;
  }
  return null;
}

export function DecisionPanel({ claim }: Readonly<{ claim: Claim }>) {
  const { decision, sign_off: signOff } = claim;
  return (
    <section className="panel">
      <h2>Decision</h2>
      {decision ? (
        <>
          <p className={`decision decision-${decision.decision}`}>
            {DECISION_LABELS[decision.decision]}
            {decision.decision === "approve" && (
              <span className="mono"> {money(decision.payout)}</span>
            )}
          </p>
          <p>{decision.reasons}</p>
          <dl className="facts">
            <dt>Policy section</dt>
            <dd>{decision.policy_section}</dd>
            <dt>Decided</dt>
            <dd>{dateTime(decision.decided_at)}</dd>
            {signOff && (
              <>
                <dt>Signed off</dt>
                <dd>
                  {signOff.handler_name}, {dateTime(signOff.signed_at)}
                </dd>
              </>
            )}
          </dl>
          <PaymentLine claim={claim} />
        </>
      ) : (
        <p className="muted">The agent has not decided this claim yet.</p>
      )}
    </section>
  );
}
