"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CloseButton, Field, Sheet, useOnline, useToast } from "@/components/ui";
import { downloadText, toCsv } from "@/lib/domain/csv";
import { formatJam, formatRupiah, formatTanggal } from "@/lib/domain/format";
import { createClient } from "@/lib/supabase/client";
import { CAT, monthLabel, shiftMonth } from "./shared";

export type PayRow = {
  staff_id: string; staff_name: string; category: "barbershop" | "nail"; commission_pct: number; service_count: number;
  revenue_net: number; hpp_total: number; commission_service: number; commission_retail: number; subsidy: number;
  adjustments: number; total_pay: number; closed: boolean; paid_at: string | null; paid_method: string | null;
};
export type Period = { status: "open" | "closed"; closed_at: string | null; reopen_reason: string | null } | null;

const signed = (v: number) => (v < 0 ? "−" : v > 0 ? "+" : "") + formatRupiah(Math.abs(v));

export function MonthlyPayroll({ month, current, rows, period, ratio, minPay }: {
  month: string; current: string; rows: PayRow[]; period: Period; ratio: number; minPay: number;
}) {
  const toast = useToast(); const router = useRouter(); const online = useOnline();
  const [detail, setDetail] = useState<PayRow | null>(null);
  const [closing, setClosing] = useState(false);
  const [reopen, setReopen] = useState(false);
  const [reason, setReason] = useState("");
  const closed = period?.status === "closed";
  const sum = (k: keyof PayRow) => rows.reduce((a, r) => a + Number(r[k] ?? 0), 0);
  const rev = sum("revenue_net"), hpp = sum("hpp_total"), comm = sum("commission_service") + sum("commission_retail");
  const under = rows.filter((r) => r.subsidy > 0).length;
  const future = month > current;

  async function close() {
    const { error } = await createClient().rpc("payroll_close", { p_month: `${month}-01` });
    if (error) return toast(error.message, "error");
    toast(`Periode ${monthLabel(month)} ditutup — angka final`); setClosing(false); router.refresh();
  }
  async function doReopen() {
    const { error } = await createClient().rpc("payroll_reopen", { p_month: `${month}-01`, p_reason: reason });
    if (error) return toast(error.message, "error");
    toast("Periode dibuka ulang"); setReopen(false); setReason(""); router.refresh();
  }
  function exportCsv() {
    downloadText(`rekap-gaji-${month}.csv`, toCsv([
      ["Staf", "Bidang", "Layanan", "Pendapatan jasa", "HPP", "Komisi jasa", "Komisi ritel", "Subsidi", "Penyesuaian", "Total dibayar", "Dibayar", "Metode"],
      ...rows.map((r) => [r.staff_name, CAT[r.category].label, r.service_count, r.revenue_net, r.hpp_total, r.commission_service, r.commission_retail,
        r.subsidy, r.adjustments, r.total_pay, r.paid_at ? formatTanggal(r.paid_at) : "", r.paid_method ?? ""]),
    ]));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`?bulan=${shiftMonth(month, -1)}`} aria-label="Bulan sebelumnya" className="btn-ghost size-11 p-0">‹</Link>
        <b className="min-w-44 text-center font-display text-xl">{monthLabel(month)}</b>
        <Link href={`?bulan=${shiftMonth(month, 1)}`} aria-label="Bulan berikutnya" className="btn-ghost size-11 p-0">›</Link>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${closed ? "bg-[#D9F2E1] text-[#144D2A]" : month === current ? "bg-[#FFF1C2] text-[#5A4300]" : "bg-[#FFDADA] text-[#6E1616]"}`}>
          {closed ? `Ditutup ${formatTanggal(period!.closed_at!)}` : month === current ? "Bulan berjalan" : future ? "Belum dimulai" : "Belum ditutup"}
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          <button onClick={exportCsv} disabled={!rows.length} className="btn-ghost h-11">Ekspor rekap</button>
          {closed
            ? <button onClick={() => setReopen(true)} disabled={!online} className="btn-ghost h-11">Buka ulang</button>
            : <button onClick={() => setClosing(true)} disabled={!online || future} className="btn-ink h-11">Tutup periode</button>}
        </div>
      </div>
      {period?.reopen_reason && !closed && <p className="text-sm text-muted">Dibuka ulang: “{period.reopen_reason}”</p>}

      <div className="grid gap-3 min-[820px]:grid-cols-2 xl:grid-cols-4">
        {[
          ["Pendapatan jasa bersih", formatRupiah(rev), `${sum("service_count")} layanan`],
          ["HPP bahan", formatRupiah(hpp), rev ? `${Math.round((hpp * 1000) / rev) / 10}% dari pendapatan` : "—"],
          ["Komisi staf", formatRupiah(comm), `rasio ${ratio}% dari margin`],
          ["Subsidi jaring pengaman", formatRupiah(sum("subsidy")), `${under} staf di bawah ${formatRupiah(minPay)}`],
        ].map(([k, v, s]) => (
          <div key={k} className="flex flex-col gap-0.5 rounded-[14px] border border-line bg-card p-4">
            <span className="text-xs font-semibold text-muted">{k}</span><b className="font-display text-2xl tabular">{v}</b><span className="text-xs text-muted">{s}</span>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-[14px] border border-line bg-card px-3">
        <table className="w-full min-w-[1100px] text-sm tabular">
          <thead><tr className="text-left text-xs text-muted">
            {["Staf", "Layanan", "Pendapatan", "HPP", "Komisi jasa", "Komisi ritel", "Subsidi", "Penyesuaian", "Total dibayar", "Status bayar"].map((h, i) =>
              <th key={h} className={`py-2.5 pr-2 font-semibold ${i && i < 9 ? "text-right" : ""}`}>{h}</th>)}
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.staff_id} onClick={() => setDetail(r)} className="cursor-pointer border-t border-[#F0EDE6] hover:bg-paper">
                <td className="py-2 pr-2">
                  <button className="flex min-h-11 items-center gap-2 text-left" onClick={(e) => { e.stopPropagation(); setDetail(r); }}>
                    <span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: CAT[r.category].color }} />
                    <span className="flex flex-col"><b>{r.staff_name}</b><span className="text-xs text-muted">{CAT[r.category].label}</span></span>
                  </button>
                </td>
                <td className="pr-2 text-right">{r.service_count}</td>
                <td className="pr-2 text-right">{formatRupiah(r.revenue_net)}</td>
                <td className="pr-2 text-right">{formatRupiah(r.hpp_total)}</td>
                <td className="pr-2 text-right">{formatRupiah(r.commission_service)}</td>
                <td className="pr-2 text-right">{formatRupiah(r.commission_retail)}</td>
                <td className="pr-2 text-right">{r.subsidy ? formatRupiah(r.subsidy) : "—"}</td>
                <td className="pr-2 text-right">{r.adjustments ? signed(r.adjustments) : "—"}</td>
                <td className="pr-2 text-right text-base font-bold">{formatRupiah(r.total_pay)}</td>
                <td className="pr-2">
                  {!closed ? <span className="text-xs text-muted">Belum final</span>
                    : r.paid_at ? <span className="rounded-full bg-[#D9F2E1] px-2.5 py-0.5 text-xs font-bold text-[#144D2A]">Dibayar {formatTanggal(r.paid_at)}</span>
                    : <Link onClick={(e) => e.stopPropagation()} href={`/manajer/sdm/slip/${month}/${r.staff_id}`} className="rounded-full bg-[#FFF1C2] px-2.5 py-1 text-xs font-bold text-[#5A4300]">Belum dibayar · Slip</Link>}
                </td>
              </tr>
            ))}
            <tr className="border-t-2 border-ink font-bold">
              <td className="py-2.5 pr-2">Total</td><td className="pr-2 text-right">{sum("service_count")}</td><td className="pr-2 text-right">{formatRupiah(rev)}</td>
              <td className="pr-2 text-right">{formatRupiah(hpp)}</td><td className="pr-2 text-right">{formatRupiah(sum("commission_service"))}</td>
              <td className="pr-2 text-right">{formatRupiah(sum("commission_retail"))}</td><td className="pr-2 text-right">{formatRupiah(sum("subsidy"))}</td>
              <td className="pr-2 text-right">{signed(sum("adjustments"))}</td><td className="pr-2 text-right text-base">{formatRupiah(sum("total_pay"))}</td><td />
            </tr>
          </tbody>
        </table>
      </div>

      <Sheet open={!!detail} onClose={() => setDetail(null)} label="Detail staf" variant="drawer">
        {detail && <StaffDetail row={detail} month={month} closed={closed} onClose={() => setDetail(null)} />}
      </Sheet>

      <Sheet open={closing} onClose={() => setClosing(false)} label="Tutup periode" width={640}>
        <div className="flex items-center gap-3 border-b border-line px-5 py-3.5">
          <h2 className="flex-1 font-display text-xl font-bold">Tutup periode {monthLabel(month)}</h2><CloseButton onClick={() => setClosing(false)} />
        </div>
        <div className="flex flex-col gap-3 p-5">
          <p className="text-sm text-muted">Angka dibekukan sebagai final: slip gaji terbentuk, tab Komisi kapster menampilkan <b>Final</b>, dan void transaksi bulan ini dikunci sampai periode dibuka ulang.</p>
          <table className="w-full text-sm tabular">
            <tbody>{rows.map((r) => <tr key={r.staff_id} className="border-t border-[#F0EDE6]"><td className="py-1.5">{r.staff_name}</td><td className="text-right font-bold">{formatRupiah(r.total_pay)}</td></tr>)}
              <tr className="border-t-2 border-ink font-bold"><td className="py-2">Total</td><td className="text-right">{formatRupiah(sum("total_pay"))}</td></tr></tbody>
          </table>
          <button onClick={close} disabled={!online} className="btn-ink h-12">Tutup & bekukan angka</button>
        </div>
      </Sheet>

      <Sheet open={reopen} onClose={() => setReopen(false)} label="Buka ulang periode" width={480}>
        <form onSubmit={(e) => { e.preventDefault(); doReopen(); }}>
          <div className="flex items-center gap-3 border-b border-line px-5 py-3.5">
            <h2 className="flex-1 font-display text-xl font-bold">Buka ulang {monthLabel(month)}</h2><CloseButton onClick={() => setReopen(false)} />
          </div>
          <div className="flex flex-col gap-3 p-5">
            <p className="text-sm text-muted">Snapshot & status bayar dihapus; angka dihitung ulang saat ditutup lagi. Alasan tercatat.</p>
            <Field label="Alasan (wajib)" htmlFor="ro-reason"><input id="ro-reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
            <button disabled={!reason.trim() || !online} className="btn-ink h-12">Buka ulang</button>
          </div>
        </form>
      </Sheet>
    </div>
  );
}

type Item = { transaction_item_id: string; created_at: string; name: string; category: string; net_amount: number; hpp: number | null; commission: number };
type Adj = { id: string; kind: string; amount: number; reason: string; created_at: string };

function StaffDetail({ row, month, closed, onClose }: { row: PayRow; month: string; closed: boolean; onClose: () => void }) {
  const toast = useToast(); const router = useRouter(); const online = useOnline();
  const [items, setItems] = useState<Item[] | null>(null);
  const [adj, setAdj] = useState<Adj[]>([]);
  const [trend, setTrend] = useState<{ m: string; v: number }[]>([]);
  const [f, setF] = useState({ kind: "bonus", amount: "", reason: "" });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const supabase = createClient();
    let alive = true;
    Promise.all([
      supabase.rpc("commission_items", { p_month: `${month}-01`, p_staff_id: row.staff_id }),
      supabase.from("payroll_adjustments").select("id, kind, amount, reason, created_at").eq("staff_id", row.staff_id).eq("month", `${month}-01`).order("created_at"),
      Promise.all(Array.from({ length: 6 }, (_, i) => shiftMonth(month, i - 5)).map(async (m) => {
        const { data } = await supabase.rpc("commission_for_period", { p_month: `${m}-01`, p_staff_id: row.staff_id });
        return { m, v: Number(data?.[0]?.commission_service ?? 0) + Number(data?.[0]?.commission_retail ?? 0) };
      })),
    ]).then(([it, a, t]) => {
      if (!alive) return;
      setItems((it.data ?? []) as Item[]); setAdj((a.data ?? []) as Adj[]); setTrend(t);
    });
    return () => { alive = false; };
  }, [month, row.staff_id, tick]);

  async function addAdj() {
    const amount = Math.round(Number(f.amount.replace(/\D/g, "")) * (f.kind === "deduction" ? -1 : 1));
    const { error } = await createClient().rpc("payroll_add_adjustment", { p_staff_id: row.staff_id, p_month: `${month}-01`, p_kind: f.kind, p_amount: amount, p_reason: f.reason });
    if (error) return toast(error.message, "error");
    toast("Penyesuaian dicatat"); setF({ kind: "bonus", amount: "", reason: "" }); setTick(tick + 1); router.refresh();
  }
  const max = Math.max(1, ...trend.map((t) => t.v));
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-line px-5 py-3.5">
        <h2 className="flex-1 font-display text-xl font-bold">{row.staff_name} · {monthLabel(month)}</h2><CloseButton onClick={onClose} />
      </div>
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5">
        <div className="flex items-baseline justify-between rounded-[14px] bg-ink p-4 text-paper tabular">
          <span className="text-sm text-[#B9B3A7]">Total dibayar</span><b className="font-display text-3xl">{formatRupiah(row.total_pay)}</b>
        </div>
        <Link href={`/manajer/sdm/slip/${month}/${row.staff_id}`} className={`btn-ghost h-11 ${closed ? "" : "pointer-events-none opacity-50"}`} aria-disabled={!closed}>
          Slip gaji{closed ? "" : " (tutup periode dulu)"}
        </Link>

        <section aria-label="Komisi 6 bulan terakhir" className="flex flex-col gap-1.5">
          <b className="text-sm">Komisi 6 bulan terakhir</b>
          <div className="flex h-28 items-end gap-2">
            {trend.map((t) => (
              <div key={t.m} className="flex flex-1 flex-col items-center gap-1" title={`${monthLabel(t.m)}: ${formatRupiah(t.v)}`}>
                <span className="text-[10px] text-muted tabular">{t.v ? `${Math.round(t.v / 1000)}rb` : ""}</span>
                <div className="w-full rounded-t-md" style={{ height: `${Math.max(2, (t.v / max) * 80)}px`, background: CAT[row.category].color, opacity: t.m === month ? 1 : 0.55 }} />
                <span className="text-[10px] text-muted">{monthLabel(t.m).slice(0, 3)}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <b className="text-sm">Bonus & potongan</b>
          {!adj.length && <span className="text-sm text-muted">Belum ada.</span>}
          {adj.map((a) => <div key={a.id} className="flex justify-between gap-2 border-t border-[#F0EDE6] py-1.5 text-sm tabular"><span>{a.reason}</span><b>{signed(a.amount)}</b></div>)}
          {!closed && (
            <form onSubmit={(e) => { e.preventDefault(); addAdj(); }} className="flex flex-col gap-2 rounded-[12px] border border-line p-3">
              <div className="grid grid-cols-2 gap-2">
                <Field label="Jenis" htmlFor="pa-kind">
                  <select id="pa-kind" className="input" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
                    <option value="bonus">Bonus</option><option value="deduction">Potongan</option><option value="correction">Koreksi (+)</option>
                  </select>
                </Field>
                <Field label="Jumlah (Rp)" htmlFor="pa-amount"><input id="pa-amount" inputMode="numeric" className="input" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
              </div>
              <Field label="Alasan (wajib)" htmlFor="pa-reason"><input id="pa-reason" className="input" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
              <button disabled={!online || !Number(f.amount.replace(/\D/g, "")) || !f.reason.trim()} className="btn-ink h-11">Tambah bonus/potongan</button>
            </form>
          )}
        </section>

        <section className="flex flex-col gap-1">
          <b className="text-sm">Rincian item</b>
          {items === null ? <span className="text-sm text-muted">Memuat…</span> : !items.length ? <span className="text-sm text-muted">Belum ada item bulan ini.</span> : items.map((i) => (
            <div key={i.transaction_item_id} className="grid grid-cols-[1fr_auto] gap-x-2 border-t border-[#F0EDE6] py-1.5 text-sm tabular">
              <span className="font-semibold">{i.name}{i.category === "retail" && " · ritel"}</span><b>{formatRupiah(i.commission)}</b>
              <span className="text-xs text-muted">{formatTanggal(i.created_at)} {formatJam(i.created_at)}</span>
              <span className="text-right text-xs text-muted">net {formatRupiah(i.net_amount)} · HPP {formatRupiah(i.hpp ?? 0)}</span>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
