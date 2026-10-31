const ECDH_PARAMS: EcKeyGenParams = { name: "ECDH", namedCurve: "P-256" };
const AES_PARAMS: AesKeyGenParams = { name: "AES-GCM", length: 256 };
export type BinaryData = ArrayBuffer | Uint8Array;

function bytes(data: BinaryData): Uint8Array<ArrayBuffer> {
  return data instanceof Uint8Array ? new Uint8Array(data) : new Uint8Array(data);
}

export function generateKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(ECDH_PARAMS, true, ["deriveKey", "deriveBits"]);
}

export async function exportPublicKey(keyPair: CryptoKeyPair): Promise<string> {
  return uint8ToBase64(new Uint8Array(await crypto.subtle.exportKey("raw", keyPair.publicKey)));
}

export async function importPublicKey(base64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", base64ToUint8(base64), ECDH_PARAMS, true, []);
}

export async function deriveSharedKey(
  privateKey: CryptoKey,
  peerPublicKey: CryptoKey,
  passphrase = "",
): Promise<CryptoKey> {
  const sharedBits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: peerPublicKey },
    privateKey,
    256,
  );
  const material = await crypto.subtle.importKey("raw", sharedBits, "HKDF", false, ["deriveKey"]);
  // This separator and context string are part of the original Omni wire protocol.
  const info = new TextEncoder().encode("project-a-v1" + (passphrase ? "\0" + passphrase : ""));
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info },
    material,
    AES_PARAMS,
    false,
    ["encrypt", "decrypt"],
  );
}

const SAS_EMOJI = [
  "🐶",
  "🐱",
  "🐭",
  "🐹",
  "🐰",
  "🦊",
  "🐻",
  "🐼",
  "🐨",
  "🐯",
  "🦁",
  "🐮",
  "🐷",
  "🐸",
  "🐵",
  "🐔",
  "🐧",
  "🐦",
  "🦆",
  "🦉",
  "🦄",
  "🐝",
  "🦋",
  "🐢",
  "🐙",
  "🐳",
  "🐬",
  "🐟",
  "🌵",
  "🌲",
  "🍀",
  "🌻",
  "🌙",
  "⭐",
  "🔥",
  "🌈",
  "🍎",
  "🍋",
  "🍓",
  "🍒",
  "🍕",
  "🍔",
  "🍪",
  "🎂",
  "⚽",
  "🏀",
  "🎸",
  "🎺",
  "🚀",
  "✈️",
  "🚗",
  "⛵",
  "🏠",
  "🔑",
  "💡",
  "📷",
  "🎈",
  "🎁",
  "💎",
  "🔔",
  "⚓",
  "⚡",
  "❄️",
  "🍩",
];

export type SafetyString = { emoji: string; code: string };

export async function safetyString(pubA: string, pubB: string): Promise<SafetyString> {
  const [x, y] = [pubA, pubB].sort();
  const hex = await sha256(`${x}|${y}`);
  const emoji = [];
  for (let i = 0; i < 10; i += 2) {
    emoji.push(SAS_EMOJI[parseInt(hex.slice(i, i + 2), 16) & 63]);
  }
  return {
    emoji: emoji.join(" "),
    code: hex
      .slice(0, 8)
      .toUpperCase()
      .replace(/(.{4})(.{4})/, "$1 $2"),
  };
}

export async function encrypt(
  key: CryptoKey,
  data: string | BinaryData,
): Promise<Uint8Array<ArrayBuffer>> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = typeof data === "string" ? new TextEncoder().encode(data) : bytes(data);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  const result = new Uint8Array(12 + ciphertext.byteLength);
  result.set(iv);
  result.set(new Uint8Array(ciphertext), 12);
  return result;
}

export async function decrypt(key: CryptoKey, data: BinaryData): Promise<ArrayBuffer> {
  const encoded = bytes(data);
  if (encoded.length < 28)
    throw new Error("Encrypted data is missing its IV or authentication tag");
  return crypto.subtle.decrypt(
    { name: "AES-GCM", iv: encoded.slice(0, 12) },
    key,
    encoded.slice(12),
  );
}

export async function sha256(data: string | BinaryData): Promise<string> {
  const encoded = typeof data === "string" ? new TextEncoder().encode(data) : bytes(data);
  const hash = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function uint8ToBase64(data: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < data.length; offset += 8192) {
    binary += String.fromCharCode(...data.subarray(offset, offset + 8192));
  }
  return btoa(binary);
}

export function base64ToUint8(base64: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

const SHA256_K = new Int32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

export class IncrementalSHA256 {
  private h = new Int32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  private block = new Uint8Array(64);
  private blockLen = 0;
  private length = 0;
  private w = new Int32Array(64);
  private result: string | null = null;

  update(data: BinaryData): this {
    if (this.result !== null) throw new Error("Hash has already been finalised");
    const input = data instanceof Uint8Array ? data : new Uint8Array(data);
    this.length += input.length;
    let i = 0;
    if (this.blockLen > 0) {
      const take = Math.min(64 - this.blockLen, input.length);
      this.block.set(input.subarray(0, take), this.blockLen);
      this.blockLen += take;
      i = take;
      if (this.blockLen === 64) {
        this.process(this.block, 0);
        this.blockLen = 0;
      }
    }
    for (; i + 64 <= input.length; i += 64) this.process(input, i);
    if (i < input.length) {
      this.block.set(input.subarray(i), 0);
      this.blockLen = input.length - i;
    }
    return this;
  }

  digest(): string {
    if (this.result !== null) return this.result;
    const block = this.block;
    let length = this.blockLen;
    block[length++] = 0x80;
    if (length > 56) {
      while (length < 64) block[length++] = 0;
      this.process(block, 0);
      length = 0;
    }
    while (length < 56) block[length++] = 0;
    const view = new DataView(block.buffer);
    view.setUint32(56, Math.floor(this.length / 0x20000000), false);
    view.setUint32(60, (this.length * 8) >>> 0, false);
    this.process(block, 0);
    this.result = Array.from(this.h, (n) => (n >>> 0).toString(16).padStart(8, "0")).join("");
    return this.result;
  }

  private process(input: Uint8Array, offset: number) {
    const w = this.w;
    const h = this.h;
    for (let i = 0; i < 16; i++) {
      const p = offset + i * 4;
      w[i] = (input[p] << 24) | (input[p + 1] << 16) | (input[p + 2] << 8) | input[p + 3];
    }
    for (let i = 16; i < 64; i++) {
      const x = w[i - 15],
        y = w[i - 2];
      const s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
      const s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let a = h[0],
      b = h[1],
      c = h[2],
      d = h[3],
      e = h[4],
      f = h[5],
      g = h[6],
      hh = h[7];
    for (let i = 0; i < 64; i++) {
      const s1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const t1 = (hh + s1 + ((e & f) ^ (~e & g)) + SHA256_K[i] + w[i]) | 0;
      const s0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const t2 = (s0 + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) | 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }
    const values = [a, b, c, d, e, f, g, hh];
    for (let i = 0; i < 8; i++) h[i] = (h[i] + values[i]) | 0;
  }
}
