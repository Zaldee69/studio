import Link from "next/link";
import { TabNav } from "@/components/tab-nav";
import { MonthlyPayroll, type PayRow, type Period } from "@/features/sdm/monthly";
import { AnnualReview, CommissionRules, Leaderboard, type LeaderRow, type ReviewRow } from "@/features/sdm/rules";
import { jktDate } from "@/lib/domain/format";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "SDM & Komisi" };

const TABS = [["bulanan", "Gaji bulanan"], ["aturan", "Aturan komisi"], ["peringkat", "Produktivitas"], ["evaluasi", "Evaluasi tahunan"]] as const;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

export default async function Sdm({ searchParams }: PageProps<"/manajer/sdm">) {
  const sp = await searchParams;
  const tab = TABS.some(([k]) => k === sp.tab) ? one(sp.tab) : "bulanan";
  const current = jktDate().slice(0, 7);
  const month = /^\d{4}-\d{2}$/.test(one(sp.bulan)) ? one(sp.bulan) : current;
  const year = /^\d{4}$/.test(one(sp.tahun)) ? Number(one(sp.tahun)) : Number(current.slice(0, 4));
  const supabase = await createClient();
  const { data: st } = await supabase.from("settings").select("commission_pct, retail_commission_pct, min_monthly_pay").single();

  let body: React.ReactNode;
  if (tab === "bulanan") {
    const [{ data: rows }, { data: period }] = await Promise.all([
      supabase.rpc("commission_for_period", { p_month: `${month}-01` }),
      supabase.from("payroll_periods").select("status, closed_at, reopen_reason").eq("month", `${month}-01`).maybeSingle(),
    ]);
    body = <MonthlyPayroll key={month} month={month} current={current} rows={(rows ?? []) as PayRow[]} period={period as Period}
      ratio={st?.commission_pct ?? 40} minPay={st?.min_monthly_pay ?? 0} />;
  } else if (tab === "aturan") {
    const { data: staff } = await supabase.from("staff").select("id, name, category, commission_pct_override, active").order("sort");
    body = <CommissionRules ratio={st?.commission_pct ?? 40} retailPct={Number(st?.retail_commission_pct ?? 0)} minPay={st?.min_monthly_pay ?? 0} staff={staff ?? []} />;
  } else if (tab === "peringkat") {
    const byYear = sp.periode === "tahun";
    const end = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 0)).toISOString().slice(0, 10);
    const { data } = await supabase.rpc("staff_leaderboard", byYear ? { p_from: `${year}-01-01`, p_to: `${year}-12-31` } : { p_from: `${month}-01`, p_to: end });
    body = (
      <div className="flex flex-col gap-3">
        <div role="group" aria-label="Periode" className="flex gap-1.5">
          {[["", "Bulan ini"], ["tahun", `Tahun ${year}`]].map(([v, l]) => (
            <Link key={v} href={`?tab=peringkat${v ? "&periode=tahun" : ""}`} aria-current={(byYear ? "tahun" : "") === v ? "true" : undefined}
              className="inline-flex h-11 items-center rounded-full border border-[#D9D4C8] bg-card px-4 text-[13px] font-bold aria-[current=true]:border-ink aria-[current=true]:bg-ink aria-[current=true]:text-white">{l}</Link>
          ))}
        </div>
        <Leaderboard rows={(data ?? []) as LeaderRow[]} />
      </div>
    );
  } else {
    const { data } = await supabase.rpc("staff_annual_review", { p_year: year });
    body = (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Link href={`?tab=evaluasi&tahun=${year - 1}`} aria-label="Tahun sebelumnya" className="btn-ghost size-11 p-0">‹</Link>
          <b className="font-display text-xl tabular">{year}</b>
          <Link href={`?tab=evaluasi&tahun=${year + 1}`} aria-label="Tahun berikutnya" className="btn-ghost size-11 p-0">›</Link>
        </div>
        <AnnualReview key={year} year={year} rows={((data ?? []) as ReviewRow[]).map((r) => ({ ...r, upsell_rate: Number(r.upsell_rate), return_rate: Number(r.return_rate) }))} />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-[28px] font-bold tracking-tight">SDM &amp; Komisi</h1>
      <TabNav tabs={TABS} current={tab} label="Bagian SDM" extra={tab === "bulanan" ? `&bulan=${month}` : ""} />
      {body}
    </div>
  );
}
