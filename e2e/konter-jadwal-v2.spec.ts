import { expect, test } from "@playwright/test";
import { login, randomWa, sql, uniq } from "./helpers";

test("form booking: kursi/kapster/jam di atas, layanan per tab + cari lintas kategori", async ({ page }) => {
  await login(page, "cashier");
  await page.goto("/kasir/jadwal");
  await page.getByRole("button", { name: "Booking baru", exact: true }).click();
  const form = page.getByRole("dialog", { name: "Booking baru" });
  // urutan: kursi sebelum pelanggan sebelum layanan
  const y = async (sel: string) => (await form.locator(sel).boundingBox())!.y;
  expect(await y("#f-res")).toBeLessThan(await y("#f-wa"));
  expect(await y("#f-wa")).toBeLessThan(await y("[aria-label='Cari layanan']"));
  await expect(form.getByRole("tab", { name: /Barbershop/, selected: true })).toBeVisible();
  await expect(form.getByRole("button", { name: /^Manicure Basic ·/ })).toHaveCount(0); // tab lain tersembunyi
  await form.getByLabel("Cari layanan").fill("manicure");
  await expect(form.getByRole("button", { name: /^Manicure Basic · Nail Art ·/ })).toBeVisible();
  await form.getByLabel("Cari layanan").fill("");
  await form.getByRole("button", { name: /^Potong Rambut ·/ }).click();
  await expect(form.getByRole("tab", { name: /Barbershop1/ })).toBeVisible(); // jumlah dipilih di tab
});

test("jadwal per kapster: kolom = staf, pilihan diingat", async ({ page }) => {
  await login(page, "cashier");
  await page.goto("/kasir/jadwal");
  await page.getByRole("radio", { name: "Per kapster" }).click();
  await expect(page.getByRole("button", { name: /^Booking baru Rizky \d\d:\d\d$/ }).first()).toBeAttached();
  await page.reload();
  await expect(page.getByRole("radio", { name: "Per kapster", checked: true })).toBeVisible();
  await page.getByRole("radio", { name: "Per kursi" }).click();
  await expect(page.getByRole("button", { name: /^Booking baru Kursi Barber 1 \d\d:\d\d$/ }).first()).toBeAttached();
});

test("manajer menghapus pelanggan: hilang dari daftar, transaksi tetap", async ({ page }) => {
  const name = `Hapus ${uniq()}`;
  const [{ id }] = sql<{ id: string }>(`insert into customers (name, whatsapp) values ('${name}', '${randomWa().replace(/^0/, "62")}') returning id`);
  await login(page, "manager");
  await page.goto("/manajer/pelanggan");
  await page.getByRole("searchbox").first().fill(name);
  await page.getByText(name, { exact: true }).first().click();
  await page.getByRole("button", { name: "Hapus pelanggan…" }).click();
  await page.getByLabel("Alasan menghapus (wajib)").fill("uji e2e");
  await page.getByRole("button", { name: "Hapus pelanggan", exact: true }).click();
  await expect(page.getByText("Pelanggan dihapus")).toBeVisible();
  expect(sql(`select 1 from customers where id = '${id}'`)).toHaveLength(0);
});

test("pijat 2 jam: layanan utama + Tambah waktu → durasi & perkiraan tagihan dijumlahkan", async ({ page }) => {
  await login(page, "cashier");
  await page.goto("/kasir/jadwal");
  await page.getByRole("button", { name: /^Booking baru Bed Pijat 1 \d\d:\d\d$/ }).first().click();
  const form = page.getByRole("dialog", { name: "Booking baru" });
  await expect(form.getByRole("tab", { name: /Pijat/, selected: true })).toBeVisible();
  const [{ d, p }] = sql<{ d: number; p: number }>(`select sum(duration_min)::int as d, sum(price)::int as p from services
    where name in ('Pijat Fullbody', 'Tambah waktu pijat 60 menit')`);
  await form.getByRole("button", { name: /^Pijat Fullbody ·/ }).click();
  await form.getByRole("button", { name: /^Tambah waktu pijat 60 menit ·/ }).click();
  await expect(form.getByText(`Durasi (menit) · otomatis ${d}`)).toBeVisible();
  await expect(form.getByLabel(/^Durasi \(menit\)/)).toHaveValue(String(d));
  await expect(form).toContainText(`Rp${Number(p).toLocaleString("id-ID")}`);
});
