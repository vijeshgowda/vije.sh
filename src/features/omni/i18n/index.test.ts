import { describe, expect, it } from "vitest";
import { isLanguage, LANGUAGES, t } from "./index";
import dictionaries from "./dictionaries.json";
import additions from "./additions.json";

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

  it.each(LANGUAGES)("adds the same vije.sh strings and placeholders in $code", ({ code }) => {
    const english = Object.keys(additions.en).sort();
    expect(Object.keys(additions[code]).sort()).toEqual(english);
    for (const key of english) {
      expect(Object.keys(dictionaries.en)).not.toContain(key);
      const source = additions.en[key as keyof typeof additions.en];
      const translated = additions[code][key as keyof typeof additions.en];
      expect(translated.trim()).not.toBe("");
      expect(translated.match(/\{[a-z]+\}/gi) ?? []).toEqual(source.match(/\{[a-z]+\}/gi) ?? []);
    }
  });
  it("translates the additions through t()", () => {
    expect(t("en", "lobby.code_sr", { code: "K 7 Q" })).toBe("Room code K 7 Q");
    expect(t("kn", "ctrl.mic")).toBe(additions.kn["ctrl.mic"]);
  });
});
