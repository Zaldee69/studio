"use client";

import { useEffect, useState } from "react";
import { CloseButton, Empty, Sheet, useOnline, useToast } from "@/components/ui";
import { dailySummary, METHOD_LABEL } from "@/lib/domain/closing";
import { formatJam, formatRupiah, formatTanggal, jktDate } from "@/lib/domain/format";
import { createClient } from "@/lib/supabase/client";
import { TX_SELECT, useDayTransactions } from "../counter/hooks";
import type { Master, TxRow } from "../counter/types";
import { ReceiptView, toReceipt } from "./receipt-view";
import { receiptName } from "@/lib/domain/guest";

const COLS = "grid gap-3 px-4 grid-cols-[64px_1.5fr_1fr_0.9fr] min-[760px]:grid-cols-[64px_1.2fr_1.8fr_1fr_0.9fr] min-[1100px]:grid-cols-[64px_1.2fr_1.8fr_1fr_0.9fr_0.9fr]";

/** Transaksi per tanggal (default hari ini): klik → struk & kirim ulang. Void hanya manajer (dijaga juga di server). */
export function History({ master, txParam }: { master: Master; txParam: string | null }) {
  const toast = useToast();
  const online = useOnline();
  const today = jktDate();
  const [date, setDate] = useState(today);
  const { data, refresh } = useDayTransactions(date);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [openId, setOpenId] = useState<string | null>(txParam);
  const [extra, setExtra] = useState<TxRow | null>(null); // transaksi dari tanggal lain (tautan dari Jadwal)
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState("");
  const [f, setF] = useState({ q: "", method: "", status: "", staff: "", item: "" });

  useEffect(() => {
    createClient().from("team_names").select("id, full_name")
      .then(({ data }) => setNames(new Map((data ?? []).map((r) => [r.id!, r.full_name!]))));
  }, []);
  const all = data ?? [];
  const staffOf = (t: TxRow) => [...new Set(t.transaction_items.map((i) => master.staff.find((s) => s.id === i.staff_id)?.name).filter(Boolean))].join(", ");
  const nameOf = (t: TxRow) => receiptName(t.customer, t.transaction_items.map((i) => i.appointment?.guest_name));
  const q = f.q.trim().toLowerCase().replace(/^#/, "");
  // ponytail: filter di browser — data sudah per tanggal (puluhan baris/hari)
  const txs = all.filter((t) =>
    (!q || nameOf(t).toLowerCase().includes(q) || t.id.slice(0, 8).toLowerCase().startsWith(q))
    && (!f.method || (f.method === "deposit" ? t.deposit_used > 0 : t.payment_method.endsWith(f.method)))
    && (!f.status || (f.status === "void") === !!t.voided_at)
    && (!f.staff || t.transaction_items.some((i) => i.staff_id === f.staff) || t.tip_staff_id === f.staff)
    && (!f.item || t.transaction_items.some((i) => i.name === f.item)));
  const filtered = txs.length !== all.length;
  const staffInDay = master.staff.filter((s) => all.some((t) => t.transaction_items.some((i) => i.staff_id === s.id)));
  const itemsInDay = [...new Set(all.flatMap((t) => t.transaction_items.map((i) => i.name)))].sort((a, b) => a.localeCompare(b, "id"));
  const open = all.find((t) => t.id === openId) ?? (extra?.id === openId ? extra : null);
  useEffect(() => {
    if (!openId || !data || data.some((t) => t.id === openId)) return;
    let alive = true;
    createClient().from("transactions").select(TX_SELECT).eq("id", openId).maybeSingle()
      .then(({ data: t }) => { if (alive) setExtra(t as unknown as TxRow | null); });
    return () => { alive = false; };
  }, [openId, data]);

  const sum = dailySummary(all, []);

  async function doVoid() {
    const { error } = await createClient().rpc("void_transaction", { p_id: openId!, p_reason: reason });
    if (error) return toast(error.message, "error");
    toast("Transaksi dibatalkan · stok & booking dikembalikan");
    setVoiding(false); setReason(""); refresh();
    if (extra) setExtra({ ...extra, voided_at: new Date().toISOString(), void_reason: reason });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-4 text-[13px] text-muted tabular">
        <input type="date" aria-label="Tanggal transaksi" className="input h-9 w-auto" max={today} value={date}
          onChange={(e) => setDate(e.target.value || today)} />
        <span><b className="text-ink">{sum.txCount}</b> transaksi</span>
        {/* total uang hanya untuk manajer: kasir menutup kas tanpa tahu angka sistem (tutup kasir buta) */}
        {master.role === "manager" && <>
          <span>Omzet <b className="text-ink">{formatRupiah(sum.grossTotal)}</b></span>
          <span>Tunai <b className="text-ink">{formatRupiah(sum.cashSales)}</b></span>
          <span>QRIS <b className="text-ink">{formatRupiah(sum.qrisSales)}</b></span>
          <span>Transfer <b className="text-ink">{formatRupiah(sum.transferSales)}</b></span>
          <span>Deposit <b className="text-ink">{formatRupiah(sum.depositUsed)}</b></span>
        </>}
        {sum.voidedCount > 0 && <span className="text-[#A12A2A]">{sum.voidedCount} void</span>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input type="search" aria-label="Cari pelanggan atau No. struk" placeholder="Cari pelanggan / No. struk" className="input h-9 w-56"
          value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
        <select aria-label="Metode bayar" className="input h-9 w-auto" value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}>
          <option value="">Semua metode</option><option value="cash">Tunai</option><option value="qris">QRIS</option><option value="transfer">Transfer</option><option value="deposit">Pakai deposit</option>
        </select>
        <select aria-label="Status" className="input h-9 w-auto" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
          <option value="">Semua status</option><option value="ok">Lunas</option><option value="void">Void</option>
        </select>
        <select aria-label="Staf" className="input h-9 w-auto" value={f.staff} onChange={(e) => setF({ ...f, staff: e.target.value })}>
          <option value="">Semua staf</option>{staffInDay.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select aria-label="Layanan" className="input h-9 w-auto max-w-56" value={f.item} onChange={(e) => setF({ ...f, item: e.target.value })}>
          <option value="">Semua layanan & produk</option>{itemsInDay.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        {filtered && <>
          <span className="text-[13px] text-muted tabular">{txs.length} dari {all.length}</span>
          <button onClick={() => setF({ q: "", method: "", status: "", staff: "", item: "" })} className="text-[13px] font-semibold underline">Reset</button>
        </>}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden rounded-[14px] border border-line bg-card">
        <div className={`${COLS} border-b border-line py-3 text-xs font-bold text-muted`}>
          <span>Jam · No.</span><span>Pelanggan</span><span className="hidden min-[760px]:block">Layanan · staf</span><span className="text-right">Total</span>
          <span>Metode</span><span className="hidden min-[1100px]:block">Kasir</span>
        </div>
        <div className="max-h-full overflow-y-auto">
          {data === null ? <Empty>Memuat…</Empty> : !txs.length ? <Empty>{filtered ? "Tidak ada transaksi yang cocok dengan filter." : date === today ? "Belum ada transaksi hari ini." : "Tidak ada transaksi di tanggal ini."}</Empty> : txs.map((t) => (
            <button key={t.id} onClick={() => setOpenId(t.id)} aria-label={`Transaksi ${formatJam(t.created_at)} ${nameOf(t)} ${formatRupiah(t.total)}`}
              className={`${COLS} min-h-[60px] w-full items-center border-b border-[#EEEEEA] py-2 text-left text-sm tabular hover:bg-paper ${t.voided_at ? "bg-[#FBF5F5]" : ""}`}>
              <span className="flex flex-col"><b>{formatJam(t.created_at)}</b><span className="text-[11px] text-muted">#{t.id.slice(0, 8).toUpperCase()}</span></span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-semibold">{nameOf(t)}</span>
                {/* layar sempit: layanan di bawah nama */}
                <span className="truncate text-xs text-muted min-[760px]:hidden">{t.transaction_items.map((i) => i.name).join(", ")}</span>
              </span>
              <span className="hidden min-w-0 flex-col min-[760px]:flex">
                <span className="truncate">{t.transaction_items.map((i) => i.name).join(", ")}</span>
                <span className="truncate text-xs text-muted">{staffOf(t) || "—"}</span>
              </span>
              <span className="flex flex-col items-end">
                <b className={t.voided_at ? "text-muted line-through" : ""}>{formatRupiah(t.total)}</b>
                {t.discount_amount > 0 && <span className="text-[11px] text-accent-ink">diskon −{formatRupiah(t.discount_amount)}</span>}
                {t.tip_amount > 0 && <span className="text-[11px] text-muted">+ tips {formatRupiah(t.tip_amount)}</span>}
              </span>
              <span className="flex min-w-0 flex-col">
                {t.voided_at
                  ? <><b className="text-[#A12A2A]">Void</b><span className="truncate text-[11px] text-muted" title={t.void_reason ?? ""}>{t.void_reason}</span></>
                  : <><span>{METHOD_LABEL[t.payment_method]}{t.cash_part > 0 && " + tunai"}</span>{t.deposit_used > 0 && <span className="text-[11px] text-muted">deposit {formatRupiah(t.deposit_used)}</span>}</>}
              </span>
              <span className="hidden truncate text-muted min-[1100px]:block">{names.get(t.cashier_id ?? "") ?? "—"}</span>
            </button>
          ))}
        </div>
      </div>

      <Sheet open={!!open} onClose={() => { setOpenId(null); setVoiding(false); }} label="Struk transaksi" width={460}>
        {open && (
          <div className="flex flex-col gap-4 p-6">
            <div className="no-print flex justify-end"><CloseButton onClick={() => setOpenId(null)} /></div>
            <ReceiptView r={toReceipt(open, master.shop, (id) => master.staff.find((s) => s.id === id)?.name, null)} title={`Transaksi ${formatTanggal(open.created_at)}`}>
              {master.role === "manager" && !open.voided_at && (voiding ? (
                <form onSubmit={(e) => { e.preventDefault(); doVoid(); }} className="flex flex-col gap-2 rounded-[10px] border border-[#E8C3C4] p-3">
                  <label htmlFor="void-reason" className="text-xs font-bold text-[#6E1616]">Alasan pembatalan (wajib)</label>
                  <input id="void-reason" className="input" autoFocus required value={reason} onChange={(e) => setReason(e.target.value)} />
                  <p className="text-xs text-muted">Booking kembali ke &quot;Selesai/Belum Bayar&quot;, stok & saldo deposit dikembalikan.</p>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setVoiding(false)} className="btn-ghost flex-1 rounded-[10px]">Kembali</button>
                    <button disabled={!reason.trim() || !online} className="btn flex-1 rounded-[10px] bg-[#A12A2A] text-white">Void transaksi</button>
                  </div>
                </form>
              ) : (
                <button onClick={() => setVoiding(true)} className="btn-ghost h-11 rounded-[10px] text-[#A12A2A]">Batalkan transaksi (void)</button>
              ))}
            </ReceiptView>
          </div>
        )}
      </Sheet>
    </div>
  );
}
