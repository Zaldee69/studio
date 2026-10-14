"use client";

import { useEffect, useState } from "react";
import { closingEscpos, type ClosingSummary } from "@/lib/domain/escpos";
import { printBytes, printerSettings, usePrinter } from "@/lib/printer";
import { PrintSheet } from "@/components/print-sheet";
import { Empty, Field, useOnline, useToast } from "@/components/ui";
import { formatJam, formatRupiah, formatTanggal, jktDate } from "@/lib/domain/format";
import { useRealtimeTable } from "@/lib/hooks/useRealtimeTable";
import { createClient } from "@/lib/supabase/client";
import type { Master } from "../counter/types";

type Full = Omit<ClosingSummary, "voided"> & { voided: (ClosingSummary["voided"][number] & { id: string })[]; blind: false; tolerance?: number };
// hitung per pecahan: lembar uang kertas + total koin (Rp)
const DENOMS = [100000, 50000, 20000, 10000, 5000, 2000, 1000];
const rb = (n: number) => `${n / 1000}rb`;
// Kasir sebelum menutup tanggal itu: server hanya mengirim jumlah transaksi & void (tutup kasir buta)
type Blind = { blind: true; tx_count: number; voided: Full["voided"] };
type Summary = Full | Blind;

/** Tutup kasir harian: rekap dari server (cash_summary), input kas fisik → selisih, simpan & cetak. */
export function Closing({ master }: { master: Master }) {
  const toast = useToast();
  const online = useOnline();
  const [date, setDate] = useState(jktDate());
  const [physical, setPhysical] = useState("");
  const [note, setNote] = useState("");
  const [deposit, setDeposit] = useState(""); // disetor / diambil dari laci saat tutup (opsional)
  const [byDenom, setByDenom] = useState(false);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const printer = usePrinter();

  const { data: s, refresh } = useRealtimeTable(["transactions", "deposit_topups", "expenses"], async () => {
    const { data, error } = await createClient().rpc("cash_summary", { p_date: date });
    if (error) throw error;
    return data as unknown as Summary;
  }, date);
  const { data: closings } = useRealtimeTable(["cash_closings"], async () => {
    const { data } = await createClient().from("cash_closings").select("id, created_at, expected_cash, physical_cash, difference, note, deposit_out, cashier_id, denominations")
      .eq("date", date).order("created_at", { ascending: false });
    return data ?? [];
  }, date);

  const denomTotal = DENOMS.reduce((a, d) => a + d * Number(counts[d] || 0), 0) + Number(counts.coins || 0);
  const phys = byDenom ? (Object.values(counts).some(Boolean) ? denomTotal : null) : physical === "" ? null : Number(physical);
  const denoms = byDenom ? Object.fromEntries(Object.entries(counts).filter(([, v]) => Number(v) > 0).map(([k, v]) => [k, Number(v)])) : null;
  const dep = Number(deposit || 0);
  const diff = s && !s.blind && phys != null ? phys - s.expected_cash : null;
  const tol = s && !s.blind ? s.tolerance ?? 0 : 0;
  const inTol = (d: number) => Math.abs(d) <= tol; // selisih kecil = pembulatan/receh, tidak ditandai merah
  const [names, setNames] = useState<Map<string, string>>(new Map()); // siapa yang menutup
  useEffect(() => {
    createClient().from("team_names").select("id, full_name").then(({ data }) => setNames(new Map((data ?? []).map((r) => [r.id!, r.full_name!]))));
  }, []);
  const lockedForCashier = master.role === "cashier" && !!closings?.length; // kasir hanya menutup sekali per tanggal

  async function save() {
    if (phys == null) return;
    setSaving(true);
    const { error } = await createClient().rpc("save_cash_closing", { p_date: date, p_physical_cash: phys, p_note: note, p_deposit_out: dep, p_denoms: denoms ?? undefined });
    setSaving(false);
    if (error) return toast(error.message, "error");
    toast("Tutup kasir tersimpan");
    setPhysical(""); setNote(""); setDeposit(""); setCounts({}); refresh();
  }

  async function printSlip() {
    if (!s || s.blind) return;
    const c = closings?.[0];
    try {
      await printBytes(closingEscpos(s, {
        paper: printerSettings().paper, shop: master.shop.name, date: formatTanggal(`${date}T12:00:00+07:00`), printedAt: formatJam(new Date()),
        cashier: master.userName, time: (iso) => formatJam(iso),
        last: c ? { at: c.created_at, physical_cash: c.physical_cash, difference: c.difference, note: c.note, deposit_out: c.deposit_out } : null,
      }));
      toast("Rekap dicetak");
    } catch (e) { toast(e instanceof Error ? e.message : String(e), "error"); }
  }

  const row = (k: string, v: number | string, strong = false) => (
    <div className={`flex justify-between gap-3 py-1.5 tabular ${strong ? "text-base font-bold" : "text-sm"}`}><span>{k}</span><span>{typeof v === "number" ? formatRupiah(v) : v}</span></div>
  );

  const body = !s ? <Empty>Memuat…</Empty> : s.blind ? (
    <>
      <div className="divide-y divide-[#EEEEEA]">{row("Jumlah transaksi", String(s.tx_count))}</div>
      <p className="rounded-[10px] bg-paper px-3.5 py-3 text-sm">
        Hitung <b>seluruh uang di laci</b> (termasuk sisa kemarin) lalu isi kolom di samping. Rekap penjualan, kas yang diharapkan, dan selisih tampil setelah tutup kasir disimpan.
      </p>
    </>
  ) : (
    <>
      <div className="divide-y divide-[#EEEEEA]">
        {row("Jumlah transaksi", String(s.tx_count))}
        {row("Omzet (setelah diskon)", s.gross_total)}
        {row("Total diskon", s.discount_total)}
        {row("Saldo awal laci (sisa tutup kasir sebelumnya)", s.opening_cash ?? 0)}
        {row("Pemasukan tunai (transaksi)", s.cash_sales)}
        {row("Pemasukan QRIS (transaksi)", s.qris_sales)}
        {row("Pemasukan transfer (transaksi)", s.transfer_sales)}
        {row("Deposit terpakai", s.deposit_used)}
        {row(`Top-up deposit tunai (${s.topup_count}×)`, s.topup_cash)}
        {row("Top-up deposit QRIS", s.topup_qris)}
        {row("Top-up deposit transfer", s.topup_transfer)}
        {row("Saldo deposit masuk (termasuk bonus)", s.topup_credited)}
        {row(`Pengeluaran dari laci (${s.expense_count}×)`, -s.expense_cash)}
        {!!s.stock_cash && row(`Pembelian stok dari laci (${s.stock_count}×)`, -s.stock_cash)}
        {!!s.refund_cash && row(`Refund tunai transaksi yang di-void (${s.refund_count}×)`, -s.refund_cash)}
        {row(`Tips QRIS/transfer diserahkan tunai ke staf (${s.tip_count}×)`, -s.tip_qris)}
      </div>
      <div className="rounded-[10px] bg-paper px-3 py-2">{row("Kas diharapkan di laci (saldo awal + tunai masuk − tunai keluar)", s.expected_cash, true)}</div>
      <div>
        <span className="text-xs font-bold uppercase tracking-[0.06em] text-muted">Transaksi void</span>
        {!s.voided.length ? <p className="py-1.5 text-sm text-muted">Tidak ada.</p> : s.voided.map((v) => (
          <div key={v.id} className="flex justify-between gap-3 py-1.5 text-sm tabular"><span>{formatJam(v.created_at)} · {v.reason}</span><span>{formatRupiah(v.total)}</span></div>
        ))}
      </div>
      {/* Angka penutupan = saat ditutup (resmi). Bila ada transaksi/void/pengeluaran sesudahnya, rekap di atas sudah berubah → beri tahu. */}
      {closings?.[0] && closings[0].expected_cash !== s.expected_cash && (
        <p role="note" className="rounded-[10px] bg-[#FBF3DE] px-3 py-2 text-[13px] text-[#5A4300]">
          Ada perubahan setelah kasir ditutup (transaksi, void, atau pengeluaran): kas diharapkan saat ditutup {formatRupiah(closings[0].expected_cash)},
          sekarang {formatRupiah(s.expected_cash)}. Selisih di bawah dihitung saat penutupan.
        </p>
      )}
      {closings?.map((c, i) => (
        <div key={c.id} className="keep rounded-[10px] border border-line p-3 text-sm">
          <b>Penutupan {formatJam(c.created_at)}{names.get(c.cashier_id ?? "") ? ` · oleh ${names.get(c.cashier_id ?? "")}` : ""}
            {closings.length > 1 && <span className="font-normal text-muted">{i === 0 ? " · terakhir (dipakai laporan)" : " · digantikan penutupan sesudahnya"}</span>}</b>
          {row("Kas diharapkan saat ditutup", c.expected_cash)}
          {row("Uang di laci", c.physical_cash)}
          {row(`Selisih${c.difference && inTol(c.difference) ? " (dalam toleransi)" : ""}`, c.difference ?? 0, true)}
          {c.denominations && <p className="text-xs text-muted">Per pecahan: {Object.entries(c.denominations as Record<string, number>).sort(([a], [b]) => (a === "coins" ? 1 : b === "coins" ? -1 : +b - +a))
            .map(([k, v]) => (k === "coins" ? `koin ${formatRupiah(v)}` : `${rb(+k)}×${v}`)).join(" · ")}</p>}
          {!!c.deposit_out && row("Disetor ke brankas / owner", -c.deposit_out)}
          {row("Sisa di laci untuk besok", c.physical_cash - c.deposit_out)}
          {c.note && <p className="text-muted">Catatan: {c.note}</p>}
        </div>
      ))}
    </>
  );

  return (
    <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto min-[1000px]:grid-cols-[1fr_380px]">
      <PrintSheet page="size: A4; margin: 14mm">
        <div className="flex flex-col gap-4 text-[#1f2320]">
          <div><h1 className="font-display text-2xl font-bold">Rekap kasir</h1>
            <span className="text-[13px]">{master.shop.name}{master.shop.address ? ` · ${master.shop.address}` : ""} · {formatTanggal(`${date}T12:00:00+07:00`)} · dicetak {formatJam(new Date())}</span></div>
          {body}
          {/* hanya di lembar cetak/PDF */}
          <div className="keep mt-6 grid grid-cols-2 gap-10 text-sm">
            {["Kasir", "Manajer"].map((r) => <div key={r} className="flex flex-col gap-12"><span>{r}</span><span className="border-t border-[#1f2320] pt-1 text-xs">Nama & tanda tangan</span></div>)}
          </div>
        </div>
      </PrintSheet>
      <section className="flex flex-col gap-4 rounded-[14px] border border-line bg-card p-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1">
            <h2 className="font-display text-xl font-bold">Rekap kasir</h2>
            <span className="text-[13px] text-muted">{master.shop.name} · {formatTanggal(`${date}T12:00:00+07:00`)}</span>
          </div>
          <div className="no-print"><Field label="Tanggal" htmlFor="cl-date">
            <input id="cl-date" type="date" className="input" value={date} max={jktDate()} onChange={(e) => e.target.value && setDate(e.target.value)} />
          </Field></div>
        </div>
        {body}
      </section>

      <section className="no-print flex flex-col gap-3 self-start rounded-[14px] border border-line bg-card p-5">
        <h2 className="font-display text-xl font-bold">Hitung kas fisik</h2>
        <label className="flex min-h-11 items-center gap-2.5 text-sm font-semibold">
          <input type="checkbox" className="size-5 accent-accent" checked={byDenom} onChange={(e) => setByDenom(e.target.checked)} />
          Hitung per pecahan (disarankan)
        </label>
        {byDenom ? (
          <div className="flex flex-col gap-1.5 rounded-[10px] bg-paper p-3 tabular">
            {DENOMS.map((d) => (
              <div key={d} className="grid grid-cols-[64px_1fr_auto] items-center gap-2 text-sm">
                <label htmlFor={`dn-${d}`} className="font-bold">{rb(d)}</label>
                <input id={`dn-${d}`} inputMode="numeric" placeholder="0 lembar" aria-label={`Jumlah lembar ${rb(d)}`} className="input h-10 text-right"
                  value={counts[d] ?? ""} onChange={(e) => setCounts({ ...counts, [d]: e.target.value.replace(/\D/g, "") })} />
                <span className="w-24 text-right text-muted">{formatRupiah(d * Number(counts[d] || 0))}</span>
              </div>
            ))}
            <div className="grid grid-cols-[64px_1fr_auto] items-center gap-2 text-sm">
              <label htmlFor="dn-coins" className="font-bold">Koin</label>
              <input id="dn-coins" inputMode="numeric" placeholder="total Rp" className="input h-10 text-right"
                value={counts.coins ? Number(counts.coins).toLocaleString("id-ID") : ""} onChange={(e) => setCounts({ ...counts, coins: e.target.value.replace(/\D/g, "") })} />
              <span className="w-24" />
            </div>
            <div className="flex justify-between border-t border-line pt-2 text-base font-bold"><span>Total uang di laci</span><span>{formatRupiah(denomTotal)}</span></div>
          </div>
        ) : (
          <Field label="Total uang di laci (Rp)" htmlFor="cl-phys" hint="Hitung semua uang di laci saat ini — uang hari ini & sisa kemarin — sebelum disetor. Termasuk koin.">
            <input id="cl-phys" inputMode="numeric" className="input text-right text-lg tabular"
              value={physical ? Number(physical).toLocaleString("id-ID") : ""} onChange={(e) => setPhysical(e.target.value.replace(/\D/g, ""))} />
          </Field>
        )}
        {diff != null && (
          <div className={`rounded-[10px] px-3 py-2.5 text-[15px] font-bold tabular ${inTol(diff) ? "bg-[#E6F1E4] text-[#144D2A]" : "bg-[#F9E6E6] text-[#6E1616]"}`}>
            Selisih {diff > 0 ? "+" : ""}{formatRupiah(diff)} {diff === 0 ? "· pas" : inTol(diff) ? `· dalam toleransi ${formatRupiah(tol)}` : diff > 0 ? "· lebih" : "· kurang"}
          </div>
        )}
        <Field label="Disetor ke brankas / owner (Rp, opsional)" htmlFor="cl-dep" hint="Pemindahan uang, bukan biaya. Belanja kebutuhan operasional dicatat di menu Pengeluaran (sumber: laci). Sisanya jadi saldo awal laci besok.">
          <input id="cl-dep" inputMode="numeric" className="input text-right tabular"
            value={deposit ? Number(deposit).toLocaleString("id-ID") : ""} onChange={(e) => setDeposit(e.target.value.replace(/\D/g, ""))} />
        </Field>
        {phys != null && (
          <div className={`flex justify-between rounded-[10px] bg-paper px-3 py-2 text-sm tabular ${dep > phys ? "text-[#A12A2A]" : ""}`}>
            <span>Sisa di laci untuk besok</span><b>{formatRupiah(phys - dep)}</b>
          </div>
        )}
        <Field label="Catatan (opsional)" htmlFor="cl-note">
          <textarea id="cl-note" rows={2} className="input py-2.5" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <button onClick={save} disabled={phys == null || dep > (phys ?? 0) || saving || !online || lockedForCashier} className="btn-ink h-12">{saving ? "Menyimpan…" : "Simpan tutup kasir"}</button>
        {lockedForCashier && <p className="text-xs text-muted">Tanggal ini sudah ditutup. Koreksi hitungan dilakukan manajer.</p>}
        {printer.status === "on" && <button onClick={printSlip} disabled={!s || s.blind} className="btn-ghost h-11 rounded-[10px]">Cetak ke printer struk</button>}
        <button onClick={() => { const t = document.title; document.title = `Rekap kasir ${date}`; window.print(); document.title = t; }} // nama file PDF
          disabled={!s || s.blind} className="btn-ghost h-11 rounded-[10px]">Cetak / simpan PDF</button>
        {!!closings?.length && <p className="text-xs text-muted">{closings.length}× ditutup pada tanggal ini.</p>}
      </section>
    </div>
  );
}
