import { expect, test } from "@playwright/test";
import { login, sql } from "./helpers";
// Halaman Audit manajer: jejak perubahan berhalaman (25 per halaman), kembali ke halaman 1 saat ganti periode.
test("audit: jejak perubahan berhalaman", async ({ page }) => {
  // pastikan > 25 entri: 30 perubahan catatan pelanggan
  sql(`do $$ begin for i in 1..30 loop update customers set notes = 'uji halaman ' || i where id = (select id from customers order by name limit 1); end loop; end $$`);
  await login(page, "manager");
  await page.goto("/manajer/audit");
  const nav = page.getByRole("navigation", { name: "Halaman jejak perubahan" });
  await expect(nav).toContainText("Halaman 1 dari");
  await expect(nav.getByRole("button", { name: "‹ Lebih baru" })).toBeDisabled();
  const first = await page.locator("#log tbody").innerText();
  await nav.getByRole("button", { name: "Lebih lama ›" }).click();
  await expect(nav).toContainText("Halaman 2 dari");
  await expect(page.locator("#log tbody tr")).toHaveCount(25);
  await expect(page.locator("#log tbody")).not.toHaveText(first);
  await page.getByRole("radio", { name: "Hari ini" }).click();
  await expect(page.locator("#log")).not.toContainText("Halaman 2");
});
