import fs from "node:fs";
import path from "node:path";

/**
 * Images in git posts (application.md 9.3) sit next to index.md, so they preview on GitHub and in
 * editors. Before dev and build they're copied to public/blog/<slug>/ and served as static files.
 * No "server-only" here: scripts/copy-blog-assets.ts runs this outside Next.js.
 */

export const IMAGE_EXTENSIONS = [".avif", ".gif", ".jpeg", ".jpg", ".png", ".svg", ".webp"];

export const PUBLIC_BLOG_DIR = path.join(process.cwd(), "public", "blog");

export function isImageFile(file: string): boolean {
  return IMAGE_EXTENSIONS.includes(path.extname(file).toLowerCase());
}

/** Public URL of a file inside a post folder: ("a-post", "img/ship 1.webp") -> /blog/a-post/img/ship%201.webp */
export function assetUrl(slug: string, rel: string): string {
  return `/blog/${slug}/${rel.split(/[\\/]/).map(encodeURIComponent).join("/")}`;
}

/** Replaces outDir with a copy of every image under each post folder in contentDir. Returns the count. */
export function copyPostAssets(contentDir: string, outDir: string): number {
  fs.rmSync(outDir, { recursive: true, force: true });
  if (!fs.existsSync(contentDir)) return 0;
  let copied = 0;
  for (const entry of fs.readdirSync(contentDir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !isImageFile(entry.name)) continue;
    const from = path.join(entry.parentPath, entry.name);
    const to = path.join(outDir, path.relative(contentDir, from));
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
    copied++;
  }
  return copied;
}
