import { CrudTable } from "@/app/manajer/pengaturan/crud-table";
import { TabNav } from "@/components/tab-nav";
import { ItemsTable, ReorderBanner, type RetailExtra } from "@/features/inventaris/items-table";
import { MovesTab, UsageTab, type MoveRow, type UsageRow } from "@/features/inventaris/moves";
import { loadOpnames } from "@/features/inventaris/load";
import { OpnameList } from "@/features/inventaris/opname";
import { InvHeader, InventoryProvider } from "@/features/inventaris/provider";
import { RecipeTab, type Margin, type RecipeLine, type RecipeService } from "@/features/inventaris/recipe";
import { SCOPE_LABEL, type InvSettings, type StockRow, type Supplier } from "@/features/inventaris/types";
import { formatTanggal } from "@/lib/domain/format";
import type { CostMethod } from "@/lib/domain/inventory";
import { createClient } from "@/lib/supabase/server";
import { BRAND } from "@/lib/brand";

export const metadata = { title: "Inventaris" };

const TABS = [
  ["bahan", "Bahan HPP"], ["ritel", "Barang Ritel"], ["resep", "Resep HPP"], ["opname", "Stok Opname"],
  ["mutasi", "Mutasi"], ["pemasok", "Pemasok"], ["laporan", "Laporan Pemakaian"],
] as const;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

export default async function Inventaris({ searchParams }: PageProps<"/manajer/inventaris">) {
  const sp = await searchParams;
  const tab = TABS.some(([k]) => k === sp.tab) ? one(sp.tab) : "bahan";
  const supabase = await createClient();
  const [{ data: levels }, { data: sups }, { data: st }] = await Promise.all([
    supabase.from("stock_levels").select("*").order("name"),
    supabase.from("suppliers").select("id, name, whatsapp, active, notes").order("name"),
    supabase.from("settings").select("inventory_cost_method, margin_warning_pct, reorder_suggest_multiplier, shop_name, commission_pct, usage_variance_threshold_pct").single(),
  ]);
  const items = (levels ?? []).map((l) => ({ ...l, qty: Number(l.qty), reorder_at: Number(l.reorder_at), unit_cost: Number(l.unit_cost), stock_value: Number(l.stock_value) })) as StockRow[];
  const suppliers = (sups ?? []) as Supplier[];
  const settings: InvSettings = {
    method: (st?.inventory_cost_method ?? "weighted_avg") as CostMethod, marginWarn: Number(st?.margin_warning_pct ?? 60),
    multiplier: Number(st?.reorder_suggest_multiplier ?? 2), shop: st?.shop_name ?? BRAND, ratio: st?.commission_pct ?? 40,
    variancePct: Number(st?.usage_variance_threshold_pct ?? 10),
  };

  let body: React.ReactNode;
  if (tab === "bahan") {
    body = <ItemsTable kind="consumable" />;
  } else if (tab === "ritel") {
    const since = new Date(Date.now() - 30 * 864e5).toISOString(); // eslint-disable-line react-hooks/purity -- Server Component, per permintaan
    const [{ data: svcs }, { data: sold }, { data: staff }] = await Promise.all([
      supabase.from("services").select("id, price, stock_item_id").eq("category", "retail"),
      supabase.from("transaction_items").select("service_id, staff_id, transaction:transactions!inner(created_at, voided_at)")
        .eq("category", "retail").gte("transaction.created_at", since).is("transaction.voided_at", null),
      supabase.from("staff").select("id, name"),
    ]);
    const itemOf = new Map((svcs ?? []).map((s) => [s.id, s.stock_item_id]));
    const extras: Record<string, RetailExtra> = {};
    for (const s of svcs ?? []) if (s.stock_item_id) extras[s.stock_item_id] = { price: s.price, sold30: 0, topSeller: null };
    const sellers: Record<string, Record<string, number>> = {};
    for (const t of sold ?? []) {
      const it = itemOf.get(t.service_id ?? "");
      if (!it) continue;
      extras[it] ??= { price: null, sold30: 0, topSeller: null };
      extras[it].sold30++;
      if (t.staff_id) (sellers[it] ??= {})[t.staff_id] = (sellers[it][t.staff_id] ?? 0) + 1;
    }
    for (const [it, by] of Object.entries(sellers)) {
      const top = Object.entries(by).sort((a, b) => b[1] - a[1])[0]?.[0];
      extras[it].topSeller = (staff ?? []).find((s) => s.id === top)?.name ?? null;
    }
    body = <ItemsTable kind="retail" extras={extras} />;
  } else if (tab === "resep") {
    const [{ data: svcs }, { data: lines }, { data: margins }] = await Promise.all([
      supabase.from("services").select("id, name, category, price, active").neq("category", "retail").order("sort"),
      supabase.from("service_materials").select("service_id, item_id, qty"),
      supabase.from("service_margins").select("id, name, price, hpp, margin_pct, commission, contribution").eq("active", true),
    ]);
    body = <RecipeTab services={(svcs ?? []) as RecipeService[]} lines={(lines ?? []).map((l) => ({ ...l, qty: Number(l.qty) })) as RecipeLine[]}
      margins={(margins ?? []).map((m) => ({ ...m, margin_pct: Number(m.margin_pct) })) as Margin[]} />;
  } else if (tab === "opname") {
    body = <OpnameList rows={await loadOpnames(supabase, true)} base="/manajer/inventaris/opname" showValue />;
  } else if (tab === "mutasi") {
    const f = { item: one(sp.item), type: one(sp.type), from: one(sp.from), to: one(sp.to), by: one(sp.by) };
    let q = supabase.from("stock_moves").select("id, created_at, item_id, qty, type, unit_cost, note, reason, transaction_id, opname_id, invoice_no, attachment_path, created_by")
      .order("created_at", { ascending: false }).limit(500);
    if (f.item) q = q.eq("item_id", f.item);
    if (f.type) q = q.eq("type", f.type as "in");
    if (f.from) q = q.gte("created_at", `${f.from}T00:00:00+07:00`);
    if (f.to) q = q.lt("created_at", new Date(Date.parse(`${f.to}T00:00:00+07:00`) + 864e5).toISOString());
    if (f.by) q = q.eq("created_by", f.by);
    const [{ data: moves }, { data: people }] = await Promise.all([q, supabase.from("team_names").select("id, full_name")]);
    const name = new Map((people ?? []).map((p) => [p.id, p.full_name]));
    const rows: MoveRow[] = (moves ?? []).map((m) => ({ ...m, qty: Number(m.qty), unit_cost: m.unit_cost == null ? null : Number(m.unit_cost), by: name.get(m.created_by ?? "") ?? "Sistem" }));
    body = <MovesTab rows={rows} items={items} filter={f} people={(people ?? []).map((p) => [p.id!, p.full_name!] as [string, string])} />;
  } else if (tab === "pemasok") {
    body = (
      <div className="flex flex-col gap-4">
        <CrudTable table="suppliers" rows={sups ?? []} />
        <section className="grid gap-3 min-[820px]:grid-cols-2 xl:grid-cols-3">
          {suppliers.map((s) => {
            const list = items.filter((i) => i.supplier_id === s.id);
            return (
              <div key={s.id} className="rounded-[14px] border border-line bg-card p-4 text-sm">
                <b className="text-base">{s.name}</b>{s.whatsapp && <span className="ml-2 text-muted tabular">+{s.whatsapp}</span>}
                <p className="mt-1 text-muted">{list.length ? list.map((i) => i.name).join(", ") : "Belum ada item — atur pemasok di tab Bahan/Ritel."}</p>
              </div>
            );
          })}
        </section>
      </div>
    );
  } else {
    const { data: ops } = await supabase.from("stock_opnames").select("id, started_at, scope").eq("status", "approved").in("scope", ["consumable", "all"])
      .order("started_at", { ascending: false }).limit(24);
    const list = (ops ?? []).map((o) => ({ id: o.id, label: `${formatTanggal(o.started_at)} · ${SCOPE_LABEL[o.scope]}` }));
    const to = one(sp.sampai) || list[0]?.id || "", from = one(sp.dari) || list[1]?.id || "";
    let rows: UsageRow[] | null = null;
    if (from && to && from !== to) {
      const { data } = await supabase.rpc("usage_report", { p_from_opname: from, p_to_opname: to });
      rows = (data ?? []).map((r) => ({ ...r, theoretical: Number(r.theoretical), actual: Number(r.actual), variance: Number(r.variance),
        variance_pct: r.variance_pct == null ? null : Number(r.variance_pct), variance_value: Number(r.variance_value) }));
    }
    body = <UsageTab opnames={list} from={from} to={to} rows={rows} threshold={settings.variancePct} />;
  }

  return (
    <InventoryProvider items={items} suppliers={suppliers} settings={settings}>
      <div className="flex flex-col gap-4">
        <InvHeader />
        <ReorderBanner />
        <TabNav tabs={TABS} current={tab} label="Bagian inventaris" />
        <div>{body}</div>
      </div>
    </InventoryProvider>
  );
}
