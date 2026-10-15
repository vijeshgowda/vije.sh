import { randomBytes } from "node:crypto";
import { createUser, deleteUser, expect, expectAccessible, test } from "./fixtures";
import { deleteNote, revalidateTags, seedNote } from "./notes";

// Runs in the "content" project, after every other spec: a published note changes the lists and
// AN numbers that blog.spec.ts checks.

const BODY = `Seeded by the feature test.

## Second heading

A [link out](https://example.com/page) and some \`code\`.

<script>window.__pwned = true</script>
<img src="x" onerror="window.__pwned = true">

\`\`\`ts
const answer = 42;
\`\`\`
`;

test("a published note joins /blog and renders at its URL through the sanitised pipeline", async ({
  page,
  request,
}) => {
  const owner = await createUser();
  const slug = `e2e-note-${randomBytes(4).toString("hex")}`;
  const tags = ["notes", `note:${slug}`];
  // dated far ahead so it is the newest entry everywhere
  const note = await seedNote({
    slug,
    title: "Seeded database note",
    summary: "A note that lives in Postgres.",
    tags: ["Testing"],
    bodyMd: BODY,
    authorId: owner.id,
    publishedAt: new Date("2099-01-02T12:00:00Z"),
  });
  try {
    await revalidateTags(request, tags);

    await page.goto("/");
    const latest = page.locator("#notes").getByRole("listitem");
    await expect(latest).toHaveCount(3);
    await expect(latest.first()).toContainText("Seeded database note");

    await page.goto("/blog");
    const row = page.locator("#index").getByRole("link", { name: /Seeded database note/ });
    await expect(row).toHaveAttribute("href", `/blog/${slug}`);
    await expect(row).toContainText("A note that lives in Postgres.");
    await expect(row).toContainText("Testing");
    await expect(row).toContainText("2 Jan 2099");
    const id = (await row.locator("span").first().textContent())!;
    expect(id).toMatch(/^AN-\d{3}$/);

    await row.click();
    await expect(page).toHaveURL(new RegExp(`/blog/${slug}$`));
    await expect(
      page.getByRole("heading", { level: 1, name: "Seeded database note" }),
    ).toBeVisible();
    await expect(page.getByText(`Application note ${id}`)).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Second heading" })).toHaveAttribute(
      "id",
      "user-content-second-heading",
    );
    await expect(page.getByRole("link", { name: "link out" })).toHaveAttribute(
      "rel",
      "nofollow ugc noopener",
    );
    const article = page.locator("article");
    await expect(article.locator("pre.shiki")).toContainText("const answer = 42;");
    await expect(article.locator("script, img, [onerror]")).toHaveCount(0);
    expect(await page.evaluate(() => "__pwned" in window)).toBe(false);
    await expect(page.getByRole("navigation", { name: "More notes" })).toContainText("Older");
    await expectAccessible(page);
  } finally {
    await deleteNote(note.id);
    await revalidateTags(request, tags);
    await deleteUser(owner.id);
  }

  expect((await page.goto(`/blog/${slug}`))?.status()).toBe(404);
  await page.goto("/blog");
  await expect(
    page.locator("#index").getByRole("link", { name: /Seeded database note/ }),
  ).toHaveCount(0);
});

test("unlisted notes render by URL only; drafts and private notes don't render", async ({
  page,
  request,
}) => {
  const owner = await createUser();
  const suffix = randomBytes(4).toString("hex");
  const notes = await Promise.all(
    (
      [
        ["unlisted", "unlisted", new Date()],
        ["private", "private", new Date()],
        ["draft", "public", null],
      ] as const
    ).map(([kind, visibility, publishedAt]) =>
      seedNote({
        slug: `e2e-${kind}-${suffix}`,
        title: `E2E ${kind} note`,
        bodyMd: "Body.",
        authorId: owner.id,
        visibility,
        publishedAt,
      }),
    ),
  );
  const tags = ["notes", ...notes.map((n) => `note:${n.slug}`)];
  try {
    await revalidateTags(request, tags);
    await page.goto(`/blog/${notes[0]!.slug}`);
    await expect(page.getByRole("heading", { level: 1, name: "E2E unlisted note" })).toBeVisible();
    await expect(page.locator("article").getByText("Unlisted note", { exact: true })).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    for (const n of notes.slice(1)) {
      expect((await page.goto(`/blog/${n.slug}`))?.status()).toBe(404);
    }
    await page.goto("/blog");
    await expect(page.locator("#index")).not.toContainText("E2E");
  } finally {
    for (const n of notes) await deleteNote(n.id);
    await revalidateTags(request, tags);
    await deleteUser(owner.id);
  }
});

const DIAGRAMS = `Two diagrams.

\`\`\`mermaid
flowchart LR
  accTitle: Request path
  accDescr: Browser to proxy to page
  A[Browser] --> B["Proxy <script>window.__pwned = true</script>"] --> C[Page]
\`\`\`

\`\`\`mermaid
this is not a diagram
\`\`\`
`;

test("mermaid blocks in a note render as SVG diagrams under the production CSP", async ({
  page,
  request,
}) => {
  await page.addInitScript(() => {
    const seen: string[] = [];
    Object.assign(window, { __csp: seen });
    document.addEventListener("securitypolicyviolation", (e) => seen.push(e.violatedDirective));
  });
  const owner = await createUser();
  const slug = `e2e-mermaid-${randomBytes(4).toString("hex")}`;
  const tags = ["notes", `note:${slug}`];
  // unlisted: reachable by URL, so it doesn't change the lists other specs count
  const note = await seedNote({
    slug,
    title: "Diagram note",
    bodyMd: DIAGRAMS,
    authorId: owner.id,
    visibility: "unlisted",
  });
  try {
    await revalidateTags(request, tags);
    await page.goto(`/blog/${slug}`);
    const article = page.locator("article");

    const diagram = article.getByRole("img", {
      name: "Request path. Browser to proxy to page",
    });
    // the first diagram on a page waits for the Mermaid chunk
    await expect(diagram.locator("svg")).toBeVisible({ timeout: 15_000 });
    await expect(diagram).toContainText("Browser");
    await expect(article.getByText("Diagram failed to render; showing its source.")).toBeVisible();
    await expect(article.locator("pre code")).toHaveText("this is not a diagram");

    await expect(article.locator("script, [onerror]")).toHaveCount(0);
    expect(await page.evaluate(() => "__pwned" in window)).toBe(false);
    expect(await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp)).toEqual([]);
    await expectAccessible(page);

    const svg = await diagram.locator("svg").innerHTML();
    await page.getByRole("button", { name: "Dark" }).first().click();
    await expect.poll(() => diagram.locator("svg").innerHTML(), { timeout: 15_000 }).not.toBe(svg);
    await expect(diagram.locator("svg")).toBeVisible();
  } finally {
    await deleteNote(note.id);
    await revalidateTags(request, tags);
    await deleteUser(owner.id);
  }
});
