import Link from "next/link";
import { HistoryStrip } from "@/features/sop/history-strip";
import { SopGrid } from "@/features/sop/grid";
import { Maintenance } from "@/features/sop/maintenance";
import { getProfile } from "@/lib/auth";
import { jktDate } from "@/lib/domain/format";
import type { SopStatus } from "@/lib/domain/kpi";
import { addDays } from "@/lib/domain/schedule";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "SOP & Kepatuhan" };
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
const long = (d: string) => new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));

export default async function Sop({ searchParams }: PageProps<"/manajer/sop">) {
  const sp = await searchParams;
  const today = jktDate();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(one(sp.tgl)) && one(sp.tgl) <= today ? one(sp.tgl) : today;
  const supabase = await createClient();
  const [{ data: st }, { data: staff }, { data: hist }, me] = await Promise.all([
    supabase.from("settings").select("sop_shifts, sop_shift_names, sop_require_photo_autoclave").single(),
    supabase.from("staff").select("id, name").eq("active", true).order("sort"),
    supabase.rpc("sop_history", { p_from: addDays(today, -13), p_to: today }),
    getProfile(),
  ]);
  const shifts = st?.sop_shifts ?? 1;
  const shift = Math.min(shifts, Math.max(1, Number(one(sp.shift)) || 1));
  const names = st?.sop_shift_names ?? ["Pagi", "Sore"];
  // Strip: satu titik per tanggal — status terburuk antar shift.
  const rank: SopStatus[] = ["part", "empty", "done", "ok", "closed"];
  const byDate = new Map<string, SopStatus>();
  for (const h of (hist ?? []) as { date: string; status: SopStatus }[]) {
    const cur = byDate.get(h.date);
    if (!cur || rank.indexOf(h.status) < rank.indexOf(cur)) byDate.set(h.date, h.status);
  }
  const strip = [...byDate].map(([d, s]) => ({ date: d, status: s })).sort((a, b) => a.date.localeCompare(b.date));
  const q = (d: string, s = shift) => `?tgl=${d}${shifts > 1 ? `&shift=${s}` : ""}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="flex-1 font-display text-[28px] font-bold tracking-tight">SOP &amp; Kepatuhan</h1>
        <span className="text-sm text-muted">Diisi oleh <b className="text-ink">{me?.full_name}</b></span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Link href={q(addDays(date, -1))} aria-label="Hari sebelumnya" className="btn-ghost size-11 p-0">‹</Link>
        <b className="min-w-56 text-center font-display text-lg">{long(date)}</b>
        {date < today ? <Link href={q(addDays(date, 1))} aria-label="Hari berikutnya" className="btn-ghost size-11 p-0">›</Link> : <span className="size-11" />}
        {date !== today && <Link href={q(today)} className="btn-ghost h-11">Hari ini</Link>}
        {shifts > 1 && (
          <div role="group" aria-label="Shift" className="ml-2 flex gap-1.5">
            {[1, 2].map((s) => (
              <Link key={s} href={q(date, s)} aria-current={shift === s ? "true" : undefined}
                className="inline-flex h-11 items-center rounded-full border border-[#D9D4C8] bg-card px-4 text-[13px] font-bold aria-[current=true]:border-ink aria-[current=true]:bg-ink aria-[current=true]:text-white">{names[s - 1] ?? `Shift ${s}`}</Link>
            ))}
          </div>
        )}
      </div>
      <p className="rounded-[12px] bg-card px-4 py-3 text-sm text-muted">
        Tiga tahap berurutan untuk setiap kelompok alat: <b className="text-ink">1. Cuci</b> (sabun &amp; sikat) → <b className="text-ink">2. Rendam disinfektan</b> →
        {" "}<b className="text-ink">3. Autoclave</b>. Setiap centang mencatat nama &amp; jam.{date < today && " Tanggal lampau hanya bisa dibaca."}
      </p>
      <HistoryStrip rows={strip} current={date} href={(d) => q(d)} />
      <SopGrid key={`${date}:${shift}`} date={date} shift={shift} me={me?.id ?? ""} manager staff={staff ?? []} requirePhoto={!!st?.sop_require_photo_autoclave} />
      <Maintenance manager staff={staff ?? []} />
      <form action="/manajer/sop/laporan" className="flex flex-wrap items-end gap-2 rounded-[14px] border border-line bg-card p-4">
        <h2 className="w-full font-display text-xl font-bold">Laporan kepatuhan</h2>
        <label className="flex flex-col"><span className="label">Dari</span><input type="date" name="dari" defaultValue={addDays(today, -29)} className="input w-44" /></label>
        <label className="flex flex-col"><span className="label">Sampai</span><input type="date" name="sampai" defaultValue={today} className="input w-44" /></label>
        <button className="btn-ink h-11">Tampilkan laporan</button>
        <Link href="/manajer/pengaturan?tab=sop" className="ml-auto text-sm font-semibold text-accent underline">Pengaturan SOP →</Link>
      </form>
    </div>
  );
}
