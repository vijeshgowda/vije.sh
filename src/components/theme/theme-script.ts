import { SITE } from "@/config/site";

export const THEME_KEY = "theme";
export type Theme = "light" | "dark";

/** Browser UI colour (<meta name="theme-color">) per theme; keep in step with --bg in tokens.css */
export const THEME_COLOR: Record<Theme, string> = { light: "#f4eee3", dark: "#0c0d0f" };

/** Inline, render-blocking on purpose: runs before first paint so dark mode never flashes light. */
export const THEME_INIT_SCRIPT = `try{if(JSON.parse(localStorage.getItem(${JSON.stringify(
  SITE.storagePrefix + THEME_KEY,
)}))==="dark"){document.documentElement.dataset.theme="dark";document.querySelectorAll('meta[name="theme-color"]').forEach(function(m){m.setAttribute("content",${JSON.stringify(
  THEME_COLOR.dark,
)})})}}catch(e){}`;
