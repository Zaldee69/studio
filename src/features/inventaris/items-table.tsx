"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Empty, useToast } from "@/components/ui";
import { formatRupiah } from "@/lib/domain/format";
import { formatUnitCost, STOCK_STATUS } from "@/lib/domain/inventory";
import { useRealtimeTable } from "@/lib/hooks/useRealtimeTable";
import { createClient } from "@/lib/supabase/client";
import { useInv } from "./provider";
import { qtyFmt, type Kind, type StockRow } from "./types";

export type RetailExtra = { price: number | null; sold30: number; topSeller: string | null };

export function StatusChip({ status }: { status: StockRow["status"] }) {
  const s = STOCK_STATUS[status];
  return <span className="whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold" style={{ background: s.bg, color: s.fg }}>{s.label}</span>;
}

/** Banner item Reorder — realtime (checkout di konter langsung memunculkan chip di sini). */
export function ReorderBanner() {
  const { open } = useInv();
  const { data } = useRealtimeTable(["stock_moves"], async () => {
    const { data } = await createClient().from("stock_levels").select("item_id, name, qty, reorder_at, unit").eq("status", "reorder").eq("active", true).order("name");
    return data ?? [];
  });
  if (!data?.length) return null;
  return (
    <div role="alert" className="flex flex-wrap items-center gap-2 rounded-[14px] border border-[#EFA3A3] bg-[#FFF4F4] px-4 py-3">
      <b className="mr-1 text-sm text-[#6E1616]">{data.length} item perlu dibeli:</b>
      {data.map((r) => (
        <button key={r.item_id} onClick={() => open({ kind: "in", itemId: r.item_id! })}
          className="min-h-11 rounded-full border border-[#EFA3A3] bg-card px-3.5 text-[13px] font-semibold text-[#6E1616] tabular hover:bg-[#FFDADA]">
          {r.name} · {qtyFmt(Number(r.qty))} / {qtyFmt(Number(r.reorder_at))} {r.unit}
        </button>
      ))}
    </div>
  );
}

function RowMenu({ r }: { r: StockRow }) {
  const { open } = useInv();
  const toast = useToast(); const router = useRouter();
  async function toggle() {
    const { error } = await createClient().from("inventory_items").update({ active: !r.active }).eq("id", r.item_id);
    if (error) return toast(error.message, "error");
    toast(r.active ? `${r.name} dinonaktifkan` : `${r.name} diaktifkan`); router.refresh();
  }
  return (
    <details className="relative">
      <summary aria-label={`Aksi lain ${r.name}`} className="flex size-11 cursor-pointer list-none items-center justify-center rounded-[10px] border border-line bg-card font-bold [&::-webkit-details-marker]:hidden">⋯</summary>
      <div className="absolute right-0 z-10 mt-1 flex w-52 flex-col rounded-xl border border-line bg-card py-1 shadow-[0_12px_32px_rgba(28,27,25,0.18)]">
        <button onClick={() => open({ kind: "adjust", itemId: r.item_id })} className="min-h-11 px-3.5 text-left text-sm hover:bg-paper">Penyesuaian stok</button>
        <button onClick={() => open({ kind: "cost", itemId: r.item_id })} className="min-h-11 px-3.5 text-left text-sm hover:bg-paper">Penyesuaian harga pokok</button>
        <Link href={`/manajer/inventaris?tab=mutasi&item=${r.item_id}`} className="flex min-h-11 items-center px-3.5 text-sm hover:bg-paper">Riwayat mutasi</Link>
        <button onClick={toggle} className="min-h-11 px-3.5 text-left text-sm text-[#A12A2A] hover:bg-paper">{r.active ? "Nonaktifkan" : "Aktifkan lagi"}</button>
      </div>
    </details>
  );
}

/** Baris yang bisa diedit langsung: nama, satuan, ambang, pemasok. Harga pokok hanya lewat Stok masuk. */
function useRowSave(r: StockRow) {
  const toast = useToast(); const router = useRouter();
  return async (fd: FormData) => {
    const reorder = Number(String(fd.get("reorder_at")).replace(",", "."));
    if (!String(fd.get("name")).trim() || !(reorder >= 0)) return toast("Nama & ambang wajib diisi", "error");
    const { error } = await createClient().from("inventory_items").update({
      name: String(fd.get("name")).trim(), unit: String(fd.get("unit")).trim() || "pcs", reorder_at: reorder,
      supplier_id: String(fd.get("supplier_id") || "") || null,
    }).eq("id", r.item_id);
    if (error) return toast(error.message, "error");
    toast("Tersimpan"); router.refresh();
  };
}

function EditCells({ r, form }: { r: StockRow; form: string }) {
  const { suppliers } = useInv();
  return (
    <>
      <td className="py-1.5 pr-2"><input form={form} name="name" aria-label="Nama" defaultValue={r.name} className="input min-w-40 font-semibold" /></td>
      <td className="pr-2"><input form={form} name="unit" aria-label="Satuan" defaultValue={r.unit} className="input w-20" /></td>
      <td className="whitespace-nowrap pr-3 text-base font-bold tabular">{qtyFmt(r.qty)}</td>
      <td className="pr-2"><input form={form} name="reorder_at" aria-label="Reorder di" inputMode="decimal" defaultValue={r.reorder_at} className="input w-24" /></td>
      <td className="pr-2">
        <select form={form} name="supplier_id" aria-label="Pemasok" defaultValue={r.supplier_id ?? ""} className="input w-36">
          <option value="">—</option>
          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </td>
    </>
  );
}

function TableRow({ r, extra }: { r: StockRow; extra?: RetailExtra }) {
  const { open } = useInv();
  const save = useRowSave(r);
  const form = `it-${r.item_id}`;
  return (
    <tr className={`border-t border-[#F0EDE6] ${r.active ? "" : "opacity-55"}`}>
      <EditCells r={r} form={form} />
      <td className="whitespace-nowrap pr-3 text-right tabular">{formatUnitCost(r.unit_cost)}</td>
      <td className="whitespace-nowrap pr-3 text-right tabular">{formatRupiah(r.stock_value)}</td>
      {extra && (
        <>
          <td className="whitespace-nowrap pr-3 text-right tabular">{extra.price == null ? "—" : formatRupiah(extra.price)}</td>
          <td className="whitespace-nowrap pr-3 text-right tabular">{extra.price == null ? "—" : formatRupiah(Math.round(extra.price - r.unit_cost))}</td>
          <td className="pr-3 text-right tabular">{extra.sold30}</td>
          <td className="pr-3">{extra.topSeller ?? "—"}</td>
        </>
      )}
      <td className="pr-2"><StatusChip status={r.status} /></td>
      <td className="whitespace-nowrap">
        <form id={form} action={save} className="flex items-center gap-1.5">
          <button className="btn-ghost h-11 px-3">Simpan</button>
          <button type="button" onClick={() => open({ kind: "in", itemId: r.item_id })} className="btn-ink h-11 px-3">+ Stok masuk</button>
          <RowMenu r={r} />
        </form>
      </td>
    </tr>
  );
}

function ItemCard({ r, extra }: { r: StockRow; extra?: RetailExtra }) {
  const { open } = useInv();
  return (
    <div className={`flex flex-col gap-2 rounded-[14px] border border-line bg-card p-3.5 ${r.active ? "" : "opacity-55"}`}>
      <div className="flex items-center gap-2">
        <b className="flex-1 text-[15px]">{r.name}</b><StatusChip status={r.status} />
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs text-muted tabular">
        <span>Stok<b className="block text-lg text-ink">{qtyFmt(r.qty)} {r.unit}</b></span>
        <span>Reorder di<b className="block text-sm text-ink">{qtyFmt(r.reorder_at)}</b></span>
        <span>Nilai<b className="block text-sm text-ink">{formatRupiah(r.stock_value)}</b></span>
        <span>Harga pokok<b className="block text-sm text-ink">{formatUnitCost(r.unit_cost)}</b></span>
        {extra && <span>Harga jual<b className="block text-sm text-ink">{extra.price == null ? "—" : formatRupiah(extra.price)}</b></span>}
        {extra && <span>Terjual 30 hr<b className="block text-sm text-ink">{extra.sold30}</b></span>}
      </div>
      <div className="flex gap-1.5">
        <button onClick={() => open({ kind: "in", itemId: r.item_id })} className="btn-ink h-11 flex-1">+ Stok masuk</button>
        <RowMenu r={r} />
      </div>
    </div>
  );
}

function NewItem({ kind }: { kind: Kind }) {
  const { suppliers } = useInv();
  const toast = useToast(); const router = useRouter();
  const [open, setOpen] = useState(false);
  async function add(fd: FormData) {
    const name = String(fd.get("name")).trim();
    if (!name) return toast("Isi nama item", "error");
    const { error } = await createClient().from("inventory_items").insert({
      name, kind, unit: String(fd.get("unit")).trim() || "pcs", reorder_at: Number(fd.get("reorder_at")) || 0,
      supplier_id: String(fd.get("supplier_id") || "") || null,
    });
    if (error) return toast(error.message, "error");
    toast(`${name} ditambahkan — catat Stok masuk untuk mengisi stok & harga pokok`); setOpen(false); router.refresh();
  }
  if (!open) return <button onClick={() => setOpen(true)} className="btn-ghost h-11 self-start">+ Tambah {kind === "retail" ? "barang ritel" : "bahan"}</button>;
  return (
    <form action={add} className="flex flex-wrap items-end gap-2 rounded-[14px] border border-line bg-card p-3.5">
      <label className="flex flex-col"><span className="label">Nama</span><input name="name" className="input w-52" autoFocus /></label>
      <label className="flex flex-col"><span className="label">Satuan</span><input name="unit" className="input w-24" placeholder={kind === "retail" ? "pcs" : "ml"} /></label>
      <label className="flex flex-col"><span className="label">Reorder di</span><input name="reorder_at" inputMode="decimal" className="input w-24" /></label>
      <label className="flex flex-col"><span className="label">Pemasok</span>
        <select name="supplier_id" className="input w-40"><option value="">—</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
      </label>
      <button className="btn-ink h-11">Tambah</button>
      <button type="button" onClick={() => setOpen(false)} className="btn-ghost h-11">Batal</button>
    </form>
  );
}

export function ItemsTable({ kind, extras }: { kind: Kind; extras?: Record<string, RetailExtra> }) {
  const { items } = useInv();
  const [showInactive, setShowInactive] = useState(false);
  const rows = items.filter((i) => i.kind === kind && (showInactive || i.active));
  const total = rows.filter((r) => r.active).reduce((a, r) => a + r.stock_value, 0);
  const head = ["Nama", "Satuan", "Stok", "Reorder di", "Pemasok", "Harga pokok/satuan", "Nilai stok",
    ...(extras ? ["Harga jual", "Margin/unit", "Terjual 30 hr", "Penjual teratas"] : []), "Status", ""];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <NewItem kind={kind} />
        <label className="ml-auto flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" className="size-5 accent-[#5646C8]" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Tampilkan nonaktif
        </label>
      </div>
      {!rows.length ? <Empty>Belum ada item.</Empty> : (
        <>
          <div className="hidden overflow-x-auto rounded-[14px] border border-line bg-card px-3 min-[1000px]:block">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-muted">{head.map((h, i) => <th key={i} className={`py-2.5 pr-2 font-semibold ${/Harga|Nilai|Margin|Terjual/.test(h) ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
              <tbody>{rows.map((r) => <TableRow key={r.item_id} r={r} extra={extras?.[r.item_id] ?? (extras ? { price: null, sold30: 0, topSeller: null } : undefined)} />)}</tbody>
            </table>
          </div>
          <div className="grid gap-2.5 min-[640px]:grid-cols-2 min-[1000px]:hidden">
            {rows.map((r) => <ItemCard key={r.item_id} r={r} extra={extras?.[r.item_id]} />)}
          </div>
          <p className="text-right text-sm tabular">Total nilai stok {kind === "retail" ? "ritel" : "bahan"}: <b>{formatRupiah(total)}</b></p>
        </>
      )}
    </div>
  );
}
