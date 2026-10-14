import { expect, test } from "@playwright/test";
import { login, sql } from "./helpers";

// Aturan komisi: pilih "Harga normal" → tersimpan, rumus di layar ikut berubah; dikembalikan di akhir.
test("dasar komisi harga normal: tersimpan & rumus diperbarui", async ({ page }) => {
  const [orig] = sql<{ b: string }>(`select commission_basis as b from settings`);
  try {
    await login(page, "manager");
    await page.goto("/manajer/sdm?tab=aturan");
    await page.getByRole("radio", { name: /Harga normal/ }).click();
    await expect(page.getByText(/dari harga normal \(sebelum diskon & promo\) \(HPP bahan tidak dipotong\)/)).toBeVisible();
    await page.getByRole("button", { name: /Simpan/ }).first().click();
    await expect(page.getByText("Aturan komisi disimpan")).toBeVisible();
    expect(sql<{ b: string }>(`select commission_basis as b from settings`)[0].b).toBe("gross");
    await page.reload();
    await expect(page.getByRole("radio", { name: /Harga normal/ })).toHaveAttribute("aria-checked", "true");
  } finally {
    sql(`update settings set commission_basis = '${orig.b}'`);
  }
});

// Jaring harian per staf: isi → tersimpan (format rupiah); kosongkan → nonaktif.
test("jaring harian per staf: tersimpan & bisa dinonaktifkan", async ({ page }) => {
  const [s] = sql<{ id: string; name: string }>(`select id, name from staff where active order by sort limit 1`);
  try {
    await login(page, "manager");
    await page.goto("/manajer/sdm?tab=aturan");
    const input = page.getByLabel(`Jaring harian ${s.name}`);
    await input.fill("75000");
    await expect(input).toHaveValue("75.000");
    await page.getByRole("button", { name: /Simpan/ }).first().click();
    await expect(page.getByText("Aturan komisi disimpan")).toBeVisible();
    expect(sql<{ d: number }>(`select daily_min_pay as d from staff where id = '${s.id}'`)[0].d).toBe(75000);
    await page.reload();
    await input.fill("");
    await page.getByRole("button", { name: /Simpan/ }).first().click();
    await expect(page.getByText("Aturan komisi disimpan")).toBeVisible();
    expect(sql<{ d: number | null }>(`select daily_min_pay as d from staff where id = '${s.id}'`)[0].d).toBeNull();
  } finally {
    sql(`update staff set daily_min_pay = null where id = '${s.id}'`);
  }
});
