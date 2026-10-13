import { randomBytes } from "node:crypto";
import type { Page } from "@playwright/test";
import { ensureOwner, expect, expectAccessible, test } from "./fixtures";
import { deleteNote, deleteNoteBySlug, seedNote } from "./notes";

// Runs in the "content" project (after every other spec): publishing changes the blog lists that
// blog.spec.ts counts.

const editor = (page: Page) => page.getByRole("form", { name: /note/i });
// Next keeps recently visited pages in the DOM (hidden), so text lookups are scoped to the editor
const editorRegion = (page: Page) => page.getByRole("region", { name: "Editor" });
// a Server Action answers with the re-rendered page, which takes a while on a busy machine
const ACTION = { timeout: 15_000 };

async function expectBusFault(page: Page, path: string) {
  await page.goto(path);
  await expect(page.getByRole("heading", { level: 1, name: "Bus fault" }), path).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Admin sections" })).toHaveCount(0);
}

test("the owner writes, previews, publishes, unpublishes and deletes a note", async ({
  page,
  asOwner,
}) => {
  expect(asOwner.handle).toBeTruthy();
  // a long flow of Server Actions, each re-rendering the editor
  test.slow();
  await page.emulateMedia({ reducedMotion: "reduce" });
  const suffix = randomBytes(4).toString("hex");
  const title = `Editor note ${suffix}`;
  const slug = `editor-note-${suffix}`;
  try {
    await page.goto("/admin/notes");
    await page.getByRole("link", { name: "New note" }).click();
    await expect(page).toHaveURL(/\/admin\/notes\/new$/);
    await expect(page.getByRole("heading", { level: 1, name: "New note" })).toBeVisible();
    await expectAccessible(page);

    const form = editor(page);
    await form.getByLabel("Title").fill(title);
    await expect(form.getByLabel("Slug")).toHaveValue(slug);
    await form.getByLabel("Summary").fill("Written in the admin editor.");
    await form.getByLabel("Tags").fill("Testing, e2e");
    await form
      .getByLabel("Body (Markdown)")
      .fill(
        "Intro paragraph.\n\n## Editor heading\n\n<script>window.__pwned = true</script>\n\n[out](https://example.com)",
      );

    // a git post's slug is refused, and what was typed stays
    await form.getByLabel("Slug").fill("planning-this-site");
    await form.getByRole("button", { name: "Create draft" }).click();
    await expect(form.getByText("Slug is already used by a post in content/blog.")).toBeVisible(
      ACTION,
    );
    await expect(form.getByLabel("Slug")).toHaveAttribute("aria-invalid", "true");
    await expect(form.getByLabel("Title")).toHaveValue(title);
    await form.getByLabel("Slug").fill(slug);

    // requested preview: rendered on the server through the sanitised pipeline
    await form.getByRole("button", { name: "Preview" }).click();
    const preview = page.getByTestId("note-preview");
    await expect(
      preview.getByRole("heading", { level: 2, name: "Editor heading" }),
    ).toHaveAttribute("id", "user-content-editor-heading", ACTION);
    await expect(preview.getByRole("link", { name: "out" })).toHaveAttribute(
      "rel",
      "nofollow ugc noopener",
    );
    await expect(preview.locator("script")).toHaveCount(0);
    expect(await page.evaluate(() => "__pwned" in window)).toBe(false);

    await form.getByRole("button", { name: "Create draft" }).click();
    await expect(page).toHaveURL(/\/admin\/notes\/\d+$/, ACTION);
    const editUrl = page.url();
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(editorRegion(page).getByText("Draft", { exact: true })).toBeVisible();
    // the stored body is rendered by the page itself
    await expect(preview.getByRole("heading", { name: "Editor heading" })).toBeVisible();
    await expectAccessible(page);

    // a draft is not public
    expect((await page.goto(`/blog/${slug}`))?.status()).toBe(404);

    await page.goto(editUrl);
    await page.getByRole("button", { name: "Publish" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Published." })).toBeVisible(ACTION);
    await expect(editorRegion(page).getByText("Published", { exact: true })).toBeVisible();

    await page.goto("/blog");
    const row = page.locator("#index").getByRole("link", { name: new RegExp(title) });
    await expect(row).toHaveAttribute("href", `/blog/${slug}`);
    await expect(row).toContainText("Written in the admin editor.");
    await row.click();
    await expect(page).toHaveURL(new RegExp(`/blog/${slug}$`));
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Editor heading" })).toBeVisible();

    // an edit to a published note shows up straight away
    await page.goto(editUrl);
    await editor(page).getByLabel("Summary").fill("Edited after publishing.");
    await editor(page).getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Saved." })).toBeVisible(ACTION);
    await page.goto("/blog");
    await expect(
      page.locator("#index").getByRole("link", { name: new RegExp(title) }),
    ).toContainText("Edited after publishing.");
    // /blog prefetches the note's page; a render that is still running when the note is
    // unpublished would store the published page again (a race in Next's route cache), so let
    // it finish first
    await page.waitForLoadState("networkidle");

    await page.goto(editUrl);
    await page.getByRole("button", { name: "Unpublish" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Moved back to drafts." })).toBeVisible(
      ACTION,
    );
    // the tags expire as the action ends, which can land a moment after its answer
    await expect
      .poll(async () => (await page.request.get(`/blog/${slug}`)).status(), ACTION)
      .toBe(404);
    await expect(async () => {
      await page.goto("/blog");
      await expect(
        page.locator("#index").getByRole("link", { name: new RegExp(title) }),
      ).toHaveCount(0);
    }).toPass(ACTION);

    // delete asks first
    await page.goto(editUrl);
    await page.getByRole("button", { name: "Delete" }).click();
    const dialog = page.getByRole("dialog", { name: "Delete this note?" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    await page.getByRole("button", { name: "Delete" }).click();
    await dialog.getByRole("button", { name: "Delete note" }).click();
    await expect(page).toHaveURL(/\/admin\/notes$/, ACTION);
    await expect(page.getByRole("link", { name: title })).toHaveCount(0);
    await expectBusFault(page, new URL(editUrl).pathname);
  } finally {
    await deleteNoteBySlug(slug);
  }
});

test("superusers can't open the note pages", async ({ page, asSuperuser }) => {
  expect(asSuperuser.handle).toBeTruthy();
  const owner = await ensureOwner();
  const note = await seedNote({
    slug: `e2e-hidden-${randomBytes(4).toString("hex")}`,
    title: "Not for superusers",
    bodyMd: "Body.",
    authorId: owner.id,
    publishedAt: null,
  });
  try {
    for (const path of ["/admin/notes", "/admin/notes/new", `/admin/notes/${note.id}`]) {
      await expectBusFault(page, path);
    }
  } finally {
    await deleteNote(note.id);
  }
});
