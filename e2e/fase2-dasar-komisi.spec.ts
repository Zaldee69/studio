import { expect, test } from "@playwright/test";
import { login, sql } from "./helpers";

// Aturan komisi: pilih "Harga normal" → tersimpan, rumus di layar ikut berubah; dikembalikan di akhir.
test("dasar komisi harga normal: tersimpan & rumus diperbarui", async ({ page }) => {
  const [orig] = sql<{ b: string }>(`select commission_basis as b from settings`);
  try {
    await login(page, "manager");
    await page.goto("/manajer/sdm?tab=aturan");
    await page.getByRole("radio", { name: /Harga normal/ }).click();
    await expect(page.getByText(/dari harga normal \(sebelum diskon & promo\) dikurangi HPP/)).toBeVisible();
    await page.getByRole("button", { name: /Simpan/ }).first().click();
    await expect(page.getByText("Aturan komisi disimpan")).toBeVisible();
    expect(sql<{ b: string }>(`select commission_basis as b from settings`)[0].b).toBe("gross");
    await page.reload();
    await expect(page.getByRole("radio", { name: /Harga normal/ })).toHaveAttribute("aria-checked", "true");
  } finally {
    sql(`update settings set commission_basis = '${orig.b}'`);
  }
});
