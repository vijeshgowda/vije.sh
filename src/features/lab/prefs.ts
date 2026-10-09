"use client";

import { createStoredValue } from "@/lib/stored-value";
import { DEFAULT_LAB, parseLab } from "./sizing";

export const labPrefs = createStoredValue("lab", DEFAULT_LAB, parseLab);
