import { afterEach, describe, expect, it, vi } from "vitest";
import {
  base64ToUint8,
  decrypt,
  deriveSharedKey,
  encrypt,
  exportPublicKey,
  generateKeyPair,
  importPublicKey,
  IncrementalSHA256,
  safetyString,
  sha256,
  uint8ToBase64,
} from "./crypto";
import golden from "./fixtures/golden.json";

afterEach(() => vi.restoreAllMocks());

async function goldenKey(password = "") {
  const privateKey = await crypto.subtle.importKey(
    "jwk",
    golden.privateKeys[0],
    { name: "ECDH", namedCurve: "P-256" },
    false,
    ["deriveBits"],
  );
  return deriveSharedKey(privateKey, await importPublicKey(golden.publicKeys[1]), password);
}

describe("original Omni crypto compatibility", () => {
  it.each(golden.encryptions)("matches HKDF/AES bytes for password '$password'", async (vector) => {
    const key = await goldenKey(vector.password);
    vi.spyOn(crypto, "getRandomValues").mockImplementationOnce((view) => {
      if (!(view instanceof Uint8Array)) throw new Error("Expected an IV");
      view.set(vector.iv);
      return view;
    });
    expect(uint8ToBase64(await encrypt(key, vector.plaintext))).toBe(vector.encrypted);
    expect(new TextDecoder().decode(await decrypt(key, base64ToUint8(vector.encrypted)))).toBe(
      vector.plaintext,
    );
    expect(key.extractable).toBe(false);
  });

  it("produces the exact five emoji and 4+4 uppercase hex SAS in either key order", async () => {
    expect(golden.safety).toEqual({ emoji: "🐯 🍋 🐹 🌙 🍋", code: "C9E5 0320" });
    expect(await safetyString(golden.publicKeys[0], golden.publicKeys[1])).toEqual(golden.safety);
    expect(await safetyString(golden.publicKeys[1], golden.publicKeys[0])).toEqual(golden.safety);
    expect(await safetyString(golden.publicKeys[0], "substituted key")).not.toEqual(golden.safety);
  });

  it("rejects a mismatched password, changed ciphertext, or missing authentication tag", async () => {
    const ciphertext = base64ToUint8(golden.encryptions[0].encrypted);
    await expect(decrypt(await goldenKey("wrong"), ciphertext)).rejects.toThrow();
    ciphertext[ciphertext.length - 1] ^= 1;
    await expect(decrypt(await goldenKey(), ciphertext)).rejects.toThrow();
    const key = await goldenKey();
    await expect(decrypt(key, new Uint8Array(27))).rejects.toThrow("authentication tag");
  });
});

describe("crypto primitives (ported from upstream crypto/features tests)", () => {
  it("exports and imports unique, raw P-256 public keys", async () => {
    const a = await generateKeyPair();
    const b = await generateKeyPair();
    expect(a.publicKey.type).toBe("public");
    expect(a.privateKey.type).toBe("private");
    const publicA = await exportPublicKey(a);
    expect(base64ToUint8(publicA).length).toBe(65);
    expect(await exportPublicKey(b)).not.toBe(publicA);
    const imported = await importPublicKey(publicA);
    expect(new Uint8Array(await crypto.subtle.exportKey("raw", imported))).toEqual(
      base64ToUint8(publicA),
    );
    await expect(importPublicKey("not a public key")).rejects.toThrow();
  });

  it.each(["", "matching password"])(
    "round trips two peers with password '%s'",
    async (password) => {
      const a = await generateKeyPair(),
        b = await generateKeyPair();
      const keyA = await deriveSharedKey(a.privateKey, b.publicKey, password);
      const keyB = await deriveSharedKey(b.privateKey, a.publicKey, password);
      for (const plaintext of [
        "Secret message 🔒",
        new Uint8Array([0, 1, 255]),
        new ArrayBuffer(0),
      ]) {
        const encrypted = await encrypt(keyA, plaintext);
        expect(new Uint8Array(await decrypt(keyB, encrypted))).toEqual(
          typeof plaintext === "string"
            ? new TextEncoder().encode(plaintext)
            : plaintext instanceof Uint8Array
              ? plaintext
              : new Uint8Array(plaintext),
        );
        expect(await encrypt(keyA, plaintext)).not.toEqual(encrypted);
      }
    },
  );

  it("matches the standard SHA-256 and base64 vectors", async () => {
    expect(await sha256("hello")).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
    expect(uint8ToBase64(new TextEncoder().encode("Hello"))).toBe("SGVsbG8=");
    for (const length of [0, 5, 65536, 200000]) {
      const data = Uint8Array.from({ length }, (_, i) => i & 255);
      expect(base64ToUint8(uint8ToBase64(data))).toEqual(data);
    }
  });

  it.each([0, 1, 55, 56, 63, 64, 65, 127, 128, 129, 65539, 1048576])(
    "streaming SHA-256 matches Web Crypto at %i bytes",
    async (length) => {
      const data = Uint8Array.from({ length }, (_, i) => i & 255);
      const hash = new IncrementalSHA256();
      for (let offset = 0; offset < length; offset += 17)
        hash.update(data.subarray(offset, offset + 17));
      expect(hash.digest()).toBe(await sha256(data.buffer));
      expect(hash.digest()).toBe(await sha256(data));
      expect(() => hash.update(new Uint8Array())).toThrow("finalised");
      expect(new IncrementalSHA256().update(data.buffer).digest()).toBe(await sha256(data));
    },
  );
});
