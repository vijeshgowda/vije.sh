import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdminStats } from "./AdminStats";

const stats = {
  members: 1234,
  onboarded: 1200,
  new7d: 5,
  new30d: 40,
  threads: 77,
  replies: 900,
  openReports: 2,
  activeBans: 0,
  notes: { git: 2, db: 1 },
  databaseBytes: 10_122_931,
  categories: [
    { slug: "engineering", name: "Engineering", threads: 70 },
    { slug: "games", name: "Games", threads: 7 },
  ],
};

describe("AdminStats", () => {
  it("shows every number, the database size and threads per category", () => {
    render(<AdminStats stats={stats} />);
    const people = screen.getByRole("region", { name: /People/ });
    expect(
      within(people)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual(["1,234Members", "1,200Onboarded", "5New, 7 days", "40New, 30 days", "0Active bans"]);
    const content = screen.getByRole("region", { name: /Content/ });
    expect(
      within(content)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual(["77Threads", "900Replies", "2Open reports", "3Notes2 git · 1 db", "9.7 MBDatabase"]);
    const table = screen.getByRole("table");
    expect(within(table).getByRole("rowheader", { name: "Engineering" })).toBeInTheDocument();
    expect(
      within(table)
        .getAllByRole("row")
        .map((r) => r.textContent),
    ).toEqual(["CategoryThreads", "Engineering70", "Games7"]);
  });

  it("adds git posts and database notes, with the split underneath", () => {
    render(<AdminStats stats={{ ...stats, notes: { git: 4, db: 1_200 } }} />);
    const item = screen.getByText("Notes").closest("li")!;
    expect(within(item).getByText("1,204")).toBeInTheDocument();
    expect(within(item).getByText("4 git · 1,200 db")).toBeInTheDocument();
  });

  it("highlights open reports and active bans only when there are some", () => {
    render(<AdminStats stats={{ ...stats, activeBans: 1, openReports: 0 }} />);
    const item = (label: string) => screen.getByText(label).closest("li")!;
    expect(item("Active bans").className).toMatch(/alert/);
    expect(item("Open reports").className).not.toMatch(/alert/);
  });
});
