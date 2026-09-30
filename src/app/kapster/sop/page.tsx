import { HistoryStrip } from "@/features/sop/history-strip";
import { SopGrid } from "@/features/sop/grid";
import { Maintenance } from "@/features/sop/maintenance";
import { getProfile } from "@/lib/auth";
import { jktDate } from "@/lib/domain/format";
import type { SopStatus } from "@/lib/domain/kpi";
import { addDays } from "@/lib/domain/schedule";
import { createClient } from "@/lib/supabase/server";
import { ShiftPicker } from "./shift-picker";

export const metadata = { title: "SOP" };
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

// Tab SOP kapster: checklist hari ini saja (pengisi = kapster login), perawatan tanpa biaya. Tidak bisa otorisasi.
export default async function KapsterSop({ searchParams }: PageProps<"/kapster/sop">) {
  const sp = await searchParams;
  const today = jktDate();
  const supabase = await createClient();
  const [{ data: cfg }, { data: hist }, me] = await Promise.all([
    supabase.rpc("sop_config"),
    supabase.rpc("sop_history", { p_from: addDays(today, -13), p_to: today }),
    getProfile(),
  ]);
  const c = (cfg ?? { shifts: 1, names: ["Pagi", "Sore"], require_photo: false }) as { shifts: number; names: string[]; require_photo: boolean };
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: "Asia/Jakarta" }).format(new Date()));
  const shift = c.shifts > 1 ? Math.min(2, Math.max(1, Number(one(sp.shift)) || (hour >= 15 ? 2 : 1))) : 1;
  const strip = ((hist ?? []) as { date: string; shift: number; status: SopStatus }[]).filter((h) => h.shift === shift).sort((a, b) => a.date.localeCompare(b.date));
  return (
    <>
      <h1 className="font-display text-[26px] font-bold">SOP sterilisasi · hari ini</h1>
      {c.shifts > 1 && <ShiftPicker shift={shift} names={c.names} />}
      <p className="text-sm text-muted">Cuci → Rendam → Autoclave untuk tiap kelompok alat. Centang mencatat nama Anda &amp; jam.</p>
      <SopGrid key={shift} date={today} shift={shift} me={me?.id ?? ""} manager={false} requirePhoto={c.require_photo} big />
      <HistoryStrip rows={strip} current={today} href={null} />
      <Maintenance manager={false} />
    </>
  );
}
