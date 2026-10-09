import { expect, test } from "@playwright/test";
import { startFakeWablas } from "./fake-wablas";
import { login, randomWa, sql, uniq } from "./helpers";

// CRM: manajer menyaring pelanggan → blast WA → pesan terkirim lewat Wablas (tiruan) → riwayat "terkirim".
// Pemicu pengiriman DB lokal (app_config.notify_url) sementara diarahkan ke server tes 3100, lalu dikembalikan.
const wablas = startFakeWablas();
test.beforeAll(wablas.listen);
test.afterAll(wablas.close);

test("blast promosi ke segmen pelanggan setia → terkirim; yang minta berhenti tidak dikirimi", async ({ page }) => {
  const spend = 1_000_000_000 + (Date.now() % 1_000_000_000); // naik tiap run → segmen hanya pelanggan tes ini
  const ikut = { name: `Setia ${uniq()}`, wa: "62" + randomWa().slice(1) }, stop = { name: `Stop ${uniq()}`, wa: "62" + randomWa().slice(1) };
  for (const c of [ikut, stop]) {
    sql(`with c as (insert into customers (name, whatsapp, promo_opt_out) values ('${c.name}', '${c.wa}', ${c === stop}) returning id)
      insert into transactions (customer_id, subtotal, total, paid_amount, payment_method) select id, ${spend}, ${spend}, ${spend}, 'cash' from c`);
  }
  // batas 3 kiriman/10 menit per manajer: kiriman run tes sebelumnya tidak ikut dihitung
  sql("update campaign_sends set created_at = created_at - interval '1 hour' where created_at > now() - interval '10 minutes'");
  const [{ url }] = sql<{ url: string }>("select value as url from app_config where key = 'notify_url'");
  sql("update app_config set value = 'http://host.docker.internal:3100/api/notifications/dispatch' where key = 'notify_url'");
  try {
    await login(page, "manager");
    await page.goto("/manajer/promosi");
    const cname = `Tes ${ikut.name}`;
    await page.getByLabel("Nama campaign").fill(cname);
    await page.getByText("Atur filter sendiri").click();
    await page.getByLabel("Minimal total belanja").fill(String(spend));
    await expect(page.getByLabel("1. Penerima")).toContainText("→ 1 pelanggan");
    await expect(page.getByLabel("1. Penerima")).toContainText(`mis. ${ikut.name}`);
    await page.getByLabel("Pesan", { exact: true }).fill("Hai {nama}, diskon 10% booking online di ");
    await page.getByRole("button", { name: "+ Link booking" }).click();
    await expect(page.getByLabel("Pratinjau pesan")).toContainText(`Hai ${ikut.name.split(" ")[0]}, diskon 10%`);
    await page.getByRole("button", { name: "Kirim ke 1 pelanggan" }).click();
    await page.getByRole("button", { name: "Kirim 1 pesan" }).click();
    await expect(page.getByText("Campaign dikirim ke 1 pelanggan")).toBeVisible();

    await expect.poll(() => wablas.sent.filter((m) => m.phone === ikut.wa).length, { timeout: 20_000 }).toBe(1);
    const msg = wablas.sent.find((m) => m.phone === ikut.wa)!;
    expect(msg.message).toContain(`Hai ${ikut.name.split(" ")[0]}, diskon 10% booking online di http`);
    expect(msg.message).toContain("Balas STOP");
    expect(wablas.sent.some((m) => m.phone === stop.wa)).toBe(false);
    await expect(page.getByLabel("3. Kirim")).toContainText("1 terkirim", { timeout: 15_000 }); // status antrean diperbarui sendiri

    // dipakai ulang: dari daftar → Kirim lagi
    const card = page.getByRole("article", { name: `Campaign ${cname}` });
    await expect(card).toContainText("Terakhir dikirim hari ini · 1 penerima · 1× dikirim");
    await page.getByRole("button", { name: "+ Campaign baru" }).click();
    await card.getByRole("button", { name: "Kirim lagi / ubah" }).click();
    await page.getByRole("button", { name: "Kirim lagi ke 1 pelanggan" }).click();
    await expect(page.getByRole("alertdialog")).toContainText("terakhir dikirim hari ini");
    await page.getByRole("button", { name: "Kirim 1 pesan" }).click();
    await expect.poll(() => wablas.sent.filter((m) => m.phone === ikut.wa).length, { timeout: 20_000 }).toBe(2);
    await expect(card).toContainText("2× dikirim");

    await card.getByRole("button", { name: "Duplikat" }).click();
    await expect(page.getByLabel("Nama campaign")).toHaveValue(`${cname} (salinan)`);
  } finally {
    sql(`update app_config set value = '${url}' where key = 'notify_url'`);
  }
});
