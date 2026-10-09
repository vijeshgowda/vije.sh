/**
 * Copies images that sit next to git posts (content/blog/<slug>/) to public/blog/<slug>/.
 * Runs before `npm run dev` and `npm run build`; public/blog is generated and gitignored.
 */
import path from "node:path";
import { copyPostAssets, PUBLIC_BLOG_DIR } from "../src/features/blog/assets";

const count = copyPostAssets(path.join(process.cwd(), "content", "blog"), PUBLIC_BLOG_DIR);
console.log(`blog: copied ${count} image${count === 1 ? "" : "s"} to public/blog`);
