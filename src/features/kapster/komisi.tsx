"use client";

import { useEffect, useState } from "react";
import { formatJam, formatRupiah, formatTanggal, jktDate } from "@/lib/domain/format";
import { useRealtimeTable } from "@/lib/hooks/useRealtimeTable";
import { createClient } from "@/lib/supabase/client";
import { mondayOf, shiftWeek, weekLabel } from "@/features/sdm/shared";

const monthLabel = (m: string) => new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${m}-01T00:00:00Z`));

/** Komisi saya: dari commission_for_period (sama dengan layar SDM & slip gaji), rincian tanpa HPP. */
export function KomisiKapster({ ratio, retailPct, gross, dailyMin, deductHpp, payMonthly }: { ratio: number; retailPct: number; gross?: boolean; dailyMin?: number | null; deductHpp?: boolean; payMonthly?: boolean }) {
  const cur = jktDate().slice(0, 7);
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(Date.UTC(+cur.slice(0, 4), +cur.slice(5, 7) - 1 - i, 1));
    return d.toISOString().slice(0, 7);
  });
  const [month, setMonth] = useState(cur);
  const { data } = useRealtimeTable(["appointments", "payroll_periods"], async () => {
    const supabase = createClient();
    const day = `${month}-01`;
    const end = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 0)).toISOString().slice(0, 10);
    const [sum, items, rank, adj, weekly] = await Promise.all([
      supabase.rpc("commission_for_period", { p_month: day }),
      supabase.rpc("commission_items", { p_month: day }),
      supabase.rpc("staff_leaderboard", { p_from: day, p_to: end }),
      supabase.from("payroll_adjustments").select("id, kind, amount, reason").eq("month", day).order("created_at"),
      supabase.rpc("commission_weekly_for_month", { p_month: day }),
    ]);
    const r = rank.data?.[0];
    return { sum: sum.data?.[0] ?? null, items: items.data ?? [], rank: r ? { rank: r.rank, of: r.of_count } : null, adj: adj.data ?? [], weekly: weekly.data?.[0] ?? null };
  }, month);

  const s = data?.sum;
  const paidWeekly = Number(data?.weekly?.closed_amount ?? 0);
  const thisWeek = mondayOf(jktDate()), lastWeek = shiftWeek(thisWeek, -1);
  const { data: wk } = useRealtimeTable(["appointments", "commission_week_pays"], async () => {
    const supabase = createClient();
    const [now, prev, hist] = await Promise.all([
      supabase.rpc("commission_week", { p_week: thisWeek }),
      supabase.rpc("commission_week", { p_week: lastWeek }),
      supabase.from("commission_week_pays").select("week_start, amount, paid_at, paid_method").order("week_start", { ascending: false }).limit(24),
    ]);
    // minggu tertutup: gabungkan potongan per bulan (minggu lintas bulan) jadi satu baris
    const closed = new Map<string, { amount: number; paid_at: string | null; paid_method: string | null }>();
    for (const r of hist.data ?? []) {
      const c = closed.get(r.week_start) ?? { amount: 0, paid_at: r.paid_at, paid_method: r.paid_method };
      c.amount += Number(r.amount); closed.set(r.week_start, c);
    }
    return { now: now.data?.[0] ?? null, prev: prev.data?.[0] ?? null, closed: [...closed.entries()].slice(0, 8) };
  }, thisWeek);
  // Notifikasi "slip final" dianggap terbaca saat capster membuka periode yang sudah final.
  useEffect(() => { if (s?.closed) createClient().rpc("mark_notifications_read"); }, [s?.closed]);
  return (
    <>
      <h1 className="font-display text-[26px] font-bold">Komisi saya</h1>
      {!payMonthly && <section aria-label="Komisi mingguan" className="flex flex-col rounded-[18px] bg-card px-4 py-2">
        <span className="py-2.5 text-xs font-bold uppercase tracking-[0.06em] text-muted">Komisi mingguan · dibayar per minggu (Senin–Minggu)</span>
        {[[thisWeek, wk?.now, "Minggu ini · berjalan"], ...(wk?.prev && !wk.prev.closed ? [[lastWeek, wk.prev, "Menunggu ditutup manajer"]] : [])].map(([w, r, note]) => (
          <div key={String(w)} className="flex min-h-14 items-center justify-between gap-2.5 border-t border-[#EEEEEA] text-sm tabular">
            <span className="flex flex-col"><b>{weekLabel(String(w))}</b><span className="text-xs text-muted">{String(note)}</span></span>
            <b>{r && typeof r === "object" ? formatRupiah(Number(r.amount)) : "Rp0"}</b>
          </div>
        ))}
        {wk?.closed.map(([w, c]) => (
          <div key={w} className="flex min-h-14 items-center justify-between gap-2.5 border-t border-[#EEEEEA] text-sm tabular">
            <span className="flex flex-col"><b>{weekLabel(w)}</b>
              <span className={`text-xs ${c.paid_at ? "text-[#144D2A]" : "text-[#5A4300]"}`}>{c.paid_at ? `Dibayar ${formatTanggal(c.paid_at)} · ${c.paid_method}` : "Final · menunggu dibayar"}</span></span>
            <b>{formatRupiah(c.amount)}</b>
          </div>
        ))}
      </section>}

      <div className="flex flex-wrap items-center gap-2.5">
        <h2 className="flex-1 font-display text-xl font-bold">Gaji bulanan</h2>
        <label htmlFor="km-month" className="sr-only">Bulan</label>
        <select id="km-month" value={month} onChange={(e) => setMonth(e.target.value)} className="input w-auto">
          {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
        </select>
      </div>
      {s?.closed ? (
        <span className="-mt-2 self-start rounded-xl bg-[#E6F1E4] px-2.5 py-1 text-xs font-semibold text-[#144D2A]">
          Final{s.paid_at ? ` · dibayar ${formatTanggal(s.paid_at)} (${s.paid_method})` : " · belum dibayar"}
        </span>
      ) : (
        <span className="-mt-2 self-start rounded-xl bg-[#FBF3DE] px-2.5 py-1 text-xs font-semibold text-[#5A4300]">Estimasi — angka final ditetapkan manajer</span>
      )}

      <section className="flex flex-col gap-1.5 rounded-[18px] bg-ink p-5 text-paper">
        <span className="text-[13px] text-[#9A9C95]">{s?.closed ? "Total dibayar" : "Perkiraan diterima"} · {monthLabel(month)}</span>
        <b className="font-display text-[40px] tracking-tight tabular">{s ? formatRupiah(s.total_pay) : "…"}</b>
        {s && (
          <span className="text-[13px] text-[#D6D6D0] tabular">
            {s.base_salary > 0 && `Gaji pokok ${formatRupiah(s.base_salary)} + `}Komisi jasa {formatRupiah(s.commission_service)}
            {s.commission_retail > 0 && ` + ritel ${formatRupiah(s.commission_retail)}`}
            {s.subsidy > 0 && ` + subsidi jaring ${dailyMin ? "harian" : "pengaman"} ${formatRupiah(s.subsidy)}`}
            {s.adjustments !== 0 && ` ${s.adjustments > 0 ? "+" : "−"} penyesuaian ${formatRupiah(Math.abs(s.adjustments))}`}
          </span>
        )}
        {s && paidWeekly > 0 && (
          <span className="mt-1 border-t border-white/15 pt-2 text-[13px] text-[#D6D6D0] tabular">
            Sudah dibayar mingguan −{formatRupiah(paidWeekly)} · <b className="text-paper">sisa akhir bulan {formatRupiah(s.total_pay - paidWeekly)}</b>
          </span>
        )}
      </section>
      <div className="grid grid-cols-3 gap-2.5 tabular">
        {[["Layanan", String(s?.service_count ?? "…")], ["Pendapatan jasa", s ? formatRupiah(s.revenue_net) : "…"],
          ["Peringkat", data?.rank?.rank ? `#${data.rank.rank} dari ${data.rank.of}` : "…"]].map(([k, v]) => (
          <div key={k} className="flex flex-col gap-0.5 rounded-[14px] bg-card p-3.5"><span className="text-xs text-muted">{k}</span><b className="text-[17px] min-[420px]:text-xl">{v}</b></div>
        ))}
      </div>
      {s && s.subsidy > 0 && !!dailyMin && (
        <div className="rounded-xl bg-card px-3.5 py-3 text-sm leading-normal tabular">
          Jaring harian {formatRupiah(dailyMin)}: di hari Anda melayani dan komisinya di bawah itu, toko menutup selisihnya — bulan ini <b>{formatRupiah(s.subsidy)}</b>, dibayar bersama komisi mingguan.
        </div>
      )}
      <span className="text-[13px] leading-normal text-muted">
        Komisi per layanan = (harga {gross ? "normal, sebelum diskon/promo" : "bersih"}{deductHpp && " − HPP bahan"}) × {s?.commission_pct ?? ratio}%.{retailPct > 0 && ` Produk ritel yang Anda jual: ${retailPct}% dari harga ${gross ? "normal" : "bersih"}.`}{payMonthly && " Gaji dan komisi dibayar sekali di akhir bulan."}
      </span>
      {!!data?.adj.length && (
        <section className="flex flex-col rounded-[18px] bg-card px-4 py-2">
          <span className="py-2.5 text-xs font-bold uppercase tracking-[0.06em] text-muted">Bonus & potongan</span>
          {data.adj.map((a) => (
            <div key={a.id} className="flex min-h-12 items-center justify-between gap-2.5 border-t border-[#EEEEEA] text-sm tabular">
              <span>{a.reason}</span><b className={a.amount < 0 ? "text-[#A12A2A]" : ""}>{a.amount < 0 ? "−" : "+"}{formatRupiah(Math.abs(a.amount))}</b>
            </div>
          ))}
        </section>
      )}

      <section className="flex flex-col rounded-[18px] bg-card px-4 py-2">
        <span className="py-2.5 text-xs font-bold uppercase tracking-[0.06em] text-muted">Rincian</span>
        {data && !data.items.length && <span className="pb-3 text-sm text-muted">Belum ada layanan bulan ini.</span>}
        {data?.items.map((it) => (
          <div key={it.transaction_item_id} className="flex min-h-12 items-center justify-between gap-2.5 border-t border-[#EEEEEA] text-sm tabular">
            <span className="flex flex-col"><b>{it.name}{it.category === "retail" && " · ritel"}</b><span className="text-xs text-muted">{formatTanggal(it.created_at)} {formatJam(it.created_at)}</span></span>
            <b>{formatRupiah(Number(it.commission))}</b>
          </div>
        ))}
      </section>
    </>
  );
}
