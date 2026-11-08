import { useEffect } from "react";

/** Call poll every ms milliseconds while active is true. */
export function usePoll(poll: () => void, ms: number, active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const id = setInterval(poll, ms);
    return () => {
      clearInterval(id);
    };
  }, [poll, ms, active]);
}
