import { expect, test } from "@playwright/test";

// Gulir halus hanya di halaman utama; bagian tujuan tidak tertutup header sticky.
test("smooth scroll di halaman utama", async ({ page }) => {
  await page.goto("/");
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe("smooth");
  await page.locator('main a[href="#menu"]').first().click(); // tautan di hero (nav header tersembunyi di HP)
  await expect.poll(() => page.evaluate(() => Math.round(document.getElementById("menu")!.getBoundingClientRect().top))).toBe(76);
  await page.goto("/login");
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe("auto");
});
