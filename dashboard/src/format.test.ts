import { expect, it } from "vitest";
import { date, dateTime, money, sentenceCase, time } from "./format";
import { claimHref, parseRoute } from "./route";

it("formats money in US dollars", () => {
  expect(money(1250)).toBe("$1,250.00");
  expect(money(0)).toBe("$0.00");
});

it("turns codes into sentence case", () => {
  expect(sentenceCase("emergency_medical")).toBe("Emergency medical");
});

it("formats dates without shifting the day", () => {
  expect(date("2026-06-24")).toBe("Jun 24, 2026");
});

it("formats times and date-times", () => {
  expect(dateTime("2026-11-08T14:01:40+00:00")).toContain("2026");
  expect(time("2026-11-08T14:01:40+00:00")).toMatch(
    /^\d{1,2}:\d{2}:40\s[AP]M$/,
  );
});

it("parses the routes", () => {
  expect(parseRoute("")).toEqual({ page: "queue" });
  expect(parseRoute("#/")).toEqual({ page: "queue" });
  expect(parseRoute("#/instructions")).toEqual({ page: "instructions" });
  expect(parseRoute("#/claims/CLM-1001")).toEqual({
    page: "claim",
    claimId: "CLM-1001",
  });
  expect(parseRoute("#/nowhere")).toEqual({ page: "queue" });
});

it("links to a claim", () => {
  expect(claimHref("CLM-1001")).toBe("#/claims/CLM-1001");
});
