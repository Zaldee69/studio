"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CloseButton, Empty, Field, Sheet, useToast } from "@/components/ui";
import { formatRupiah } from "@/lib/domain/format";
import { formatUnitCost, STOCK_STATUS } from "@/lib/domain/inventory";
import { useRealtimeTable } from "@/lib/hooks/useRealtimeTable";
import { createClient } from "@/lib/supabase/client";
import { useInv } from "./provider";
import { qtyFmt, type Kind, type StockRow } from "./types";

export type RetailExtra = { price: number | null; sold30: number; topSeller: string | null };

export function StatusChip({ status }: { status: StockRow["status"] }) {
  const s = STOCK_STATUS[status];
  return <span className="whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ background: s.bg, color: s.fg }}>{s.label}</span>;
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
    <div role="alert" className="flex flex-wrap items-center gap-2 rounded-[14px] border border-[#E8C3C4] bg-[#FFF4F4] px-4 py-3">
      <b className="mr-1 text-sm text-[#6E1616]">{data.length} item perlu dibeli:</b>
      {data.map((r) => (
        <button key={r.item_id} onClick={() => open({ kind: "in", itemId: r.item_id! })}
          className="min-h-11 rounded-full border border-[#E8C3C4] bg-card px-3.5 text-[13px] font-medium text-[#6E1616] tabular hover:bg-[#FBEEEC]">
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
      <summary aria-label={`Aksi lain ${r.name}`} className="flex size-11 cursor-pointer list-none items-center justify-center rounded-[14px] border border-line bg-card font-semibold [&::-webkit-details-marker]:hidden">⋯</summary>
      <div className="absolute right-0 z-10 mt-1 flex w-52 flex-col rounded-[14px] border border-line bg-card py-1 shadow-[0_12px_32px_rgba(28,27,25,0.18)]">
        <button onClick={() => open({ kind: "adjust", itemId: r.item_id })} className="min-h-11 px-3.5 text-left text-sm hover:bg-paper">Penyesuaian stok</button>
        <button onClick={() => open({ kind: "cost", itemId: r.item_id })} className="min-h-11 px-3.5 text-left text-sm hover:bg-paper">Penyesuaian harga pokok</button>
        <Link href={`/manajer/inventaris?tab=mutasi&item=${r.item_id}`} className="flex min-h-11 items-center px-3.5 text-sm hover:bg-paper">Riwayat mutasi</Link>
        <button onClick={toggle} className="min-h-11 px-3.5 text-left text-sm text-[#D94B42] hover:bg-paper">{r.active ? "Nonaktifkan" : "Aktifkan lagi"}</button>
      </div>
    </details>
  );
}

/** Ubah nama, satuan, ambang reorder, dan pemasok. Harga pokok hanya berubah lewat Stok masuk / penyesuaian harga. */
function EditItem({ r, onClose }: { r: StockRow; onClose: () => void }) {
  const { suppliers } = useInv();
  const toast = useToast(); const router = useRouter();
  async function save(fd: FormData) {
    const reorder = Number(String(fd.get("reorder_at")).replace(",", "."));
    if (!String(fd.get("name")).trim() || !(reorder >= 0)) return toast("Nama dan ambang wajib diisi", "error");
    const { error } = await createClient().from("inventory_items").update({
      name: String(fd.get("name")).trim(), unit: String(fd.get("unit")).trim() || "pcs", reorder_at: reorder,
      supplier_id: String(fd.get("supplier_id") || "") || null,
    }).eq("id", r.item_id);
    if (error) return toast(error.message, "error");
    toast("Tersimpan"); onClose(); router.refresh();
  }
  return (
    <form action={save} className="flex flex-col gap-4 p-5">
      <div className="flex items-start justify-between gap-3"><h2 className="text-lg font-semibold">Ubah {r.name}</h2><CloseButton onClick={onClose} /></div>
      <Field label="Nama" htmlFor="ei-name"><Input id="ei-name" name="name" defaultValue={r.name} autoFocus /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Satuan" htmlFor="ei-unit"><Input id="ei-unit" name="unit" defaultValue={r.unit} /></Field>
        <Field label="Reorder di" htmlFor="ei-reorder" hint="Status jadi Perlu dibeli di angka ini"><Input id="ei-reorder" name="reorder_at" inputMode="decimal" defaultValue={r.reorder_at} /></Field>
      </div>
      <Field label="Pemasok" htmlFor="ei-sup">
        <NativeSelect id="ei-sup" name="supplier_id" defaultValue={r.supplier_id ?? ""}>
          <option value="">Belum ditentukan</option>
          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </NativeSelect>
      </Field>
      <div className="flex gap-2"><Button type="button" variant="outline" onClick={onClose} className="h-11 flex-1">Batal</Button><Button className="h-11 flex-1">Simpan</Button></div>
    </form>
  );
}

const ORDER: Record<StockRow["status"], number> = { reorder: 0, low: 1, ok: 2 };

/** Batang stok: terisi sebanding stok terhadap 3× ambang reorder; garis menandai ambang. */
function StockBar({ r }: { r: StockRow }) {
  const full = Math.max(r.reorder_at * 3, r.qty, 1);
  const color = r.status === "reorder" ? "#D94B42" : r.status === "low" ? "#C58A2B" : "#268052";
  return (
    <span aria-hidden="true" className="relative mt-1 block h-1.5 w-24 rounded-full bg-[#E3E5E9]">
      <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(100, (r.qty / full) * 100)}%`, background: color }} />
      {r.reorder_at > 0 && <span className="absolute -top-0.5 h-2.5 w-px bg-ink/50" style={{ left: `${Math.min(100, (r.reorder_at / full) * 100)}%` }} />}
    </span>
  );
}

function TableRow({ r, extra, onEdit }: { r: StockRow; extra?: RetailExtra; onEdit: () => void }) {
  const { open, suppliers } = useInv();
  const sup = suppliers.find((x) => x.id === r.supplier_id)?.name;
  return (
    <tr className={`border-t border-line ${r.active ? "" : "opacity-55"}`}>
      <td className="py-3 pr-3">
        <b className="block font-medium">{r.name}</b>
        <span className="text-xs text-muted">{sup ? `Pemasok: ${sup}` : "Belum ada pemasok"}</span>
      </td>
      <td className="whitespace-nowrap pr-3 tabular">
        <b className="text-base font-semibold">{qtyFmt(r.qty)}</b> <span className="text-muted">{r.unit}</span>
        <StockBar r={r} />
      </td>
      <td className="whitespace-nowrap pr-3 text-right tabular text-muted">{qtyFmt(r.reorder_at)}</td>
      <td className="whitespace-nowrap pr-3 text-right tabular">{formatUnitCost(r.unit_cost)}</td>
      <td className="whitespace-nowrap pr-3 text-right tabular">{formatRupiah(r.stock_value)}</td>
      {extra && (
        <>
          <td className="whitespace-nowrap pr-3 text-right tabular">{extra.price == null ? "—" : formatRupiah(extra.price)}</td>
          <td className="whitespace-nowrap pr-3 text-right tabular">{extra.price == null ? "—" : formatRupiah(Math.round(extra.price - r.unit_cost))}</td>
          <td className="pr-3 text-right tabular">{extra.sold30}</td>
        </>
      )}
      <td className="pr-3"><StatusChip status={r.status} /></td>
      <td className="whitespace-nowrap py-2">
        <div className="flex items-center justify-end gap-1.5">
          <Button type="button" variant="outline" onClick={() => open({ kind: "in", itemId: r.item_id })} className="h-10 px-3">+ Stok masuk</Button>
          <Button type="button" variant="ghost" onClick={onEdit} className="h-10 px-3 text-muted">Ubah</Button>
          <RowMenu r={r} />
        </div>
      </td>
    </tr>
  );
}

function ItemCard({ r, extra, onEdit }: { r: StockRow; extra?: RetailExtra; onEdit: () => void }) {
  const { open } = useInv();
  return (
    <div className={`flex flex-col gap-2 rounded-2xl border border-line bg-card p-3.5 ${r.active ? "" : "opacity-55"}`}>
      <div className="flex items-center gap-2">
        <b className="flex-1 text-[15px] font-medium">{r.name}</b><StatusChip status={r.status} />
      </div>
      <div className="flex items-end justify-between gap-3 tabular">
        <span><b className="text-xl font-semibold">{qtyFmt(r.qty)}</b> <span className="text-sm text-muted">{r.unit}</span><StockBar r={r} /></span>
        <span className="text-right text-xs text-muted">Reorder di {qtyFmt(r.reorder_at)}<b className="block text-sm font-medium text-ink">{formatRupiah(r.stock_value)}</b></span>
      </div>
      {extra?.price != null && <span className="text-xs text-muted tabular">Harga jual {formatRupiah(extra.price)} · terjual {extra.sold30} dalam 30 hari</span>}
      <div className="flex gap-1.5">
        <Button onClick={() => open({ kind: "in", itemId: r.item_id })} className="h-11 flex-1">+ Stok masuk</Button>
        <Button variant="outline" onClick={onEdit} className="h-11">Ubah</Button>
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
  return (
    <>
      <Button onClick={() => setOpen(true)} className="h-11">+ Tambah {kind === "retail" ? "barang ritel" : "bahan"}</Button>
      <Sheet open={open} onClose={() => setOpen(false)} label="Item baru" width={460}>
        <form action={add} className="flex flex-col gap-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <div><h2 className="text-lg font-semibold">{kind === "retail" ? "Barang ritel baru" : "Bahan baru"}</h2><p className="text-[13px] text-muted">Stok dan harga pokok terisi lewat Stok masuk setelah ini.</p></div>
            <CloseButton onClick={() => setOpen(false)} />
          </div>
          <Field label="Nama" htmlFor="ni-name"><Input id="ni-name" name="name" autoFocus /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Satuan" htmlFor="ni-unit"><Input id="ni-unit" name="unit" placeholder={kind === "retail" ? "pcs" : "ml"} /></Field>
            <Field label="Reorder di" htmlFor="ni-reorder"><Input id="ni-reorder" name="reorder_at" inputMode="decimal" placeholder="0" /></Field>
          </div>
          <Field label="Pemasok" htmlFor="ni-sup">
            <NativeSelect id="ni-sup" name="supplier_id"><option value="">Belum ditentukan</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</NativeSelect>
          </Field>
          <div className="flex gap-2"><Button type="button" variant="outline" onClick={() => setOpen(false)} className="h-11 flex-1">Batal</Button><Button className="h-11 flex-1">Tambah</Button></div>
        </form>
      </Sheet>
    </>
  );
}

export function ItemsTable({ kind, extras }: { kind: Kind; extras?: Record<string, RetailExtra> }) {
  const { items } = useInv();
  const [showInactive, setShowInactive] = useState(false);
  const [q, setQ] = useState("");
  const [f, setF] = useState<"all" | StockRow["status"]>("all");
  const [editing, setEditing] = useState<StockRow | null>(null);
  const all = items.filter((i) => i.kind === kind && (showInactive || i.active));
  const cnt = { reorder: all.filter((r) => r.status === "reorder").length, low: all.filter((r) => r.status === "low").length };
  const rows = all.filter((r) => (f === "all" || r.status === f) && r.name.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.name.localeCompare(b.name));
  const total = all.filter((r) => r.active).reduce((a, r) => a + r.stock_value, 0);
  const head = ["Nama", "Stok", "Reorder di", "Harga pokok", "Nilai stok", ...(extras ? ["Harga jual", "Margin/unit", "Terjual 30 hr"] : []), "Status", ""];
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 min-[900px]:grid-cols-4">
        {[["Jumlah item", String(all.filter((r) => r.active).length), kind === "retail" ? "barang ritel" : "bahan HPP"],
          ["Perlu dibeli", String(cnt.reorder), "di bawah batas reorder"], ["Menipis", String(cnt.low), "mendekati batas"],
          ["Nilai stok", formatRupiah(total), "harga pokok × stok"]].map(([k, v, sub], i) => (
          <div key={k} className="flex flex-col gap-0.5 rounded-3xl border border-line bg-card p-4">
            <span className="text-[13px] font-medium text-muted">{k}</span>
            <b className={`font-display text-[28px] font-semibold leading-tight tracking-tight tabular ${i === 1 && cnt.reorder ? "text-[#D94B42]" : ""}`}>{v}</b>
            <span className="text-xs text-muted">{sub}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Input type="search" aria-label="Cari item" placeholder="Cari nama…" value={q} onChange={(e) => setQ(e.target.value)} className="h-11 w-56" />
        <div role="radiogroup" aria-label="Filter status" className="flex gap-1 rounded-xl bg-side p-1">
          {([["all", "Semua"], ["reorder", `Perlu dibeli${cnt.reorder ? ` (${cnt.reorder})` : ""}`], ["low", `Menipis${cnt.low ? ` (${cnt.low})` : ""}`], ["ok", "Aman"]] as const).map(([v, l]) => (
            <button key={v} role="radio" aria-checked={f === v} onClick={() => setF(v)}
              className={`h-9 rounded-lg px-3.5 text-[13px] font-medium ${f === v ? "bg-card font-semibold text-ink shadow-sm" : "text-muted hover:text-ink"}`}>{l}</button>
          ))}
        </div>
        <label className="flex min-h-11 items-center gap-2 text-sm text-muted">
          <Checkbox className="size-5" checked={showInactive} onCheckedChange={(v) => setShowInactive(v === true)} /> Nonaktif
        </label>
        <div className="ml-auto"><NewItem kind={kind} /></div>
      </div>

      {!rows.length ? <Empty>{all.length ? "Tidak ada item yang cocok dengan pencarian atau filter." : "Belum ada item."}</Empty> : (
        <>
          <div className="hidden overflow-x-auto rounded-3xl border border-line bg-card px-4 min-[1000px]:block">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-muted">{head.map((h, i) => <th key={i} className={`whitespace-nowrap py-3 pr-3 font-medium ${/Harga|Nilai|Margin|Terjual|Reorder/.test(h) ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
              <tbody>{rows.map((r) => <TableRow key={r.item_id} r={r} onEdit={() => setEditing(r)} extra={extras?.[r.item_id] ?? (extras ? { price: null, sold30: 0, topSeller: null } : undefined)} />)}</tbody>
            </table>
          </div>
          <div className="grid gap-2.5 min-[640px]:grid-cols-2 min-[1000px]:hidden">
            {rows.map((r) => <ItemCard key={r.item_id} r={r} extra={extras?.[r.item_id]} onEdit={() => setEditing(r)} />)}
          </div>
        </>
      )}
      <Sheet open={!!editing} onClose={() => setEditing(null)} label="Ubah item" width={460}>
        {editing && <EditItem key={editing.item_id} r={editing} onClose={() => setEditing(null)} />}
      </Sheet>
    </div>
  );
}
