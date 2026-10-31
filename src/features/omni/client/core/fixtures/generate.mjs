// Generate from the original checkout, not the port. All private keys below are synthetic test data.
import { createECDH } from "node:crypto";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const revision = "c2a2056a34b9805cccc68b42d848c826078726fa";
if (!process.argv[2]) throw new Error("Usage: node generate.mjs <coming-soon-temp checkout>");
const root = resolve(process.argv[2]);
if (
  execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim() !== revision
) {
  throw new Error(`Expected original Omni revision ${revision}`);
}
const upstream = (name) => import(pathToFileURL(join(root, "omni/js", name)).href);
const original = await upstream("crypto.js");
const { PeerConnection } = await upstream("webrtc.js");
const { makeQrMatrix } = await upstream("qrcode.js");
const { _translations } = await upstream("i18n.js");

function syntheticJwk(scalar) {
  const ecdh = createECDH("prime256v1");
  const privateKey = Buffer.alloc(32);
  privateKey[31] = scalar;
  ecdh.setPrivateKey(privateKey);
  const publicKey = ecdh.getPublicKey();
  return {
    kty: "EC",
    crv: "P-256",
    x: publicKey.subarray(1, 33).toString("base64url"),
    y: publicKey.subarray(33, 65).toString("base64url"),
    d: privateKey.toString("base64url"),
  };
}
const privateKeys = [syntheticJwk(1), syntheticJwk(2)];
const pairs = await Promise.all(
  privateKeys.map(async (jwk) => ({
    privateKey: await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "ECDH", namedCurve: "P-256" },
      true,
      ["deriveBits"],
    ),
    publicKey: await crypto.subtle.importKey(
      "jwk",
      { ...jwk, d: undefined },
      { name: "ECDH", namedCurve: "P-256" },
      true,
      [],
    ),
  })),
);
const publicKeys = await Promise.all(pairs.map(original.exportPublicKey));
const keyPeer = new PeerConnection({ sendSignal() {} }, true, []);
keyPeer.keyPair = pairs[0];
const keyChannel = new EventTarget();
keyChannel.readyState = "open";
const publicKeyWire = await new Promise((resolve) => {
  keyChannel.send = resolve;
  keyPeer._setupDataChannel(keyChannel);
});

// Only the fixture generator fixes IVs. The production port always uses fresh random IVs.
const random = crypto.getRandomValues.bind(crypto);
let nextIv = 0;
crypto.getRandomValues = (view) => {
  if (!(view instanceof Uint8Array) || view.length !== 12) return random(view);
  for (let i = 0; i < view.length; i++) view[i] = (nextIv + i) & 255;
  nextIv++;
  return view;
};
const encryptions = [];
for (const password of ["", "pass", "pass\0word", "ಕನ್ನಡ"]) {
  const key = await original.deriveSharedKey(pairs[0].privateKey, pairs[1].publicKey, password);
  const plaintext = "Omni compatibility 🔒";
  const ciphertext = await original.encrypt(key, plaintext);
  encryptions.push({
    password,
    plaintext,
    iv: Array.from(ciphertext.slice(0, 12)),
    encrypted: original.uint8ToBase64(ciphertext),
  });
}
const channel = new EventTarget();
channel.readyState = "open";
channel.bufferedAmount = 0;
const frames = [];
channel.send = (data) => frames.push(data);
const peer = new PeerConnection({ sendSignal() {} }, true, []);
peer.dataChannel = channel;
peer.sharedKey = await original.deriveSharedKey(pairs[0].privateKey, pairs[1].publicKey);
const messages = [];
for (const message of [
  { type: "chat", text: "hello" },
  { type: "typing" },
  { type: "__verify" },
  { type: "__verified" },
]) {
  await peer.send(message);
  const wrapper = JSON.parse(frames.pop());
  const encrypted = original.base64ToUint8(wrapper.data);
  messages.push({ message, iv: Array.from(encrypted.slice(0, 12)), wire: JSON.stringify(wrapper) });
}
const data = Uint8Array.from({ length: 65539 }, (_, i) => (i * 3 + 1) & 255);
await peer.sendFile(new File([data], "sample.bin", { type: "application/octet-stream" }), {
  fileId: 0xabcdef01,
});
const metadataWire = frames.shift();
const metadataEncrypted = original.base64ToUint8(JSON.parse(metadataWire).data);
const metadata = JSON.parse(
  new TextDecoder().decode(await original.decrypt(peer.sharedKey, metadataEncrypted)),
);
const fileFrames = await Promise.all(
  frames.map(async (frame) => ({
    byteLength: frame.byteLength,
    header: Array.from(new Uint8Array(frame.slice(0, 8))),
    iv: Array.from(new Uint8Array(frame.slice(8, 20))),
    sha256: await original.sha256(frame),
  })),
);
const qrs = [];
for (const [text, ecc] of [
  ["hello", "LOW"],
  ["https://vije.sh/lab/omni#K7Q2M9", "MEDIUM"],
  ["ಕನ್ನಡ", "QUARTILE"],
  ["x".repeat(1000), "HIGH"],
]) {
  const matrix = makeQrMatrix(text, ecc);
  qrs.push({
    text,
    ecc,
    size: matrix.length,
    sha256: await original.sha256(Uint8Array.from(matrix.flat(), Number)),
  });
}
const fixture = {
  source: `vijeshgowda/coming-soon-temp@${revision}`,
  privateKeys,
  publicKeys,
  publicKeyWire,
  safety: await original.safetyString(...publicKeys),
  encryptions,
  messages,
  file: {
    metadata,
    metadataWire,
    metadataIv: Array.from(metadataEncrypted.slice(0, 12)),
    frames: fileFrames,
  },
  qrs,
};
crypto.getRandomValues = random;
writeFileSync(new URL("./golden.json", import.meta.url), JSON.stringify(fixture, null, 2) + "\n");
writeFileSync(
  new URL("../../../i18n/dictionaries.json", import.meta.url),
  JSON.stringify(_translations, null, 2) + "\n",
);
console.log(`Generated original Omni vectors and dictionaries from ${revision}`);
