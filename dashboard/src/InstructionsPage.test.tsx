import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { InstructionsPage } from "./InstructionsPage";
import { Reply, stubApi } from "./testing";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("shows the agent's instructions, read only", async () => {
  stubApi({
    "GET /api/instructions": {
      text: "You are the UnderCover Agent.\n\n## How to work a claim",
    },
  });
  render(<InstructionsPage />);
  expect(
    await screen.findByText(/^You are the UnderCover Agent\./),
  ).toBeDefined();
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(screen.queryByRole("button")).toBeNull();
});

it("says when the instructions cannot be loaded", async () => {
  stubApi({
    "GET /api/instructions": new Reply(500, { detail: "Server error" }),
  });
  render(<InstructionsPage />);
  expect(
    await screen.findByText("Could not load the instructions: Server error"),
  ).toBeDefined();
});
