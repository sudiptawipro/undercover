import type { Policy } from "./api";
import { date, money } from "./format";

export function PolicyPanel({ policy }: Readonly<{ policy: Policy }>) {
  return (
    <section className="panel">
      <h2>Policy</h2>
      <dl className="facts">
        <dt>Policy</dt>
        <dd className="mono">{policy.policy_id}</dd>
        <dt>Plan</dt>
        <dd>{policy.plan.name}</dd>
        <dt>Trip</dt>
        <dd>
          {policy.trip.destination}, {date(policy.trip.departs_on)} to{" "}
          {date(policy.trip.returns_on)}
        </dd>
        <dt>Trip cost</dt>
        <dd className="mono">{money(policy.trip.trip_cost)}</dd>
        <dt>Travelers</dt>
        <dd>{policy.travelers.join(", ")}</dd>
        <dt>Add-ons</dt>
        <dd>
          {policy.add_ons.length
            ? policy.add_ons.map((addOn) => addOn.name).join(", ")
            : "None"}
        </dd>
        <dt>Bought</dt>
        <dd>{date(policy.purchased_on)}</dd>
      </dl>
    </section>
  );
}
