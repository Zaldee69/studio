import ExcelJS from "exceljs";
import type { NextRequest } from "next/server";
import { loadOwnerReport } from "@/features/analitik/owner";
import { CAT_NAME, change, SUMMARY_ROWS, WEEKDAY, type RowKind } from "@/features/analitik/owner-rows";
import { requireRole } from "@/lib/auth";
import { log } from "@/lib/log";
import { attainment, marginPct } from "@/lib/domain/owner";

// Laporan owner → .xlsx (satu sheet per bagian). Angka sama persis dengan halaman PDF (owner_report()).
const FMT: Record<RowKind | "delta" | "poin", string> = {
  money: '"Rp"#,##0;-"Rp"#,##0', int: "#,##0", pct: '0.0"%"', delta: '+0.0"%";-0.0"%";0.0"%"', poin: '+0.0" poin";-0.0" poin";0.0" poin"',
};

function sheet(wb: ExcelJS.Workbook, name: string, title: string, sub: string) {
  const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 3 }], pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  ws.addRow([title]).font = { bold: true, size: 14 };
  ws.addRow([sub]).font = { color: { argb: "FF6B665C" } };
  return ws;
}
/** Tabel: baris judul tebal + baris data; fmts = format angka per kolom (null = teks). Mengembalikan nomor baris data pertama. */
function table(ws: ExcelJS.Worksheet, headers: string[], rows: (string | number | null)[][], fmts: (string | null)[]) {
  const h = ws.addRow(headers);
  const first = h.number + 1;
  h.font = { bold: true };
  h.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEDEAE3" } }; c.border = { bottom: { style: "thin" } }; });
  for (const r of rows) {
    const row = ws.addRow(r);
    fmts.forEach((f, i) => { if (f) row.getCell(i + 1).numFmt = f; });
  }
  ws.addRow([]);
  return first;
}
const widths = (ws: ExcelJS.Worksheet, w: number[]) => w.forEach((x, i) => { ws.getColumn(i + 1).width = x; });

export async function GET(req: NextRequest) {
  await requireRole("manager");
  const sp = req.nextUrl.searchParams;
  const q = { periode: sp.get("periode") ?? undefined, nilai: sp.get("nilai") ?? undefined, dari: sp.get("dari") ?? undefined, sampai: sp.get("sampai") ?? undefined, bulan: sp.get("bulan") ?? undefined };
  const { p, r, shop } = await loadOwnerReport(q);
  const s = r.summary, f = r.finance, t = r.targets;
  const sub = `${shop.name} · ${p.from} s.d. ${p.to} · dibanding ${p.previous.label}${p.sameCompare ? "" : ` & ${p.lastYear.label}`} · dibuat ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`;

  const wb = new ExcelJS.Workbook();
  wb.creator = shop.name; wb.created = new Date();

  // 1. Ringkasan
  let ws = sheet(wb, "Ringkasan", `Laporan owner · ${p.label}`, sub);
  const ly = !p.sameCompare; // laporan tahunan: "sebelumnya" = "tahun lalu" → satu kolom pembanding
  const r0 = table(ws, ["Metrik", p.label, p.previous.label, "Perubahan", ...(ly ? [p.lastYear.label, "Perubahan"] : []), "Target", "Capaian"],
    SUMMARY_ROWS.map((row) => {
      const cur = s[row.key] as number | null, prev = r.previous[row.key] as number | null, last = r.last_year[row.key] as number | null;
      const target = row.target?.(t) ?? null;
      return [row.label, cur, prev, change(row.kind, cur, prev).value, ...(ly ? [last, change(row.kind, cur, last).value] : []), target, attainment(cur, target)];
    }), []);
  // format per baris (jenis metrik berbeda-beda)
  SUMMARY_ROWS.forEach((row, i) => {
    const x = ws.getRow(r0 + i);
    for (const c of ly ? [2, 3, 5, 7] : [2, 3, 5]) x.getCell(c).numFmt = FMT[row.kind];
    for (const c of ly ? [4, 6] : [4]) x.getCell(c).numFmt = row.kind === "pct" ? FMT.poin : FMT.delta;
    x.getCell(ly ? 8 : 6).numFmt = FMT.pct;
  });
  if (r.insights.length) table(ws, ["Insight"], r.insights.map((i) => [i.message]), [null]);
  widths(ws, [32, 16, 16, 12, 16, 12, 16, 11]);

  // 2. Keuangan
  ws = sheet(wb, "Keuangan", "Keuangan", sub);
  const payroll = r.payroll.complete ? r.payroll.total_pay : null;
  const k0 = table(ws, ["Laba kotor", "Rp"], [
    ["Omzet kotor (harga normal)", f.gross], ["Diskon (paket barbershop + nail)", -f.discount], ["Omzet bersih", f.net],
    ["HPP bahan & barang", -f.hpp], ["Margin kotor", f.net - f.hpp], ["Margin kotor %", marginPct(f.net, f.hpp)],
    ["Gaji & komisi staf", payroll == null ? "hanya untuk bulan/kuartal/tahun penuh" : -payroll],
    ["Kontribusi setelah gaji", payroll == null ? null : f.net - f.hpp - payroll],
    ["Biaya perawatan fasilitas (dicatat)", f.maintenance_cost],
  ], [null, FMT.money]);
  ws.getRow(k0 + 5).getCell(2).numFmt = FMT.pct; // baris "Margin kotor %"
  table(ws, ["Uang masuk", "Rp"], [
    ["Tunai (transaksi)", f.payments.cash], ["QRIS (transaksi)", f.payments.qris], [`Top-up deposit (${f.deposit.topup_count}×)`, f.deposit.topup_paid],
    ["Total uang masuk", f.payments.cash + f.payments.qris + f.deposit.topup_paid], ["Dibayar pakai saldo deposit", f.payments.deposit],
    [`Void (${f.void_count} transaksi)`, f.void_amount],
  ], [null, FMT.money]);
  table(ws, ["Deposit pelanggan", "Rp"], [
    ["Top-up dibayar", f.deposit.topup_paid], ["  tunai", f.deposit.topup_cash], ["  QRIS", f.deposit.topup_qris],
    ["Saldo dikreditkan", f.deposit.topup_credited], ["Bonus diberikan", f.deposit.bonus], ["Saldo terpakai", f.deposit.used],
    [`Saldo pelanggan per ${p.to} (kewajiban)`, f.deposit.balance_end],
  ], [null, FMT.money]);
  table(ws, ["Kategori", "Item", "Omzet kotor", "Diskon", "Omzet bersih", "HPP", "Margin", "Margin %"],
    f.by_category.map((c) => [CAT_NAME[c.category], c.items, c.gross, c.discount, c.net, c.hpp, c.margin, marginPct(c.net, c.hpp)]),
    [null, FMT.int, FMT.money, FMT.money, FMT.money, FMT.money, FMT.money, FMT.pct]);
  if (r.payroll.months.length) table(ws, ["Gaji & komisi per bulan", "Rp", "Status"],
    r.payroll.months.map((x) => [x.month.slice(0, 7), x.total_pay, x.closed ? "ditutup" : "berjalan"]), [null, FMT.money, null]);
  widths(ws, [40, 18, 16, 14, 16, 14, 14, 11]);

  // 3. Harian
  ws = sheet(wb, "Harian", "Rincian harian", sub);
  table(ws, ["Tanggal", "Transaksi", "Omzet bersih", "Barbershop", "Nail & Spa", "Ritel", "Diskon", "HPP", "Margin", "Void", "Tunai", "QRIS", "Deposit"],
    r.daily.map((x) => [x.day, x.tx, x.net, x.barbershop, x.nail, x.retail, x.discount, x.hpp, x.net - x.hpp, x.void, x.cash, x.qris, x.deposit]),
    [null, FMT.int, FMT.money, FMT.money, FMT.money, FMT.money, FMT.money, FMT.money, FMT.money, FMT.int, FMT.money, FMT.money, FMT.money]);
  const tot = (k: keyof (typeof r.daily)[number]) => r.daily.reduce((a, x) => a + (x[k] as number), 0);
  const total = ws.getRow(ws.rowCount); // baris kosong setelah tabel → jadi baris total
  total.values = ["Total", tot("tx"), tot("net"), tot("barbershop"), tot("nail"), tot("retail"), tot("discount"), tot("hpp"), tot("net") - tot("hpp"), tot("void"), tot("cash"), tot("qris"), tot("deposit")];
  total.font = { bold: true };
  [FMT.int, FMT.money, FMT.money, FMT.money, FMT.money, FMT.money, FMT.money, FMT.money, FMT.int, FMT.money, FMT.money, FMT.money].forEach((x, i) => { total.getCell(i + 2).numFmt = x; });
  widths(ws, [12, 10, 15, 14, 14, 13, 12, 13, 14, 7, 14, 14, 13]);

  // 4. Staf
  ws = sheet(wb, "Staf", "Kinerja staf", sub);
  table(ws, ["Staf", "Kategori", "Transaksi", "Omzet", "Jasa", "Ritel", "AOV", "Upsell %", "Utilisasi %", "HPP", "Dilayani", "No-show", "Gaji & komisi"],
    r.staff.map((x) => [x.name + (x.active ? "" : " (nonaktif)"), x.category === "nail" ? "Nail & Spa" : "Barbershop", x.tx, x.revenue, x.service_revenue,
      x.retail_revenue, x.aov, x.upsell_rate, x.utilization, x.hpp, x.served, x.no_show, r.payroll.by_staff[x.staff_id] ?? null]),
    [null, null, FMT.int, FMT.money, FMT.money, FMT.money, FMT.money, FMT.pct, FMT.pct, FMT.money, FMT.int, FMT.int, FMT.money]);
  widths(ws, [20, 12, 10, 15, 15, 13, 13, 10, 11, 13, 10, 9, 15]);

  // 5. Layanan & produk
  ws = sheet(wb, "Layanan & produk", "Layanan & produk", sub);
  table(ws, ["Nama", "Kategori", "Qty", "Omzet bersih", "HPP", "Margin", "Margin %"],
    r.services.map((x) => [x.name, CAT_NAME[x.category], x.qty, x.revenue, x.hpp, x.margin, x.margin_pct]),
    [null, null, FMT.int, FMT.money, FMT.money, FMT.money, FMT.pct]);
  widths(ws, [30, 13, 8, 15, 13, 14, 10]);

  // 6. Pelanggan
  ws = sheet(wb, "Pelanggan", "Pelanggan & booking", sub);
  const c = r.customers, o = r.online;
  table(ws, ["Metrik", "Nilai"], [
    ["Pelanggan baru", c.new_customers], ["Pelanggan kembali", c.returning], [`Tingkat kembali ≤ ${c.window_days} hari (%)`, c.return_rate],
    ["Belum kembali (churn, saat ini)", c.churn_count], ["Follow-up dikirim", c.followup_sent], ["Follow-up berhasil", c.followup_converted],
    ["Kunjungan landing", o.landing], ["Buka halaman booking", o.booking_open], ["Booking online dibuat", o.booked],
    ["Porsi booking online (%)", o.share_online], ["Pembatalan online (%)", o.cancel_rate], ["No-show (%)", o.no_show_rate], ["No-show (jumlah)", o.no_show],
  ], [null, "#,##0.0"]);
  table(ws, ["Pelanggan teratas", "Kunjungan", "Belanja", "Saldo deposit"], c.top.map((x) => [x.name, x.visits, x.spend, x.deposit_balance]), [null, FMT.int, FMT.money, FMT.money]);
  widths(ws, [36, 14, 15, 15]);

  // 7. Operasional
  ws = sheet(wb, "Operasional", "Operasional & kepatuhan", sub);
  table(ws, ["Kursi / meja", "Kategori", "Utilisasi %", "Jam terjual", "Jam tersedia"],
    r.operations.utilization.map((u) => [u.name, u.type === "nail" ? "Nail & Spa" : "Barbershop", u.pct, u.sold_minutes / 60, u.available_minutes / 60]),
    [null, null, FMT.pct, "#,##0.0", "#,##0.0"]);
  table(ws, ["Jam tersibuk", "Menit terjual rata-rata"], r.operations.peak_hours.map((h) => [`${WEEKDAY[h.weekday]} ${String(h.hour).padStart(2, "0")}.00`, h.minutes_avg]), [null, "#,##0"]);
  const inv = r.operations.inventory;
  const o0 = table(ws, ["Kepatuhan & stok", "Nilai"], [
    ["Kepatuhan SOP (%)", r.operations.sop.compliance_pct], ["Hari patuh / hari operasional", `${r.operations.sop.ok} / ${r.operations.sop.operational}`],
    ["Perawatan selesai", r.operations.maintenance_done], ["Perawatan terlambat (saat ini)", r.operations.maintenance_overdue_now],
    ["Biaya perawatan", f.maintenance_cost], ["Nilai stok akhir periode", inv.value_end], ["  bahan habis pakai", inv.value_consumable], ["  barang ritel", inv.value_retail],
    ["Stok masuk (nilai)", inv.in_value], ["Stok terpakai & terjual (nilai)", inv.out_value], ["Penyesuaian opname (nilai)", inv.adjust_value],
    ["Stok menipis (saat ini)", inv.low_stock_now], ["Opname disetujui di periode", inv.opnames],
    ["Bahan dengan selisih pemakaian ditandai", inv.opnames >= 2 ? inv.usage_flagged : "butuh ≥ 2 opname"], ["Nilai selisih pemakaian", inv.opnames >= 2 ? inv.usage_variance_value : null],
  ], [null, "#,##0.0"]);
  for (const i of [4, 5, 6, 7, 8, 9, 10, 14]) ws.getRow(o0 + i).getCell(2).numFmt = FMT.money; // baris rupiah
  widths(ws, [40, 16, 12, 13, 13]);
  ws.addRow(["Nilai stok memakai harga pokok rata-rata saat ini. Kontribusi belum dikurangi biaya tetap yang tidak dicatat aplikasi."]).font = { italic: true, color: { argb: "FF6B665C" } };

  const buf = await wb.xlsx.writeBuffer();
  log("info", "owner_report_excel", { from: p.from, to: p.to });
  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="laporan-owner-${p.from}_${p.to}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
