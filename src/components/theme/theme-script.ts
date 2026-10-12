import { SITE } from "@/config/site";

export const THEME_KEY = "theme";
export type Theme = "light" | "dark";

/** Browser UI colour (<meta name="theme-color">) per theme; keep in step with --bg in tokens.css */
export const THEME_COLOR: Record<Theme, string> = { light: "#f4eee3", dark: "#0c0d0f" };

const INLINE_SCRIPT_UNSAFE_CHARS: Record<string, string> = {
  "<": "\\u003C",
  ">": "\\u003E",
  "/": "\\u002F",
  "\u2028": "\\u2028",
  "\u2029": "\\u2029",
};

function escapeForInlineScript(value: string): string {
  return JSON.stringify(value).replace(
    /[<>/\u2028\u2029]/g,
    (ch) => INLINE_SCRIPT_UNSAFE_CHARS[ch],
  );
}

/** Inline, render-blocking on purpose: runs before first paint so dark mode never flashes light. */
export const THEME_INIT_SCRIPT = `try{if(JSON.parse(localStorage.getItem(${escapeForInlineScript(
  SITE.storagePrefix + THEME_KEY,
)}))==="dark"){document.documentElement.dataset.theme="dark";document.querySelectorAll('meta[name="theme-color"]').forEach(function(m){m.setAttribute("content",${escapeForInlineScript(
  THEME_COLOR.dark,
)})})}}catch(e){}`;
