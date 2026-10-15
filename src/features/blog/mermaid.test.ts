import { describe, expect, it } from "vitest";
import { diagramLabel, mermaidConfig } from "./mermaid";

describe("diagramLabel", () => {
  it("joins accTitle and a one-line accDescr", () => {
    const src = "graph TD\n  accTitle: Request flow\n  accDescr: Browser to server\n  A --> B";
    expect(diagramLabel(src)).toBe("Request flow. Browser to server");
  });

  it("reads a block accDescr, collapsing whitespace", () => {
    expect(diagramLabel("graph TD\n  accDescr {\n    Two\n    lines\n  }\n")).toBe("Two lines");
  });

  it("falls back to a generic label", () => {
    expect(diagramLabel("graph TD\n  A --> B")).toBe("Diagram");
  });
});

describe("mermaidConfig", () => {
  const tokens: Record<string, string> = { "--bg": " #0c0d0f", "--ink": "#efefec", "--card": "" };

  it("is strict, never auto-starts and themes the base theme from tokens", () => {
    const cfg = mermaidConfig(true, (n) => tokens[n] ?? "", "Inter, sans-serif");
    expect(cfg).toMatchObject({
      startOnLoad: false,
      securityLevel: "strict",
      suppressErrorRendering: true,
      theme: "base",
    });
    expect(cfg.themeVariables).toMatchObject({
      darkMode: true,
      fontFamily: "Inter, sans-serif",
      background: "#0c0d0f",
      primaryTextColor: "#efefec",
      textColor: "#efefec",
    });
    // empty tokens are left to Mermaid's own defaults
    expect(cfg.themeVariables).not.toHaveProperty("primaryColor");
  });

  it("omits an empty font", () => {
    expect(mermaidConfig(false, () => "", "").themeVariables).toEqual({ darkMode: false });
  });
});
