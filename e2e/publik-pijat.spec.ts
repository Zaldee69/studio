import { expect, test, type Browser, type TestInfo } from "@playwright/test";
import { randomWa, sql, uniq } from "./helpers";

// Pijat bisa dibooking online: landing → Reservasi pijat → Pijat Fullbody + Tambah waktu 60 menit → terapis → jam → tamu → sukses
// → tercatat di Bed Pijat dengan durasi 120 menit. Terapis uji dibuat & dinonaktifkan lagi (DB lokal tanpa terapis aktif).
async function visitor(browser: Browser, info: TestInfo) {
  const ctx = await browser.newContext({ ...info.project.use, extraHTTPHeaders: { "x-forwarded-for": `10.8.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` } });
  return ctx.newPage();
}
const lanjut = (p: import("@playwright/test").Page) => p.getByRole("button", { name: /^Lanjut/ }).first().click();

test("booking pijat 2 jam online → bed & terapis terjadwal 120 menit", async ({ browser }, info) => {
  const terapis = `Terapis ${uniq()}`, name = `Pijat ${uniq()}`;
  const [{ id }] = sql<{ id: string }>(`insert into staff (name, category) values ('${terapis}', 'massage') returning id`);
  try {
    const p = await visitor(browser, info);
    await p.goto("/booking?kategori=massage");
    await expect(p.getByRole("tab", { name: "Pijat", selected: true })).toBeVisible();
    await expect(p.getByRole("button", { name: /Tambahan 1 titik bekam/ })).toHaveCount(0); // ditentukan di tempat
    await p.getByRole("button", { name: /Pijat Fullbody/ }).first().click();
    await p.getByRole("button", { name: /Tambah waktu pijat 60 menit/ }).click();
    await lanjut(p);
    await p.getByRole("button", { name: new RegExp(terapis) }).click();
    await lanjut(p);
    await p.locator("button[aria-pressed][aria-label]").nth(2).click(); // H+2
    await p.locator("button[aria-pressed]:not([aria-label])", { hasText: /^\d\d:\d\d$/ }).first().click();
    await lanjut(p);
    await p.fill("#g-name", name);
    await p.fill("#g-wa", randomWa());
    await p.getByLabel(/Saya menyetujui/).check();
    await p.getByRole("button", { name: /^Konfirmasi/ }).first().click();
    await expect(p.getByText(/Booking (terkonfirmasi|diterima)|menunggu/i).first()).toBeVisible();

    const [a] = sql<{ dur: number; res: string; staff: string }>(`select a.duration_min as dur, r.name as res, s.name as staff
      from appointments a join resources r on r.id = a.resource_id join staff s on s.id = a.staff_id
      join customers c on c.id = a.customer_id where c.name = '${name}'`);
    expect(Number(a.dur)).toBe(120);
    expect(a.res).toMatch(/^Bed Pijat/);
    expect(a.staff).toBe(terapis);
  } finally {
    sql(`update appointments set status = 'cancelled', cancel_reason = 'uji' where staff_id = '${id}' and status in ('booked','pending_review')`);
    sql(`update staff set active = false where id = '${id}'`);
  }
});
