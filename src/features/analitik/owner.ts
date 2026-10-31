import type { ExpenseCat } from "@/lib/domain/expense";
import type { Cat as StaffCat } from "@/lib/domain/category";
import "server-only";
import { jktDate } from "@/lib/domain/format";
import { ownerPeriod, type OwnerPeriod } from "@/lib/domain/owner";
import { createClient } from "@/lib/supabase/server";
import { BRAND } from "@/lib/brand";
import type { AnalyticsData } from "./dashboard";

type N = number | null;
export type OwnerSummary = {
  from: string; to: string; net: number; gross: number; discount: number; hpp: number; margin: number; margin_pct: N;
  tx_count: number; aov: N; aov_barbershop: N; aov_nail: N; aov_massage?: N; rev_barbershop: number; rev_nail: number; rev_massage?: number; rev_retail: number;
  retail_ratio: N; utilization: N; void_count: number; topup_paid: number;
  new_customers: number; returning: number; return_rate: N; no_show_rate: N; online_share: N; sop_compliance: N;
};
type Cat = "barbershop" | "nail" | "massage" | "retail";
export type OwnerReport = {
  summary: OwnerSummary; previous: OwnerSummary; last_year: OwnerSummary;
  finance: {
    tx_count: number; void_count: number; void_amount: number; gross: number; discount: number; discount_promo?: number; net: number; hpp: number;
    by_category: { category: Cat; items: number; gross: number; discount: number; net: number; hpp: number; margin: number }[];
    payments: { cash: number; qris: number; transfer?: number; deposit: number; tips_qris?: number };
    deposit: { topup_count: number; topup_paid: number; topup_cash: number; topup_qris: number; topup_transfer?: number; topup_credited: number; bonus: number; used: number; balance_end: number };
    maintenance_cost: number; expenses_total: number; expenses_by_category: { category: ExpenseCat; amount: number }[];
  };
  payroll: { months: { month: string; closed: boolean; total_pay: number }[]; complete: boolean; all_closed: boolean; total_pay: number;
    commission_service: number; commission_retail: number; subsidy: number; adjustments: number; by_staff: Record<string, number> };
  staff: { staff_id: string; name: string; category: StaffCat; active: boolean; tx: number; revenue: number; service_revenue: number;
    service_items: number; retail_revenue: number; aov: N; upsell_rate: N; hpp: number; utilization: N; served: number; no_show: number }[];
  services: { name: string; category: Cat; qty: number; revenue: number; hpp: number; margin: number; margin_pct: N }[];
  customers: { new_customers: number; returning: number; return_rate: N; return_eligible: number; return_back: number; churn_count: number;
    followup_sent: number; followup_converted: number; followup_rate: N; window_days: number;
    recorded?: { tx: number; with_customer: number };
    top: { name: string; visits: number; spend: number; deposit_balance: number }[] };
  online: { landing: number; booking_open: number; booked: number; online_appts: number; all_appts: number; online_created: number;
    online_cancelled: number; no_show: number; showed: number; share_online: N; cancel_rate: N; no_show_rate: N };
  operations: {
    utilization: { name: string; type: StaffCat; pct: N; sold_minutes: number; available_minutes: number }[];
    peak_hours: { weekday: number; hour: number; minutes_avg: number }[];
    sop: { operational: number; ok: number; compliance_pct: N };
    maintenance_done: number; maintenance_overdue_now: number;
    inventory: { value_end: number; value_consumable: number; value_retail: number; in_value: number; out_value: number; adjust_value: number;
      low_stock_now: number; opnames: number; usage_flagged: number; usage_variance_value: number };
  };
  daily: { day: string; tx: number; net: number; barbershop: number; nail: number; retail: number; discount: number; hpp: number;
    void: number; cash: number; qris: number; transfer?: number; deposit: number }[];
  insights: { priority: number; code: string; message: string; href: string }[];
  targets: { revenue: number; revenue_monthly: number; aov_barbershop: number; aov_nail: number; aov_massage?: number; utilization: number; retail_min: number; retail_max: number };
};

export type OwnerQuery = { periode?: string; nilai?: string; dari?: string; sampai?: string; bulan?: string };

/** Periode dari URL (+ ?bulan=YYYY-MM lama) → owner_report (satu RPC, khusus manajer). */
type Charts = { daily: AnalyticsData["daily"]; mix: AnalyticsData["mix"] };
export type OwnerExtra = { bookings: number; bookings_paid: number; bookings_cancelled: number; bookings_no_show: number; bookings_walk_in: number;
  commission_est: number; subsidy_est?: number; base_salary_est?: number; hpp_items?: number; hpp_items_filled?: number; commission_weekly_paid: number; cash_days: number; cash_days_closed: number; cash_days_unclosed: number;
  cash_diff_total: number; cash_diff_abs: number; campaign_sends: number; campaign_recipients: number; stock_purchases?: number; payroll_paid?: number };
export type Issue = { masalah: string; bukti: string; dampak: string; akar: string; tindakan: string; pj: string; tenggat: string };
export type Decision = { keputusan: string; alasan: string; opsi: string; rekomendasi: string; biaya: string; risiko: string; tenggat: string };
export type Priority = { tujuan: string; tindakan: string; indikator: string; pj: string; tenggat: string };
/** Catatan manajer per periode (owner_report_notes.data). */
export type OwnerNotes = { summary?: string; issues?: Issue[]; decisions?: Decision[]; no_decision?: boolean; priorities?: Priority[];
  evaluation?: string; next_plan?: string };
/** Laporan owner + 2 grafik (bauran omzet mingguan, AOV harian) — semua paralel; tanpa kpi_dashboard penuh (heatmap/insight tidak dipakai di sini). */
export async function loadOwnerReport(q: OwnerQuery): Promise<{ p: OwnerPeriod; r: OwnerReport; shop: { name: string; address: string }; charts: Charts;
  extra: OwnerExtra; extraPrev: OwnerExtra; notes: OwnerNotes | null; notesKind: "minggu" | "bulan" | null }> {
  const p = ownerPeriod(q.bulan && !q.periode ? { periode: "bulan", nilai: q.bulan } : q, jktDate());
  const supabase = await createClient();
  const notesKind = p.kind === "minggu" || p.kind === "bulan" ? p.kind : null;
  const [{ data, error }, { data: shop }, aov, mix, ex, exPrev, nt] = await Promise.all([
    supabase.rpc("owner_report", { p_from: p.from, p_to: p.to, p_prev_from: p.previous.from, p_prev_to: p.previous.to,
      p_ly_from: p.lastYear.from, p_ly_to: p.lastYear.to }),
    supabase.from("settings").select("shop_name, shop_address").single(),
    supabase.rpc("kpi_aov_daily", { p_from: p.from, p_to: p.to }),
    supabase.rpc("kpi_revenue_mix", { p_from: p.from, p_to: p.to }),
    supabase.rpc("owner_report_extra", { p_from: p.from, p_to: p.to }),
    supabase.rpc("owner_report_extra", { p_from: p.previous.from, p_to: p.previous.to }),
    notesKind ? supabase.from("owner_report_notes").select("data").eq("kind", notesKind).eq("period_start", p.from).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  if (error) throw new Error(error.message);
  const daily = (aov.data ?? []).map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v])));
  return { p, r: data as unknown as OwnerReport, shop: { name: shop?.shop_name ?? BRAND, address: shop?.shop_address ?? "" },
    charts: { daily: daily as unknown as Charts["daily"], mix: mix.data as unknown as Charts["mix"] },
    extra: ex.data as unknown as OwnerExtra, extraPrev: exPrev.data as unknown as OwnerExtra,
    notes: (nt.data?.data as OwnerNotes | undefined) ?? null, notesKind };
}

export { ownerFinanceView } from "@/lib/domain/owner-finance";
