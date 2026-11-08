import { useState, type SubmitEvent } from "react";
import type { Handler } from "./api";

export function SignOffForm({
  handlers,
  busy,
  onSignOff,
}: Readonly<{
  handlers: Handler[];
  busy: boolean;
  onSignOff: (handlerId: string) => void;
}>) {
  const eligible = handlers.filter((handler) => handler.can_approve_over_limit);
  const [handlerId, setHandlerId] = useState("");
  const chosen = handlerId || (eligible[0]?.handler_id ?? "");

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSignOff(chosen);
  };

  return (
    <form className="sign-off" onSubmit={submit}>
      <label htmlFor="handler">Handler</label>
      <select
        id="handler"
        value={chosen}
        onChange={(event) => {
          setHandlerId(event.target.value);
        }}
      >
        {eligible.map((handler) => (
          <option key={handler.handler_id} value={handler.handler_id}>
            {handler.name}, {handler.role}
          </option>
        ))}
      </select>
      <button type="submit" disabled={busy || !chosen}>
        Sign off and pay
      </button>
    </form>
  );
}
