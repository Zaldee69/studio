import { describe, expect, it } from "vitest";
import { bundleHint, calcCart, quickCash, type CartLine } from "./cart";
import { dailySummary } from "./closing";
import { parseCsv, previewImport } from "./csv";
import { cashChange, receiptText } from "./receipt";
import { conflictingIds, findConflicts, jktMinutes, nextQuarter } from "./schedule";
import { nextStatus } from "./status";

const cut: CartLine = { serviceId: "cut", name: "Potong Rambut", category: "barbershop", price: 75000, appointmentId: "a1", staffId: "andi" };
const pedi: CartLine = { serviceId: "pedi", name: "Pedicure Basic", category: "nail", price: 120000, appointmentId: "a2", staffId: "sari" };
const pomade: CartLine = { serviceId: "pom", name: "Pomade Matte", category: "retail", price: 110000 };

describe("kasir (cermin checkout SQL)", () => {
  it("bundle + deposit sebagian → sisa QRIS", () => {
    const r = calcCart([cut, pedi], { bundlePct: 10, method: "qris", useDeposit: true, depositBalance: 100000 });
    expect(r).toMatchObject({ subtotal: 195000, discount: 19500, total: 175500, depositUsed: 100000, paid: 75500, paymentMethod: "deposit_qris" });
    expect(r.shares).toEqual([7500, 12000]);
  });
  it("hanya ritel: tanpa diskon, tanpa petunjuk bundle", () => {
    const r = calcCart([pomade, pomade], { bundlePct: 10, method: "cash" });
    expect(r).toMatchObject({ discount: 0, total: 220000, shares: [0, 0] });
    expect(bundleHint([pomade])).toBeNull();
  });
  it("dua booking digabung (pasangan) → satu tagihan dengan diskon, staf per item tetap", () => {
    const lines = [cut, pedi, pomade];
    const r = calcCart(lines, { bundlePct: 15, method: "cash" });
    expect(r.discount).toBe(29300); // 195.000 × 15% = 29.250 → 29.300
    expect(r.shares.reduce((a, b) => a + b, 0)).toBe(r.discount);
    expect(new Set(lines.map((l) => l.appointmentId).filter(Boolean)).size).toBe(2);
    expect(bundleHint([cut])).toBe("nail");
  });
  it("kembalian & nominal cepat", () => {
    expect(cashChange(95000, 100000)).toBe(5000);
    expect(cashChange(95000, null)).toBeNull();
    expect(quickCash(95000).map((q) => q.value)).toEqual([95000, 100000, 200000]);
    expect(quickCash(40000).map((q) => q.label)).toEqual(["Uang pas", "50rb", "100rb", "200rb"]);
    expect(quickCash(247500).map((q) => q.value)).toEqual([247500, 250000, 300000, 400000]);
  });
  it("void tidak dihitung di rekap; kas diharapkan = tunai jual + tunai top-up", () => {
    const s = dailySummary([
      { total: 95000, paid_amount: 95000, deposit_used: 0, discount_amount: 0, payment_method: "cash", voided_at: null },
      { total: 175500, paid_amount: 75500, deposit_used: 100000, discount_amount: 19500, payment_method: "deposit_cash", voided_at: null },
      { total: 110000, paid_amount: 110000, deposit_used: 0, discount_amount: 0, payment_method: "qris", voided_at: null },
      { total: 999000, paid_amount: 999000, deposit_used: 0, discount_amount: 0, payment_method: "cash", voided_at: "2026-09-30T10:00:00Z" },
    ], [{ amount_paid: 500000, amount_credited: 550000, method: "cash" }, { amount_paid: 1000000, amount_credited: 1125000, method: "qris" }]);
    expect(s).toMatchObject({ txCount: 3, cashSales: 170500, qrisSales: 110000, depositUsed: 100000, topupCash: 500000,
      topupQris: 1000000, expectedCash: 670500, discountTotal: 19500, voidedCount: 1 });
  });
  it("struk WA memuat diskon, deposit, kembalian", () => {
    const t = receiptText({ shop: "D'Pras Barbershop", when: "Rabu, 30 Sep 2026 10.00", customer: "Rina",
      items: [{ name: "Potong Rambut", price: 75000 }], subtotal: 75000, discount: 0, discountLabel: "", depositUsed: 25000,
      paid: 50000, method: "deposit_cash", cashReceived: 100000, balanceAfter: 0 });
    expect(t).toContain("Dibayar (Deposit + Tunai): Rp50.000");
    expect(t).toContain("Kembalian: Rp50.000");
    expect(t).toContain("Saldo deposit: −Rp25.000");
  });
});

describe("jadwal", () => {
  const a = (id: string, res: string, staff: string, s: string, e: string, status = "booked") =>
    ({ id, resource_id: res, staff_id: staff, start_at: `2026-09-30T${s}:00+07:00`, end_at: `2026-09-30T${e}:00+07:00`, status });
  const appts = [a("1", "r1", "andi", "10:00", "10:45"), a("2", "r2", "sari", "10:30", "11:30"), a("3", "r1", "rizky", "10:30", "11:00"),
    a("4", "r1", "andi", "12:00", "13:00", "cancelled")];
  it("bentrok = resource sama ATAU staf sama; batal diabaikan; diri sendiri diabaikan", () => {
    const d = (res: string, staff: string, s: string, e: string, excludeId?: string) =>
      findConflicts(appts, { resourceId: res, staffId: staff, start: `2026-09-30T${s}:00+07:00`, end: `2026-09-30T${e}:00+07:00`, excludeId }).map((x) => x.id);
    expect(d("r3", "andi", "10:15", "10:30")).toEqual(["1"]);        // staf sama
    expect(d("r2", "dimas", "11:00", "11:15")).toEqual(["2"]);       // resource sama
    expect(d("r1", "dimas", "12:00", "13:00")).toEqual([]);          // yang batal diabaikan
    expect(d("r1", "andi", "10:00", "10:45", "1")).toEqual(["3"]);   // edit: kecualikan diri
    expect([...conflictingIds(appts)].sort()).toEqual(["1", "3"]);
  });
  it("tidak datang (no_show) membebaskan slot; jeda antar-booking memperlebar bentrok", () => {
    const list = [a("5", "r4", "maya", "14:00", "14:45", "no_show"), a("6", "r5", "dewi", "15:00", "15:45")];
    const at = (s: string) => `2026-09-30T${s}:00+07:00`;
    expect(findConflicts(list, { resourceId: "r4", staffId: "maya", start: at("14:05"), end: at("14:50") })).toEqual([]);
    expect(conflictingIds([...list, a("7", "r4", "maya", "14:05", "14:50")]).size).toBe(0);
    expect(findConflicts(list, { resourceId: "r5", staffId: "x", start: at("15:45"), end: at("16:30") })).toEqual([]);
    expect(findConflicts(list, { resourceId: "r5", staffId: "x", start: at("15:45"), end: at("16:30"), bufferMin: 15 }).map((x) => x.id)).toEqual(["6"]);
  });
  it("menit Jakarta & pembulatan 15 menit", () => {
    expect(jktMinutes("2026-09-30T03:07:00Z")).toBe(10 * 60 + 7);
    expect(nextQuarter(607, 540, 1260)).toBe(615);
    expect(nextQuarter(100, 540, 1260)).toBe(540);
    expect(nextStatus("arrived")).toBe("in_service");
  });
});

describe("impor CSV", () => {
  it("parse ; dan kutip, pratinjau valid/duplikat/error", () => {
    const rows = parseCsv('﻿Nama;WhatsApp;Catatan\n"Budi, S";0812-1111-2222;"clipper ""#2"""\nRina;081311112222;\n;0812;\nDobel;+62 812 1111 2222;\n');
    expect(rows[1]).toEqual(["Budi, S", "0812-1111-2222", 'clipper "#2"']);
    const p = previewImport(rows, new Set(["6281311112222"]));
    expect(p.map((r) => r.status)).toEqual(["valid", "duplicate", "error", "duplicate"]);
    expect(p[0]).toMatchObject({ wa: "6281211112222", row: 2 });
  });
});
