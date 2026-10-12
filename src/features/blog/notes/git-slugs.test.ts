import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CONTENT_DIR } from "../posts";
import { GIT_SLUGS_FILE, manifestText, readGitSlugs, writeGitSlugManifest } from "./git-slugs";
import manifest from "./git-slugs.json";

// Scratch space inside the project (node_modules/.cache is ignored), not the system temp dir.
const SCRATCH = path.join(process.cwd(), "node_modules", ".cache", "vitest-git-slugs");

afterEach(() => {
  fs.rmSync(SCRATCH, { recursive: true, force: true });
});

describe("git slug manifest", () => {
  it("is up to date with content/blog (run `npm run blog:assets` and commit it)", () => {
    expect(manifest.slugs).toEqual(readGitSlugs(CONTENT_DIR));
    expect(fs.readFileSync(GIT_SLUGS_FILE, "utf8")).toBe(manifestText(manifest.slugs));
  });

  it("lists post folders only, sorted, and nothing for a missing directory", () => {
    fs.mkdirSync(path.join(SCRATCH, "content", "b-post"), { recursive: true });
    fs.mkdirSync(path.join(SCRATCH, "content", "a-post"));
    fs.writeFileSync(path.join(SCRATCH, "content", "README.txt"), "not a post");
    expect(readGitSlugs(path.join(SCRATCH, "content"))).toEqual(["a-post", "b-post"]);
    expect(readGitSlugs(path.join(SCRATCH, "missing"))).toEqual([]);
  });

  it("writes the manifest only when the slugs changed", () => {
    const content = path.join(SCRATCH, "content");
    const file = path.join(SCRATCH, "git-slugs.json");
    fs.mkdirSync(path.join(content, "first"), { recursive: true });
    expect(writeGitSlugManifest(content, file)).toBe(true);
    expect(JSON.parse(fs.readFileSync(file, "utf8")).slugs).toEqual(["first"]);
    expect(writeGitSlugManifest(content, file)).toBe(false);
    fs.mkdirSync(path.join(content, "second"));
    expect(writeGitSlugManifest(content, file)).toBe(true);
    expect(JSON.parse(fs.readFileSync(file, "utf8")).slugs).toEqual(["first", "second"]);
  });
});
