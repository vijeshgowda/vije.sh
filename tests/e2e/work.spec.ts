import { expect, test } from "./fixtures";

test("rack units pull out and the career table lights the timing diagram", async ({ page }) => {
  await page.goto("/work");
  const unit = page.getByRole("button", { name: /GKE/ });
  await expect(unit).toHaveAttribute("aria-expanded", "false");
  await unit.click();
  await expect(unit).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText(/Istio\/Envoy mesh/)).toBeVisible();
  await unit.click();
  await expect(unit).toHaveAttribute("aria-expanded", "false");

  const wave = page.locator('[data-signal="1"] path');
  const stroke = () => wave.evaluate((el) => getComputedStyle(el).stroke);
  const idle = await stroke();
  await page.getByRole("row", { name: /Harbor Labs/ }).focus();
  await expect.poll(stroke).toBe("rgb(227, 6, 19)");
  await page.getByRole("row", { name: /Harbor Labs/ }).blur();
  await expect.poll(stroke).toBe(idle);
});
