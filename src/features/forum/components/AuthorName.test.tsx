import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AuthorName } from "./AuthorName";

describe("AuthorName", () => {
  it("links a handle to its profile", () => {
    render(<AuthorName handle="Ada_99" />);
    expect(screen.getByRole("link", { name: "Ada_99" })).toHaveAttribute("href", "/u/Ada_99");
  });

  it("shows a deleted account as plain text", () => {
    render(<AuthorName handle={null} />);
    expect(screen.getByText("[deleted]")).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
