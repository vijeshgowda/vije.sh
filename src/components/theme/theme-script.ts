import { SITE } from "@/config/site";

export const THEME_KEY = "theme";
export type Theme = "light" | "dark";

/** Inline, render-blocking on purpose: runs before first paint so dark mode never flashes light. */
export const THEME_INIT_SCRIPT = `try{if(JSON.parse(localStorage.getItem(${JSON.stringify(
  SITE.storagePrefix + THEME_KEY,
)}))==="dark")document.documentElement.dataset.theme="dark"}catch(e){}`;
