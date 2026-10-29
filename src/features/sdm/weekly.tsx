"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useConfirm } from "@/components/alert-dialog";
import { Empty, Sheet, CloseButton, useOnline, useToast } from "@/components/ui";
import type { Cat } from "@/lib/domain/category";
import { downloadText, toCsv } from "@/lib/domain/csv";
import { formatRupiah, formatTanggal } from "@/lib/domain/format";
import { createClient } from "@/lib/supabase/client";
import { CAT, shiftWeek, weekLabel } from "./shared";

export type WeekRow = {
  staff_id: string; staff_name: string; category: Cat; service_count: number; revenue_net: number;
  commission_service: number; commission_retail: number; subsidy: number; kasbon: number; amount: number; closed: boolean; paid_at: string | null; paid_method: string | null;
};

/** Komisi mingguan (Senin–Minggu): tutup minggu → bayar per staf. Subsidi jaring harian ikut mingguan; jaring bulanan & penyesuaian diselesaikan bulanan. */
export function WeeklyCommission({ week, thisWeek, rows, reopenReason }: { week: string; thisWeek: string; rows: WeekRow[]; reopenReason: string | null }) {
  const toast = useToast(); const router = useRouter(); const online = useOnline(); const confirm = useConfirm();
  const [paying, setPaying] = useState<WeekRow | null>(null);
  const [reopen, setReopen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const closed = rows.some((r) => r.closed) || false;
  const running = week === thisWeek, future = week > thisWeek;
  const total = rows.reduce((a, r) => a + r.amount, 0);
  const unpaid = rows.filter((r) => r.closed && !r.paid_at && r.amount > 0);
  const anyPaid = rows.some((r) => r.paid_at);

  async function rpc(fn: "commission_week_close" | "commission_week_reopen" | "commission_week_mark_paid", args: Record<string, string>, ok: string) {
    setBusy(true);
    const { error } = await createClient().rpc(fn, args as never);
    setBusy(false);
    if (error) return toast(error.message, "error");
    toast(ok); router.refresh();
  }
  async function close() {
    if (!(await confirm({ title: `Tutup minggu ${weekLabel(week)}?`,
      description: `Komisi ${rows.length} staf (${formatRupiah(total)}) dibekukan dan siap dibayar. Subsidi gaji minimum & penyesuaian tetap dihitung di akhir bulan.`,
      confirmLabel: "Tutup minggu" }))) return;
    rpc("commission_week_close", { p_week: week }, "Minggu ditutup — angka final");
  }
  function exportCsv() {
    downloadText(`komisi-mingguan-${week}.csv`, toCsv([
      ["Staf", "Bidang", "Layanan", "Pendapatan jasa", "Komisi jasa", "Komisi ritel", "Subsidi harian", "Potongan kasbon", "Dibayar bersih", "Tanggal bayar", "Metode"],
      ...rows.map((r) => [r.staff_name, CAT[r.category].label, r.service_count, r.revenue_net, r.commission_service, r.commission_retail, r.subsidy, r.kasbon,
        r.amount, r.paid_at ? formatTanggal(r.paid_at) : "", r.paid_method ?? ""]),
    ]));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`?tab=mingguan&minggu=${shiftWeek(week, -1)}`} aria-label="Minggu sebelumnya" className="btn-ghost size-11 p-0">‹</Link>
        <b className="min-w-52 text-center font-display text-xl">{weekLabel(week)}</b>
        <Link href={`?tab=mingguan&minggu=${shiftWeek(week, 1)}`} aria-label="Minggu berikutnya" className="btn-ghost size-11 p-0">›</Link>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${closed ? "bg-[#E6F1E4] text-[#144D2A]" : running ? "bg-[#FBF3DE] text-[#5A4300]" : future ? "bg-paper text-muted" : "bg-[#F9E6E6] text-[#6E1616]"}`}>
          {closed ? (unpaid.length ? `Ditutup · ${unpaid.length} belum dibayar` : "Ditutup · semua dibayar") : running ? "Minggu berjalan" : future ? "Belum dimulai" : "Belum ditutup"}
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          <button onClick={exportCsv} disabled={!rows.length} className="btn-ghost h-11">Ekspor</button>
          {closed
            ? <button onClick={() => setReopen(true)} disabled={!online || anyPaid || busy} title={anyPaid ? "Sudah ada yang dibayar" : undefined} className="btn-ghost h-11">Buka ulang</button>
            : <button onClick={close} disabled={!online || running || future || busy} title={running ? "Bisa ditutup setelah Minggu malam" : undefined} className="btn-ink h-11">Tutup minggu</button>}
        </div>
      </div>
      {reopenReason && !closed && <p className="text-sm text-muted">Dibuka ulang: “{reopenReason}”</p>}
      <p className="text-sm text-muted">
        Komisi dibayar per minggu (Senin–Minggu). Akhir bulan, <Link href="?tab=bulanan" className="underline">Gaji bulanan</Link> menghitung
        subsidi gaji minimum &amp; penyesuaian, lalu mengurangkan yang sudah ditutup mingguan. Staf berjaring harian menerima subsidinya di sini; kasbon dipotong dari bayaran minggu ini (sisanya minggu berikutnya). Staf yang dibayar bulanan (Pengaturan → Staf) tidak muncul di sini; semuanya masuk Gaji bulanan.
      </p>

      <div className="overflow-x-auto rounded-[14px] border border-line bg-card px-3">
        {!rows.length ? <Empty>{future ? "Minggu ini belum dimulai." : "Tidak ada komisi di minggu ini."}</Empty> : (
          <table className="w-full min-w-[1080px] text-sm tabular">
            <thead><tr className="text-left text-xs text-muted">
              {["Staf", "Layanan", "Pendapatan", "Komisi jasa", "Komisi ritel", "Subsidi harian", "Kasbon", "Dibayar", "Pembayaran", ""].map((h, i) =>
                <th key={i} className={`py-2.5 pr-2 font-semibold ${i && i < 8 ? "text-right" : ""}`}>{h}</th>)}
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.staff_id} className="border-t border-[#EEEEEA]">
                  <td className="py-2 pr-2">
                    <span className="flex items-center gap-2">
                      <span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: CAT[r.category].color }} />
                      <span className="flex flex-col"><b>{r.staff_name}</b><span className="text-xs text-muted">{CAT[r.category].label}</span></span>
                    </span>
                  </td>
                  <td className="pr-2 text-right">{r.service_count}</td>
                  <td className="pr-2 text-right">{formatRupiah(r.revenue_net)}</td>
                  <td className="pr-2 text-right">{formatRupiah(r.commission_service)}</td>
                  <td className="pr-2 text-right">{formatRupiah(r.commission_retail)}</td>
                  <td className="pr-2 text-right">{r.subsidy ? formatRupiah(r.subsidy) : "—"}</td>
                  <td className="pr-2 text-right text-[#A12A2A]">{r.kasbon ? `−${formatRupiah(r.kasbon)}` : "—"}</td>
                  <td className="pr-2 text-right text-base font-bold">{formatRupiah(r.amount)}</td>
                  <td className="py-2 pr-2">
                    {!r.closed ? <span className="text-xs text-muted">Belum final</span>
                      : r.paid_at ? <span className="rounded-full bg-[#E6F1E4] px-2.5 py-0.5 text-xs font-bold text-[#144D2A]">Dibayar {formatTanggal(r.paid_at)} · {r.paid_method}</span>
                      : r.amount > 0 ? <button onClick={() => setPaying(r)} disabled={!online} className="rounded-full bg-[#FBF3DE] px-3 py-1.5 text-xs font-bold text-[#5A4300]">Tandai dibayar</button>
                      : <span className="text-xs text-muted">—</span>}
                  </td>
                  <td className="py-2"><Link href={`/manajer/sdm/slip-minggu/${week}/${r.staff_id}`} className="btn-ghost h-9 px-3 text-xs">Slip</Link></td>
                </tr>
              ))}
              <tr className="border-t-2 border-ink font-bold">
                <td className="py-2.5 pr-2">Total</td><td className="pr-2 text-right">{rows.reduce((a, r) => a + r.service_count, 0)}</td>
                <td className="pr-2 text-right">{formatRupiah(rows.reduce((a, r) => a + r.revenue_net, 0))}</td>
                <td className="pr-2 text-right">{formatRupiah(rows.reduce((a, r) => a + r.commission_service, 0))}</td>
                <td className="pr-2 text-right">{formatRupiah(rows.reduce((a, r) => a + r.commission_retail, 0))}</td>
                <td className="pr-2 text-right">{formatRupiah(rows.reduce((a, r) => a + r.subsidy, 0))}</td>
                <td className="pr-2 text-right">{formatRupiah(rows.reduce((a, r) => a + r.kasbon, 0))}</td>
                <td className="pr-2 text-right text-base">{formatRupiah(total)}</td><td /><td />
              </tr>
            </tbody>
          </table>
        )}
      </div>

      <Sheet open={!!paying} onClose={() => setPaying(null)} label="Tandai dibayar" width={420}>
        {paying && (
          <div className="flex flex-col gap-4 p-5">
            <div className="flex items-start justify-between gap-3">
              <div><h2 className="text-lg font-bold">Bayar komisi {paying.staff_name}</h2><p className="text-sm text-muted">{weekLabel(week)}</p></div>
              <CloseButton onClick={() => setPaying(null)} />
            </div>
            <b className="font-display text-3xl tabular">{formatRupiah(paying.amount)}</b>
            <div className="grid grid-cols-2 gap-2">
              {(["tunai", "transfer"] as const).map((m) => (
                <button key={m} disabled={busy} className="btn-ink h-12 capitalize"
                  onClick={async () => { await rpc("commission_week_mark_paid", { p_week: week, p_staff_id: paying.staff_id, p_method: m }, `Komisi ${paying.staff_name} ditandai dibayar (${m})`); setPaying(null); }}>
                  {m === "tunai" ? "Dibayar tunai" : "Dibayar transfer"}
                </button>
              ))}
            </div>
          </div>
        )}
      </Sheet>

      <Sheet open={reopen} onClose={() => setReopen(false)} label="Buka ulang minggu" width={480}>
        <form className="flex flex-col gap-3 p-5" onSubmit={async (e) => { e.preventDefault(); await rpc("commission_week_reopen", { p_week: week, p_reason: reason }, "Minggu dibuka ulang"); setReopen(false); setReason(""); }}>
          <h2 className="text-lg font-bold">Buka ulang {weekLabel(week)}?</h2>
          <p className="text-sm text-muted">Angka kembali dihitung ulang dari transaksi. Hanya bisa bila belum ada yang dibayar.</p>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">Alasan (wajib)
            <input className="input" required value={reason} onChange={(e) => setReason(e.target.value)} /></label>
          <div className="flex gap-2"><button type="button" onClick={() => setReopen(false)} className="btn-ghost flex-1">Batal</button>
            <button disabled={!reason.trim() || busy} className="btn-ink flex-1">Buka ulang</button></div>
        </form>
      </Sheet>
    </div>
  );
}
