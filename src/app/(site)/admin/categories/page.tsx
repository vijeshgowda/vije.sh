import type { Metadata } from "next";
import { PageIntro } from "@/components/ui/Datasheet";
import styles from "@/components/ui/Datasheet.module.css";
import { CategoryCreateForm } from "@/features/admin/categories/components/CategoryCreateForm";
import { CategoryTable } from "@/features/admin/categories/components/CategoryTable";
import categoryStyles from "@/features/admin/categories/components/Categories.module.css";
import { listCategoriesForAdmin } from "@/features/admin/categories/queries";
import { requireAdminSection } from "@/features/admin/guard";

// waits for the session check like the layout (see layout.tsx)
export const instant = false;

export const metadata: Metadata = { title: "Categories" };

export default async function AdminCategoriesPage() {
  await requireAdminSection("categories");
  const categories = await listCategoriesForAdmin();
  const staffOnly = categories.filter((c) => c.staffOnly).length;
  return (
    <>
      <PageIntro kicker="Admin" title="Categories">
        Forum categories in display order. A slug is the category&apos;s URL, so it never changes;
        only empty categories can be deleted.
      </PageIntro>
      <section className={styles.sec} aria-label="All categories">
        <div className={categoryStyles.bar}>
          <span className={categoryStyles.count}>
            {categories.length} {categories.length === 1 ? "category" : "categories"}, {staffOnly}{" "}
            staff only
          </span>
        </div>
        <CategoryTable categories={categories} />
      </section>
      <section className={styles.sec} aria-labelledby="new-category-h">
        <h2 id="new-category-h" className={categoryStyles.heading}>
          New category
        </h2>
        <CategoryCreateForm />
      </section>
    </>
  );
}
