import { describe, expect, it } from "vitest";
import type { OwnerExtra, OwnerReport } from "../../features/analitik/owner";
import { ownerFinanceView } from "./owner-finance";

// Audit KPI-4 (1 Nov): laba/rugi laporan owner dijaga test (dulu dihitung di TypeScript tanpa test).
const report = (complete: boolean, totalPay = 0) => ({
  payroll: { complete, total_pay: totalPay },
  finance: {
    net: 1_000_000, hpp: 50_000, maintenance_cost: 30_000, expenses_total: 170_000,
    expenses_by_category: [{ category: "kasbon", amount: 50_000 }, { category: "listrik_air", amount: 100_000 }, { category: "pemasaran", amount: 20_000 }],
    payments: { cash: 300_000, qris: 600_000, transfer: 100_000 }, deposit: { topup_paid: 50_000 },
  },
}) as unknown as OwnerReport;
const extra = { commission_est: 400_000, subsidy_est: 100_000, base_salary_est: 700_000, commission_weekly_paid: 200_000,
  stock_purchases: 40_000, payroll_paid: 0 } as unknown as OwnerExtra;

describe("laba/rugi laporan owner", () => {
  it("periode mingguan: upah = komisi + jaring harian + gaji pokok prorata; kasbon bukan biaya", () => {
    const v = ownerFinanceView(report(false), extra, true);
    expect(v.kasbon).toBe(50_000);
    expect(v.opex).toBe(150_000); // 170.000 − kasbon 50.000 + perawatan 30.000
    expect(v.labor).toBe(1_200_000);
    expect(v.contribution).toBe(-250_000); // 1.000.000 − HPP 50.000 − upah 1.200.000
    expect(v.operating).toBe(-400_000);
    expect(v.opexRows.map((e) => e.category)).toEqual(["listrik_air", "pemasaran"]);
    expect(v.marketing).toBe(20_000);
  });
  it("bulan penuh: upah = gaji bulanan + kasbon yang sudah dipotong dari gaji", () => {
    const v = ownerFinanceView(report(true, 900_000), extra, false);
    expect(v.fullPayroll).toBe(true);
    expect(v.labor).toBe(950_000);
    expect(v.operating).toBe(1_000_000 - 50_000 - 950_000 - 150_000);
  });
  it("laporan mingguan selalu memakai estimasi walau periodenya bulan penuh", () => {
    expect(ownerFinanceView(report(true, 900_000), extra, true).labor).toBe(1_200_000);
  });
  it("arus kas tercatat = masuk (tunai, QRIS, transfer, top-up) − keluar (opex, stok, kasbon, komisi mingguan, gaji)", () => {
    expect(ownerFinanceView(report(false), extra, true).cashNet).toBe(1_050_000 - 440_000);
  });
});
