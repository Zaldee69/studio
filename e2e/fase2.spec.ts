import { expect, test, type Page } from "@playwright/test";
import { formatRupiah, jktDate } from "../src/lib/domain/format";
import { formatUnitCost, newUnitCost } from "../src/lib/domain/inventory";
import { admin, apiAs, login, newSession } from "./helpers";

// Tahap 4 — Inventaris & HPP · SDM & Komisi (E1–E6). Data disiapkan lewat API (kasir asli / service role),
// dicek lewat layar manajer. Tiap tes membersihkan jejaknya supaya proyek viewport berikutnya mulai bersih.
const STAFF = { andi: "00000000-0000-0000-0001-000000000001", rizky: "00000000-0000-0000-0001-000000000002", dimas: "00000000-0000-0000-0001-000000000003", sari: "00000000-0000-0000-0001-000000000004" };
const month = () => jktDate().slice(0, 7);

async function svc(name: string) {
  const { data } = await admin.from("services").select("id").eq("name", name).single();
  return data!.id as string;
}
async function item(name: string) {
  const { data } = await admin.from("stock_levels").select("item_id, qty, unit_cost, reorder_at").eq("name", name).single();
  return { id: data!.item_id as string, qty: Number(data!.qty), cost: Number(data!.unit_cost), reorder: Number(data!.reorder_at) };
}
/** Checkout sebagai kasir sungguhan (RPC checkout, RLS & peran berlaku). */
async function sell(lines: { service: string; staff?: string; upsell?: boolean }[]) {
  const k = await apiAs("cashier");
  const items = await Promise.all(lines.map(async (l) => ({ service_id: await svc(l.service), staff_id: l.staff ?? null, from_upsell: !!l.upsell })));
  const { data, error } = await k.rpc("checkout", { p: { method: "cash", items } });
  if (error) throw new Error(error.message);
  return data as string;
}
async function hppOf(tx: string, name: string) {
  const { data } = await admin.from("transaction_items").select("net_amount, transaction_item_costs(hpp)").eq("transaction_id", tx).eq("name", name).single();
  const c = data!.transaction_item_costs as unknown as { hpp: number } | { hpp: number }[];
  return { net: data!.net_amount as number, hpp: Array.isArray(c) ? c[0].hpp : c.hpp };
}
async function cancelDrafts() {
  await admin.from("stock_opnames").update({ status: "cancelled" }).eq("status", "draft");
}
async function resetPayroll() {
  const m = `${month()}-01`;
  const { data: per } = await admin.from("payroll_periods").select("id").eq("month", m).maybeSingle();
  if (per) { await admin.from("payroll_snapshots").delete().eq("period_id", per.id); await admin.from("payroll_periods").update({ status: "open" }).eq("id", per.id); }
  await admin.from("payroll_adjustments").delete().eq("month", m);
}
const toast = (p: Page, t: string | RegExp) => p.getByRole("status").filter({ hasText: t }).or(p.getByRole("alert").filter({ hasText: t }));

test("E1 · stok masuk 1.000 ml krim @135 → harga pokok rata-rata → HPP Hair Spa baru; transaksi lama tetap HPP lama", async ({ page }) => {
  const tx = await sell([{ service: "Hair Spa", staff: STAFF.dimas }]);
  const old = await hppOf(tx, "Hair Spa");
  const krim = await item("Krim hair spa"), shampoo = await item("Shampoo salon");
  const expected = newUnitCost("weighted_avg", krim.qty, krim.cost, 1000, 135);

  await login(page, "manager");
  await page.goto("/manajer/inventaris");
  await page.getByRole("button", { name: "+ Stok masuk" }).first().click();
  await page.selectOption("#si-item", krim.id);
  await page.fill("#si-qty", "1000");
  await page.fill("#si-price", "135");
  await expect(page.getByRole("dialog", { name: "Stok masuk" }).getByRole("status")).toContainText(`harga pokok ${formatUnitCost(krim.cost)} → ${formatUnitCost(expected)}`);
  await page.getByRole("button", { name: "Simpan stok masuk" }).click();
  await expect(toast(page, "Stok Krim hair spa +1.000 ml")).toBeVisible();
  await expect.poll(async () => (await item("Krim hair spa")).cost).toBe(expected);

  await page.goto("/manajer/inventaris?tab=resep");
  await page.getByRole("navigation", { name: "Layanan" }).getByRole("button", { name: /^Hair Spa/ }).click();
  const newHpp = Math.round(20 * shampoo.cost + 40 * expected);
  await expect(page.getByRole("complementary", { name: "Ringkasan margin" })).toContainText(`HPP bahan${formatRupiah(newHpp)}`);
  expect(newHpp).not.toBe(old.hpp);

  await page.goto("/manajer/sdm");
  await page.getByRole("button", { name: /^Dimas/ }).click();
  await expect(page.getByRole("dialog", { name: "Detail staf" })).toContainText(`net ${formatRupiah(old.net)} · HPP ${formatRupiah(old.hpp)}`);
});

test("E2 · checkout 3× Potong → neck strip lewat ambang → banner & lonceng realtime → daftar belanja → pesan WA", async ({ page }) => {
  await admin.from("notifications").update({ read_at: new Date().toISOString() }).eq("kind", "low_stock").is("read_at", null);
  const { data: sup } = await admin.from("suppliers").insert({ name: `Pemasok Uji ${Date.now() % 10000}`, whatsapp: "081200001111" }).select("id, name").single();
  const neck = await item("Neck strip");
  await admin.from("inventory_items").update({ reorder_at: neck.qty - 3, supplier_id: sup!.id }).eq("id", neck.id);
  try {
    await login(page, "manager");
    await page.goto("/manajer/inventaris");
    await expect(page.getByRole("button", { name: /^Neck strip ·/ })).toHaveCount(0);
    for (let i = 0; i < 3; i++) await sell([{ service: "Potong Rambut", staff: STAFF.andi }]);

    await expect(page.getByRole("button", { name: `Neck strip · ${neck.qty - 3} / ${neck.qty - 3} pcs` })).toBeVisible(); // banner, tanpa reload
    await page.getByRole("button", { name: /^Notifikasi, \d+ belum dibaca/ }).click();
    await expect(page.getByRole("dialog", { name: "Notifikasi" })).toContainText("Stok Neck strip tinggal");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: /^Notifikasi/ }).click();

    await page.getByRole("button", { name: "Daftar belanja" }).click();
    const list = page.getByRole("dialog", { name: "Daftar belanja" });
    const group = list.locator("section").filter({ hasText: sup!.name });
    const suggest = 2 * (neck.qty - 3) - (neck.qty - 3);
    await expect(group.getByLabel("Jumlah beli Neck strip")).toHaveValue(String(suggest));
    const href = decodeURIComponent((await group.getByRole("link", { name: "Kirim via WhatsApp" }).getAttribute("href"))!);
    expect(href).toContain("wa.me/6281200001111");
    expect(href).toContain(`- Neck strip ${new Intl.NumberFormat("id-ID").format(suggest)} pcs`);
    expect(href).toContain(`Halo ${sup!.name}, kami dari Groom & Bloom mau pesan:`);
  } finally {
    await admin.from("inventory_items").update({ reorder_at: 100, supplier_id: null }).eq("id", neck.id);
    await admin.from("suppliers").delete().eq("id", sup!.id);
  }
});

test("E3 · opname HPP: kasir mengisi separuh di tablet → manajer melanjutkan di laptop → setujui → stok = hitungan fisik", async ({ page, browser }, info) => {
  await cancelDrafts();
  await login(page, "cashier");
  await page.goto("/kasir/opname");
  await page.selectOption("#op-scope", "consumable");
  await page.getByRole("button", { name: "Mulai opname" }).click();
  await page.waitForURL(/\/kasir\/opname\/[0-9a-f-]{36}$/);
  const id = page.url().split("/").pop()!;
  const { data: lines } = await admin.from("stock_opname_lines").select("system_qty, item:inventory_items(name)").eq("opname_id", id);
  const sys = Object.fromEntries((lines ?? []).map((l) => [(l.item as unknown as { name: string }).name, Number(l.system_qty)]));

  await page.getByLabel("Hitungan fisik Neck strip").fill(String(sys["Neck strip"] - 3));
  await page.getByLabel("Hitungan fisik Callus remover").fill(String(sys["Callus remover"]));
  await page.getByLabel("Hitungan fisik Cat rambut").fill(String(sys["Cat rambut"]));
  await page.getByRole("button", { name: "Simpan sebagian" }).click();
  await expect(toast(page, "3 hitungan tersimpan")).toBeVisible();

  const mgr = await newSession(browser, info, "manager");
  await mgr.goto("/manajer/inventaris?tab=opname");
  await mgr.getByRole("link", { name: /Lanjutkan/ }).click();
  await expect(mgr.getByLabel("Hitungan fisik Neck strip")).toHaveValue(String(sys["Neck strip"] - 3)); // hitungan kasir terlihat di perangkat lain
  await mgr.getByLabel("Hitungan fisik Remover").fill(String(sys["Remover"]));
  mgr.once("dialog", (d) => d.accept());
  await mgr.getByRole("button", { name: "Setujui opname" }).click();
  await mgr.waitForURL(/tab=opname/);

  const neck = await item("Neck strip");
  expect(neck.qty).toBe(sys["Neck strip"] - 3);
  const { data: mv } = await admin.from("stock_moves").select("qty").eq("opname_id", id);
  expect((mv ?? []).map((m) => Number(m.qty))).toEqual([-3]);
  await mgr.goto(`/manajer/inventaris?tab=mutasi&item=${neck.id}&type=opname`);
  await expect(mgr.getByRole("row").filter({ hasText: "Opname" }).filter({ hasText: "−3 pcs" }).first()).toBeVisible();
  await mgr.context().close();
});

test("E4 · laporan pemakaian: dua opname + 2× Hair Spa di antaranya → teoretis 80, aktual 100 (+25%) ditandai", async ({ page }) => {
  await cancelDrafts();
  const m = await apiAs("manager");
  const krim = await item("Krim hair spa");
  const { data: o1 } = await m.rpc("opname_start", { p_scope: "consumable" });
  await m.rpc("opname_save_counts", { p_opname_id: o1, p_lines: [{ item_id: krim.id, counted_qty: krim.qty }] });
  await m.rpc("opname_approve", { p_opname_id: o1 });
  await sell([{ service: "Hair Spa", staff: STAFF.rizky }, { service: "Hair Spa", staff: STAFF.rizky }]);
  const { data: o2 } = await m.rpc("opname_start", { p_scope: "consumable" });
  await m.rpc("opname_save_counts", { p_opname_id: o2, p_lines: [{ item_id: krim.id, counted_qty: krim.qty - 80 - 20 }] });
  const { error } = await m.rpc("opname_approve", { p_opname_id: o2 });
  expect(error).toBeNull();

  await login(page, "manager");
  await page.goto("/manajer/inventaris?tab=laporan");
  const row = page.getByRole("row").filter({ hasText: "Krim hair spa" });
  await expect(row).toContainText("80 ml");
  await expect(row).toContainText("100 ml");
  await expect(row).toContainText("+25%");
  await expect(row).toContainText("Di atas 10%");
  await expect(page.getByRole("row").filter({ hasText: "Shampoo salon" })).not.toContainText("Di atas");
});

test("E5 · komisi bundle → bonus Andi → tutup periode → slip 1.300.000 dibayar → Final di HP → void ditolak → buka ulang → void → tutup lagi", async ({ page, browser }, info) => {
  await resetPayroll();
  try {
    const tx = await sell([{ service: "Potong Rambut", staff: STAFF.andi }, { service: "Gel Polish Tangan", staff: STAFF.sari }]);
    const potong = await hppOf(tx, "Potong Rambut"), gel = await hppOf(tx, "Gel Polish Tangan");
    expect([potong.net, gel.net]).toEqual([67500, 162000]); // diskon 25.500 → 7.500 / 18.000
    const andi = Math.round((67500 - potong.hpp) * 0.4), sari = Math.round((162000 - gel.hpp) * 0.4);
    expect(sari).toBe(60000);

    await login(page, "manager");
    await page.goto("/manajer/sdm");
    await page.getByRole("button", { name: /^Sari/ }).click();
    await expect(page.getByRole("dialog", { name: "Detail staf" })).toContainText(`Gel Polish Tangan${formatRupiah(sari)}`);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: /^Andi/ }).click();
    const drawer = page.getByRole("dialog", { name: "Detail staf" });
    await expect(drawer).toContainText(`Potong Rambut${formatRupiah(andi)}`);
    await page.selectOption("#pa-kind", "bonus");
    await page.fill("#pa-amount", "100000");
    await page.fill("#pa-reason", "Target tercapai");
    await page.getByRole("button", { name: "Tambah bonus/potongan" }).click();
    await expect(toast(page, "Penyesuaian dicatat")).toBeVisible();
    await expect(drawer).toContainText("Target tercapai+Rp100.000");
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "Tutup periode" }).click();
    await page.getByRole("button", { name: "Tutup & bekukan angka" }).click();
    await expect(page.getByText(/^Ditutup /)).toBeVisible();
    const andiRow = page.getByRole("row").filter({ has: page.getByRole("button", { name: /^Andi/ }) });
    await expect(andiRow).toContainText("Rp1.300.000");
    await andiRow.getByRole("link", { name: /Slip/ }).click();
    await expect(page.getByRole("article")).toContainText("Total dibayarRp1.300.000");
    await page.getByRole("button", { name: "Tandai sudah dibayar" }).click();
    await page.getByRole("button", { name: "Simpan" }).click();
    await expect(page.getByRole("article")).toContainText("Status: dibayar");

    const hp = await newSession(browser, info, "andi", { width: 390, height: 844 });
    await hp.goto("/kapster/komisi");
    await expect(hp.getByText(/^Final · dibayar/)).toBeVisible();
    await expect(hp.getByText("Rp1.300.000")).toBeVisible();
    await hp.context().close();

    await page.goto(`/manajer/kasir?tab=riwayat&tx=${tx}`);
    await page.getByRole("button", { name: "Batalkan transaksi (void)" }).click();
    await page.fill("#void-reason", "Salah input");
    await page.getByRole("button", { name: "Void transaksi" }).click();
    await expect(toast(page, "sudah ditutup. Buka ulang dulu.")).toBeVisible();

    await page.goto(`/manajer/sdm?bulan=${month()}`);
    await page.getByRole("button", { name: "Buka ulang" }).click();
    await page.fill("#ro-reason", "Koreksi transaksi salah input");
    await page.getByRole("dialog", { name: "Buka ulang periode" }).getByRole("button", { name: "Buka ulang" }).click();
    await expect(page.getByText("Bulan berjalan")).toBeVisible();

    const before = await (await apiAs("manager")).rpc("commission_for_period", { p_month: `${month()}-01`, p_staff_id: STAFF.andi });
    await page.goto(`/manajer/kasir?tab=riwayat&tx=${tx}`);
    await page.getByRole("button", { name: "Batalkan transaksi (void)" }).click();
    await page.fill("#void-reason", "Salah input");
    await page.getByRole("button", { name: "Void transaksi" }).click();
    await expect(page.getByRole("dialog", { name: "Struk transaksi" })).toContainText("DIBATALKAN (void)");

    await page.goto(`/manajer/sdm?bulan=${month()}`);
    await page.getByRole("button", { name: "Tutup periode" }).click();
    await page.getByRole("button", { name: "Tutup & bekukan angka" }).click();
    await expect(page.getByText(/^Ditutup /)).toBeVisible();
    const after = await (await apiAs("manager")).rpc("commission_for_period", { p_month: `${month()}-01`, p_staff_id: STAFF.andi });
    expect(after.data![0].closed).toBe(true);
    expect(after.data![0].commission_service).toBe(before.data![0].commission_service - andi);
    await expect(andiRow).toContainText(formatRupiah(after.data![0].commission_service));
  } finally {
    await resetPayroll();
  }
});

test("E6 · kasir menambah Hair Spa dari saran upsell → tingkat upsell Rizky di evaluasi tahunan naik", async ({ page, browser }, info) => {
  const year = Number(jktDate().slice(0, 4));
  const rate = async () => {
    const { data } = await (await apiAs("manager")).rpc("staff_annual_review", { p_year: year });
    return Number((data as { staff_id: string; upsell_rate: number }[]).find((r) => r.staff_id === STAFF.rizky)!.upsell_rate);
  };
  const before = await rate();

  await login(page, "cashier");
  await page.goto("/kasir/kasir");
  await page.getByRole("button", { name: /^Tambah Potong Rambut/ }).click();
  await page.getByLabel("Kapster untuk Potong Rambut").selectOption({ label: "Rizky" });
  await page.getByRole("button", { name: "Tambah", exact: true }).click(); // saran upsell: Hair Spa
  await expect(page.getByLabel("Kapster untuk Hair Spa")).toHaveValue(STAFF.rizky);
  await page.getByRole("button", { name: /Catat pembayaran/ }).click();
  await expect(page.getByRole("heading", { name: "Pembayaran tercatat" })).toBeVisible();

  const after = await rate();
  expect(after).toBeGreaterThan(before);
  const mgr = await newSession(browser, info, "manager");
  await mgr.goto("/manajer/sdm?tab=evaluasi");
  await expect(mgr.getByRole("row").filter({ hasText: "Rizky" })).toContainText(`${after.toLocaleString("id-ID")}%`);
  await mgr.context().close();
});
