import { expect, test, type Page } from "@playwright/test";
import { card, login, newSession, slotHour, uniq } from "./helpers";

const row = (page: Page, name: string) => page.getByRole("button", { name: new RegExp(name) }).filter({ hasText: name });

test("1 · kasir booking untuk Sari → muncul di HP Sari → Datang/Mulai/Selesai → siap bayar di kasir → Lunas di HP Sari", async ({ page, browser }, info) => {
  const h = slotHour(info);
  const name = `Tamu ${uniq()}`;
  await login(page, "sari");
  await expect(page).toHaveURL(/\/kapster$/);
  const kasir = await newSession(browser, info, "cashier");

  await kasir.goto("/kasir/jadwal");
  await kasir.getByRole("button", { name: `Booking baru Meja Manicure 3 ${h}:00` }).click();
  await kasir.fill("#f-name", name);
  await kasir.getByRole("button", { name: /^Manicure Basic ·/ }).click();
  await kasir.selectOption("#f-staff", { label: "Sari" });
  await kasir.getByRole("button", { name: "Simpan booking" }).click();
  await expect(card(kasir, name)).toBeVisible();

  // muncul di HP Sari tanpa refresh
  await expect(page.getByText(new RegExp(`Booking baru · ${name}`))).toBeVisible({ timeout: 15_000 });
  await row(page, name).click();
  const cur = page.getByRole("region", { name: "Pelanggan saat ini" });
  await expect(cur).toContainText(name);
  // 3 ketukan
  await cur.getByRole("button", { name: "Pelanggan datang" }).click();
  await expect(card(kasir, name)).toHaveAccessibleName(/Datang\/Menunggu/); // konter melihat "datang"
  await cur.getByRole("button", { name: "Mulai layanan" }).click();
  await expect(cur.getByRole("timer")).toBeVisible();
  await cur.getByRole("button", { name: "Selesai → ke kasir" }).click();
  await expect(cur).toContainText("Pembayaran diproses kasir");

  // toast "siap bayar" di layar kasir → buka di kasir → bayar
  const toast = kasir.getByRole("status").filter({ hasText: `${name} — siap bayar (Sari)` });
  await expect(toast).toBeVisible({ timeout: 15_000 });
  await expect(kasir.getByLabel(/siap bayar/).filter({ visible: true })).toBeVisible(); // badge menu Kasir (sidebar atau tab bar HP)
  await toast.getByRole("link", { name: "Buka di kasir" }).click();
  await expect(kasir.getByRole("region", { name: "Keranjang" })).toContainText("Manicure Basic");
  await kasir.getByRole("button", { name: /Catat pembayaran/ }).click();
  await expect(kasir.getByRole("heading", { name: "Pembayaran tercatat" })).toBeVisible();

  await expect(row(page, name)).toContainText("Lunas", { timeout: 15_000 });
  await kasir.context().close();
});

test("2 · Sari memperbarui preferensi pelanggan → kasir melihat catatan baru", async ({ page, browser }, info) => {
  const note = `Gel nude, kutikula sensitif ${uniq()}`;
  await login(page, "sari");
  await row(page, "Lina").click();
  const cur = page.getByRole("region", { name: "Pelanggan saat ini" });
  await expect(cur).toContainText("Lina");
  await cur.getByLabel(/Perbarui preferensi/).fill(note);
  await expect(cur.getByText("Tersimpan ✓")).toBeVisible();

  const kasir = await newSession(browser, info, "cashier");
  await kasir.goto("/kasir/pelanggan");
  await kasir.getByRole("button", { name: /Lina/ }).first().click();
  await expect(kasir.getByLabel("Catatan preferensi teknis")).toHaveValue(note);
  await kasir.context().close();
});

test("3 · Andi ajukan izin besok → manajer setujui → peringatan di form booking & slot online tanpa Andi", async ({ page, browser }, info) => {
  const reason = `Acara keluarga ${uniq()}`;
  await login(page, "andi");
  await page.getByRole("button", { name: "Menu", exact: true }).click(); // Izin pindah ke menu ⋯ (Tahap 5)
  await page.getByRole("link", { name: /^Izin \/ cuti/ }).click();
  await page.getByLabel("Alasan").fill(reason);
  await page.getByRole("button", { name: "Ajukan izin" }).click();
  await expect(page.getByText(reason)).toBeVisible();
  await expect(page.getByText(reason).locator("xpath=ancestor::div[1]/..")).toContainText("Menunggu");

  const mgr = await newSession(browser, info, "manager");
  await mgr.goto("/manajer/izin");
  const req = mgr.getByText(reason).locator("xpath=ancestor::div[2]");
  await req.getByRole("button", { name: "Setujui" }).click();
  await expect(mgr.getByText("Izin disetujui")).toBeVisible();
  await expect(page.getByText(reason).locator("xpath=ancestor::div[1]/..")).toContainText("Disetujui", { timeout: 15_000 }); // realtime ke HP Andi

  // form booking konter: peringatan + label (izin)
  await mgr.goto("/manajer/jadwal");
  await mgr.getByRole("button", { name: "Hari berikutnya" }).click();
  await mgr.getByRole("button", { name: "Booking baru Kursi Barber 3 10:00" }).click();
  await mgr.getByRole("button", { name: /^Potong Rambut ·/ }).click();
  await expect(mgr.locator("#f-staff")).not.toHaveValue(/0001-000000000001$/); // default melewati Andi
  await mgr.selectOption("#f-staff", { label: "Andi (izin)" });
  await expect(mgr.getByRole("dialog").getByRole("alert").filter({ hasText: "Andi sedang izin/cuti" })).toBeVisible();
  await mgr.context().close();

  // booking online (publik): tanggal besok → Andi tidak ditawarkan di langkah staf
  const besok = new Date(Date.now() + 86_400_000).toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
  const pub = await browser.newContext(info.project.use);
  const p = await pub.newPage();
  await p.goto(`/booking?tgl=${besok}`); await p.waitForLoadState("networkidle");
  await p.getByRole("button", { name: /Potong Rambut/ }).first().click();
  await p.getByRole("button", { name: /^Lanjut/ }).first().click();
  await expect(p.getByRole("button", { name: /^R\s*Rizky/ })).toBeVisible();
  await expect(p.getByRole("button", { name: /^A\s*Andi/ })).toHaveCount(0);
  await pub.close();
});

test("4 · kapster membuka /kasir & /manajer → dialihkan ke /kapster", async ({ page }) => {
  await login(page, "andi");
  await page.goto("/kasir/kasir");
  await expect(page).toHaveURL(/\/kapster$/);
  await page.goto("/manajer/pengaturan");
  await expect(page).toHaveURL(/\/kapster$/);
});

test("5 · mode stasiun: manajer atur PIN & daftarkan tablet → Sari masuk dengan PIN → Ganti kapster", async ({ page }, info) => {
  const pin = String(4000 + ((info.project.name.length * 97) % 5000));
  await login(page, "manager");
  await page.goto("/manajer/pengaturan?tab=stasiun");
  await page.getByLabel("PIN baru Sari").fill(pin);
  await page.getByLabel("PIN baru Sari").locator("..").getByRole("button", { name: "Simpan" }).click();
  await expect(page.getByText("PIN disimpan")).toBeVisible();
  await page.getByPlaceholder("Mis. Tablet meja kuku").fill(`Tablet uji ${info.project.name}`);
  await page.getByRole("button", { name: "Daftarkan perangkat ini" }).click();
  await expect(page.getByText(/terdaftar sebagai stasiun/)).toBeVisible();
  const more = page.getByRole("button", { name: "Lainnya" }); // HP: Keluar ada di menu Lainnya
  if (await more.isVisible()) await more.click();
  await page.getByRole("button", { name: /Keluar/ }).filter({ visible: true }).first().click();
  await page.waitForURL((u) => u.pathname === "/");

  await page.goto("/stasiun");
  await page.getByRole("button", { name: /Sari/ }).click();
  for (const d of "0000") await page.getByRole("button", { name: d, exact: true }).click();
  await page.getByRole("button", { name: "Masuk" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "PIN salah" })).toContainText("Sisa 4 percobaan");
  for (let i = 0; i < 4; i++) await page.getByRole("button", { name: "Hapus digit" }).click();
  for (const d of pin) await page.getByRole("button", { name: d, exact: true }).click();
  await page.getByRole("button", { name: "Masuk" }).click();
  await page.waitForURL((u) => u.pathname === "/kapster");
  await expect(page.getByText("Halo, Sari")).toBeVisible();
  await page.getByRole("button", { name: "Ganti kapster" }).click();
  await page.waitForURL((u) => u.pathname === "/stasiun");
  await page.goto("/kapster");
  await expect(page).toHaveURL(/\/login$/); // sesi benar-benar keluar
});
