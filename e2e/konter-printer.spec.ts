import { expect, test, type Page } from "@playwright/test";
import { login, resetTodayClosings } from "./helpers";

// Printer struk Bluetooth tiruan (Web Bluetooth palsu) — merekam byte ESC/POS yang dikirim aplikasi.
async function fakePrinter(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __printed: number[] };
    w.__printed = [];
    const char = {
      properties: { write: true, writeWithoutResponse: false },
      writeValueWithResponse: async (b: Uint8Array) => { w.__printed.push(...b); },
      writeValueWithoutResponse: async () => {},
    };
    const device = {
      id: "fake", name: "Printer Uji", addEventListener() {},
      gatt: { connect: async () => ({ getPrimaryServices: async () => [{ getCharacteristics: async () => [char] }] }), disconnect() {} },
    };
    Object.defineProperty(navigator, "bluetooth", { value: { requestDevice: async () => device, getDevices: async () => [] } });
  });
}
const printed = (page: Page) => page.evaluate(() => String.fromCharCode(...(window as unknown as { __printed: number[] }).__printed));

test("printer Bluetooth: sambungkan → bayar tunai → struk tercetak otomatis + laci; rekap tutup kasir", async ({ page }) => {
  await fakePrinter(page);
  await login(page, "cashier");
  await page.goto("/kasir/kasir");

  await page.getByRole("button", { name: /^Printer struk: belum tersambung/ }).click();
  const sheet = page.getByRole("dialog", { name: "Printer struk" });
  await sheet.getByRole("button", { name: "Sambungkan" }).click();
  await expect(sheet).toContainText("Printer Uji");
  await sheet.getByText("Buka laci uang saat bayar tunai").click();
  await sheet.getByRole("button", { name: "Uji cetak" }).click();
  await expect.poll(() => printed(page)).toContain("UJI CETAK");
  await sheet.getByRole("button", { name: "Tutup" }).click();
  await expect(page.getByRole("button", { name: /^Printer struk: tersambung \(Printer Uji\)/ })).toBeVisible();

  await page.evaluate(() => { (window as unknown as { __printed: number[] }).__printed = []; });
  const cart = page.getByRole("region", { name: "Keranjang" });
  await page.getByRole("button", { name: /^Tambah Cukur Jenggot/ }).first().click();
  await cart.getByRole("combobox", { name: /Kapster untuk Cukur Jenggot/ }).selectOption({ index: 1 });
  await cart.getByRole("radio", { name: "Tunai" }).click();
  await page.getByRole("button", { name: /^Catat pembayaran/ }).click();
  await expect(cart).toContainText("Pembayaran tercatat");

  await expect.poll(() => printed(page)).toContain("Terima kasih");
  const struk = await printed(page);
  expect(struk).toContain("Cukur Jenggot");
  expect(struk).toContain("TOTAL");
  expect(struk).toContain("\x1bp\x00\x19\xfa"); // laci terbuka (tunai)

  // tutup kasir buta: rekap baru bisa dicetak setelah kas fisik disimpan
  resetTodayClosings();
  await page.getByRole("tab", { name: "Tutup kasir" }).click();
  await page.fill("#cl-phys", "100000");
  await page.getByRole("button", { name: "Simpan tutup kasir" }).click();
  await expect(page.getByRole("main").getByText(/Penutupan terakhir/)).toBeVisible();
  await page.evaluate(() => { (window as unknown as { __printed: number[] }).__printed = []; });
  await page.getByRole("button", { name: "Cetak ke printer struk" }).click();
  await expect.poll(() => printed(page)).toContain("KAS DIHARAPKAN");
});
