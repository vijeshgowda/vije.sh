import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdminStub } from "./AdminStub";

describe("AdminStub", () => {
  it("titles the section and says it isn't built yet", () => {
    render(<AdminStub title="Members">Search members.</AdminStub>);
    expect(screen.getByRole("heading", { level: 1, name: "Members" })).toBeInTheDocument();
    expect(screen.getByText("Search members.")).toBeInTheDocument();
    expect(screen.getByText(/still being typeset/)).toBeInTheDocument();
  });
});
