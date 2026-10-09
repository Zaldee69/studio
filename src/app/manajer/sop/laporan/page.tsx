import Link from "next/link";
import { PrintButton } from "@/components/print-button";
import { formatJam, formatRupiah, formatTanggal, jktDate } from "@/lib/domain/format";
import { pct1, SOP_STATUS, STAGE_LABEL, type SopStatus, type Stage } from "@/lib/domain/kpi";
import { addDays } from "@/lib/domain/schedule";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Laporan kepatuhan" };
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
const valid = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);
type Day = { date: string; shift: number; status: SopStatus; done: number; total: number; approved_by: string | null; approved_at: string | null;
  logs: { group: string; stage: Stage; by: string | null; on_behalf: string | null; at: string; note: string; photo: boolean }[] };
type Report = { from: string; to: string; operational: number; ok: number; compliance_pct: number | null; days: Day[];
  maintenance: { task: string; at: string; by: string | null; note: string; vendor: string | null; cost: number | null }[] };

// Laporan Kepatuhan Sterilisasi & Perawatan — A4, siap cetak untuk inspeksi.
export default async function Laporan({ searchParams }: PageProps<"/manajer/sop/laporan">) {
  const sp = await searchParams;
  const today = jktDate();
  const to = valid(one(sp.sampai)) ? one(sp.sampai) : today;
  const from = valid(one(sp.dari)) && one(sp.dari) <= to ? one(sp.dari) : addDays(to, -29);
  const supabase = await createClient();
  const [{ data }, { data: shop }] = await Promise.all([
    supabase.rpc("sop_compliance_report", { p_from: from, p_to: to }),
    supabase.from("settings").select("shop_name, shop_address, sop_shifts, sop_shift_names").single(),
  ]);
  const r = data as unknown as Report;
  const d = (s: string) => formatTanggal(`${s}T12:00:00+07:00`);
  return (
    <div className="flex flex-col gap-4">
      <style>{"@page { size: A4; margin: 12mm } @media print { body { background: #fff } }"}</style>
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Link href="/manajer/sop" className="btn-ghost h-11">← SOP</Link>
        <form className="flex flex-wrap items-end gap-2">
          <input type="date" name="dari" aria-label="Dari" defaultValue={from} className="input w-44" />
          <input type="date" name="sampai" aria-label="Sampai" defaultValue={to} className="input w-44" />
          <button className="btn-ghost h-11">Terapkan</button>
        </form>
        <PrintButton />
      </div>
      <article className="flex flex-col gap-4 rounded-[14px] border border-line bg-card p-6 text-sm print:border-0 print:p-0">
        <header className="flex flex-col border-b-2 border-ink pb-2">
          <b className="font-display text-xl">{shop?.shop_name}</b>
          <span className="text-xs text-muted">{shop?.shop_address}</span>
          <h1 className="mt-2 font-display text-2xl font-bold">Laporan Kepatuhan Sterilisasi &amp; Perawatan</h1>
          <span className="tabular">Periode {d(r.from)} – {d(r.to)} · dibuat {formatTanggal(new Date())} {formatJam(new Date())}</span>
        </header>
        <div className="grid grid-cols-3 gap-3 tabular">
          <div className="rounded-[10px] border border-line p-3"><span className="text-xs text-muted">% hari patuh</span><b className="block text-3xl">{r.compliance_pct == null ? "—" : `${pct1(r.compliance_pct)}%`}</b></div>
          <div className="rounded-[10px] border border-line p-3"><span className="text-xs text-muted">Diotorisasi</span><b className="block text-3xl">{r.ok}</b></div>
          <div className="rounded-[10px] border border-line p-3"><span className="text-xs text-muted">Hari operasional</span><b className="block text-3xl">{r.operational}</b></div>
        </div>
        <table className="w-full text-xs tabular">
          <thead><tr className="border-b border-ink text-left">{["Tanggal", "Status", "Pengisi tiap tahap", "Penyetuju"].map((h) => <th key={h} className="py-1.5 pr-2 font-semibold">{h}</th>)}</tr></thead>
          <tbody>
            {r.days.map((x) => (
              <tr key={`${x.date}-${x.shift}`} className="break-inside-avoid border-b border-[#E5E5E0] align-top">
                <td className="whitespace-nowrap py-1.5 pr-2">{d(x.date)}{(shop?.sop_shifts ?? 1) > 1 && <span className="block text-muted">{shop?.sop_shift_names?.[x.shift - 1]}</span>}</td>
                <td className="whitespace-nowrap pr-2"><span aria-hidden="true">{SOP_STATUS[x.status].icon} </span>{SOP_STATUS[x.status].label}{x.status !== "closed" && ` (${x.done}/${x.total})`}</td>
                <td className="pr-2">{x.logs.length ? x.logs.map((l, i) => (
                  <span key={i} className="mr-2 inline-block">{l.group} · {STAGE_LABEL[l.stage]}: {l.by}{l.on_behalf ? ` a.n. ${l.on_behalf}` : ""} {formatJam(l.at)}{l.note ? ` — ${l.note}` : ""}{l.photo ? " 📷" : ""}</span>
                )) : "—"}</td>
                <td className="whitespace-nowrap pr-2">{x.approved_by ? `${x.approved_by} · ${formatJam(x.approved_at!)}` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <section className="break-inside-avoid">
          <h2 className="mb-1 font-bold">Log perawatan fasilitas</h2>
          {!r.maintenance.length ? <p className="text-muted">Tidak ada perawatan pada periode ini.</p> : (
            <table className="w-full text-xs tabular">
              <tbody>{r.maintenance.map((m, i) => (
                <tr key={i} className="border-b border-[#E5E5E0]"><td className="py-1 pr-2">{formatTanggal(m.at)}</td><td className="pr-2">{m.task}</td>
                  <td className="pr-2">{m.vendor || m.by}{m.note ? ` — ${m.note}` : ""}</td><td className="text-right">{m.cost ? formatRupiah(m.cost) : ""}</td></tr>
              ))}</tbody>
            </table>
          )}
        </section>
        <footer className="mt-8 flex justify-end break-inside-avoid">
          <div className="flex w-60 flex-col items-center gap-14 text-center"><span>Mengetahui, Manajer</span><span className="w-full border-t border-ink pt-1">( nama &amp; tanda tangan )</span></div>
        </footer>
      </article>
    </div>
  );
}
