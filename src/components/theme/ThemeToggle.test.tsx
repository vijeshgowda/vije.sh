import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ThemeToggle } from "./ThemeToggle";
import { THEME_INIT_SCRIPT } from "./theme-script";

describe("theme", () => {
  it("toggles dark mode and remembers it", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);
    const btn = screen.getByRole("button", { name: "Dark" });
    expect(btn).toHaveAttribute("aria-pressed", "false");
    await user.click(btn);
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("vj:theme")).toBe('"dark"');
    expect(btn).toHaveAttribute("aria-pressed", "true");
    await user.click(btn);
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(localStorage.getItem("vj:theme")).toBe('"light"');
  });

  it("the init script applies a saved dark theme and ignores bad storage", () => {
    localStorage.setItem("vj:theme", '"dark"');
    new Function(THEME_INIT_SCRIPT)();
    expect(document.documentElement.dataset.theme).toBe("dark");
    delete document.documentElement.dataset.theme;
    localStorage.setItem("vj:theme", "{not json");
    expect(() => new Function(THEME_INIT_SCRIPT)()).not.toThrow();
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });
});
