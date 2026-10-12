import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ThemeToggle } from "./ThemeToggle";
import { THEME_COLOR, THEME_INIT_SCRIPT } from "./theme-script";

describe("theme", () => {
  it("toggles dark mode and remembers it", async () => {
    const user = userEvent.setup();
    const meta = Object.assign(document.createElement("meta"), { name: "theme-color" });
    document.head.append(meta);
    render(<ThemeToggle />);
    const btn = screen.getByRole("button", { name: "Dark" });
    expect(btn).toHaveAttribute("aria-pressed", "false");
    await user.click(btn);
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("vj:theme")).toBe('"dark"');
    expect(btn).toHaveAttribute("aria-pressed", "true");
    expect(meta.content).toBe(THEME_COLOR.dark);
    await user.click(btn);
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(localStorage.getItem("vj:theme")).toBe('"light"');
    expect(meta.content).toBe(THEME_COLOR.light);
    meta.remove();
  });

  it("the init script applies a saved dark theme and ignores bad storage", () => {
    const meta = Object.assign(document.createElement("meta"), {
      name: "theme-color",
      content: THEME_COLOR.light,
    });
    document.head.append(meta);
    localStorage.setItem("vj:theme", '"dark"');
    new Function(THEME_INIT_SCRIPT)();
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(meta.content).toBe(THEME_COLOR.dark);
    meta.remove();
    delete document.documentElement.dataset.theme;
    localStorage.setItem("vj:theme", "{not json");
    expect(() => new Function(THEME_INIT_SCRIPT)()).not.toThrow();
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });
});
