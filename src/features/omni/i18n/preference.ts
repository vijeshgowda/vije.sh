"use client";

import { createStoredValue } from "@/lib/stored-value";
import { isLanguage, type Language } from "./index";

export const languagePreference = createStoredValue<Language>("omni-lang", "en", (value) =>
  isLanguage(value) ? value : "en",
);
