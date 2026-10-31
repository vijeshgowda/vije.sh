import { describe, expect, it } from "vitest";
import { previewKind, receivedFile, sanitiseFileName } from "./files";

describe("received file safety", () => {
  it.each(["image/png", "image/jpeg", "image/gif", "image/webp"])(
    "previews only allowed image %s",
    (mime) => {
      expect(previewKind(mime)).toBe("image");
    },
  );
  it.each(["video/mp4", "video/webm"])("previews only allowed video %s", (mime) => {
    expect(previewKind(mime)).toBe("video");
  });
  it.each([
    "image/svg+xml",
    "text/html",
    "application/xhtml+xml",
    "",
    "IMAGE/PNG",
    "image/png; charset=utf8",
  ])("does not preview %s", (mime) => expect(previewKind(mime)).toBeNull());
  it.each([
    ["../../photo.png", "photo.png"],
    ["C:\\folder\\video.webm", "video.webm"],
    ["\0bad:<name>?.txt", "_bad__name__.txt"],
    ["... ", "download"],
    ["CON.txt", "download"],
    ["lpt1", "download"],
    ["", "download"],
    ["file\u202ecod.exe", "file_cod.exe"],
    ["a\u2066b.txt", "a_b.txt"],
    ["ಕನ್ನಡ.png", "ಕನ್ನಡ.png"],
  ])("sanitises '%s' as '%s'", (input, expected) => {
    expect(sanitiseFileName(input)).toBe(expected);
  });
  it("always constructs inert octet-stream blobs, even for an allowed preview", async () => {
    for (const type of ["text/html", "image/svg+xml", "image/png"]) {
      const file = receivedFile(["<script>malicious()</script>"], "../../peer.html", type);
      expect(file.blob.type).toBe("application/octet-stream");
      expect(file.name).toBe("peer.html");
      expect(await file.blob.text()).toBe("<script>malicious()</script>");
    }
    expect(sanitiseFileName("a".repeat(400)).length).toBe(200);
  });
});
