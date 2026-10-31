export type PreviewKind = "image" | "video";
const PREVIEWS = new Map<string, PreviewKind>([
  ["image/png", "image"],
  ["image/jpeg", "image"],
  ["image/gif", "image"],
  ["image/webp", "image"],
  ["video/mp4", "video"],
  ["video/webm", "video"],
]);

export function previewKind(mimeType: string): PreviewKind | null {
  return PREVIEWS.get(mimeType) ?? null;
}

export function sanitiseFileName(name: string): string {
  const basename = name.split(/[/\\]/).pop() ?? "";
  // Peer-controlled names must not carry paths, control characters, or bidi overrides.
  const clean = Array.from(basename, (char) => {
    const code = char.codePointAt(0)!;
    return code < 32 ||
      code === 127 ||
      (code >= 0x202a && code <= 0x202e) ||
      (code >= 0x2066 && code <= 0x2069) ||
      /[<>:"|?*]/.test(char)
      ? "_"
      : char;
  })
    .join("")
    .replace(/^[. ]+|[. ]+$/g, "")
    .slice(0, 200);
  if (!clean || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(clean)) {
    return "download";
  }
  return clean;
}

export function receivedFile(parts: BlobPart[], name: string, mimeType: string) {
  return {
    blob: new Blob(parts, { type: "application/octet-stream" }),
    name: sanitiseFileName(name),
    preview: previewKind(mimeType),
  };
}
