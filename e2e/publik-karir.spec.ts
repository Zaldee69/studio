import { expect, test } from "@playwright/test";

// Formulir lamaran: pertanyaan berganti per posisi; hampir semua wajib. Jalur simpan diuji di pgTAP 50 (tanpa notifikasi).
test("karir: capster minta portofolio, kasir tidak; nomor salah ditolak", async ({ page }) => {
  await page.goto("/karir");
  await expect(page.getByLabel("Link Instagram / portofolio hasil potongan")).toBeVisible();
  await page.getByRole("link", { name: "Kasir" }).click();
  await expect(page).toHaveURL(/posisi=kasir/);
  await expect(page.getByLabel("Pernah memakai aplikasi kasir (POS)?")).toBeVisible();
  await expect(page.getByLabel("Link Instagram / portofolio hasil potongan")).toHaveCount(0);
  const form = page.locator("form");
  // isi semua: pilihan pertama, angka 2, teks satu kalimat, centang pertama tiap kelompok
  for (const s of await form.locator("select").all()) await s.selectOption({ index: 1 });
  for (const t of await form.locator("textarea").all()) await t.fill("Jawaban satu kalimat untuk uji.");
  for (const i of await form.locator("input:not([type=hidden]):not([type=checkbox]):not([name=website]):visible").all())
    await i.fill((await i.getAttribute("inputmode")) === "numeric" ? "2" : "Uji isian");
  for (const f of await form.locator("fieldset").all()) await f.getByRole("checkbox").first().check();
  await page.getByLabel("No. WhatsApp").fill("0812");
  await page.getByRole("button", { name: "Kirim lamaran" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "No. WhatsApp tidak valid" })).toBeVisible();
});
