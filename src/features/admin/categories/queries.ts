import "server-only";
import { query } from "@/lib/db";

/** A category as the owner manages it in /admin/categories (uncached: admin pages are dynamic). */
export interface AdminCategory {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  staffOnly: boolean;
  /** every thread, hidden ones included: a category with any thread can't be deleted */
  threadCount: number;
  /** category moderator grants, which go with the category when it is deleted */
  moderatorCount: number;
}

/** Every category in forum order (position, then name, then id for ties). */
export async function listCategoriesForAdmin(): Promise<AdminCategory[]> {
  const { rows } = await query<AdminCategory>(
    `select c.id::text as id, c.slug, c.name, c.description, c.staff_only as "staffOnly",
            (select count(*)::int from app.threads t where t.category_id = c.id) as "threadCount",
            (select count(*)::int from app.user_roles r where r.category_id = c.id)
              as "moderatorCount"
       from app.categories c
      order by c.position, c.name, c.id`,
  );
  return rows;
}
