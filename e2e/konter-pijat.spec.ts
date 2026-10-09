import { expect, test } from "@playwright/test";
import { login, sql, uniq } from "./helpers";

// Pijat: kategori ketiga yang hanya lewat kasir — terapis sendiri, 2 bed, tidak tampil di booking online.
test("pijat: kasir mencatat pijat atas nama terapis; bed tampil di jadwal; tidak ada di booking online", async ({ page }) => {
  const terapis = `Terapis ${uniq()}`;
  sql(`insert into staff (name, category) values ('${terapis}', 'massage')`);
  try {
    await login(page, "cashier");
    await page.getByRole("tab", { name: "Pijat" }).click();
    await page.getByRole("button", { name: /Tambah Pijat Fullbody \+ Kop/ }).click();
    const pick = page.getByLabel("Terapis pijat untuk Pijat Fullbody + Kop");
    await expect(pick.getByRole("option", { name: "Andi" })).toHaveCount(0); // kapster barbershop tidak bisa dipilih
    await pick.selectOption({ label: terapis });
    await expect(page.getByText(/untuk diskon paket/)).toHaveCount(0);      // pijat tidak ikut diskon paket gabungan
    await page.getByRole("button", { name: /Catat pembayaran/ }).click();
    await expect(page.getByRole("heading", { name: "Pembayaran tercatat" })).toBeVisible();
    const [it] = sql<{ category: string; price: number }>(`select ti.category, ti.price from transaction_items ti join staff s on s.id = ti.staff_id where s.name = '${terapis}'`);
    expect(it).toEqual({ category: "massage", price: 100000 });

    await page.goto("/kasir/jadwal");
    await expect(page.getByText("Bed Pijat 1", { exact: true })).toBeVisible();
    await expect(page.getByText("Bed Pijat 2", { exact: true })).toBeVisible();

    await page.goto("/booking");
    await expect(page.getByText(/Pijat/)).toHaveCount(0);
  } finally {
    sql(`update staff set active = false where name = '${terapis}'`);
  }
});
