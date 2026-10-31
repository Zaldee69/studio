// Laba/rugi & arus kas laporan owner (murni, tanpa server) — dipakai PDF, Excel, dan unit test.
import type { OwnerExtra, OwnerReport } from "../../features/analitik/owner";

/**
 * Angka keuangan laporan owner (PDF & Excel memakai fungsi yang sama → angka tidak bisa berbeda).
 * Kasbon = uang muka gaji (bukan biaya operasional); gaji bulanan sudah dipotong kasbon → biaya staf = gaji + kasbon.
 * Periode tanpa gaji bulan penuh (mis. mingguan): biaya staf = estimasi komisi + jaring harian + gaji pokok prorata (belum termasuk jaring bulanan).
 */
export function ownerFinanceView(r: OwnerReport, x: OwnerExtra, weekly: boolean) {
  const f = r.finance;
  const kasbon = f.expenses_by_category.find((e) => e.category === "kasbon")?.amount ?? 0;
  const marketing = f.expenses_by_category.find((e) => e.category === "pemasaran")?.amount ?? 0;
  const opexRows = f.expenses_by_category.filter((e) => e.category !== "kasbon");
  const opex = f.expenses_total - kasbon + f.maintenance_cost;
  const fullPayroll = !weekly && r.payroll.complete;
  const labor = fullPayroll ? r.payroll.total_pay + kasbon : x.commission_est + (x.subsidy_est ?? 0) + (x.base_salary_est ?? 0);
  const contribution = f.net - f.hpp - labor;
  const operating = contribution - opex;
  const cashIn = { cash: f.payments.cash, qris: f.payments.qris, transfer: f.payments.transfer ?? 0, topup: f.deposit.topup_paid };
  const cashOut = { expenses: opex, stock: x.stock_purchases ?? 0, kasbon, weeklyCommission: x.commission_weekly_paid, payroll: x.payroll_paid ?? 0 };
  const net = Object.values(cashIn).reduce((a, v) => a + v, 0) - Object.values(cashOut).reduce((a, v) => a + v, 0);
  return { kasbon, marketing, opexRows, opex, fullPayroll, labor, contribution, operating, cashIn, cashOut, cashNet: net };
}
