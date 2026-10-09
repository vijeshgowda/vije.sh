import "server-only";
import fs from "node:fs";
import path from "node:path";
import type { Element, ElementContent, Root } from "hast";
import { imageSize } from "image-size";
import { visit } from "unist-util-visit";
import { SITE } from "@/config/site";
import { IMAGE_HOSTS } from "@/lib/security-headers";
import { assetUrl, isImageFile } from "./assets";

const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/**
 * Resolves an image path written relative to a post's index.md. Returns null for anything else.
 * Throws (failing the build) when the file is missing or outside the post folder.
 */
export function resolvePostAsset(
  slug: string,
  dir: string,
  src: string,
): { url: string; file: string } | null {
  const fail = (msg: string): never => {
    throw new Error(`content/blog/${slug}: ${src}: ${msg}`);
  };
  if (SCHEME.test(src) || src.startsWith("//")) return null;
  if (src.startsWith("/") || src.startsWith("#") || src.startsWith("?")) return null;
  const clean = decodeURI(src.replace(/[?#].*$/, ""));
  if (!isImageFile(clean)) return null;
  const file = path.resolve(dir, clean);
  const rel = path.relative(dir, file);
  if (rel.startsWith("..") || path.isAbsolute(rel)) fail("must sit inside the post folder");
  if (!fs.existsSync(file)) fail("file not found next to index.md");
  return { url: assetUrl(slug, rel), file };
}

function checkRemoteImage(slug: string, src: string) {
  if (!SCHEME.test(src) && !src.startsWith("//")) return;
  const ok = IMAGE_HOSTS.some((h) => src.startsWith(`${h}/`));
  if (!ok) {
    throw new Error(
      `content/blog/${slug}: ${src}: the CSP blocks images from other sites; put the file next to index.md`,
    );
  }
}

function setImage(node: Element, file: string) {
  const p = node.properties;
  if (p.width === undefined && p.height === undefined) {
    try {
      const { width, height } = imageSize(fs.readFileSync(file));
      if (width && height) Object.assign(p, { width, height });
    } catch {
      // unreadable dimensions: the image still loads, it just can't reserve its space
    }
  }
}

function isExternal(href: string): boolean {
  if (!/^https?:\/\//i.test(href)) return false;
  return new URL(href).origin !== new URL(SITE.url).origin;
}

/** A paragraph holding only a titled image becomes a figure with the title as its caption. */
function toFigure(node: Element): Element | null {
  const kids = node.children.filter((c) => !(c.type === "text" && !c.value.trim()));
  const img = kids[0];
  if (kids.length !== 1 || img.type !== "element" || img.tagName !== "img") return null;
  const title = img.properties.title;
  if (typeof title !== "string" || !title) return null;
  delete img.properties.title;
  const caption: ElementContent = {
    type: "element",
    tagName: "figcaption",
    properties: {},
    children: [{ type: "text", value: title }],
  };
  return { type: "element", tagName: "figure", properties: {}, children: [img, caption] };
}

/**
 * Rehype plugin for git posts: serves relative images from public/blog/<slug>/ with their
 * dimensions, lazy-loads them, captions titled images and marks external links (AGENTS.md).
 */
export function rehypePostAssets({ slug, dir }: { slug: string; dir: string }) {
  return (tree: Root) => {
    visit(tree, "element", (node) => {
      if (node.tagName === "img" && typeof node.properties.src === "string") {
        const src = node.properties.src;
        const asset = resolvePostAsset(slug, dir, src);
        if (asset) {
          node.properties.src = asset.url;
          setImage(node, asset.file);
        } else {
          checkRemoteImage(slug, src);
        }
        node.properties.loading ??= "lazy";
        node.properties.decoding ??= "async";
      }
      if (node.tagName === "a" && typeof node.properties.href === "string") {
        const href = node.properties.href;
        const asset = resolvePostAsset(slug, dir, href);
        if (asset) node.properties.href = asset.url;
        else if (isExternal(href)) {
          Object.assign(node.properties, {
            target: "_blank",
            rel: ["noopener", "noreferrer"],
            ariaDescribedBy: "newtab",
          });
        }
      }
    });
    visit(tree, "element", (node, index, parent) => {
      if (node.tagName !== "p" || !parent || index === undefined) return;
      const fig = toFigure(node);
      if (fig) parent.children[index] = fig;
    });
  };
}
