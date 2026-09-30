"use client";

import { useEffect, useState } from "react";
import { formatJam, formatRupiah, formatTanggal, jktDate } from "@/lib/domain/format";
import { useRealtimeTable } from "@/lib/hooks/useRealtimeTable";
import { createClient } from "@/lib/supabase/client";

const monthLabel = (m: string) => new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${m}-01T00:00:00Z`));

/** Komisi saya: dari commission_for_period (sama dengan layar SDM & slip gaji), rincian tanpa HPP. */
export function KomisiKapster({ ratio, minPay, retailPct }: { ratio: number; minPay: number; retailPct: number }) {
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
    const [sum, items, rank, adj] = await Promise.all([
      supabase.rpc("commission_for_period", { p_month: day }),
      supabase.rpc("commission_items", { p_month: day }),
      supabase.rpc("staff_leaderboard", { p_from: day, p_to: end }),
      supabase.from("payroll_adjustments").select("id, kind, amount, reason").eq("month", day).order("created_at"),
    ]);
    const r = rank.data?.[0];
    return { sum: sum.data?.[0] ?? null, items: items.data ?? [], rank: r ? { rank: r.rank, of: r.of_count } : null, adj: adj.data ?? [] };
  }, month);

  const s = data?.sum;
  // Notifikasi "slip final" dianggap terbaca saat kapster membuka periode yang sudah final.
  useEffect(() => { if (s?.closed) createClient().rpc("mark_notifications_read"); }, [s?.closed]);
  return (
    <>
      <div className="flex flex-wrap items-center gap-2.5">
        <h1 className="flex-1 font-display text-[26px] font-bold">Komisi saya</h1>
        <label htmlFor="km-month" className="sr-only">Bulan</label>
        <select id="km-month" value={month} onChange={(e) => setMonth(e.target.value)} className="input w-auto">
          {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
        </select>
      </div>
      {s?.closed ? (
        <span className="-mt-2 self-start rounded-xl bg-[#D9F2E1] px-2.5 py-1 text-xs font-semibold text-[#144D2A]">
          Final{s.paid_at ? ` · dibayar ${formatTanggal(s.paid_at)} (${s.paid_method})` : " · belum dibayar"}
        </span>
      ) : (
        <span className="-mt-2 self-start rounded-xl bg-[#FFF1C2] px-2.5 py-1 text-xs font-semibold text-[#5A4300]">Estimasi — angka final ditetapkan manajer</span>
      )}

      <section className="flex flex-col gap-1.5 rounded-[18px] bg-ink p-5 text-paper">
        <span className="text-[13px] text-[#B9B3A7]">{s?.closed ? "Total dibayar" : "Perkiraan diterima"} · {monthLabel(month)}</span>
        <b className="font-display text-[40px] tracking-tight tabular">{s ? formatRupiah(s.total_pay) : "…"}</b>
        {s && (
          <span className="text-[13px] text-[#D8D2C6] tabular">
            Komisi jasa {formatRupiah(s.commission_service)}
            {s.commission_retail > 0 && ` + ritel ${formatRupiah(s.commission_retail)}`}
            {s.subsidy > 0 && ` + subsidi jaring pengaman ${formatRupiah(s.subsidy)}`}
            {s.adjustments !== 0 && ` ${s.adjustments > 0 ? "+" : "−"} penyesuaian ${formatRupiah(Math.abs(s.adjustments))}`}
          </span>
        )}
      </section>
      <div className="grid grid-cols-3 gap-2.5 tabular">
        {[["Layanan", String(s?.service_count ?? "…")], ["Pendapatan jasa", s ? formatRupiah(s.revenue_net) : "…"],
          ["Peringkat", data?.rank?.rank ? `#${data.rank.rank} dari ${data.rank.of}` : "…"]].map(([k, v]) => (
          <div key={k} className="flex flex-col gap-0.5 rounded-[14px] bg-card p-3.5"><span className="text-xs text-muted">{k}</span><b className="text-[17px] min-[420px]:text-xl">{v}</b></div>
        ))}
      </div>
      {s && s.subsidy > 0 && (
        <div className="rounded-xl bg-card px-3.5 py-3 text-sm leading-normal tabular">
          Kurang <b>{formatRupiah(s.subsidy)}</b> lagi untuk mencapai ambang {formatRupiah(minPay)} dari komisi sendiri. Sampai itu tercapai, toko menutup selisihnya.
        </div>
      )}
      <span className="text-[13px] leading-normal text-muted">
        Komisi per layanan = (harga bersih − HPP bahan) × {s?.commission_pct ?? ratio}%.{retailPct > 0 && ` Produk ritel yang Anda jual: ${retailPct}% dari harga bersih.`}
      </span>
      {!!data?.adj.length && (
        <section className="flex flex-col rounded-[18px] bg-card px-4 py-2">
          <span className="py-2.5 text-xs font-bold uppercase tracking-[0.06em] text-muted">Bonus & potongan</span>
          {data.adj.map((a) => (
            <div key={a.id} className="flex min-h-12 items-center justify-between gap-2.5 border-t border-[#F0EDE6] text-sm tabular">
              <span>{a.reason}</span><b className={a.amount < 0 ? "text-[#A12A2A]" : ""}>{a.amount < 0 ? "−" : "+"}{formatRupiah(Math.abs(a.amount))}</b>
            </div>
          ))}
        </section>
      )}

      <section className="flex flex-col rounded-[18px] bg-card px-4 py-2">
        <span className="py-2.5 text-xs font-bold uppercase tracking-[0.06em] text-muted">Rincian</span>
        {data && !data.items.length && <span className="pb-3 text-sm text-muted">Belum ada layanan bulan ini.</span>}
        {data?.items.map((it) => (
          <div key={it.transaction_item_id} className="flex min-h-12 items-center justify-between gap-2.5 border-t border-[#F0EDE6] text-sm tabular">
            <span className="flex flex-col"><b>{it.name}{it.category === "retail" && " · ritel"}</b><span className="text-xs text-muted">{formatTanggal(it.created_at)} {formatJam(it.created_at)}</span></span>
            <b>{formatRupiah(Number(it.commission))}</b>
          </div>
        ))}
      </section>
    </>
  );
}
