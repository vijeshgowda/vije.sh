import dictionaries from "./dictionaries.json";
import additions from "./additions.json";

export const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "kn", label: "ಕನ್ನಡ" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "hi", label: "हिन्दी" },
] as const;
export type Language = (typeof LANGUAGES)[number]["code"];
export type TranslationKey = keyof typeof dictionaries.en | keyof typeof additions.en;

// dictionaries.json is regenerated from the original Omni; vije.sh-only strings live in additions.json.
const merged = Object.fromEntries(
  LANGUAGES.map(({ code }) => [code, { ...dictionaries[code], ...additions[code] }]),
) as Record<Language, Record<TranslationKey, string>>;

export function isLanguage(value: unknown): value is Language {
  return LANGUAGES.some((language) => language.code === value);
}

export function t(
  language: Language,
  key: TranslationKey,
  params: Record<string, string | number> = {},
): string {
  let text = merged[language][key];
  for (const [name, value] of Object.entries(params)) {
    text = text.split(`{${name}}`).join(String(value));
  }
  return text;
}
