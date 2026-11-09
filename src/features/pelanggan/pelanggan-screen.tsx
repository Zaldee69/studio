"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RouteTabs, PELANGGAN_TABS } from "@/components/route-tabs";
import { useSearchParams } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { Empty, Sheet, useOnline, useToast } from "@/components/ui";
import { formatRupiah, formatTanggal } from "@/lib/domain/format";
import { useRealtimeTable } from "@/lib/hooks/useRealtimeTable";
import { createClient } from "@/lib/supabase/client";
import type { Master } from "../counter/types";
import { NewCustomer } from "../counter/new-customer";
import { ImportCustomers } from "./import-customers";
import { Profile, type CustRow } from "./profile";

const PAGE = 50;
type Filter = "all" | "follow" | "due" | "never";
const daysAgo = (n: number) => new Date(Date.now() - n * 864e5).toISOString();
const wideQuery = "(min-width: 1000px)";
const useWide = () => useSyncExternalStore(
  (cb) => { const m = matchMedia(wideQuery); m.addEventListener("change", cb); return () => m.removeEventListener("change", cb); },
  () => matchMedia(wideQuery).matches, () => true);

export function PelangganScreen({ master }: { master: Master }) {
  const toast = useToast();
  const online = useOnline();
  const wide = useWide();
  const [q, setQ] = useState("");
  const params = useSearchParams();
  const asked = params.get("filter");
  const [filter, setFilter] = useState<Filter>(asked === "follow" || asked === "due" || asked === "never" ? asked : "all");
  const [limit, setLimit] = useState(PAGE);
  const [selId, setSelId] = useState<string | null>(null);
  const [modal, setModal] = useState<"new" | "import" | null>(null);

  const term = q.replace(/[,()%*]/g, " ").trim();
  const { data, refresh } = useRealtimeTable(["customers", "transactions", "deposit_topups"], async () => {
    const supabase = createClient();
    const { count: followCount } = await supabase.from("customer_stats").select("customer_id", { count: "exact", head: true }).eq("is_churn", true);
    let query = supabase.from("customers").select("id, name, whatsapp, notes", { count: "exact" }).is("deleted_at", null).order("name");
    if (term) {
      const digits = term.replace(/\D/g, "").replace(/^0/, "");
      query = query.or(digits.length >= 3 ? `name.ilike.%${term}%,whatsapp.ilike.%${digits}%` : `name.ilike.%${term}%`);
    }
    if (filter === "follow") {
      const { data: churn } = await supabase.from("customer_stats").select("customer_id").eq("is_churn", true);
      query = query.in("id", (churn ?? []).map((c) => c.customer_id!));
    }
    // Ajak kembali (rencana volume 10 Nov): jatuh tempo potong ulang 3–5 minggu, dan kontak ber-WA yang belum pernah datang
    if (filter === "due") {
      const { data: due } = await supabase.from("customer_stats").select("customer_id")
        .gte("last_visit_at", daysAgo(35)).lt("last_visit_at", daysAgo(21));
      query = query.in("id", (due ?? []).map((c) => c.customer_id!));
    }
    if (filter === "never") {
      const { data: none } = await supabase.from("customer_stats").select("customer_id").eq("visit_count", 0);
      query = query.not("whatsapp", "is", null).in("id", (none ?? []).map((c) => c.customer_id!));
    }
    const { data: rows, count } = await query.range(0, limit - 1);
    const { data: stats } = await supabase.from("customer_stats").select("*").in("customer_id", (rows ?? []).map((r) => r.id));
    const byId = new Map((stats ?? []).map((s) => [s.customer_id!, s]));
    return {
      total: count ?? 0, followCount: followCount ?? 0,
      rows: (rows ?? []).map((r) => {
        const s = byId.get(r.id);
        return { ...r, stats: s ? { lifetime_value: s.lifetime_value!, visit_count: s.visit_count!, last_visit_at: s.last_visit_at, deposit_balance: s.deposit_balance!, is_churn: !!s.is_churn } : null } as CustRow;
      }),
    };
  }, JSON.stringify([term, filter, limit]));

  const rows = data?.rows ?? [];
  const sel = rows.find((r) => r.id === selId) ?? null;
  const status = (r: CustRow) => r.stats?.is_churn ? ["Follow-up", "#F9E6E6", "#6E1616"] : !r.stats?.visit_count ? ["Baru", "#EEF3F7", "#24435A"] : ["Aktif", "#E6F1E4", "#144D2A"];
  // HP: nama (+ kunjungan terakhir di bawahnya) | total | status
  const cols = "grid-cols-[minmax(0,1fr)_auto_auto] sm:grid-cols-[2fr_1.4fr_1.2fr_1fr] xl:grid-cols-[2fr_1.3fr_1.3fr_1.1fr_1.1fr_1.2fr]";

  return (
    <div className="flex h-[calc(100dvh-80px)] gap-4 xl:h-[calc(100dvh-88px)] xl:gap-6">
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <div className="flex min-h-12 flex-wrap items-center gap-3">
          <h1 className="flex-1 font-display text-[28px] font-bold tracking-tight">Pelanggan</h1>
          <label htmlFor="cust-q" className="sr-only">Cari pelanggan</label>
          <Input id="cust-q" type="search" placeholder="Cari nama atau no. WA" className="h-11 w-[200px] xl:w-[260px]"
            value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} />
          {master.role === "manager" && <Button onClick={() => setModal("import")} variant="outline" className="h-11 rounded-[10px]">Impor</Button>}
          <Button onClick={() => setModal("new")} className="h-11">Pelanggan baru</Button>
        </div>
        {master.role === "manager" && <RouteTabs tabs={PELANGGAN_TABS} label="Bagian pelanggan" />}
        <div role="tablist" aria-label="Filter pelanggan" className="flex flex-wrap gap-1.5">
          {([["all", "Semua"], ["follow", `Perlu follow-up · ${data?.followCount ?? 0}`], ["due", "Jatuh tempo 3–5 minggu"], ["never", "Belum pernah datang"]] as const).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={filter === k} onClick={() => { setFilter(k); setLimit(PAGE); }}
              className={`h-11 rounded-full border px-4 text-[13px] font-bold ${filter === k ? "border-ink bg-ink text-white" : "border-[#DCDCD6] bg-card"}`}>
              {l}{filter === k && k !== "follow" && data ? ` · ${data.total}` : ""}</button>
          ))}
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[14px] border border-line bg-card">
          <div className={`grid ${cols} gap-3 border-b border-line px-4 py-3 text-xs font-bold text-muted`}>
            <span>Nama</span><span className="hidden xl:block">WhatsApp</span><span className="max-sm:hidden">Kunjungan terakhir</span><span className="text-right">Total belanja</span>
            <span className="hidden text-right xl:block">Saldo deposit</span><span>Status</span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {!data ? <Empty>Memuat…</Empty> : !rows.length ? <Empty>Tidak ada pelanggan yang cocok.</Empty> : rows.map((r) => {
              const [label, bg, fg] = status(r);
              return (
                <button key={r.id} aria-pressed={r.id === selId} onClick={() => setSelId(r.id)}
                  className={`grid ${cols} min-h-[52px] w-full items-center gap-3 border-b border-[#EEEEEA] px-4 py-2 text-left text-sm [@media(pointer:coarse)]:min-h-[60px] ${r.id === selId ? "bg-paper" : "hover:bg-[#FAF8F4]"}`}>
                  <span className="flex min-w-0 flex-col"><span className="truncate font-bold">{r.name}</span>
                    <span className="truncate text-xs text-muted tabular sm:hidden">{r.stats?.last_visit_at ? `Terakhir ${formatTanggal(r.stats.last_visit_at)}` : "Belum berkunjung"}</span></span>
                  <span className="hidden truncate text-[#4A4C46] tabular xl:block">{r.whatsapp ?? "—"}</span>
                  <span className="tabular max-sm:hidden">{r.stats?.last_visit_at ? formatTanggal(r.stats.last_visit_at) : "—"}</span>
                  <span className="text-right tabular">{formatRupiah(r.stats?.lifetime_value ?? 0)}</span>
                  <span className="hidden text-right tabular xl:block">{formatRupiah(r.stats?.deposit_balance ?? 0)}</span>
                  <span><span className="whitespace-nowrap rounded-full px-2 py-[3px] text-xs font-bold" style={{ background: bg, color: fg }}>{label}</span></span>
                </button>
              );
            })}
            {data && rows.length < data.total && (
              <div className="p-3 text-center">
                <Button onClick={() => setLimit(limit + PAGE)} variant="outline" className="h-11 rounded-[10px]">Muat {Math.min(PAGE, data.total - rows.length)} lagi · {rows.length}/{data.total}</Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {wide ? (
        <section aria-label="Profil pelanggan" className="w-[340px] shrink-0 overflow-y-auto rounded-[14px] border border-line bg-card xl:w-[420px]">
          {sel ? <Profile key={sel.id} c={sel} master={master} onDeleted={() => { setSelId(null); refresh(); }} /> : <Empty>Pilih pelanggan untuk melihat profil, riwayat, dan saldo deposit.</Empty>}
        </section>
      ) : (
        <Sheet open={!!sel} onClose={() => setSelId(null)} label="Profil pelanggan" variant="drawer">
          {sel && <Profile key={sel.id} c={sel} master={master} onClose={() => setSelId(null)} onDeleted={() => { setSelId(null); refresh(); }} />}
        </Sheet>
      )}

      <Sheet open={modal === "new"} onClose={() => setModal(null)} label="Pelanggan baru" width={480}>
        <NewCustomer online={online} onClose={() => setModal(null)} onSaved={(c) => { toast(`${c.name} ditambahkan`); setModal(null); setQ(c.name); setSelId(c.id); refresh(); }} />
      </Sheet>
      <Sheet open={modal === "import"} onClose={() => setModal(null)} label="Impor pelanggan" width={720}>
        <ImportCustomers onClose={() => setModal(null)} onDone={() => { setModal(null); refresh(); }} />
      </Sheet>
    </div>
  );
}
