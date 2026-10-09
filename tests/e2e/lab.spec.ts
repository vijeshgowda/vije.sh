import { expect, test } from "./fixtures";

test("lab sizes a model and remembers the choice", async ({ page }) => {
  await page.goto("/lab");
  const gb = page.getByTestId("lab-gb");
  await expect(gb).toHaveText("5.3");

  await page
    .getByRole("group", { name: "Bits per weight" })
    .getByRole("button", { name: "4" })
    .click();
  await expect(gb).toHaveText("14");
  await expect(page.getByText("Standard 16-bit would be 54 GB, about 4.0× larger.")).toBeVisible();

  await page.getByRole("slider", { name: /Parameters/ }).fill("70");
  await expect(gb).toHaveText("35");
  await expect(page.getByRole("listitem").filter({ hasText: "64 GB workstation" })).toContainText(
    ": fits",
  );
  await expect(page.getByRole("listitem").filter({ hasText: "32 GB GPU" })).toContainText(
    ": too small",
  );

  await page.reload();
  await expect(gb).toHaveText("35");
  await expect(page.getByRole("button", { name: "4", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});
