import { expect, test } from "@playwright/test";
import { login, uniq } from "./helpers";

// Walk-in sekarang: 3 ketukan → langsung "Sedang dilayani"; panel Sekarang → Selesai; kartu → Bayar ▸ → kasir.
test("walk-in sekarang → dilayani → Selesai dari panel → Bayar", async ({ page }) => {
  const guest = `Cepat ${uniq()}`;
  await login(page, "cashier");
  await page.goto("/kasir/jadwal");
  await page.getByRole("button", { name: "Walk-in sekarang" }).click();
  const form = page.getByRole("dialog", { name: "Walk-in sekarang" });
  const pick = form.getByRole("radio", { checked: true }); // default: kapster yang kosong
  const staff = (await pick.locator("b").innerText()).trim();
  await form.getByRole("button", { name: /^Potong Rambut ·/ }).click();
  await form.getByLabel("Nama panggilan (opsional)").fill(guest);
  await form.getByRole("button", { name: /^Mulai dilayani/ }).click();
  const tetap = form.getByRole("button", { name: "Tetap mulai" });
  if (await tetap.isVisible().catch(() => false)) await tetap.click(); // sisa data uji di jam ini
  await expect(page.getByText(`mulai dilayani ${staff}`)).toBeVisible();

  const panel = page.getByRole("region", { name: "Sekarang" });
  const tile = panel.locator("div", { has: page.getByText(staff, { exact: true }) }).filter({ hasText: guest }).first();
  await expect(tile).toContainText("Melayani");
  await tile.getByRole("button", { name: "Selesai" }).click();

  // Bayar dari panel "Belum bayar" (kartu di grid juga punya tombol Bayar ▸, tapi di luar jam buka kartunya di luar grid)
  await panel.getByRole("link", { name: new RegExp(guest) }).click();
  const cart = page.getByRole("region", { name: "Keranjang" });
  await expect(cart).toContainText("Potong Rambut");
  await cart.getByRole("radio", { name: "Tunai" }).click();
  await page.getByRole("button", { name: /^Catat pembayaran/ }).click();
  await expect(cart).toContainText("Pembayaran tercatat");
  await expect(cart).toContainText(`Pelanggan${guest}`);
});
