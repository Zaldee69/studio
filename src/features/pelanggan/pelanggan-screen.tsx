"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { RouteTabs, PELANGGAN_TABS } from "@/components/route-tabs";
import { Icon } from "@/components/icons";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { CloseButton, Empty, Sheet, useOnline, useToast } from "@/components/ui";
import { CUSTOMER_SOURCES } from "@/lib/domain/customer";
import { formatRupiah, formatTanggal } from "@/lib/domain/format";
import { useRealtimeTable } from "@/lib/hooks/useRealtimeTable";
import { createClient } from "@/lib/supabase/client";
import type { Master } from "../counter/types";
import { NewCustomer } from "../counter/new-customer";
import { ImportCustomers } from "./import-customers";
import { Profile, type CustRow } from "./profile";

const PAGE = 50;
const DAY = 864e5;
type Seg = "all" | "active" | "due" | "follow" | "never" | "deposit" | "loyal" | "top";
type Sort = "name" | "recent" | "oldest" | "spend" | "visits" | "balance" | "newest";
type Row = CustRow & { source: string | null; created_at: string };

const TOP_N = 10;
const SEGMENTS: { key: Seg; label: string; hint: string; test: (r: Row, now: number, topCut: number) => boolean }[] = [
  { key: "all", label: "Semua", hint: "Semua pelanggan", test: () => true },
  { key: "active", label: "Aktif 30 hari", hint: "Datang dalam 30 hari terakhir", test: (r, n) => !!r.stats?.last_visit_at && n - Date.parse(r.stats.last_visit_at) <= 30 * DAY },
  { key: "due", label: "Jatuh tempo", hint: "Terakhir datang 3–5 minggu lalu, saatnya diajak potong lagi", test: (r, n) => { const a = r.stats?.last_visit_at ? n - Date.parse(r.stats.last_visit_at) : -1; return a >= 21 * DAY && a < 35 * DAY; } },
  { key: "follow", label: "Perlu follow-up", hint: "Lama tidak datang (melewati batas churn)", test: (r) => !!r.stats?.is_churn },
  { key: "never", label: "Belum pernah datang", hint: "Kontak yang belum pernah bertransaksi", test: (r) => !r.stats?.visit_count },
  { key: "deposit", label: "Punya saldo", hint: "Masih punya saldo deposit", test: (r) => (r.stats?.deposit_balance ?? 0) > 0 },
  { key: "loyal", label: "Langganan", hint: "Enam kunjungan atau lebih", test: (r) => (r.stats?.visit_count ?? 0) >= 6 },
  { key: "top", label: `Transaksi terbanyak`, hint: `${TOP_N} pelanggan dengan transaksi paling banyak`, test: (r, _n, cut) => (r.stats?.visit_count ?? 0) >= cut && cut > 0 },
];
const SORTS: [Sort, string][] = [
  ["name", "Nama A–Z"], ["recent", "Terakhir datang (terbaru)"], ["oldest", "Paling lama tidak datang"], ["spend", "Total belanja terbesar"],
  ["visits", "Kunjungan terbanyak"], ["balance", "Saldo deposit terbesar"], ["newest", "Terbaru ditambahkan"],
];
const last = (r: Row) => (r.stats?.last_visit_at ? Date.parse(r.stats.last_visit_at) : 0);
const SORT_FN: Record<Sort, (a: Row, b: Row) => number> = {
  name: (a, b) => a.name.localeCompare(b.name, "id"),
  recent: (a, b) => last(b) - last(a),
  oldest: (a, b) => (last(a) || Infinity) - (last(b) || Infinity),
  spend: (a, b) => (b.stats?.lifetime_value ?? 0) - (a.stats?.lifetime_value ?? 0),
  visits: (a, b) => (b.stats?.visit_count ?? 0) - (a.stats?.visit_count ?? 0),
  balance: (a, b) => (b.stats?.deposit_balance ?? 0) - (a.stats?.deposit_balance ?? 0),
  newest: (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
};

/** Ambil semua baris (PostgREST membatasi 1000 per permintaan). Cukup untuk ribuan pelanggan; di atas ±10 rb pindahkan penyaringan ke server. */
async function pages<T>(q: (from: number, to: number) => PromiseLike<{ data: T[] | null }>) {
  const out: T[] = [];
  for (let i = 0; ; i += 1000) { const { data } = await q(i, i + 999); out.push(...(data ?? [])); if ((data?.length ?? 0) < 1000) break; }
  return out;
}

export function PelangganScreen({ master }: { master: Master }) {
  const toast = useToast();
  const online = useOnline();
  const params = useSearchParams();
  const asked = params.get("filter");
  const [q, setQ] = useState("");
  const [seg, setSeg] = useState<Seg>(asked === "follow" || asked === "due" || asked === "never" ? asked : "all");
  const [sort, setSort] = useState<Sort>("name");
  const [source, setSource] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [selId, setSelId] = useState<string | null>(null);
  const [modal, setModal] = useState<"new" | "import" | null>(null);

  const { data, refresh } = useRealtimeTable(["customers", "transactions", "deposit_topups"], async () => {
    const supabase = createClient();
    const [cs, st] = await Promise.all([
      pages((a, b) => supabase.from("customers").select("id, name, whatsapp, notes, source, created_at").is("deleted_at", null).order("id").range(a, b)),
      pages((a, b) => supabase.from("customer_stats").select("*").order("customer_id").range(a, b)),
    ]);
    const byId = new Map(st.map((s) => [s.customer_id!, s]));
    return { now: Date.now(), rows: cs.map((c) => {
      const s = byId.get(c.id);
      return { ...c, stats: s ? { lifetime_value: s.lifetime_value!, visit_count: s.visit_count!, last_visit_at: s.last_visit_at, deposit_balance: s.deposit_balance!, is_churn: !!s.is_churn } : null } as Row;
    }) };
  }, "all");

  const all = useMemo(() => data?.rows ?? [], [data]);
  const now = data?.now ?? 0; // waktu diambil saat data dimuat (render harus murni)
  // ambang "transaksi terbanyak": jumlah kunjungan ke-10 tertinggi (minimal 1 kunjungan)
  const topCut = useMemo(() => [...all].map((r) => r.stats?.visit_count ?? 0).sort((a, b) => b - a)[TOP_N - 1] ?? 0, [all]);
  const counts = useMemo(() => Object.fromEntries(SEGMENTS.map((s) => [s.key, all.filter((r) => s.test(r, now, topCut)).length])) as Record<Seg, number>, [all, now, topCut]);
  const term = q.trim().toLowerCase();
  const digits = q.replace(/\D/g, "").replace(/^0/, "");
  const segDef = SEGMENTS.find((s) => s.key === seg)!;
  const list = useMemo(() => all
    .filter((r) => segDef.test(r, now, topCut) && (!source || r.source === source)
      && (!term || r.name.toLowerCase().includes(term) || (digits.length >= 3 && !!r.whatsapp && r.whatsapp.includes(digits))))
    .sort(SORT_FN[sort]), [all, segDef, source, term, digits, sort, now, topCut]);
  const rows = list.slice(0, limit);
  const sel = all.find((r) => r.id === selId) ?? null;
  const totalBalance = all.reduce((n, r) => n + (r.stats?.deposit_balance ?? 0), 0);
  const filtered = seg !== "all" || !!source || !!term || sort !== "name";
  const reset = () => { setSeg("all"); setSource(""); setQ(""); setSort("name"); setLimit(PAGE); };
  const status = (r: Row) => r.stats?.is_churn ? ["Follow-up", "#FBE6E3", "#D94B42"] : !r.stats?.visit_count ? ["Baru", "#E8E5DE", "#4D4A55"] : ["Aktif", "#E3F1E8", "#268052"];
  // HP: nama (+ kunjungan terakhir di bawahnya) | total | status
  const cols = "grid-cols-[minmax(0,1fr)_auto_auto] sm:grid-cols-[2fr_1.4fr_1.2fr_1fr] xl:grid-cols-[2fr_1.3fr_1.3fr_0.8fr_1.1fr_1.1fr_1.2fr]";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="flex-1 font-display text-[28px] font-medium tracking-tight">Pelanggan</h1>
          {master.role === "manager" && <Button onClick={() => setModal("import")} variant="outline" size="lg">Impor</Button>}
          <Button onClick={() => setModal("new")} size="lg">+ Pelanggan baru</Button>
        </div>
        {master.role === "manager" && <RouteTabs tabs={PELANGGAN_TABS} label="Bagian pelanggan" />}

        <div className="grid grid-cols-2 gap-3 min-[900px]:grid-cols-4">
          {([
            ["Total pelanggan", all.length, "semua pelanggan", "all"],
            ["Aktif 30 hari", counts.active, "datang bulan ini", "active"],
            ["Perlu follow-up", counts.follow, "lama tidak datang", "follow"],
            ["Saldo deposit", formatRupiah(totalBalance), `${counts.deposit} pelanggan`, "deposit"],
          ] as const).map(([l, v, sub, k]) => (
            <button key={l} type="button" onClick={() => { setSeg(k); setLimit(PAGE); }} aria-pressed={seg === k}
              className={`flex flex-col items-start gap-0.5 rounded-[14px] border bg-card px-4 py-3 text-left transition hover:bg-paper ${seg === k ? "border-accent" : "border-line"}`}>
              <span className="text-sm text-muted">{l}</span>
              <b className={`tabular text-2xl font-semibold ${k === "follow" && counts.follow ? "text-[#D94B42]" : ""}`}>{v}</b>
              <span className="text-xs text-muted">{sub}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-3 rounded-3xl border border-line bg-card p-4">
          <div className="flex flex-wrap items-center gap-3">
            <label htmlFor="cust-q" className="sr-only">Cari pelanggan</label>
            <div className="relative min-w-[220px] flex-1">
              <Icon name="search" className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted" />
              <Input id="cust-q" type="search" placeholder="Cari nama atau nomor WhatsApp" className="h-12 pl-12" value={q}
                onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} autoComplete="off" />
            </div>
            <label className="flex items-center gap-2 text-sm text-muted">Urutkan
              <NativeSelect aria-label="Urutkan pelanggan" value={sort} onChange={(e) => { setSort(e.target.value as Sort); setLimit(PAGE); }} className="w-56">
                {SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </NativeSelect>
            </label>
            <label className="flex items-center gap-2 text-sm text-muted">Sumber
              <NativeSelect aria-label="Filter sumber pelanggan" value={source} onChange={(e) => { setSource(e.target.value); setLimit(PAGE); }} className="w-48">
                <option value="">Semua</option>
                {CUSTOMER_SOURCES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </NativeSelect>
            </label>
          </div>
          <div role="group" aria-label="Kelompok pelanggan" className="flex flex-wrap gap-2">
            {SEGMENTS.map((s) => (
              <button key={s.key} type="button" title={s.hint} aria-pressed={seg === s.key} onClick={() => { setSeg(s.key); if (s.key === "top") setSort("visits"); setLimit(PAGE); }}
                className={`min-h-10 rounded-full border px-4 text-sm font-medium transition ${seg === s.key ? "border-accent bg-accent-soft text-accent" : "border-input bg-card text-ink hover:bg-paper"}`}>
                {s.label} <span className={`tabular ${seg === s.key ? "text-accent" : "text-muted"}`}>{counts[s.key]}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col overflow-hidden rounded-3xl border border-line bg-card">
          <div className="flex items-center gap-3 border-b border-line px-5 py-3 text-sm">
            <span className="flex-1 text-muted">{!data ? "Memuat…" : <>Menampilkan <b className="text-ink">{rows.length}</b> dari {list.length} pelanggan{seg !== "all" ? ` · ${segDef.label}` : ""}</>}</span>
            {filtered && <button type="button" onClick={reset} className="font-medium text-accent hover:underline">Hapus filter</button>}
          </div>
          <div className={`grid ${cols} gap-3 border-b border-line bg-paper px-5 py-2.5 text-xs font-medium text-muted`}>
            <span>Nama</span><span className="hidden xl:block">WhatsApp</span><span className="max-sm:hidden">Kunjungan terakhir</span><span className="hidden text-right xl:block">Transaksi</span><span className="text-right">Total belanja</span>
            <span className="hidden text-right xl:block">Saldo deposit</span><span>Status</span>
          </div>
          <div>
            {!data ? <Empty>Memuat…</Empty> : !rows.length ? (
              <div className="flex flex-col items-center gap-3 px-6 py-12 text-center text-sm text-muted">
                Tidak ada pelanggan yang cocok{term ? ` dengan "${q.trim()}"` : ""}.
                {filtered && <Button variant="outline" onClick={reset}>Hapus semua filter</Button>}
              </div>
            ) : rows.map((r) => {
              const [label, bg, fg] = status(r);
              return (
                <button key={r.id} onClick={() => setSelId(r.id)}
                  className={`grid ${cols} min-h-[56px] w-full items-center gap-3 border-b border-line px-5 py-2 text-left text-sm last:border-0 [@media(pointer:coarse)]:min-h-[64px] ${"hover:bg-paper"}`}>
                  <span className="flex min-w-0 flex-col"><span className="truncate font-medium">{r.name}</span>
                    <span className="truncate text-xs text-muted tabular xl:hidden">{r.whatsapp ?? "Tanpa WhatsApp"}{r.stats?.last_visit_at ? ` · ${formatTanggal(r.stats.last_visit_at)}` : ""}</span></span>
                  <span className="hidden truncate text-muted tabular xl:block">{r.whatsapp ?? "—"}</span>
                  <span className="tabular text-muted max-sm:hidden">{r.stats?.last_visit_at ? formatTanggal(r.stats.last_visit_at) : "—"}</span>
                  <span className="hidden text-right tabular xl:block">{r.stats?.visit_count ?? 0}</span>
                  <span className="text-right tabular">{formatRupiah(r.stats?.lifetime_value ?? 0)}</span>
                  <span className="hidden text-right tabular xl:block">{formatRupiah(r.stats?.deposit_balance ?? 0)}</span>
                  <span><span className="whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium" style={{ background: bg, color: fg }}>{label}</span></span>
                </button>
              );
            })}
            {data && rows.length < list.length && (
              <div className="p-4 text-center">
                <Button onClick={() => setLimit(limit + PAGE)} variant="outline">Muat {Math.min(PAGE, list.length - rows.length)} lagi · {rows.length}/{list.length}</Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* profil pelanggan: dialog di tengah (tidak memakan ruang daftar) */}
      <Sheet open={!!sel} onClose={() => setSelId(null)} label="Profil pelanggan" width={640}>
        {sel && (
          <div>
            <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-line bg-card px-6 py-4">
              <div className="min-w-0 flex-1"><h2 className="truncate font-display text-xl font-medium">{sel.name}</h2><p className="text-sm text-muted">Profil pelanggan{sel.whatsapp ? ` · ${sel.whatsapp}` : ""}</p></div>
              <CloseButton onClick={() => setSelId(null)} />
            </div>
            <Profile key={sel.id} c={sel} master={master} onDeleted={() => { setSelId(null); refresh(); }} />
          </div>
        )}
      </Sheet>

      <Sheet open={modal === "new"} onClose={() => setModal(null)} label="Pelanggan baru" width={480}>
        <NewCustomer online={online} onClose={() => setModal(null)} onSaved={(c) => { toast(`${c.name} ditambahkan`); setModal(null); setQ(c.name); setSelId(c.id); refresh(); }} />
      </Sheet>
      <Sheet open={modal === "import"} onClose={() => setModal(null)} label="Impor pelanggan" width={720}>
        <ImportCustomers onClose={() => setModal(null)} onDone={() => { setModal(null); refresh(); }} />
      </Sheet>
    </div>
  );
}
