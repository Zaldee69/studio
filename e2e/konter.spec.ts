import { expect, test } from "@playwright/test";
import { card, login, newSession, randomWa, slotHour, uniq } from "./helpers";

test("1 · walk-in dari slot kosong → status sampai Selesai → bayar tunai + kembalian → Lunas di tab lain", async ({ page, browser }, info) => {
  const h = slotHour(info);
  await login(page, "cashier");
  await expect(page).toHaveURL(/\/kasir\/kasir$/);
  const manager = await newSession(browser, info, "manager");
  await manager.goto("/manajer/jadwal");

  const name = `Walkin ${uniq()}`;
  await page.goto("/kasir/jadwal");
  // tap 1: slot kosong
  await page.getByRole("button", { name: `Booking baru Kursi Barber 3 ${h}:00` }).click();
  await page.fill("#f-name", name);
  // tap 2: layanan, tap 3: simpan
  await page.getByRole("button", { name: /^Potong Rambut ·/ }).click();
  await page.getByRole("button", { name: "Simpan booking" }).click();
  await expect(card(page, name)).toBeVisible();
  await expect(card(manager, name)).toBeVisible(); // booking baru muncul di tab manajer (realtime)

  await card(page, name).click();
  for (const s of ["Datang", "Mulai", "Selesai"]) await page.getByRole("button", { name: s, exact: true }).click();
  await expect(card(manager, name)).toHaveAccessibleName(/Selesai\/Belum Bayar/);

  // tap 4: proses bayar, tap 5: nominal cepat, tap 6: catat pembayaran
  await page.getByRole("link", { name: "Proses bayar di Kasir" }).click();
  await expect(page.getByRole("region", { name: "Keranjang" })).toContainText("Potong Rambut");
  await page.getByRole("button", { name: "100rb" }).click();
  await expect(page.getByText("Kembalian")).toBeVisible();
  await page.getByRole("button", { name: /Catat pembayaran · Rp75\.000/ }).click();
  await expect(page.getByRole("heading", { name: "Pembayaran tercatat" })).toBeVisible();
  const receipt = page.getByRole("region", { name: "Keranjang" });
  await expect(receipt).toContainText("Uang diterimaRp100.000");
  await expect(receipt).toContainText("KembalianRp25.000");

  await expect(card(manager, name)).toHaveAccessibleName(/Lunas/); // tab lain, tanpa refresh
  await manager.context().close();
});

test("2 · pasangan: barber + nail → satu tagihan, diskon, deposit + QRIS, saldo berkurang benar", async ({ page }, info) => {
  const h = slotHour(info);
  const name = `Pasangan ${uniq()}`, wa = randomWa();
  await login(page, "cashier");
  await page.goto("/kasir/jadwal");

  await page.getByRole("button", { name: `Booking baru Kursi Barber 2 ${h}:00` }).click();
  await page.fill("#f-name", name); await page.fill("#f-wa", wa);
  await page.getByRole("button", { name: /^Potong Rambut ·/ }).click();
  await page.getByRole("button", { name: "Simpan booking" }).click();
  await expect(card(page, name)).toBeVisible();

  await page.getByRole("button", { name: `Booking baru Meja Manicure 2 ${h}:00` }).click();
  await page.fill("#f-name", name); await page.fill("#f-wa", wa);
  await expect(page.getByText(/sudah terdaftar atas nama/)).toBeVisible(); // WA lama → pelanggan yang sama
  await page.getByRole("button", { name: /^Manicure Basic ·/ }).click();
  await page.getByRole("button", { name: "Simpan booking" }).click();
  await expect(card(page, name)).toHaveCount(2);

  await page.goto("/kasir/kasir");
  const bills = page.getByRole("region", { name: "Tagihan dari booking hari ini" });
  const mine = bills.getByRole("button", { name: new RegExp(name) });
  await expect(mine).toHaveCount(2);
  await mine.nth(0).click(); await mine.nth(1).click();
  const cart = page.getByRole("region", { name: "Keranjang" });
  await expect(cart).toContainText(name);
  await expect(cart).toContainText("Diskon Groom & Bloom 10%−Rp16.500");

  await cart.getByRole("button", { name: "Top-up" }).click();
  await page.fill("#tp-paid", "100000");
  await page.getByRole("button", { name: /Simpan top-up · Rp100\.000/ }).click();
  await expect(cart).toContainText("Saldo deposit: Rp100.000");
  await cart.getByRole("button", { name: /Pakai saldo deposit/ }).click();
  await cart.getByRole("radio", { name: "QRIS" }).click();
  await expect(cart).toContainText("Sisa dibayarRp48.500");
  await page.getByRole("button", { name: /Catat pembayaran · Rp48\.500/ }).click();
  await expect(cart).toContainText("Dibayar (Deposit + QRIS)Rp48.500");
  await expect(cart).toContainText("Potong saldo deposit−Rp100.000");
  await expect(cart).toContainText("Sisa saldo depositRp0");
});

test("3 · bentrok: booking tumpang tindih → peringatan → Tetap simpan → badge Bentrok", async ({ page }) => {
  const name = `Bentrok ${uniq()}`;
  await login(page, "cashier");
  await page.goto("/kasir/jadwal");
  await page.getByRole("button", { name: "Booking baru", exact: true }).click();
  await page.selectOption("#f-res", { label: "Kursi Barber 1" });
  await page.selectOption("#f-start", { label: "10:15" }); // Rina 10:00–10:45 (seed)
  await page.fill("#f-name", name);
  await page.getByRole("button", { name: /^Cukur Jenggot ·/ }).click();
  await expect(page.getByRole("dialog").getByRole("alert").filter({ hasText: "Jadwal bentrok" })).toContainText(/Jadwal bentrok:.*Rina/);
  await page.getByRole("button", { name: "Tetap simpan" }).click();
  await expect(card(page, name)).toHaveAccessibleName(/bentrok/);
  await expect(card(page, name)).toContainText("Bentrok");
  await expect(card(page, "Rina")).toContainText("Bentrok");
});

test("4 · kasir: /manajer/sdm ditolak, tidak ada void; manajer bisa void", async ({ page, browser }, info) => {
  await login(page, "cashier");
  await page.goto("/manajer/sdm");
  await expect(page).toHaveURL(/\/kasir\/kasir$/);
  await expect(page.getByRole("navigation", { name: "Menu utama" }).getByRole("link")).toHaveText(["Jadwal", "Kasir", "Pelanggan", "Stok opname"].map((t) => new RegExp(t)));

  // transaksi ritel cepat
  await page.getByRole("tab", { name: "Ritel" }).click();
  await page.getByRole("button", { name: /Tambah Pomade Matte/ }).click();
  await page.getByRole("button", { name: /Catat pembayaran/ }).click();
  await expect(page.getByRole("heading", { name: "Pembayaran tercatat" })).toBeVisible();
  await page.getByRole("tab", { name: "Transaksi hari ini" }).click();
  await page.getByRole("button", { name: /Pelanggan umum/ }).first().click();
  const struk = page.getByRole("dialog", { name: "Struk transaksi" });
  await expect(struk).toBeVisible();
  await expect(struk.getByRole("button", { name: /void/i })).toHaveCount(0);

  const manager = await newSession(browser, info, "manager");
  await manager.goto("/manajer/kasir?tab=riwayat");
  await manager.getByRole("button", { name: /Pelanggan umum/ }).first().click();
  await manager.getByRole("button", { name: "Batalkan transaksi (void)" }).click();
  await manager.fill("#void-reason", "Uji e2e");
  await manager.getByRole("button", { name: "Void transaksi" }).click();
  await expect(manager.getByRole("dialog", { name: "Struk transaksi" })).toContainText("DIBATALKAN (void)");
  await expect(manager.getByRole("dialog", { name: "Struk transaksi" })).toContainText("Alasan void: Uji e2e");
  await manager.context().close();
});

test("5 · tutup kasir: selisih dihitung benar & tersimpan", async ({ page }) => {
  await login(page, "cashier");
  await page.goto("/kasir/kasir?tab=tutup");
  const main = page.getByRole("main"); // bukan salinan di lembar cetak
  const expectedRow = main.getByText("Kas diharapkan (tunai jual + tunai top-up)").locator("..");
  await expect(expectedRow).toContainText("Rp");
  const expected = Number((await expectedRow.innerText()).split("Rp")[1].replace(/\D/g, ""));
  await page.fill("#cl-phys", String(expected - 5000));
  await expect(main.getByText(/Selisih [-−]Rp5\.000 · kurang/)).toBeVisible();
  await page.getByRole("button", { name: "Simpan tutup kasir" }).click();
  await expect(main.getByText(/Penutupan terakhir/)).toBeVisible();
  await expect(main.getByText(/Penutupan terakhir/).locator("..")).toContainText(/Selisih[-−]Rp5\.000/);
});
