import type { Route } from "next";

export const SITE = {
  name: "vije.sh",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://vije.sh",
  part: "VKG-04",
  rev: "Rev 30.1",
  title: "VKG-04 · Personal Systems Processor",
  description:
    "Vijesh: software engineer building distributed backend systems, security and developer tooling, with small, efficient AI models on the side.",
  /** localStorage key prefix; every key in the app starts with this */
  storagePrefix: "vj:",
} as const;

export interface SitePage {
  /** Route path without the leading slash ("" for the overview). */
  segment: string;
  href: Route;
  code: string;
  label: string;
  /** One line shown in the compact menu */
  description: string;
  /** Load the document to apply route-specific response policies. */
  document?: true;
}

/** The seven datasheet pages. Order defines the footer site map and the P1..P7 codes. */
export const PAGES: readonly SitePage[] = [
  {
    segment: "",
    href: "/",
    code: "P1",
    label: "Overview",
    description: "The datasheet: features, cluster, live telemetry",
  },
  {
    segment: "work",
    href: "/work",
    code: "P2",
    label: "Work",
    description: "Deployments, the rack and career timing",
  },
  {
    segment: "lab",
    href: "/lab",
    code: "P3",
    label: "Lab",
    description: "How much memory a model needs",
  },
  {
    segment: "photo",
    href: "/photo",
    code: "P4",
    label: "Photo",
    description: "Rockets, roads, racks and one dog",
  },
  {
    segment: "blog",
    href: "/blog",
    code: "P5",
    label: "Blog",
    description: "Application notes, newest first",
  },
  {
    segment: "forum",
    href: "/forum",
    code: "P6",
    label: "Forum",
    description: "The community bus",
  },
  {
    segment: "live",
    href: "/live",
    code: "P7",
    label: "Live",
    description: "Public data feeds: space, Earth, dev, AI",
  },
];

/** The header also links to Omni, which is not a datasheet page. */
export const NAV_PAGES: readonly SitePage[] = [
  ...PAGES,
  {
    segment: "lab/omni",
    href: "/lab/omni",
    code: "P8",
    label: "Omni",
    description: "Encrypted calls, chat and file transfer",
    document: true,
  },
];

export function pageByPathname(pathname: string): SitePage | undefined {
  let current: SitePage | undefined;
  for (const page of NAV_PAGES) {
    if (
      (pathname === page.href || (page.href !== "/" && pathname.startsWith(`${page.href}/`))) &&
      (!current || page.href.length > current.href.length)
    ) {
      current = page;
    }
  }
  return current;
}
