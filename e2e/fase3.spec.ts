import { readFileSync } from "node:fs";
import ExcelJS from "exceljs";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { jktDate } from "../src/lib/domain/format";
import { admin, apiAs, login, newSession, sql } from "./helpers";

// Tahap 5 — Analitik KPI · SOP & Kepatuhan (E1–E8). Data contoh bagian 4 di tanggal 10 bulan lalu (beda bulan per
// viewport agar laporan bulanan hanya berisi data contoh). SOP hari ini dibersihkan tiap tes lewat SQL (trigger audit).
const OFFSET: Record<string, number> = { "laptop-1366": 1, "tablet-1024": 2, "portrait-820": 3 };
const fixtureDay = (info: TestInfo) => {
  const t = jktDate();
  return new Date(Date.UTC(+t.slice(0, 4), +t.slice(5, 7) - 1 - (OFFSET[info.project.name] ?? 1), 10)).toISOString().slice(0, 10);
};
const STAFF = { andi: "00000000-0000-0000-0001-000000000001", sari: "00000000-0000-0000-0001-000000000004" };
const toast = (p: Page, t: string | RegExp) => p.getByRole("status").filter({ hasText: t }).or(p.getByRole("alert").filter({ hasText: t }));

async function svc(name: string) {
  const { data } = await admin.from("services").select("id").eq("name", name).single();
  return data!.id as string;
}
/** T1–T5 (spesifikasi 4): lewat checkout kasir sungguhan, T5 di-void manajer, lalu dipindah ke tanggal contoh. */
async function seedExample(day: string) {
  const k = await apiAs("cashier");
  const [potong, gel, pomade] = await Promise.all([svc("Potong Rambut"), svc("Gel Polish Tangan"), svc("Pomade Matte")]);
  const sell = async (items: { service_id: string; staff_id?: string }[]) => {
    const { data, error } = await k.rpc("checkout", { p: { method: "cash", items } });
    if (error) throw new Error(error.message);
    return data as string;
  };
  const ids = [
    await sell([{ service_id: potong, staff_id: STAFF.andi }]),
    await sell([{ service_id: gel, staff_id: STAFF.sari }]),
    await sell([{ service_id: potong, staff_id: STAFF.andi }, { service_id: gel, staff_id: STAFF.sari }]),
    await sell([{ service_id: pomade }]),
    await sell([{ service_id: potong, staff_id: STAFF.andi }]),
  ];
  const { error } = await (await apiAs("manager")).rpc("void_transaction", { p_id: ids[4], p_reason: "uji e2e" });
  if (error) throw new Error(error.message);
  sql(`do $$ begin
    alter table transactions disable trigger transactions_immutable;
    update transactions set created_at = jkt('${day}', '10:00') where id in (${ids.map((i) => `'${i}'`).join(",")});
    alter table transactions enable trigger transactions_immutable;
    perform refresh_analytics(true);
  end $$`);
}
function clearSopToday() {
  sql(`do $$ begin
    alter table sop_logs disable trigger sop_logs_locked; alter table sop_approvals disable trigger sop_approvals_immutable;
    delete from sop_logs where date = jkt_today(); delete from sop_approvals where date = jkt_today();
    alter table sop_logs enable trigger sop_logs_locked; alter table sop_approvals enable trigger sop_approvals_immutable;
    update settings set sop_shifts = 1, sop_require_photo_autoclave = false;
  end $$`);
}
const groups = () => sql<{ name: string }>("select name from sop_tool_groups where active order by sort").map((g) => g.name);
const STAGES = ["Cuci", "Rendam", "Autoclave"];
async function tick(p: Page, group: string, stage: number) {
  await p.getByRole("button", { name: new RegExp(`^${stage + 1}\\. ${STAGES[stage]} ${group}:`) }).click();
  await p.getByRole("button", { name: `Tandai ${STAGES[stage]} selesai` }).click();
  await expect(toast(p, `${STAGES[stage]} · ${group} tercatat`)).toBeVisible();
  // grid sudah memuat ulang (bukan hanya toast) → klik berikutnya melihat status terbaru
  await expect(p.getByRole("button", { name: new RegExp(`^${stage + 1}\\. ${STAGES[stage]} ${group}: selesai`) })).toBeVisible();
}

test.describe.serial("Analitik", () => {
  test.beforeAll(async ({}, info) => { await seedExample(fixtureDay(info)); });

  test("E1 · angka konsisten di kartu, tooltip, Lihat tabel, CSV & laporan PDF (71.250 / 171.000 / 594.500 / 22,7%)", async ({ page }, info) => {
    const day = fixtureDay(info);
    await login(page, "manager");
    await page.goto(`/manajer/analitik?periode=kustom&dari=${day}&sampai=${day}`);
    await expect(page.getByRole("link", { name: /^AOV Barbershop/ })).toContainText("Rp71.250");
    await expect(page.getByRole("link", { name: /^AOV Nail/ })).toContainText("Rp171.000");
    await expect(page.getByRole("link", { name: /^Omzet/ })).toContainText("Rp594.500");
    await expect(page.getByRole("link", { name: /^Rasio ritel/ })).toContainText("22,7%");
    await expect(page.getByRole("link", { name: /^Rasio ritel/ })).toContainText("Di atas target");

    const aov = page.locator("#aov");
    await aov.locator("svg rect").first().hover();
    const tip = aov.getByRole("status");
    await expect(tip).toContainText("Rp71.250");
    await expect(tip).toContainText("Rp171.000");
    await expect(tip).toContainText("Omzet Rp594.500");
    await aov.getByText("Lihat tabel").click();
    await expect(aov.getByRole("table")).toContainText("Rp71.250");
    await expect(aov.getByRole("table")).toContainText("Rp594.500");

    const [dl] = await Promise.all([page.waitForEvent("download"), aov.getByRole("button", { name: "Unduh CSV" }).click()]);
    const csv = readFileSync((await dl.path())!, "utf8");
    expect(csv).toContain(`${day};71250;2;171000;2;594500`);
    const [dl2] = await Promise.all([page.waitForEvent("download"), page.locator("#ritel").getByRole("button", { name: "Unduh CSV" }).click()]);
    expect(readFileSync((await dl2.path())!, "utf8")).toContain("Rasio %;;22,7");

    await page.goto(`/manajer/analitik/laporan?bulan=${day.slice(0, 7)}`);
    const rep = page.getByRole("article");
    for (const v of ["Rp71.250", "Rp171.000", "Rp594.500", "22,7%"]) await expect(rep).toContainText(v);
    await page.emulateMedia({ media: "print" });
    expect((await page.pdf({ format: "A4" })).length).toBeGreaterThan(20_000);
  });

  test("E2 · Nail + 30 hari → semua bagian ikut; state di URL bertahan setelah refresh", async ({ page }) => {
    await login(page, "manager");
    await page.goto("/manajer/analitik");
    await page.getByRole("link", { name: "30 hari", exact: true }).click();
    await page.waitForURL(/periode=30/);
    await page.getByLabel("Kategori", { exact: true }).selectOption("nail");
    await page.waitForURL(/kategori=nail/);
    const check = async () => {
      await expect(page.getByRole("link", { name: /^AOV Nail/ })).toBeVisible();
      await expect(page.getByRole("link", { name: /^AOV Barbershop/ })).toHaveCount(0);
      await expect(page.locator("#ritel")).toHaveCount(0);
      await expect(page.locator("#utilisasi")).toContainText("Meja Manicure 1");
      await expect(page.locator("#utilisasi")).not.toContainText("Kursi Barber 1");
      await expect(page.getByLabel("Kategori", { exact: true })).toHaveValue("nail");
    };
    await check();
    const url = page.url();
    await page.reload();
    expect(page.url()).toBe(url);
    await check();
  });

  test("E3 · target AOV nail 200.000 → insight AOV nail muncul dengan tautan ke bagian AOV", async ({ page }, info) => {
    const day = fixtureDay(info);
    await login(page, "manager");
    await page.goto(`/manajer/analitik?periode=kustom&dari=${day}&sampai=${day}`);
    const setNail = async (v: string) => {
      await page.fill("#tg-aov_target_nail", v);
      await page.getByRole("button", { name: "Simpan target" }).click();
      await expect(toast(page, "Target KPI disimpan")).toBeVisible();
    };
    await setNail("170000");
    await expect(page.getByRole("region", { name: "Insight" })).not.toContainText("AOV Nail");
    await setNail("200000");
    const row = page.getByRole("region", { name: "Insight" }).locator("p").filter({ hasText: "AOV Nail 14,5% di bawah target" });
    await expect(row).toBeVisible();
    await expect(row.getByRole("link", { name: "Lihat" })).toHaveAttribute("href", "#aov");
    await row.getByRole("link", { name: "Lihat" }).click();
    await expect(page).toHaveURL(/#aov$/);
  });

  test("E9 · laporan owner bulan data contoh: ringkasan, keuangan, target omzet, PDF & Excel dengan angka sama", async ({ page }, info) => {
    const month = fixtureDay(info).slice(0, 7);
    await login(page, "manager");
    await page.goto("/manajer/analitik");
    await page.fill("#tg-revenue_target_monthly", "1000000");
    await page.getByRole("button", { name: "Simpan target" }).click();
    await expect(toast(page, "Target KPI disimpan")).toBeVisible();
    try {
      await page.goto(`/manajer/analitik/laporan?periode=bulan&nilai=${month}`);
      const rep = page.getByRole("article", { name: "Laporan owner" });
      await expect(rep.getByRole("heading", { level: 1 })).toContainText("Laporan owner");
      const net = rep.getByRole("row", { name: /^Omzet bersih/ }).first();
      await expect(net).toContainText("Rp594.500");
      await expect(net).toContainText("59,5%"); // 594.500 ÷ target 1.000.000
      for (const v of ["Rp71.250", "Rp171.000", "22,7%", "= Omzet bersih", "= Margin kotor"]) await expect(rep).toContainText(v);
      await expect(rep.getByRole("heading", { name: "3. Staf & layanan" })).toBeVisible();

      const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Unduh Excel" }).click()]);
      expect(dl.suggestedFilename()).toMatch(/^laporan-owner-\d{4}-\d{2}-01_\d{4}-\d{2}-\d{2}\.xlsx$/);
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.readFile((await dl.path())!);
      expect(wb.worksheets.map((w) => w.name)).toEqual(["Ringkasan", "Keuangan", "Harian", "Staf", "Layanan & produk", "Pelanggan", "Operasional"]);
      const find = (sheet: string, label: string) => {
        let v: unknown; wb.getWorksheet(sheet)!.eachRow((r) => { if (r.getCell(1).value === label && v === undefined) v = r.getCell(2).value; });
        return v;
      };
      expect(find("Ringkasan", "Omzet bersih")).toBe(594500);
      expect(find("Keuangan", "Omzet bersih")).toBe(594500);
      expect(find("Harian", "Total")).toBeGreaterThan(0);
      let harian = 0; wb.getWorksheet("Harian")!.eachRow((r, i) => { if (i > 3 && r.getCell(1).value !== "Total" && typeof r.getCell(3).value === "number") harian += r.getCell(3).value as number; });
      expect(harian).toBe(594500);

      await page.emulateMedia({ media: "print" });
      expect((await page.pdf({ format: "A4" })).length).toBeGreaterThan(40_000);
    } finally {
      sql("update settings set revenue_target_monthly = 0");
    }
  });
});

test("E4 · kapster mencentang 4 kelompok × 3 tahap di HP → progres manajer realtime → otorisasi → HP terkunci", async ({ page, browser }, info) => {
  test.setTimeout(120_000);
  clearSopToday();
  const g = groups();
  const hp = await newSession(browser, info, "andi", { width: 390, height: 844 });
  await hp.goto("/kapster/sop");
  await login(page, "manager");
  await page.goto("/manajer/sop");
  await expect(page.getByText(`0 dari ${g.length * 3} tahap selesai`)).toBeVisible();

  for (let s = 0; s < 3; s++) await tick(hp, g[0], s);
  await expect(page.getByText(`3 dari ${g.length * 3} tahap selesai`)).toBeVisible(); // realtime di laptop manajer
  for (const name of g.slice(1)) for (let s = 0; s < 3; s++) await tick(hp, name, s);
  await expect(page.getByText(`${g.length * 3} dari ${g.length * 3} tahap selesai`)).toBeVisible();

  await page.getByRole("button", { name: "Otorisasi shift" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Otorisasi" }).click();
  await expect(toast(page, "Checklist diotorisasi")).toBeVisible();
  await expect(hp.getByText(/^Sudah diotorisasi/)).toBeVisible();
  await hp.getByRole("button", { name: new RegExp(`^1\\. Cuci ${g[0]}:`) }).click();
  await expect(hp.getByRole("dialog", { name: "Detail tahap" })).toBeVisible();
  await expect(hp.getByRole("button", { name: "Batalkan" })).toHaveCount(0);
  await hp.context().close();
});

test("E5 · batalkan Rendam tercatat undone_at; batalkan Cuci saat Rendam aktif ditolak", async ({ browser }, info) => {
  clearSopToday();
  const g = groups()[0];
  const hp = await newSession(browser, info, "andi", { width: 390, height: 844 });
  await hp.goto("/kapster/sop");
  await tick(hp, g, 0);
  await tick(hp, g, 1);
  await hp.getByRole("button", { name: new RegExp(`^2\\. Rendam ${g}: selesai`) }).click();
  await hp.getByRole("button", { name: "Batalkan" }).click();
  await expect(toast(hp, "Tahap dibatalkan (tercatat)")).toBeVisible();
  expect(sql<{ n: number }>(`select count(*)::int as n from sop_logs where date = jkt_today() and stage = 'soak' and undone_at is not null`)[0].n).toBe(1);

  await tick(hp, g, 1);
  await hp.getByRole("button", { name: new RegExp(`^1\\. Cuci ${g}: selesai`) }).click();
  const detail = hp.getByRole("dialog", { name: "Detail tahap" });
  await expect(detail).toContainText("Batalkan tahap berikutnya dulu.");
  await expect(detail.getByRole("button", { name: "Batalkan" })).toHaveCount(0);
  const wash = sql<{ id: string }>(`select id from sop_logs where date = jkt_today() and stage = 'wash' and undone_at is null limit 1`)[0].id;
  const { error } = await (await apiAs("andi")).rpc("undo_sop_stage", { p_log_id: wash });
  expect(error?.message).toContain("Batalkan tahap berikutnya dulu");
  await hp.context().close();
});

test("E6 · jam 12:00 tanpa log → notifikasi ke kapster bertugas & manajer", async ({ page }) => {
  clearSopToday();
  sql(`do $$ begin
    delete from notifications where kind = 'sop_reminder';
    insert into appointments (resource_id, staff_id, start_at, duration_min, status)
    select id, '${STAFF.andi}', jkt(jkt_today(), '20:15'), 30, 'booked' from resources where name = 'Kursi Barber 1';
  end $$`);
  const n = sql<{ n: number }>(`select sop_reminders(jkt(jkt_today(), '12:05')) as n`)[0].n;
  expect(n).toBeGreaterThanOrEqual(2);
  const { data } = await (await apiAs("andi")).from("notifications").select("kind").eq("kind", "sop_reminder");
  expect(data?.length).toBe(1);
  await login(page, "manager");
  await page.goto("/manajer");
  await page.getByRole("button", { name: /^Notifikasi, \d+ belum dibaca/ }).click();
  await expect(page.getByRole("dialog", { name: "Notifikasi" })).toContainText("Checklist sterilisasi hari ini belum dimulai");
  sql(`delete from appointments where staff_id = '${STAFF.andi}' and start_at = jkt(jkt_today(), '20:15')`);
});

test("E7 · tugas HVAC terlambat → Beranda & lonceng → manajer tandai selesai → 14 hari lagi → tambah biaya; kapster tidak melihat perawatan", async ({ page, browser }, info) => {
  const name = `HVAC uji ${info.project.name}`;
  sql(`do $$ declare t uuid; begin
    insert into maintenance_tasks (name, interval_days, created_at) values ('${name}', 14, now() - interval '30 days') returning id into t;
    insert into maintenance_logs (task_id, note, vendor, created_at) values (t, 'servis rutin', 'Teknisi AC', now() - interval '16 days');
    perform maintenance_reminders();
  end $$`);
  try {
    await login(page, "manager");
    await page.goto("/manajer");
    await expect(page.getByText(`${name} terlambat 2 hari`)).toBeVisible();
    await page.getByRole("button", { name: /^Notifikasi, \d+ belum dibaca/ }).click();
    await expect(page.getByRole("dialog", { name: "Notifikasi" })).toContainText(`${name} terlambat 2 hari`);

    // perawatan fasilitas khusus manajer: tab SOP kapster hanya checklist sterilisasi
    const hp = await newSession(browser, info, "andi", { width: 390, height: 844 });
    await hp.goto("/kapster/sop");
    await expect(hp.getByRole("heading", { name: /SOP sterilisasi/ })).toBeVisible();
    await expect(hp.getByRole("region", { name: "Perawatan fasilitas" })).toHaveCount(0);
    await hp.context().close();

    await page.goto("/manajer/sop");
    const mcard = page.getByRole("article", { name });
    await expect(mcard).toContainText("Terlambat 2 hari");
    await mcard.getByRole("button", { name: "Tandai selesai" }).click();
    await page.fill("#mt-note", "filter dibersihkan");
    await page.getByRole("button", { name: "Simpan", exact: true }).click();
    await expect(mcard).toContainText("14 hari lagi");
    await mcard.getByText("Riwayat 3 terakhir").click();
    await mcard.getByRole("button", { name: "Tambah biaya" }).first().click();
    await mcard.getByLabel("Biaya servis").fill("350000");
    await mcard.getByRole("button", { name: "Simpan" }).click();
    await expect(toast(page, "Biaya servis dicatat")).toBeVisible();
    await expect(mcard).toContainText("Rp350.000");
  } finally {
    sql(`update maintenance_tasks set active = false where name = '${name}'`);
  }
});

test("E8 · laporan kepatuhan: 30 hari, 27 diotorisasi → 90%; PDF tercetak", async ({ page }, info) => {
  const start = { "laptop-1366": "2025-01-01", "tablet-1024": "2025-03-01", "portrait-820": "2025-05-01" }[info.project.name] ?? "2025-07-01";
  const end = new Date(Date.parse(`${start}T00:00:00Z`) + 29 * 864e5).toISOString().slice(0, 10);
  const ok = new Date(Date.parse(`${start}T00:00:00Z`) + 26 * 864e5).toISOString().slice(0, 10);
  sql(`do $$ begin
    alter table sop_logs disable trigger sop_logs_locked;
    insert into sop_logs (date, shift, group_id, stage, done_by)
    select d::date, 1, g.id, st, '00000000-0000-0000-0002-000000000003' from generate_series(date '${start}', date '${end}', interval '1 day') d
    cross join sop_tool_groups g cross join unnest(array['wash', 'soak', 'autoclave']::sop_stage[]) st where g.active;
    alter table sop_logs enable trigger sop_logs_locked;
    insert into sop_approvals (date, shift, approved_by)
    select d::date, 1, '00000000-0000-0000-0002-000000000001' from generate_series(date '${start}', date '${ok}', interval '1 day') d;
  end $$`);
  await login(page, "manager");
  await page.goto(`/manajer/sop/laporan?dari=${start}&sampai=${end}`);
  const rep = page.getByRole("article");
  await expect(rep).toContainText("Laporan Kepatuhan Sterilisasi & Perawatan");
  await expect(rep).toContainText("% hari patuh90,0%");
  await expect(rep).toContainText("Diotorisasi27");
  await expect(rep).toContainText("Hari operasional30");
  await page.emulateMedia({ media: "print" });
  expect((await page.pdf({ format: "A4" })).length).toBeGreaterThan(20_000);
});
