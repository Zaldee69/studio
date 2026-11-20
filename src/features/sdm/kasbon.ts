import type { KasbonInfo } from "./shared";
import { NO_KASBON } from "./shared";
import type { createClient } from "@/lib/supabase/server";

type Db = Awaited<ReturnType<typeof createClient>>;

/** Info kasbon per staf untuk satu bulan ("YYYY-MM"): utang s/d akhir bulan, terpotong mingguan, adjustment kasbon. Hanya manajer (RLS). */
export async function loadKasbon(db: Db, month: string): Promise<Record<string, KasbonInfo>> {
  const m0 = `${month}-01`;
  const end = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 0)).toISOString().slice(0, 10);
  const [{ data: ex }, { data: pays }, { data: adj }] = await Promise.all([
    db.from("expenses").select("staff_id, date, amount, adjustment_id").eq("category", "kasbon").is("voided_at", null).lte("date", end),
    db.from("commission_week_pays").select("staff_id, month, kasbon").lte("month", m0).gt("kasbon", 0),
    db.from("payroll_adjustments").select("staff_id, amount").eq("month", m0),
  ]);
  const out: Record<string, KasbonInfo> = {};
  const at = (id: string) => (out[id] ??= { ...NO_KASBON });
  for (const e of ex ?? []) {
    if (!e.staff_id) continue;
    at(e.staff_id).expenses += Number(e.amount);
    if (e.adjustment_id && e.date.slice(0, 7) === month) at(e.staff_id).adjKasbon += Number(e.amount);
  }
  for (const p of pays ?? []) { const k = at(p.staff_id); k.cut += Number(p.kasbon); if (p.month === m0) k.cutMonth += Number(p.kasbon); }
  for (const a of adj ?? []) at(a.staff_id).adjAll += Number(a.amount);
  return out;
}
