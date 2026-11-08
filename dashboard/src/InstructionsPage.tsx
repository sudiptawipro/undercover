import { useEffect, useState } from "react";
import { api, errorMessage } from "./api";

export function InstructionsPage() {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api
      .getInstructions()
      .then((instructions) => {
        setText(instructions.text);
      })
      .catch((caught: unknown) => {
        setError(errorMessage(caught));
      });
  }, []);

  return (
    <>
      <h1>The agent's instructions</h1>
      <p className="muted">
        Read only. The agent reads these at the start of every claim.
      </p>
      {error && (
        <p className="alert">Could not load the instructions: {error}</p>
      )}
      {text === null && !error && <p className="muted">Loading…</p>}
      {text !== null && (
        <section className="panel">
          <div className="instructions">{text}</div>
        </section>
      )}
    </>
  );
}
