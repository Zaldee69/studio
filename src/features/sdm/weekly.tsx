"use client";

import { Button, buttonClass } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { PeriodNav } from "./period-nav";

export type WeekRow = {
  staff_id: string; staff_name: string; category: Cat; service_count: number; revenue_net: number;
  commission_service: number; commission_retail: number; subsidy: number; kasbon: number; amount: number; closed: boolean; paid_at: string | null; paid_method: string | null;
};

/** Komisi mingguan (Senin–Minggu): tutup minggu → bayar per staf. Subsidi jaring harian ikut mingguan; jaring bulanan & penyesuaian diselesaikan bulanan. */
export function WeeklyCommission({ week, thisWeek, rows, reopenReason, holdMonths = [] }: { week: string; thisWeek: string; rows: WeekRow[]; reopenReason: string | null; holdMonths?: string[] }) {
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
  const paidSum = rows.filter((r) => r.paid_at).reduce((a, r) => a + r.amount, 0);
  const unpaidSum = unpaid.reduce((a, r) => a + r.amount, 0);

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
      ["Staf", "Bidang", "Layanan", "Pendapatan jasa", "Komisi jasa", "Komisi ritel", "Subsidi harian", "Kasbon & potongan", "Dibayar bersih", "Tanggal bayar", "Metode"],
      ...rows.map((r) => [r.staff_name, CAT[r.category].label, r.service_count, r.revenue_net, r.commission_service, r.commission_retail, r.subsidy, r.kasbon,
        r.amount, r.paid_at ? formatTanggal(r.paid_at) : "", r.paid_method ?? ""]),
    ]));
  }

  return (
    <div className="flex flex-col gap-4">
      <PeriodNav prev={`?tab=mingguan&minggu=${shiftWeek(week, -1)}`} next={`?tab=mingguan&minggu=${shiftWeek(week, 1)}`} label={weekLabel(week)}
        prevLabel="Minggu sebelumnya" nextLabel="Minggu berikutnya" tone={closed ? "ok" : running ? "warn" : future ? "idle" : "late"}
        status={closed ? (unpaid.length ? `Ditutup · ${unpaid.length} belum dibayar` : "Ditutup · semua dibayar") : running ? "Minggu berjalan" : future ? "Belum dimulai" : "Belum ditutup"}>
        <Button onClick={exportCsv} disabled={!rows.length} variant="outline" className="h-11">Ekspor</Button>
        {closed
          ? <Button onClick={() => setReopen(true)} disabled={!online || anyPaid || busy} title={anyPaid ? "Sudah ada yang dibayar" : undefined} variant="outline" className="h-11">Buka ulang</Button>
          : <Button onClick={close} disabled={!online || running || future || busy} title={running ? "Bisa ditutup setelah Minggu malam" : undefined} className="h-11">Tutup minggu</Button>}
      </PeriodNav>
      {!!holdMonths.length && closed && <p role="note" className="rounded-[14px] bg-[#FBF2E4] px-3 py-2 text-[13px] text-[#6B4A10]">Minggu ini lintas bulan. Komisinya ikut payroll {holdMonths.join(", ")} yang belum ditutup, jadi pembayaran ditahan sampai payroll ditutup.</p>}
      {reopenReason && !closed && <p className="text-sm text-muted">Dibuka ulang: “{reopenReason}”</p>}
      {!!rows.length && (
        <div className="grid grid-cols-1 gap-3 min-[700px]:grid-cols-3">
          {[
            ["Total komisi minggu ini", formatRupiah(total), `${rows.length} staf${closed ? "" : " · belum final"}`],
            ["Sudah dibayar", formatRupiah(paidSum), `${rows.filter((r) => r.paid_at).length} staf`],
            [closed ? "Belum dibayar" : "Cara membayar", closed ? formatRupiah(unpaidSum) : "Tutup minggu dulu", closed ? `${unpaid.length} staf` : "angka dibekukan, lalu bayar per staf"],
          ].map(([k, v, sub], i) => (
            <div key={k} className="flex flex-col gap-0.5 rounded-3xl border border-line bg-card p-4">
              <span className="text-[13px] font-medium text-muted">{k}</span>
              <b className={`font-display font-semibold tracking-tight tabular ${i === 2 && !closed ? "text-lg leading-8 text-muted" : "text-[28px] leading-tight"} ${i === 2 && closed && unpaidSum > 0 ? "text-[#8A5A00]" : ""}`}>{v}</b>
              <span className="text-xs text-muted">{sub}</span>
            </div>
          ))}
        </div>
      )}
      <details className="group rounded-2xl border border-line bg-card px-4 py-2.5 text-sm">
        <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between font-medium">Cara komisi dihitung dan dibayar<span aria-hidden="true" className="text-muted group-open:rotate-180">⌄</span></summary>
        <p className="pb-2 pt-1 leading-relaxed text-muted">Komisi dibayar per minggu (Senin–Minggu). Akhir bulan, <Link href="?tab=bulanan" className="underline">Gaji bulanan</Link> menghitung
        subsidi gaji minimum &amp; penyesuaian, lalu mengurangkan yang sudah ditutup mingguan. Staf berjaring harian menerima subsidinya di sini; kasbon dan potongan (komisi transaksi yang di-void setelah minggunya dibayar) dipotong dari bayaran minggu ini; sisanya terbawa ke minggu berikutnya, juga lintas bulan. Staf yang dibayar bulanan (Pengaturan → Staf) tidak muncul di sini; semuanya masuk Gaji bulanan.</p>
      </details>

      <div className="overflow-x-auto rounded-[14px] border border-line bg-card px-3">
        {!rows.length ? <Empty>{future ? "Minggu ini belum dimulai." : "Tidak ada komisi di minggu ini."}</Empty> : (
          <table className="w-full min-w-[960px] text-sm tabular">
            <thead><tr className="text-left text-xs text-muted">
              {["Staf", "Pendapatan", "Komisi jasa", "Komisi ritel", "Subsidi harian", "Kasbon & potongan", "Dibayar bersih", "Status", ""].map((h, i) =>
                <th key={i} className={`py-3 pr-3 font-medium ${i === 0 ? "sticky left-0 z-[1] bg-card" : ""} ${i && i < 7 ? "text-right" : ""}`}>{h}</th>)}
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.staff_id} className="border-t border-line">
                  <td className="sticky left-0 z-[1] bg-card py-2.5 pr-3">
                    <span className="flex items-center gap-2">
                      <span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: CAT[r.category].color }} />
                      <span className="flex flex-col"><b className="font-medium">{r.staff_name}</b><span className="text-xs text-muted">{CAT[r.category].label} · {r.service_count} layanan</span></span>
                    </span>
                  </td>
                  <td className="pr-3 text-right text-muted">{formatRupiah(r.revenue_net)}</td>
                  <td className="pr-3 text-right">{formatRupiah(r.commission_service)}</td>
                  <td className="pr-3 text-right">{formatRupiah(r.commission_retail)}</td>
                  <td className="pr-3 text-right">{r.subsidy ? formatRupiah(r.subsidy) : <span className="text-faint">—</span>}</td>
                  <td className="pr-3 text-right text-[#D94B42]">{r.kasbon ? `−${formatRupiah(r.kasbon)}` : <span className="text-faint">—</span>}</td>
                  <td className="bg-paper/60 pr-3 text-right text-base font-semibold">{formatRupiah(r.amount)}</td>
                  <td className="py-2 pl-3 pr-3">
                    {!r.closed ? <span className="text-xs text-muted">Belum final</span>
                      : r.paid_at ? <span className="rounded-full bg-[#E3F4EA] px-2.5 py-0.5 text-xs font-semibold text-[#1D5A3A]">Dibayar {formatTanggal(r.paid_at)} · {r.paid_method}</span>
                      : r.amount > 0 ? <button onClick={() => setPaying(r)} disabled={!online || !!holdMonths.length} title={holdMonths.length ? "Minggu lintas bulan: tutup payroll bulanan dulu" : undefined} className="h-9 rounded-[10px] bg-accent px-3 text-xs font-semibold text-white disabled:opacity-50">Bayar</button>
                      : <span className="text-xs text-muted">—</span>}
                  </td>
                  <td className="py-2"><Link href={`/manajer/sdm/slip-minggu/${week}/${r.staff_id}`} className={buttonClass("outline", "h-9 px-3 text-xs")}>Slip</Link></td>
                </tr>
              ))}
              <tr className="border-t-2 border-accent font-semibold">
                <td className="sticky left-0 z-[1] bg-card py-3 pr-3">Total</td>
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
              <div><h2 className="text-lg font-semibold">Bayar komisi {paying.staff_name}</h2><p className="text-sm text-muted">{weekLabel(week)}</p></div>
              <CloseButton onClick={() => setPaying(null)} />
            </div>
            <b className="font-display text-3xl tabular">{formatRupiah(paying.amount)}</b>
            <div className="grid grid-cols-2 gap-2">
              {(["tunai", "transfer"] as const).map((m) => (
                <Button key={m} disabled={busy} className="h-12 capitalize"
                  onClick={async () => { await rpc("commission_week_mark_paid", { p_week: week, p_staff_id: paying.staff_id, p_method: m }, `Komisi ${paying.staff_name} ditandai dibayar (${m})`); setPaying(null); }}>
                  {m === "tunai" ? "Dibayar tunai" : "Dibayar transfer"}
                </Button>
              ))}
            </div>
          </div>
        )}
      </Sheet>

      <Sheet open={reopen} onClose={() => setReopen(false)} label="Buka ulang minggu" width={480}>
        <form className="flex flex-col gap-3 p-5" onSubmit={async (e) => { e.preventDefault(); await rpc("commission_week_reopen", { p_week: week, p_reason: reason }, "Minggu dibuka ulang"); setReopen(false); setReason(""); }}>
          <h2 className="text-lg font-semibold">Buka ulang {weekLabel(week)}?</h2>
          <p className="text-sm text-muted">Angka kembali dihitung ulang dari transaksi. Hanya bisa bila belum ada yang dibayar.</p>
          <label className="flex flex-col gap-1.5 text-sm font-medium">Alasan (wajib)
            <Input required value={reason} onChange={(e) => setReason(e.target.value)} /></label>
          <div className="flex gap-2"><Button type="button" onClick={() => setReopen(false)} variant="outline" className="flex-1">Batal</Button>
            <Button variant="outline" disabled={!reason.trim() || busy} className="flex-1">Buka ulang</Button></div>
        </form>
      </Sheet>
    </div>
  );
}
