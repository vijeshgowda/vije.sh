import { expect, test } from "./fixtures";

test("the overview lists the three latest application notes, newest first", async ({ page }) => {
  await page.goto("/");
  const notes = page.locator("#notes");
  await expect(notes.getByRole("heading", { name: /Latest application notes/ })).toBeVisible();
  const items = notes.getByRole("listitem");
  await expect(items).toHaveCount(3);
  await expect(items.first().getByRole("link")).toHaveAttribute("href", "/blog/planning-this-site");
  await expect(items.first()).toContainText("AN-004");
  await expect(items.nth(2)).toContainText("Quality per GB");

  await notes.getByRole("link", { name: /All notes/ }).click();
  await expect(page).toHaveURL(/\/blog$/);
});
