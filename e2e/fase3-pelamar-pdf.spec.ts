import { expect, test } from "@playwright/test";
import { login, sql } from "./helpers";

// Lembar pelamar untuk disimpan sebagai PDF: jawaban per bagian, menu aplikasi tidak ikut tercetak.
test("pelamar: lembar PDF satu pelamar & semua per posisi", async ({ page }) => {
  const [{ id }] = sql<{ id: string }>(`insert into job_applications (position, name, whatsapp, answers) values ('kasir', 'Uji Pelamar PDF', '6281200009999',
    '{"usia": "25", "status": "Menikah", "domisili": "Tapos, Depok", "selisih_kas": "Dilaporkan ke owner.", "keahlian": ["Membalas chat WhatsApp pelanggan", "Excel / Google Sheets"]}') returning id`);
  try {
    await login(page, "manager");
    await page.goto("/manajer/pengaturan?tab=pelamar");
    const card = page.locator("article", { hasText: "Uji Pelamar PDF" });
    await expect(card.getByRole("link", { name: "PDF" })).toHaveAttribute("href", `/manajer/pengaturan/pelamar?id=${id}`);
    await page.goto(`/manajer/pengaturan/pelamar?id=${id}`);
    await expect(page.getByText("Pelamar Kasir · WA +6281200009999")).toBeVisible();
    await expect(page.getByRole("row", { name: /Pernah ada selisih kas/ })).toContainText("Dilaporkan ke owner.");
    await expect(page.getByRole("row", { name: /Yang sudah biasa dikerjakan/ })).toContainText("Membalas chat WhatsApp pelanggan, Excel / Google Sheets");
    await page.emulateMedia({ media: "print" });
    await expect(page.getByRole("button", { name: "Simpan PDF" })).toBeHidden();
    if (process.env.PDF_OUT) await page.pdf({ path: process.env.PDF_OUT, format: "A4" });
    await page.goto("/manajer/pengaturan/pelamar?posisi=kasir");
    await expect(page.getByText("Uji Pelamar PDF")).toBeVisible();
  } finally {
    sql(`delete from job_applications where id = '${id}'`);
  }
});
