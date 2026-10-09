"use client";

import Link from "next/link";
import { useState } from "react";
import { Empty } from "@/components/ui";
import { formatJam, formatRupiah, formatTanggal, jktDate } from "@/lib/domain/format";
import { STATUS } from "@/lib/domain/status";
import type { ApptStatus } from "@/lib/domain/status";
import { useRealtimeTable } from "@/lib/hooks/useRealtimeTable";
import { createClient } from "@/lib/supabase/client";

type Overview = {
  unpaid: { id: string; customer: string; staff: string | null; start_at: string; since: string | null }[];
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
  cash_closings: "Tutup kasir", services: "Layanan", staff: "Staf", profiles: "Akun",
};
const LOG_PAGE = 25;
const when = (iso: string) => `${formatTanggal(iso)} ${formatJam(iso)}`;
const st = (s: string | null) => (s && s in STATUS ? STATUS[s as ApptStatus].label : s ?? "—");
const daysAgo = (n: number) => { const d = new Date(`${jktDate()}T12:00:00+07:00`); d.setDate(d.getDate() - n); return jktDate(d); };

function Section({ title, count, tone = "muted", children, id }: { title: string; count: number; tone?: "danger" | "warn" | "muted"; children: React.ReactNode; id: string }) {
  const badge = tone === "danger" ? "bg-[#F9E6E6] text-[#6E1616]" : tone === "warn" ? "bg-[#FBF3DE] text-[#5A4300]" : "bg-paper text-muted";
  return (
    <section id={id} className="flex flex-col gap-3 rounded-[14px] border border-line bg-card p-4">
      <h2 className="flex items-center gap-2 text-base font-bold">{title}<span className={`rounded-full px-2 py-0.5 text-xs tabular ${count ? badge : "bg-paper text-muted"}`}>{count}</span></h2>
      {children}
    </section>
  );
}
const Table = ({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) => !rows.length ? <Empty>Tidak ada.</Empty> : (
  <div className="overflow-x-auto">
    <table className="w-full min-w-[560px] text-sm tabular">
      <thead><tr className="text-left text-xs text-muted">{head.map((h) => <th key={h} className="py-2 pr-3 font-semibold">{h}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i} className="border-t border-[#EEEEEA] align-top">{r.map((c, j) => <td key={j} className="py-2 pr-3">{c}</td>)}</tr>)}</tbody>
    </table>
  </div>
);

/** Audit & kecurigaan (manajer): hal-hal yang patut dicek ulang + jejak perubahan. */
export function AuditScreen() {
  const [days, setDays] = useState(7);
  const [page, setPage] = useState(0); // halaman jejak perubahan (0 = terbaru)
  const from = daysAgo(days - 1), to = jktDate();
  const { data: o } = useRealtimeTable(["transactions", "appointments", "cash_closings", "deposit_topups"], async () => {
    const { data, error } = await createClient().rpc("fraud_overview", { p_from: from, p_to: to });
    if (error) throw error;
    return data as unknown as Overview;
  }, `${from}`);
  const { data: log } = useRealtimeTable(["audit_log"], async () => {
    const { data, count } = await createClient().from("audit_feed").select("id, at, actor_name, entity, action, changes", { count: "exact" })
      .gte("at", `${from}T00:00:00+07:00`).order("at", { ascending: false }).order("id", { ascending: false })
      .range(page * LOG_PAGE, page * LOG_PAGE + LOG_PAGE - 1);
    return { rows: (data ?? []) as Audit[], total: count ?? 0 };
  }, `${from}:${page}`);
  const pages = Math.max(1, Math.ceil((log?.total ?? 0) / LOG_PAGE));

  const diffDays = o?.closings.filter((c) => c.last_diff !== 0 || c.count > 1) ?? [];
  const qrisTotal = o?.qris.filter((q) => !q.voided).reduce((n, q) => n + q.amount, 0) ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="flex-1 font-display text-3xl font-bold">Audit</h1>
        <div role="radiogroup" aria-label="Periode" className="flex gap-1.5">
          {[[1, "Hari ini"], [7, "7 hari"], [30, "30 hari"]].map(([n, l]) => (
            <button key={n} role="radio" aria-checked={days === n} onClick={() => { setDays(n as number); setPage(0); }}
              className={`h-11 rounded-full border px-4 text-[13px] font-bold ${days === n ? "border-ink bg-ink text-white" : "border-[#DCDCD6] bg-card"}`}>{l}</button>
          ))}
        </div>
      </div>
      <p className="text-sm text-muted">Bukan tuduhan — daftar hal yang perlu dicek ulang. Semua perubahan penting tercatat otomatis dan tidak bisa dihapus.</p>

      {!o ? <Empty>Memuat…</Empty> : (
        <>
          <div className="grid grid-cols-2 gap-3 min-[700px]:grid-cols-4">
            {([["Selesai belum dibayar", o.unpaid.length, "#unpaid", true], ["Selisih / koreksi kas", diffDays.length, "#kas", true],
               ["Void", o.voids.length, "#void", false], ["Batal / mundur status", o.cancels.length, "#batal", false],
               ["Ganti kapster", o.staff_changes.length, "#kapster", false], ["Top-up tanpa paket", o.manual_topups.length, "#topup", false],
               ["Pembayaran QRIS", o.qris.length, "#qris", false]] as const).map(([l, n, href, hot]) => (
              <a key={l} href={href} className={`flex flex-col gap-1 rounded-[14px] border p-4 ${hot && n ? "border-[#E8C3C4] bg-[#FFF7F7]" : "border-line bg-card"}`}>
                <span className="text-xs font-semibold text-muted">{l}</span>
                <b className="font-display text-2xl tabular">{n}</b>
              </a>
            ))}
          </div>

          <Section id="unpaid" title="Selesai dilayani tapi belum dibayar" count={o.unpaid.length} tone="danger">
            <Table head={["Pelanggan", "Kapster", "Jadwal", "Selesai sejak", ""]} rows={o.unpaid.map((u) => [
              <b key="c">{u.customer}</b>, u.staff ?? "—", when(u.start_at), u.since ? when(u.since) : "—",
              <Link key="l" href="/manajer/kasir" className="font-semibold text-accent underline">Kasir</Link>])} />
          </Section>

          <Section id="kas" title="Tutup kasir" count={diffDays.length} tone="warn">
            <Table head={["Tanggal", "Kasir", "Kas diharapkan", "Selisih hitungan kasir", "Selisih akhir", "Penutupan"]} rows={o.closings.map((c) => [
              formatTanggal(`${c.date}T12:00:00+07:00`), c.cashier ?? "—", formatRupiah(c.expected),
              <span key="f" className={c.first_diff ? "font-bold text-danger" : ""}>{formatRupiah(c.first_diff)}</span>,
              <span key="l" className={c.last_diff ? "font-bold text-danger" : ""}>{formatRupiah(c.last_diff)}</span>,
              c.count > 1 ? <span key="n" className="font-bold text-[#8A5A00]">{c.count}× (ada koreksi)</span> : "1×"])} />
          </Section>

          <Section id="void" title="Transaksi void" count={o.voids.length} tone="warn">
            <Table head={["Waktu void", "Transaksi", "Total", "Alasan", "Kasir", "Di-void oleh"]} rows={o.voids.map((v) => [
              when(v.voided_at), when(v.created_at), formatRupiah(v.total), v.reason, v.cashier ?? "—", v.by ?? "—"])} />
          </Section>

          <Section id="batal" title="Booking dibatalkan / status dimundurkan oleh tim" count={o.cancels.length} tone="warn">
            <Table head={["Waktu", "Oleh", "Pelanggan", "Status", "Alasan"]} rows={o.cancels.map((c) => [
              when(c.at), c.by, c.customer, `${st(c.from)} → ${st(c.to)}`, c.reason ?? "—"])} />
          </Section>

          <Section id="kapster" title="Kapster / nail artist booking diganti" count={o.staff_changes.length}>
            <Table head={["Waktu", "Oleh", "Pelanggan", "Dari → ke"]} rows={o.staff_changes.map((c) => [
              when(c.at), c.by, c.customer, `${c.from ?? "—"} → ${c.to ?? "—"}`])} />
          </Section>

          <Section id="topup" title="Top-up deposit tanpa paket" count={o.manual_topups.length}>
            <Table head={["Waktu", "Pelanggan", "Dibayar", "Saldo masuk", "Oleh"]} rows={o.manual_topups.map((t) => [
              when(t.at), t.customer, formatRupiah(t.paid),
              <span key="c" className={t.credited > t.paid ? "font-bold text-[#8A5A00]" : ""}>{formatRupiah(t.credited)}</span>, t.by ?? "—"])} />
          </Section>

          <Section id="qris" title="Rekonsiliasi QRIS" count={o.qris.length}>
            <p className="text-sm text-muted">Cocokkan No. referensi & nominal dengan mutasi rekening / aplikasi QRIS. Total (tanpa void): <b className="text-ink">{formatRupiah(qrisTotal)}</b></p>
            <Table head={["Waktu", "Jenis", "Nominal", "No. ref", "Kasir"]} rows={o.qris.map((q) => [
              when(q.at), q.kind, <span key="a" className={q.voided ? "line-through" : ""}>{formatRupiah(q.amount)}</span>,
              q.ref ? <b key="r" className="font-mono">{q.ref}</b> : <span key="r" className="text-muted">— (sebelum wajib)</span>, q.cashier ?? "—"])} />
          </Section>
        </>
      )}

      <Section id="log" title="Jejak perubahan" count={log?.total ?? 0}>
        <Table head={["Waktu", "Oleh", "Data", "Aksi", "Perubahan"]} rows={(log?.rows ?? []).map((a) => [
          when(a.at), a.actor_name, ENTITY[a.entity] ?? a.entity, a.action === "update" ? "ubah" : a.action === "insert" ? "tambah" : "hapus",
          <span key="c" className="text-xs text-[#4A4C46]">{a.action === "update" ? Object.entries(a.changes).map(([k, v]) => {
            const [o2, n2] = v as [unknown, unknown];
            return `${k}: ${k === "status" ? `${st(String(o2))} → ${st(String(n2))}` : `${fmt(o2)} → ${fmt(n2)}`}`;
          }).join(" · ") : summary(a)}</span>])} />
        {pages > 1 && (
          <nav aria-label="Halaman jejak perubahan" className="flex items-center justify-between gap-3 border-t border-[#EEEEEA] pt-3 text-sm">
            <button onClick={() => setPage(page - 1)} disabled={page === 0} className="btn-ghost h-10 rounded-[10px] px-3">‹ Lebih baru</button>
            <span className="tabular text-muted">
              Halaman <b className="text-ink">{page + 1}</b> dari {pages} · {page * LOG_PAGE + 1}–{Math.min((page + 1) * LOG_PAGE, log?.total ?? 0)} dari {log?.total}
            </span>
            <button onClick={() => setPage(page + 1)} disabled={page + 1 >= pages} className="btn-ghost h-10 rounded-[10px] px-3">Lebih lama ›</button>
          </nav>
        )}
      </Section>
    </div>
  );
}

const fmt = (v: unknown) => v == null || v === "" ? "—" : typeof v === "string" && /^\d{4}-\d\d-\d\dT/.test(v) ? when(v) : String(v).slice(0, 40);
function summary(a: Audit) {
  const c = a.changes as Record<string, unknown>;
  if (a.entity === "deposit_topups") return `bayar ${formatRupiah(Number(c.amount_paid))} → saldo ${formatRupiah(Number(c.amount_credited))}${c.qris_ref ? ` · ref ${c.qris_ref}` : ""}`;
  if (a.entity === "cash_closings") return `${c.date} · fisik ${formatRupiah(Number(c.physical_cash))} · selisih ${formatRupiah(Number(c.difference))}`;
  return String(c.name ?? c.full_name ?? "");
}
