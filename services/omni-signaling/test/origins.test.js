import { test } from "node:test";
import assert from "node:assert/strict";
import { allowedOrigins, isAllowedOrigin, isExactOrigin, PRODUCTION_ORIGINS } from "../origins.js";

const PRODUCTION = ["https://vije.sh", "https://vijeshgowda.com"];

test("the committed production list is exactly vije.sh and the GitHub Pages Omni", () => {
  assert.deepEqual([...PRODUCTION_ORIGINS], PRODUCTION);
  assert.ok(Object.isFrozen(PRODUCTION_ORIGINS));
  for (const origin of PRODUCTION_ORIGINS) {
    assert.ok(isExactOrigin(origin), origin);
    assert.ok(origin.startsWith("https://"), origin);
    assert.doesNotMatch(origin, /localhost|127\.0\.0\.1/);
  }
});

test("a missing or empty override keeps the committed list", () => {
  for (const value of [undefined, null, "", "   ", ",", " , ,"]) {
    assert.deepEqual(allowedOrigins(value), PRODUCTION, String(value));
  }
});

test("the override is a comma-separated list of exact origins that replaces the default", () => {
  assert.deepEqual(allowedOrigins(" http://localhost:3000 ,https://preview.example,"), [
    "http://localhost:3000",
    "https://preview.example",
  ]);
  assert.deepEqual(allowedOrigins("https://a.example,https://a.example"), ["https://a.example"]);
});

test("the override refuses anything that isn't an exact origin", () => {
  for (const value of [
    "*",
    "https://*.vije.sh",
    "https://vije.sh/",
    "https://vije.sh/lab/omni",
    "https://vije.sh?x=1",
    "vije.sh",
    "null",
    "file:///tmp",
    "ws://localhost:3000",
    "https://vije.sh,*",
  ]) {
    assert.throws(() => allowedOrigins(value), /exact origins/, value);
  }
});

test("origins match exactly, and a missing origin never matches", () => {
  const allowed = allowedOrigins();
  assert.equal(isAllowedOrigin("https://vije.sh", allowed), true);
  for (const origin of [
    undefined,
    "",
    "null",
    "http://vije.sh",
    "https://vije.sh/",
    "https://www.vije.sh",
    "https://vije.sh.evil.example",
    "https://evil.example",
    "http://localhost:3000",
  ]) {
    assert.equal(isAllowedOrigin(origin, allowed), false, String(origin));
  }
});
