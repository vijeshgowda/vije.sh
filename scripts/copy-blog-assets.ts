/**
 * Copies images that sit next to git posts (content/blog/<slug>/) to public/blog/<slug>/ and
 * refreshes the git slug manifest that keeps database notes off git post slugs.
 * Runs before `npm run dev` and `npm run build`; public/blog is generated and gitignored, the
 * manifest is committed (src/features/blog/notes/git-slugs.ts explains why).
 */
import path from "node:path";
import { copyPostAssets, PUBLIC_BLOG_DIR } from "../src/features/blog/assets";
import { GIT_SLUGS_FILE, writeGitSlugManifest } from "../src/features/blog/notes/git-slugs";

const contentDir = path.join(process.cwd(), "content", "blog");
const count = copyPostAssets(contentDir, PUBLIC_BLOG_DIR);
console.log(`blog: copied ${count} image${count === 1 ? "" : "s"} to public/blog`);
if (writeGitSlugManifest(contentDir)) {
  console.log(`blog: updated ${path.relative(process.cwd(), GIT_SLUGS_FILE)}; commit it`);
}
