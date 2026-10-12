import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageIntro, RunFoot, RunHead, Section } from "@/components/ui/Datasheet";
import { ForumBar } from "@/features/forum/components/ForumBar";
import { ThreadList } from "@/features/forum/components/ThreadList";
import { categoryHref, isCategorySlug } from "@/features/forum/format";
import {
  databaseReady,
  getCategory,
  listCategories,
  listCategoryThreads,
} from "@/features/forum/queries";

// Not a valid slug, so it can never match a category.
const NO_CATEGORIES = "__none__";

// Unknown categories wait for the full render instead of streaming the fallback shell, so they get a real 404.
export const ensureStatic = "navigation";

export async function generateStaticParams() {
  // without a database at build time, every category renders on its first request instead
  const categories = (await databaseReady()) ? await listCategories() : [];
  const params = categories.map((c) => ({ category: c.slug }));
  // Cache Components needs at least one param; the placeholder renders the 404 page.
  return params.length > 0 ? params : [{ category: NO_CATEGORIES }];
}

async function load(slug: string) {
  return isCategorySlug(slug) ? getCategory(slug) : null;
}

export async function generateMetadata({
  params,
}: PageProps<"/forum/[category]">): Promise<Metadata> {
  const category = await load((await params).category);
  if (!category) return {};
  return {
    title: `${category.name} · Forum`,
    description: category.description ?? `Threads in ${category.name}.`,
    alternates: { canonical: categoryHref(category.slug) },
  };
}

export default async function CategoryPage({ params }: PageProps<"/forum/[category]">) {
  const category = await load((await params).category);
  if (!category) notFound();
  const [categories, threads] = await Promise.all([
    listCategories(),
    listCategoryThreads(category.slug),
  ]);
  return (
    <>
      <RunHead label="Community bus" />
      <PageIntro kicker="Section 11 · Forum" title={category.name}>
        {category.description}
      </PageIntro>
      <Section id="threads" no={11} title="Threads" note={`${threads.length} on the bus`}>
        <ForumBar categories={categories} current={category.slug} />
        <ThreadList threads={threads} empty={`No threads in ${category.name} yet.`} />
      </Section>
      <RunFoot page={6} />
    </>
  );
}
