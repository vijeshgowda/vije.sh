import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NoteList } from "./NoteList";

describe("NoteList", () => {
  it("links each note to its post with id, category and date", () => {
    render(
      <NoteList
        notes={[
          {
            id: "AN-002",
            slug: "quality-per-gb",
            title: "Quality per GB",
            summary: "Comparing low-bit models.",
            category: "Local AI",
            date: "2026-09-20",
          },
        ]}
      />,
    );
    const link = screen.getByRole("link", { name: /Quality per GB/ });
    expect(link).toHaveAttribute("href", "/blog/quality-per-gb");
    expect(link).toHaveTextContent("AN-002");
    expect(link).toHaveTextContent("Comparing low-bit models.");
    expect(link).toHaveTextContent("Local AI");
    expect(screen.getByText("20 Sep 2026")).toHaveAttribute("datetime", "2026-09-20");
  });

  it("says so when there are no notes", () => {
    render(<NoteList notes={[]} />);
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.getByText("No application notes published yet.")).toBeInTheDocument();
  });
});
