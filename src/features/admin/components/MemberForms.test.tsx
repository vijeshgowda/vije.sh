import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  grantRoleAction: vi.fn(),
  revokeRoleAction: vi.fn(),
  banAction: vi.fn(),
  liftBanAction: vi.fn(),
}));
vi.mock("../actions", () => actions);
const toast = vi.hoisted(() => vi.fn());
vi.mock("@/components/layout/toast", () => ({ toast }));

const { BanForm, GrantModeratorForm, GrantSuperuserForm, LiftBanForm, RevokeRoleForm } =
  await import("./MemberForms");

const sent = (fn: ReturnType<typeof vi.fn>) =>
  Object.fromEntries((fn.mock.calls[0]![1] as FormData).entries());

beforeEach(() => vi.clearAllMocks());

describe("member forms", () => {
  it("grant moderator sends the handle, role and chosen category, and toasts success", async () => {
    actions.grantRoleAction.mockResolvedValue({ ok: "@nora is now a moderator." });
    render(<GrantModeratorForm handle="nora" categories={[{ id: "4", name: "Games" }]} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Moderator of" }), {
      target: { value: "4" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Grant moderator" }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith("@nora is now a moderator."));
    expect(sent(actions.grantRoleAction)).toEqual({
      handle: "nora",
      role: "moderator",
      categoryId: "4",
    });
  });

  it("shows an error next to the form instead of a toast", async () => {
    actions.grantRoleAction.mockResolvedValue({ error: "You can't change this member." });
    render(<GrantSuperuserForm handle="nora" />);
    fireEvent.click(screen.getByRole("button", { name: "Make superuser" }));
    expect(await screen.findByText("You can't change this member.")).toBeInTheDocument();
    expect(toast).not.toHaveBeenCalled();
    expect(sent(actions.grantRoleAction)).toEqual({ handle: "nora", role: "superuser" });
  });

  it("revoke sends the grant's role and category", async () => {
    actions.revokeRoleAction.mockResolvedValue({ ok: "done" });
    render(<RevokeRoleForm handle="nora" role="moderator" categoryId={null} label="Moderator" />);
    fireEvent.click(screen.getByRole("button", { name: "Revoke Moderator" }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith("done"));
    expect(sent(actions.revokeRoleAction)).toEqual({
      handle: "nora",
      role: "moderator",
      categoryId: "",
    });
  });

  it("ban sends the reason and length", async () => {
    actions.banAction.mockResolvedValue({ ok: "@nora is banned." });
    render(<BanForm handle="nora" />);
    fireEvent.change(screen.getByRole("textbox", { name: "Reason" }), {
      target: { value: "spam" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Length" }), { target: { value: "7" } });
    fireEvent.click(screen.getByRole("button", { name: "Ban @nora" }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith("@nora is banned."));
    expect(sent(actions.banAction)).toEqual({ handle: "nora", reason: "spam", days: "7" });
    expect(screen.getByRole("textbox", { name: "Reason" })).toHaveAccessibleDescription(
      "Recorded in the moderation log. Up to 500 characters.",
    );
  });

  it("lift ban sends the handle", async () => {
    actions.liftBanAction.mockResolvedValue({ error: "@nora isn't banned." });
    render(<LiftBanForm handle="nora" />);
    fireEvent.click(screen.getByRole("button", { name: "Lift ban" }));
    expect(await screen.findByText("@nora isn't banned.")).toBeInTheDocument();
    expect(sent(actions.liftBanAction)).toEqual({ handle: "nora" });
  });
});
