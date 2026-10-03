"use client";

import { useSearchParams } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { CloseButton, Empty, Field, Sheet, useOnline, useToast } from "@/components/ui";
import { formatRupiah, formatTanggal, normalizeWhatsApp } from "@/lib/domain/format";
import { useRealtimeTable } from "@/lib/hooks/useRealtimeTable";
import { createClient } from "@/lib/supabase/client";
import type { Master } from "../counter/types";
import { ImportCustomers } from "./import-customers";
import { Profile, type CustRow } from "./profile";

const PAGE = 50;
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
  const [filter, setFilter] = useState<"all" | "follow">(params.get("filter") === "follow" ? "follow" : "all");
  const [limit, setLimit] = useState(PAGE);
  const [selId, setSelId] = useState<string | null>(null);
  const [modal, setModal] = useState<"new" | "import" | null>(null);

  const term = q.replace(/[,()%*]/g, " ").trim();
  const { data, refresh } = useRealtimeTable(["customers", "transactions", "deposit_topups"], async () => {
    const supabase = createClient();
    const { count: followCount } = await supabase.from("customer_stats").select("customer_id", { count: "exact", head: true }).eq("is_churn", true);
    let query = supabase.from("customers").select("id, name, whatsapp, notes", { count: "exact" }).order("name");
    if (term) {
      const digits = term.replace(/\D/g, "").replace(/^0/, "");
      query = query.or(digits.length >= 3 ? `name.ilike.%${term}%,whatsapp.ilike.%${digits}%` : `name.ilike.%${term}%`);
    }
    if (filter === "follow") {
      const { data: churn } = await supabase.from("customer_stats").select("customer_id").eq("is_churn", true);
      query = query.in("id", (churn ?? []).map((c) => c.customer_id!));
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
  const status = (r: CustRow) => r.stats?.is_churn ? ["Follow-up", "#FFDADA", "#6E1616"] : !r.stats?.visit_count ? ["Baru", "#DCEBFF", "#163D78"] : ["Aktif", "#D9F2E1", "#144D2A"];
  // HP: nama (+ kunjungan terakhir di bawahnya) | total | status
  const cols = "grid-cols-[minmax(0,1fr)_auto_auto] sm:grid-cols-[2fr_1.4fr_1.2fr_1fr] xl:grid-cols-[2fr_1.3fr_1.3fr_1.1fr_1.1fr_1.2fr]";

  return (
    <div className="flex h-[calc(100dvh-80px)] gap-4 xl:h-[calc(100dvh-88px)] xl:gap-6">
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <div className="flex min-h-12 flex-wrap items-center gap-3">
          <h1 className="flex-1 font-display text-[28px] font-bold tracking-tight">Pelanggan</h1>
          <label htmlFor="cust-q" className="sr-only">Cari pelanggan</label>
          <input id="cust-q" type="search" placeholder="Cari nama atau no. WA" className="input h-11 w-[200px] xl:w-[260px]"
            value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} />
          {master.role === "manager" && <button onClick={() => setModal("import")} className="btn-ghost h-11 rounded-[10px]">Impor</button>}
          <button onClick={() => setModal("new")} className="btn-ink h-11">Pelanggan baru</button>
        </div>
        <div role="tablist" aria-label="Filter pelanggan" className="flex gap-1.5">
          {([["all", `Semua${data ? ` · ${filter === "all" ? data.total : "…"}` : ""}`], ["follow", `Perlu follow-up · ${data?.followCount ?? 0}`]] as const).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={filter === k} onClick={() => { setFilter(k); setLimit(PAGE); }}
              className={`h-11 rounded-full border px-4 text-[13px] font-bold ${filter === k ? "border-ink bg-ink text-white" : "border-[#D9D4C8] bg-card"}`}>{l}</button>
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
                  className={`grid ${cols} min-h-[52px] w-full items-center gap-3 border-b border-[#F0EDE6] px-4 py-2 text-left text-sm [@media(pointer:coarse)]:min-h-[60px] ${r.id === selId ? "bg-paper" : "hover:bg-[#FAF8F4]"}`}>
                  <span className="flex min-w-0 flex-col"><span className="truncate font-bold">{r.name}</span>
                    <span className="truncate text-xs text-muted tabular sm:hidden">{r.stats?.last_visit_at ? `Terakhir ${formatTanggal(r.stats.last_visit_at)}` : "Belum berkunjung"}</span></span>
                  <span className="hidden truncate text-[#4A463F] tabular xl:block">{r.whatsapp ?? "—"}</span>
                  <span className="tabular max-sm:hidden">{r.stats?.last_visit_at ? formatTanggal(r.stats.last_visit_at) : "—"}</span>
                  <span className="text-right tabular">{formatRupiah(r.stats?.lifetime_value ?? 0)}</span>
                  <span className="hidden text-right tabular xl:block">{formatRupiah(r.stats?.deposit_balance ?? 0)}</span>
                  <span><span className="whitespace-nowrap rounded-full px-2 py-[3px] text-xs font-bold" style={{ background: bg, color: fg }}>{label}</span></span>
                </button>
              );
            })}
            {data && rows.length < data.total && (
              <div className="p-3 text-center">
                <button onClick={() => setLimit(limit + PAGE)} className="btn-ghost h-11 rounded-[10px]">Muat {Math.min(PAGE, data.total - rows.length)} lagi · {rows.length}/{data.total}</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {wide ? (
        <section aria-label="Profil pelanggan" className="w-[340px] shrink-0 overflow-y-auto rounded-[14px] border border-line bg-card xl:w-[420px]">
          {sel ? <Profile key={sel.id} c={sel} master={master} /> : <Empty>Pilih pelanggan untuk melihat profil, riwayat, dan saldo deposit.</Empty>}
        </section>
      ) : (
        <Sheet open={!!sel} onClose={() => setSelId(null)} label="Profil pelanggan" variant="drawer">
          {sel && <Profile key={sel.id} c={sel} master={master} onClose={() => setSelId(null)} />}
        </Sheet>
      )}

      <Sheet open={modal === "new"} onClose={() => setModal(null)} label="Pelanggan baru" width={480}>
        <NewCustomer online={online} onClose={() => setModal(null)} onSaved={(id, name) => { toast(`${name} ditambahkan`); setModal(null); setQ(name); setSelId(id); refresh(); }} />
      </Sheet>
      <Sheet open={modal === "import"} onClose={() => setModal(null)} label="Impor pelanggan" width={720}>
        <ImportCustomers onClose={() => setModal(null)} onDone={() => { setModal(null); refresh(); }} />
      </Sheet>
    </div>
  );
}

function NewCustomer({ online, onClose, onSaved }: { online: boolean; onClose: () => void; onSaved: (id: string, name: string) => void }) {
  const [f, setF] = useState({ name: "", wa: "", notes: "" });
  const [error, setError] = useState("");
  async function save() {
    setError("");
    const wa = f.wa.trim() ? normalizeWhatsApp(f.wa) : null;
    if (!f.name.trim()) return setError("Isi nama.");
    if (f.wa.trim() && !wa) return setError("No. WhatsApp belum valid.");
    const { data, error } = await createClient().from("customers").insert({ name: f.name.trim(), whatsapp: wa, notes: f.notes.trim() }).select("id").single();
    if (error) return setError(error.code === "23505" ? "No. WhatsApp sudah terdaftar — cari di daftar pelanggan." : error.message);
    onSaved(data.id, f.name.trim());
  }
  return (
    <form onSubmit={(e) => { e.preventDefault(); save(); }} className="flex flex-col gap-4 p-6">
      <div className="flex items-center gap-3"><h2 className="flex-1 font-display text-2xl font-bold">Pelanggan baru</h2><CloseButton onClick={onClose} /></div>
      <Field label="Nama" htmlFor="nc-name"><input id="nc-name" className="input" autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <Field label="No. WhatsApp" htmlFor="nc-wa"><input id="nc-wa" className="input tabular" inputMode="tel" placeholder="08…" value={f.wa} onChange={(e) => setF({ ...f, wa: e.target.value })} /></Field>
      <Field label="Catatan preferensi (opsional)" htmlFor="nc-notes"><textarea id="nc-notes" rows={3} className="input py-2.5" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      {error && <p role="alert" className="text-[13px] font-semibold text-[#A12A2A]">{error}</p>}
      <div className="flex justify-end gap-2.5">
        <button type="button" onClick={onClose} className="btn-ghost h-12 rounded-[10px]">Batal</button>
        <button disabled={!online} className="btn-ink h-12 px-6">Simpan</button>
      </div>
    </form>
  );
}
