"use client";

import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Empty } from "@/components/ui";
import { formatJam, formatRupiah, formatTanggal, jktDate } from "@/lib/domain/format";
import { STATUS } from "@/lib/domain/status";
import type { ApptStatus } from "@/lib/domain/status";
import { useRealtimeTable } from "@/lib/hooks/useRealtimeTable";
import { createClient } from "@/lib/supabase/client";

type Overview = {
  unpaid: { id: string; customer: string; staff: string | null; start_at: string; since: string | null }[];
  cash_tolerance?: number;
  closings: { date: string; count: number; cashier: string | null; first_diff: number; last_diff: number; expected: number }[];
  voids: { id: string; created_at: string; voided_at: string; total: number; reason: string; cashier: string | null; by: string | null }[];
  cancels: { at: string; by: string; customer: string; from: ApptStatus; to: ApptStatus; reason: string | null }[];
  staff_changes: { at: string; by: string; customer: string; from: string | null; to: string | null }[];
  qris: { at: string; kind: string; amount: number; ref: string | null; cashier: string | null; voided: boolean }[];
  manual_topups: { at: string; customer: string; paid: number; credited: number; by: string | null }[];
};
type Audit = { id: number; at: string; actor_name: string; entity: string; action: string; changes: Record<string, unknown> };

const ENTITY: Record<string, string> = {
  appointments: "Booking", customers: "Pelanggan", transactions: "Transaksi", deposit_topups: "Top-up deposit",
  cash_closings: "Tutup kasir", expenses: "Pengeluaran", services: "Layanan", staff: "Staf", profiles: "Akun",
};
const LOG_PAGE = 25;
// nama kolom database → bahasa manajer (yang tidak dikenal tampil apa adanya)
const FIELD: Record<string, string> = {
  status: "Status", photo_path: "Foto", requested_staff: "Diminta pelanggan", is_addon: "Layanan tambahan", day_off: "Hari libur", notes: "Catatan",
  whatsapp: "WhatsApp", active: "Aktif", staff_id: "Petugas", name: "Nama", price: "Harga", sort: "Urutan", category: "Kategori", reorder_at: "Batas reorder",
  supplier_id: "Pemasok", unit: "Satuan", duration_min: "Durasi", cancel_reason: "Alasan batal", start_at: "Jadwal", resource_id: "Kursi", role: "Peran", home_resource_id: "Kursi utama",
};
const short = (iso: string) => `${new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "Asia/Jakarta" }).format(new Date(iso))}, ${formatJam(iso)}`;
const when = (iso: string) => `${formatTanggal(iso)} ${formatJam(iso)}`;
const st = (s: string | null) => (s && s in STATUS ? STATUS[s as ApptStatus].label : s ?? "—");
const daysAgo = (n: number) => { const d = new Date(`${jktDate()}T12:00:00+07:00`); d.setDate(d.getDate() - n); return jktDate(d); };

function Section({ title, count, tone = "muted", children, id, hint }: { title: string; count: number; tone?: "danger" | "warn" | "muted"; children: React.ReactNode; id: string; hint?: string }) {
  const badge = tone === "danger" ? "bg-[#FBEEEC] text-[#6E1616]" : tone === "warn" ? "bg-[#FBF2E4] text-[#6B4A10]" : "bg-paper text-muted";
  return (
    <section id={id} className="flex scroll-mt-20 flex-col gap-3 rounded-3xl border border-line bg-card p-5">
      <div className="flex flex-col gap-0.5">
        <h2 className="flex items-center gap-2 text-base font-semibold">{title}<span className={`rounded-full px-2 py-0.5 text-xs tabular ${count ? badge : "bg-paper text-muted"}`}>{count}</span></h2>
        {hint && <p className="text-[13px] text-muted">{hint}</p>}
      </div>
      {children}
    </section>
  );
}
const Table = ({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) => !rows.length ? <Empty>Tidak ada.</Empty> : (
  <div className="overflow-x-auto">
    <table className="w-full min-w-[560px] text-sm tabular">
      <thead><tr className="text-left text-xs text-muted">{head.map((h) => <th key={h} className="whitespace-nowrap py-2 pr-3 font-medium">{h}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i} className="border-t border-line align-top">{r.map((c, j) => <td key={j} className="py-2.5 pr-3">{c}</td>)}</tr>)}</tbody>
    </table>
  </div>
);

/** Audit & kecurigaan (manajer): hal-hal yang patut dicek ulang + jejak perubahan. */
export function AuditScreen() {
  const [days, setDays] = useState(7);
  const [page, setPage] = useState(0); // halaman jejak perubahan (0 = terbaru)
  const [hideSystem, setHideSystem] = useState(false);
  const from = daysAgo(days - 1), to = jktDate();
  const { data: o } = useRealtimeTable(["transactions", "appointments", "cash_closings", "deposit_topups"], async () => {
    const { data, error } = await createClient().rpc("fraud_overview", { p_from: from, p_to: to });
    if (error) throw error;
    return data as unknown as Overview;
  }, `${from}`);
  const { data: log } = useRealtimeTable(["audit_log"], async () => {
    let q = createClient().from("audit_feed").select("id, at, actor_name, entity, action, changes", { count: "exact" }).gte("at", `${from}T00:00:00+07:00`);
    if (hideSystem) q = q.neq("actor_name", "Sistem");
    const { data, count } = await q.order("at", { ascending: false }).order("id", { ascending: false }).range(page * LOG_PAGE, page * LOG_PAGE + LOG_PAGE - 1);
    return { rows: (data ?? []) as Audit[], total: count ?? 0 };
  }, `${from}:${page}:${hideSystem}`);
  const pages = Math.max(1, Math.ceil((log?.total ?? 0) / LOG_PAGE));

  const tol = o?.cash_tolerance ?? 0; // selisih ≤ toleransi = pembulatan/receh
  const diffDays = o?.closings.filter((c) => Math.abs(c.last_diff) > tol || c.count > 1) ?? [];
  const qrisTotal = o?.qris.filter((q) => !q.voided).reduce((n, q) => n + q.amount, 0) ?? 0;

  // Bagian temuan: yang kosong tidak diberi kartu sendiri, cukup disebut di satu baris "tidak ada temuan"
  const found = !o ? [] : [
    { id: "unpaid", title: "Selesai dilayani tapi belum dibayar", n: o.unpaid.length, tone: "danger" as const, hot: true, hint: "Layanan sudah selesai, uangnya belum tercatat di kasir.",
      node: <Table head={["Pelanggan", "Capster", "Jadwal", "Selesai sejak", ""]} rows={o.unpaid.map((u) => [
        <b key="c" className="font-medium">{u.customer}</b>, u.staff ?? "—", when(u.start_at), u.since ? when(u.since) : "—",
        <Link key="l" href="/manajer/kasir" className="font-medium text-accent underline">Buka kasir</Link>])} /> },
    { id: "kas", title: "Selisih tutup kasir", n: diffDays.length, tone: "warn" as const, hot: true, hint: `Selisih di atas ${formatRupiah(tol)} atau penutupan yang dikoreksi.`,
      node: <Table head={["Tanggal", "Kasir", "Kas diharapkan", "Selisih hitungan kasir", "Selisih akhir", "Penutupan"]} rows={o.closings.map((c) => [
        formatTanggal(`${c.date}T12:00:00+07:00`), c.cashier ?? "—", formatRupiah(c.expected),
        <span key="f" className={Math.abs(c.first_diff) > tol ? "font-semibold text-danger" : ""}>{formatRupiah(c.first_diff)}</span>,
        <span key="l" className={Math.abs(c.last_diff) > tol ? "font-semibold text-danger" : ""}>{formatRupiah(c.last_diff)}</span>,
        c.count > 1 ? <span key="n" className="font-semibold text-[#8A5A00]">{c.count}× (ada koreksi)</span> : "1×"])} /> },
    { id: "void", title: "Transaksi void", n: o.voids.length, tone: "warn" as const, hot: false,
      node: <Table head={["Waktu void", "Transaksi", "Total", "Alasan", "Kasir", "Di-void oleh"]} rows={o.voids.map((v) => [
        when(v.voided_at), when(v.created_at), formatRupiah(v.total), v.reason, v.cashier ?? "—", v.by ?? "—"])} /> },
    { id: "batal", title: "Booking dibatalkan atau status dimundurkan", n: o.cancels.length, tone: "warn" as const, hot: false,
      node: <Table head={["Waktu", "Oleh", "Pelanggan", "Status", "Alasan"]} rows={o.cancels.map((c) => [when(c.at), c.by, c.customer, `${st(c.from)} → ${st(c.to)}`, c.reason ?? "—"])} /> },
    { id: "capster", title: "Capster atau nail artist booking diganti", n: o.staff_changes.length, tone: "muted" as const, hot: false,
      node: <Table head={["Waktu", "Oleh", "Pelanggan", "Dari → ke"]} rows={o.staff_changes.map((c) => [when(c.at), c.by, c.customer, `${c.from ?? "—"} → ${c.to ?? "—"}`])} /> },
    { id: "topup", title: "Top-up deposit tanpa paket", n: o.manual_topups.length, tone: "muted" as const, hot: false,
      node: <Table head={["Waktu", "Pelanggan", "Dibayar", "Saldo masuk", "Oleh"]} rows={o.manual_topups.map((t) => [when(t.at), t.customer, formatRupiah(t.paid),
        <span key="c" className={t.credited > t.paid ? "font-semibold text-[#8A5A00]" : ""}>{formatRupiah(t.credited)}</span>, t.by ?? "—"])} /> },
    { id: "qris", title: "Rekonsiliasi QRIS dan transfer", n: o.qris.length, tone: "muted" as const, hot: false,
      hint: `Cocokkan No. referensi dan nominal dengan mutasi rekening atau aplikasi QRIS. Total tanpa void: ${formatRupiah(qrisTotal)}.`,
      node: <Table head={["Waktu", "Jenis", "Nominal", "No. ref", "Kasir"]} rows={o.qris.map((q) => [
        when(q.at), q.kind, <span key="a" className={q.voided ? "line-through" : ""}>{formatRupiah(q.amount)}</span>,
        q.ref ? <b key="r" className="font-mono font-medium">{q.ref}</b> : <span key="r" className="text-muted">— (sebelum wajib)</span>, q.cashier ?? "—"])} /> },
  ];
  const withData = found.filter((x) => x.n > 0), clean = found.filter((x) => x.n === 0);
  const periodLabel = days === 1 ? "hari ini" : `${days} hari terakhir`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h1 className="font-display text-[28px] font-medium tracking-tight">Audit</h1>
          <span className="text-[13px] text-muted">Bukan tuduhan, hanya daftar hal yang perlu dicek ulang. Semua perubahan penting tercatat otomatis dan tidak bisa dihapus.</span>
        </div>
        <div role="radiogroup" aria-label="Periode" className="flex gap-1 rounded-xl bg-side p-1">
          {[[1, "Hari ini"], [7, "7 hari"], [30, "30 hari"]].map(([n, l]) => (
            <button key={n} role="radio" aria-checked={days === n} onClick={() => { setDays(n as number); setPage(0); }}
              className={`h-10 rounded-lg px-4 text-[13px] font-medium ${days === n ? "bg-card font-semibold text-ink shadow-sm" : "text-muted hover:text-ink"}`}>{l}</button>
          ))}
        </div>
      </div>

      {!o ? <Empty>Memuat…</Empty> : (
        <>
          <div className="grid grid-cols-2 gap-3 min-[700px]:grid-cols-4">
            {found.map((x) => {
              const hot = x.hot && x.n > 0;
              const cls = `flex flex-col gap-0.5 rounded-3xl border p-4 ${hot ? "border-[#E8C3C4] bg-[#FFF7F7]" : "border-line bg-card"} ${x.n ? "hover:border-[#CBCFD6]" : ""}`;
              const body = <><span className="text-[13px] font-medium text-muted">{x.title}</span><b className={`font-display text-[28px] font-semibold leading-tight tabular ${hot ? "text-[#D94B42]" : x.n ? "" : "text-faint"}`}>{x.n}</b></>;
              return x.n ? <a key={x.id} href={`#${x.id}`} className={cls}>{body}</a> : <div key={x.id} className={cls}>{body}</div>;
            })}
          </div>

          {!withData.length && (
            <p role="status" className="rounded-2xl bg-[#E3F4EA] px-4 py-3 text-sm font-medium text-[#1D5A3A]">Tidak ada temuan dalam {periodLabel}. Semua aman.</p>
          )}
          {withData.map((x) => (
            <Section key={x.id} id={x.id} title={x.title} count={x.n} tone={x.tone} hint={x.hint}>{x.node}</Section>
          ))}
          {!!withData.length && !!clean.length && (
            <p className="rounded-2xl bg-paper px-4 py-3 text-[13px] text-muted">Tidak ada temuan untuk: {clean.map((x) => x.title.toLowerCase()).join(", ")}.</p>
          )}
        </>
      )}

      <Section id="log" title="Jejak perubahan" count={log?.total ?? 0} hint="Siapa mengubah apa. Perubahan otomatis oleh sistem ditandai abu-abu.">
        <label className="flex min-h-11 w-fit items-center gap-2 text-sm text-muted">
          <Checkbox className="size-5" checked={hideSystem} onCheckedChange={(v) => { setHideSystem(v === true); setPage(0); }} /> Sembunyikan perubahan otomatis (Sistem)
        </label>
        <Table head={["Waktu", "Oleh", "Data", "Aksi", "Perubahan"]} rows={(log?.rows ?? []).map((a) => {
          const sys = a.actor_name === "Sistem";
          return [
            <span key="w" className="whitespace-nowrap">{short(a.at)}</span>,
            <span key="o" className={sys ? "text-muted" : "font-medium"}>{a.actor_name}</span>,
            ENTITY[a.entity] ?? a.entity,
            <span key="a" className={`rounded-full px-2 py-0.5 text-xs font-semibold ${a.action === "delete" ? "bg-[#FBEEEC] text-[#6E1616]" : a.action === "insert" ? "bg-[#E3F4EA] text-[#1D5A3A]" : "bg-side text-muted"}`}>{a.action === "update" ? "Ubah" : a.action === "insert" ? "Tambah" : "Hapus"}</span>,
            <span key="c" className={`text-[13px] ${sys ? "text-muted" : "text-[#4A505B]"}`}>{a.action === "update" ? Object.entries(a.changes).map(([k, v]) => {
              const [o2, n2] = v as [unknown, unknown];
              return `${FIELD[k] ?? k}: ${k === "status" ? `${st(String(o2))} → ${st(String(n2))}` : `${fmt(o2)} → ${fmt(n2)}`}`;
            }).join(" · ") : summary(a)}</span>,
          ];
        })} />
        {pages > 1 && (
          <nav aria-label="Halaman jejak perubahan" className="flex items-center justify-between gap-3 border-t border-line pt-3 text-sm">
            <Button onClick={() => setPage(page - 1)} disabled={page === 0} variant="outline" className="h-10 rounded-[14px] px-3">‹ Lebih baru</Button>
            <span className="tabular text-muted">
              Halaman <b className="text-ink">{page + 1}</b> dari {pages} · {page * LOG_PAGE + 1}–{Math.min((page + 1) * LOG_PAGE, log?.total ?? 0)} dari {log?.total}
            </span>
            <Button onClick={() => setPage(page + 1)} disabled={page + 1 >= pages} variant="outline" className="h-10 rounded-[14px] px-3">Lebih lama ›</Button>
          </nav>
        )}
      </Section>
    </div>
  );
}

const fmt = (v: unknown) => v == null || v === "" ? "—" : v === true ? "ya" : v === false ? "tidak" : typeof v === "string" && /^\d{4}-\d\d-\d\dT/.test(v) ? when(v) : String(v).slice(0, 40);
function summary(a: Audit) {
  const c = a.changes as Record<string, unknown>;
  if (a.entity === "deposit_topups") return `bayar ${formatRupiah(Number(c.amount_paid))} → saldo ${formatRupiah(Number(c.amount_credited))}${c.qris_ref ? ` · ref ${c.qris_ref}` : ""}`;
  if (a.entity === "cash_closings") return `${c.date} · fisik ${formatRupiah(Number(c.physical_cash))} · selisih ${formatRupiah(Number(c.difference))}`;
  return String(c.name ?? c.full_name ?? "");
}
