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

/** The site's first four posts. Later posts come and go without touching this test. */
const DEFAULT_POSTS = [
  "0001-saltbound-combat",
  "0002-quality-per-gb",
  "0003-enforcing-access-in-two-places",
  "0004-planning-this-site",
];

describe("git slug manifest", () => {
  it("covers the default posts, in generated form (run `npm run blog:assets` and commit it)", () => {
    const slugs = DEFAULT_POSTS.map((folder) => folder.slice("0000-".length));
    expect(readGitSlugs(CONTENT_DIR)).toEqual(expect.arrayContaining(slugs));
    expect(manifest.slugs).toEqual(expect.arrayContaining(slugs));
    expect(manifest.slugs).toEqual([...manifest.slugs].sort());
    expect(fs.readFileSync(GIT_SLUGS_FILE, "utf8")).toBe(manifestText(manifest.slugs));
  });

  it("lists slugs without the publish number, sorted, and nothing for a missing directory", () => {
    fs.mkdirSync(path.join(SCRATCH, "content", "0001-b-post"), { recursive: true });
    fs.mkdirSync(path.join(SCRATCH, "content", "0002-a-post"));
    fs.writeFileSync(path.join(SCRATCH, "content", "README.txt"), "not a post");
    expect(readGitSlugs(path.join(SCRATCH, "content"))).toEqual(["a-post", "b-post"]);
    expect(readGitSlugs(path.join(SCRATCH, "missing"))).toEqual([]);
  });

  it("writes the manifest only when the slugs changed", () => {
    const content = path.join(SCRATCH, "content");
    const file = path.join(SCRATCH, "git-slugs.json");
    fs.mkdirSync(path.join(content, "0001-first"), { recursive: true });
    expect(writeGitSlugManifest(content, file)).toBe(true);
    expect(JSON.parse(fs.readFileSync(file, "utf8")).slugs).toEqual(["first"]);
    expect(writeGitSlugManifest(content, file)).toBe(false);
    fs.mkdirSync(path.join(content, "0002-second"));
    expect(writeGitSlugManifest(content, file)).toBe(true);
    expect(JSON.parse(fs.readFileSync(file, "utf8")).slugs).toEqual(["first", "second"]);
  });
});
