import type { MermaidConfig } from "mermaid";

/** Accessible name for a diagram: its `accTitle` and `accDescr`, or a generic label. */
export function diagramLabel(source: string): string {
  const title = /^\s*accTitle\s*:\s*(.+)$/m.exec(source)?.[1]?.trim();
  const descr =
    /^\s*accDescr\s*:\s*(.+)$/m.exec(source)?.[1]?.trim() ??
    /^\s*accDescr\s*\{([^}]*)\}/m.exec(source)?.[1]?.replace(/\s+/g, " ").trim();
  return [title, descr].filter(Boolean).join(". ") || "Diagram";
}

/** Mermaid theme variable -> design token (src/styles/tokens.css). */
const TOKENS = {
  background: "--bg",
  primaryColor: "--card",
  primaryTextColor: "--ink",
  primaryBorderColor: "--ink",
  secondaryColor: "--faint",
  secondaryTextColor: "--ink",
  secondaryBorderColor: "--line2",
  tertiaryColor: "--bg",
  tertiaryTextColor: "--ink",
  tertiaryBorderColor: "--line2",
  lineColor: "--mute",
  textColor: "--ink",
  noteBkgColor: "--faint",
  noteTextColor: "--ink",
  noteBorderColor: "--line2",
  edgeLabelBackground: "--card",
  clusterBkg: "--faint",
  clusterBorder: "--line2",
} as const;

/**
 * Mermaid settings for the current site theme. `strict` makes Mermaid sanitise labels and the
 * whole SVG with DOMPurify and disables click handlers; directives in a diagram can't loosen it.
 * `token` reads a CSS custom property; empty values are left to Mermaid's base theme.
 */
export function mermaidConfig(
  dark: boolean,
  token: (name: string) => string,
  fontFamily: string,
): MermaidConfig {
  const themeVariables: Record<string, string | boolean> = { darkMode: dark };
  if (fontFamily) themeVariables.fontFamily = fontFamily;
  for (const [key, name] of Object.entries(TOKENS)) {
    const value = token(name).trim();
    if (value) themeVariables[key] = value;
  }
  return {
    startOnLoad: false,
    securityLevel: "strict",
    suppressErrorRendering: true,
    theme: "base",
    themeVariables,
  };
}
