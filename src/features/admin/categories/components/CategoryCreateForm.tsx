"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/Button";
import { createCategoryAction, type CategoryField, type CategoryFormState } from "../actions";
import { CATEGORY_LIMITS, suggestCategorySlug } from "../schemas";
import styles from "./Categories.module.css";

const EMPTY = { name: "", slug: "", description: "", staffOnly: false, slugEdited: false };

/**
 * Adds a category at the end of the forum order. The slug follows the name until it is edited;
 * it can't change later, because it is the category's URL.
 */
export function CategoryCreateForm() {
  const [fields, setFields] = useState(EMPTY);
  const [state, create, pending] = useActionState<CategoryFormState, FormData>(
    async (prev, formData) => {
      const result = await createCategoryAction(prev, formData);
      if (!result.error) setFields(EMPTY);
      return result;
    },
    {},
  );

  const invalid = (f: CategoryField) => (state.field === f ? true : undefined);
  const described = (f: CategoryField, hint?: string) =>
    [hint, state.field === f ? "category-error" : undefined].filter(Boolean).join(" ") || undefined;

  return (
    <form action={create} className={styles.form} aria-label="New category">
      <div className={styles.grid}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="category-name">
            Name
          </label>
          <input
            id="category-name"
            name="name"
            className={styles.input}
            value={fields.name}
            onChange={(e) => {
              const name = e.target.value;
              setFields((f) => ({
                ...f,
                name,
                slug: f.slugEdited ? f.slug : suggestCategorySlug(name),
              }));
            }}
            required
            maxLength={CATEGORY_LIMITS.name}
            aria-invalid={invalid("name")}
            aria-describedby={described("name")}
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="category-slug">
            Slug
          </label>
          <input
            id="category-slug"
            name="slug"
            className={`${styles.input} ${styles.n}`}
            value={fields.slug}
            onChange={(e) => {
              const slug = e.target.value;
              setFields((f) => ({ ...f, slug, slugEdited: true }));
            }}
            required
            maxLength={CATEGORY_LIMITS.slug}
            spellCheck={false}
            autoCapitalize="none"
            aria-invalid={invalid("slug")}
            aria-describedby={described("slug", "category-slug-hint")}
          />
          <p id="category-slug-hint" className={styles.hint}>
            The URL is /forum/{fields.slug || "\u2026"}; it can&apos;t be changed later.
          </p>
        </div>
      </div>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="category-description">
          Description
        </label>
        <input
          id="category-description"
          name="description"
          className={styles.input}
          value={fields.description}
          onChange={(e) => {
            const description = e.target.value;
            setFields((f) => ({ ...f, description }));
          }}
          maxLength={CATEGORY_LIMITS.description}
          aria-invalid={invalid("description")}
          aria-describedby={described("description", "category-description-hint")}
        />
        <p id="category-description-hint" className={styles.hint}>
          Optional. Shown at the top of the category page.
        </p>
      </div>
      <label className={styles.check}>
        <input
          type="checkbox"
          name="staffOnly"
          checked={fields.staffOnly}
          onChange={(e) => {
            const staffOnly = e.target.checked;
            setFields((f) => ({ ...f, staffOnly }));
          }}
        />
        Staff only: everyone reads it, only staff start threads
      </label>
      <div id="category-error" aria-live="polite">
        {state.error && <p className={styles.error}>{state.error}</p>}
      </div>
      <div className={styles.row}>
        <Button type="submit" variant="red" size="sm" disabled={pending}>
          {pending ? "Creating\u2026" : "Create category"}
        </Button>
        <span className={styles.ok} role="status">
          {!pending && state.message}
        </span>
      </div>
    </form>
  );
}
