import type { Step } from "./api";
import { STEP_LABELS, time } from "./format";

export function AgentActivity({
  steps,
  working,
}: Readonly<{ steps: Step[]; working: boolean }>) {
  return (
    <section className="panel" aria-labelledby="activity-heading">
      <h2 id="activity-heading">Agent activity</h2>
      {working && (
        <p className="working" role="status">
          The agent is working on this claim…
        </p>
      )}
      {steps.length === 0 ? (
        <p className="muted">No activity yet.</p>
      ) : (
        <ol className="steps">
          {steps.map((step) => (
            <li key={step.step_id} className={`step step-${step.kind}`}>
              <span className="step-meta">
                <span className="mono">{time(step.created_at)}</span>{" "}
                <strong>{STEP_LABELS[step.kind]}</strong>
              </span>
              <span className="step-text">{step.text}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
