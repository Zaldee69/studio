import "server-only";
import { jktDate } from "@/lib/domain/format";
import { previousPeriod } from "@/lib/domain/kpi";
import { addDays } from "@/lib/domain/schedule";
import { createClient } from "@/lib/supabase/server";
import type { AnalyticsData } from "./dashboard";

const valid = (d?: string) => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d);
const fmt = (d: string, year = true) => new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", ...(year ? { year: "numeric" } : {}), timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));
export const rangeLabel = (a: string, b: string) => (a === b ? fmt(a) : `${fmt(a, a.slice(0, 4) !== b.slice(0, 4))} – ${fmt(b)}`);

/** Periode dari URL (Asia/Jakarta). Default 7 hari terakhir. */
export function resolvePeriod(p: { periode?: string; dari?: string; sampai?: string }) {
  const today = jktDate();
  const m0 = `${today.slice(0, 7)}-01`;
  switch (p.periode) {
    case "hari": return { periode: "hari", from: today, to: today };
    case "30": return { periode: "30", from: addDays(today, -29), to: today };
    case "bulan": return { periode: "bulan", from: m0, to: today };
    case "lalu": { const end = addDays(m0, -1); return { periode: "lalu", from: `${end.slice(0, 7)}-01`, to: end }; }
    case "kustom":
      if (valid(p.dari) && valid(p.sampai) && p.dari! <= p.sampai!) return { periode: "kustom", from: p.dari!, to: p.sampai! };
      return { periode: "7", from: addDays(today, -6), to: today };
    default: return { periode: "7", from: addDays(today, -6), to: today };
  }
}

/** Semua bagian Analitik dari fungsi kpi_* yang sama (dipakai layar & laporan PDF). */
export async function loadAnalytics(p: { periode?: string; dari?: string; sampai?: string; kategori?: string; staf?: string }): Promise<AnalyticsData> {
  const { periode, from, to } = resolvePeriod(p);
  const category = p.kategori === "barbershop" || p.kategori === "nail" ? p.kategori : "";
  const staff = /^[0-9a-f-]{36}$/.test(p.staf ?? "") ? p.staf! : "";
  const args = { p_from: from, p_to: to, p_category: category || undefined, p_staff_id: staff || undefined };
  const supabase = await createClient();
  const [dash, st, staffList] = await Promise.all([
    supabase.rpc("kpi_dashboard", args),
    supabase.from("settings").select("aov_target_barbershop, aov_target_nail, retail_ratio_min, retail_ratio_max, utilization_target, insight_aov_gap_pct, insight_low_util_pct, kpi_min_tx_for_stable").single(),
    supabase.from("staff").select("id, name").eq("active", true).order("sort"),
  ]);
  if (dash.error) throw new Error(dash.error.message);
  const x = dash.data as unknown as Record<string, unknown>;
  const prev = previousPeriod(from, to);
  const num = <T,>(rows: T[]) => rows.map((r) => Object.fromEntries(Object.entries(r as object).map(([k, v]) => [k, typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v]))) as T[];
  return {
    periode, from, to, label: rangeLabel(from, to), prevLabel: rangeLabel(prev.from, prev.to), category, staff, monthForReport: from.slice(0, 7),
    summary: x.summary as AnalyticsData["summary"],
    daily: num(x.daily as AnalyticsData["daily"]), drivers: num(x.drivers as AnalyticsData["drivers"]),
    util: num(x.util as AnalyticsData["util"]), heat: num(x.heat as AnalyticsData["heat"]),
    duration: num(x.duration as AnalyticsData["duration"]), retail: x.retail as AnalyticsData["retail"],
    mix: x.mix as AnalyticsData["mix"], customers: x.customers as AnalyticsData["customers"],
    online: x.online as AnalyticsData["online"], insights: x.insights as AnalyticsData["insights"],
    staffList: staffList.data ?? [], settings: Object.fromEntries(Object.entries(st.data ?? {}).map(([k, v]) => [k, Number(v)])) as AnalyticsData["settings"],
  };
}
