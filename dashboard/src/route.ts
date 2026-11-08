import { useEffect, useState } from "react";

export type Route =
  | { page: "queue" }
  | { page: "claim"; claimId: string }
  | { page: "instructions" };

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, "");
  if (path === "/instructions") return { page: "instructions" };
  const claim = /^\/claims\/([^/]+)$/.exec(path);
  if (claim?.[1])
    return { page: "claim", claimId: decodeURIComponent(claim[1]) };
  return { page: "queue" };
}

export function claimHref(claimId: string): string {
  return `#/claims/${encodeURIComponent(claimId)}`;
}

export function useRoute(): Route {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const onChange = () => {
      setHash(window.location.hash);
    };
    window.addEventListener("hashchange", onChange);
    return () => {
      window.removeEventListener("hashchange", onChange);
    };
  }, []);
  return parseRoute(hash);
}
