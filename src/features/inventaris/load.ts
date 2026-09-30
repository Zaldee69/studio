import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { OpnameRow } from "./opname";

type Supa = Awaited<ReturnType<typeof createClient>>;
/** Daftar opname + progres hitung. `withNames`: manajer melihat nama penghitung/penyetuju & nilai selisih. */
export async function loadOpnames(supabase: Supa, withNames: boolean): Promise<OpnameRow[]> {
  const [{ data: ops }, { data: sheet }, { data: people }] = await Promise.all([
    supabase.from("stock_opnames").select("id, scope, status, started_at, approved_at, started_by, approved_by").order("started_at", { ascending: false }).limit(30),
    supabase.from("opname_sheet").select("opname_id, counted_qty"),
    withNames ? supabase.from("team_names").select("id, full_name") : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
  ]);
  const values = withNames
    ? (await supabase.from("stock_opname_lines").select("opname_id, diff, unit_cost").not("counted_qty", "is", null)).data ?? []
    : [];
  const name = new Map((people ?? []).map((p) => [p.id, p.full_name]));
  return (ops ?? []).map((o) => {
    const lines = (sheet ?? []).filter((l) => l.opname_id === o.id);
    const v = values.filter((x) => x.opname_id === o.id).reduce((a, x) => a + Number(x.diff) * Number(x.unit_cost), 0);
    return {
      id: o.id, scope: o.scope, status: o.status, started_at: o.started_at, approved_at: o.approved_at,
      starter: name.get(o.started_by ?? "") ?? "—", approver: name.get(o.approved_by ?? "") ?? "",
      value: withNames ? Math.round(v) : null, counted: lines.filter((l) => l.counted_qty !== null).length, total: lines.length,
    };
  });
}
