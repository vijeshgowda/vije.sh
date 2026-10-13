import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CurrentUser, Role } from "@/lib/authz";
import type { MemberDetail } from "../queries";

// the forms post to Server Actions; only which forms render matters here
vi.mock("../actions", () => ({
  grantRoleAction: vi.fn(),
  revokeRoleAction: vi.fn(),
  banAction: vi.fn(),
  liftBanAction: vi.fn(),
}));

const { MemberProfile } = await import("./MemberProfile");

const viewer = (id: string, role: Role): CurrentUser => ({
  id,
  handle: id,
  onboarded: true,
  banned: false,
  roles: [{ role, categoryId: null }],
});
const owner = viewer("owner", "admin");
const su = viewer("su", "superuser");

const at = new Date("2026-10-01T09:05:00Z");
const grant = (
  role: Role,
  categoryId: string | null = null,
  categoryName: string | null = null,
) => ({
  role,
  categoryId,
  categoryName,
  grantedAt: at,
  grantedBy: "owner",
});
const detail = (extra: Partial<MemberDetail> = {}): MemberDetail => {
  const grants = extra.grants ?? [];
  return {
    id: "t1",
    handle: "Nora",
    displayName: "Nora K",
    joinedAt: at,
    onboarded: true,
    bans: [],
    ...extra,
    grants,
    roles: grants.map((g) => g.role),
  };
};
const categories = [
  { id: "2", name: "Engineering" },
  { id: "4", name: "Games" },
];

const show = (member: MemberDetail, user: CurrentUser) =>
  render(<MemberProfile member={member} viewer={user} categories={categories} />);

describe("MemberProfile", () => {
  it("shows a member's facts", () => {
    show(detail(), su);
    expect(screen.getByRole("heading", { level: 1, name: "@Nora" })).toBeInTheDocument();
    expect(screen.getByText("Nora K")).toBeInTheDocument();
    expect(screen.getAllByText("2026-10-01 09:05 UTC")[0]).toHaveAttribute(
      "datetime",
      at.toISOString(),
    );
    expect(
      screen.getByText("No staff roles. Members are everyone onboarded and not banned."),
    ).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("gives the owner every control over a plain member", () => {
    show(detail(), owner);
    expect(screen.getByRole("button", { name: "Grant moderator" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Make superuser" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Moderator of" })).toHaveTextContent(
      "Every categoryEngineeringGames",
    );
    expect(screen.getByRole("button", { name: "Ban @Nora" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Length" })).toHaveValue("");
  });

  it("lets a superuser grant moderator and ban, but not make superusers", () => {
    show(detail({ grants: [grant("moderator", "4", "Games")] }), su);
    expect(screen.getByRole("button", { name: "Grant moderator" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Make superuser" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Revoke Moderator · Games" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ban @Nora" })).toBeInTheDocument();
  });

  it("locks a superuser's page for other superusers", () => {
    show(detail({ grants: [grant("superuser")] }), su);
    expect(screen.getByText("Only the owner can change a superuser.")).toBeInTheDocument();
    expect(screen.queryAllByRole("button")).toEqual([]);
  });

  it("lets the owner revoke a superuser, without offering moderator", () => {
    show(detail({ grants: [grant("superuser")] }), owner);
    expect(screen.getByRole("button", { name: "Revoke Superuser" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Grant moderator" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Make superuser" })).not.toBeInTheDocument();
  });

  it("locks the owner's page and your own", () => {
    const { unmount } = show(detail({ id: "owner", grants: [grant("admin")] }), su);
    expect(screen.getByText("The owner's account can't be changed here.")).toBeInTheDocument();
    expect(screen.queryAllByRole("button")).toEqual([]);
    unmount();
    show(detail({ id: "owner", grants: [grant("admin")] }), owner);
    expect(screen.getByText(/This is you/)).toBeInTheDocument();
    expect(screen.queryAllByRole("button")).toEqual([]);
  });

  it("shows an active ban with a lift button and the ban history", () => {
    const later = new Date("2026-10-08T09:05:00Z");
    show(
      detail({
        bans: [
          {
            id: "2",
            reason: "spam",
            bannedBy: "su",
            createdAt: at,
            expiresAt: later,
            liftedAt: null,
            active: true,
          },
          {
            id: "1",
            reason: "old",
            bannedBy: null,
            createdAt: at,
            expiresAt: null,
            liftedAt: at,
            active: false,
          },
        ],
      }),
      su,
    );
    expect(screen.getAllByText("Banned")[0]).toBeInTheDocument();
    const ban = screen.getByRole("region", { name: /^\d\s*Ban$/ });
    expect(ban).toHaveTextContent(
      "Banned since 2026-10-01 09:05 UTC until 2026-10-08 09:05 UTC: spam",
    );
    expect(within(ban).getByRole("button", { name: "Lift ban" })).toBeInTheDocument();
    expect(within(ban).queryByRole("button", { name: /^Ban/ })).not.toBeInTheDocument();
    const history = within(ban).getByRole("table", { name: "Ban history, newest first" });
    const rows = within(history).getAllByRole("row");
    expect(rows[1]).toHaveTextContent("@su");
    expect(rows[2]).toHaveTextContent("Permanent");
    expect(rows[2]).toHaveTextContent("—");
  });

  it("says a permanent ban is permanent", () => {
    show(
      detail({
        bans: [
          {
            id: "1",
            reason: "abuse",
            bannedBy: "owner",
            createdAt: at,
            expiresAt: null,
            liftedAt: null,
            active: true,
          },
        ],
      }),
      owner,
    );
    expect(screen.getByRole("region", { name: /^\d\s*Ban$/ })).toHaveTextContent(
      "Banned since 2026-10-01 09:05 UTC, permanently: abuse",
    );
  });
});
