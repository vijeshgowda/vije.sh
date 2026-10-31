import { describe, expect, it } from "vitest";
import { isLanguage, LANGUAGES, t } from "./index";
import dictionaries from "./dictionaries.json";

describe("original Omni dictionaries", () => {
  it("offers all six native names, with Kannada second", () => {
    expect(LANGUAGES.map((language) => language.code)).toEqual([
      "en",
      "kn",
      "es",
      "fr",
      "de",
      "hi",
    ]);
    expect(LANGUAGES.map((language) => language.label)).toEqual([
      "English",
      "ಕನ್ನಡ",
      "Español",
      "Français",
      "Deutsch",
      "हिन्दी",
    ]);
    expect(isLanguage("kn")).toBe(true);
    expect(isLanguage("zz")).toBe(false);
    expect(isLanguage(null)).toBe(false);
  });
  it.each(LANGUAGES)(
    "keeps all 112 English keys and interpolation placeholders in $code",
    ({ code }) => {
      expect(Object.keys(dictionaries[code]).sort()).toEqual(Object.keys(dictionaries.en).sort());
      expect(Object.keys(dictionaries[code])).toHaveLength(112);
      for (const key of Object.keys(dictionaries.en)) {
        const entry = Object.entries(dictionaries.en).find(([name]) => name === key)!;
        const translated = Object.entries(dictionaries[code]).find(([name]) => name === key)!;
        expect(translated[1].match(/\{[a-z]+\}/gi) ?? []).toEqual(
          entry[1].match(/\{[a-z]+\}/gi) ?? [],
        );
      }
    },
  );
  it("translates without global language or DOM mutations", () => {
    expect(t("en", "home.create")).toBe("Create Room");
    expect(t("es", "home.create")).toBe("Crear sala");
    expect(t("kn", "home.create")).toBe(dictionaries.kn["home.create"]);
    expect(t("en", "file.sending", { name: "a.png", pct: 42 })).toBe("Sending a.png: 42%");
    expect(t("en", "lobby.reconnecting", { attempt: 2, max: 5 })).toBe(
      "Connection lost. Reconnecting… (attempt 2/5)",
    );
    expect(t("en", "file.sending")).toBe("Sending {name}: {pct}%");
  });
});
