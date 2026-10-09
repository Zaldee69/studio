"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { CloseButton, Field, Sheet, useOnline, useToast } from "@/components/ui";
import { formatRupiah } from "@/lib/domain/format";
import { formatUnitCost, newUnitCost, suggestOrder, supplierMessage } from "@/lib/domain/inventory";
import { createClient } from "@/lib/supabase/client";
import { ADJUST_REASONS, qtyFmt, type InvSettings, type StockRow, type Supplier } from "./types";
import { IMAGE_ACCEPT, toUploadable } from "@/lib/image";

type Modal = { kind: "in" | "adjust" | "cost"; itemId?: string } | { kind: "shopping" } | null;
type Ctx = { open: (m: Modal) => void; items: StockRow[]; suppliers: Supplier[]; settings: InvSettings };
const InvCtx = createContext<Ctx | null>(null);
export const useInv = () => useContext(InvCtx)!;

/** Modal Stok masuk / Penyesuaian / Harga pokok / Daftar belanja — bisa dibuka dari tab mana pun. */
export function InventoryProvider({ items, suppliers, settings, children }: { items: StockRow[]; suppliers: Supplier[]; settings: InvSettings; children: React.ReactNode }) {
  const [modal, setModal] = useState<Modal>(null);
  const ctx = useMemo(() => ({ open: setModal, items, suppliers, settings }), [items, suppliers, settings]);
  const close = () => setModal(null);
  return (
    <InvCtx.Provider value={ctx}>
      {children}
      <Sheet open={modal?.kind === "in"} onClose={close} label="Stok masuk" width={560}>
        {modal?.kind === "in" && <StockIn initial={modal.itemId} onDone={close} />}
      </Sheet>
      <Sheet open={modal?.kind === "adjust"} onClose={close} label="Penyesuaian stok" width={520}>
        {modal?.kind === "adjust" && <Adjust initial={modal.itemId} onDone={close} />}
      </Sheet>
      <Sheet open={modal?.kind === "cost"} onClose={close} label="Penyesuaian harga pokok" width={480}>
        {modal?.kind === "cost" && <SetCost initial={modal.itemId} onDone={close} />}
      </Sheet>
      <Sheet open={modal?.kind === "shopping"} onClose={close} label="Daftar belanja" width={760}>
        {modal?.kind === "shopping" && <ShoppingList onDone={close} />}
      </Sheet>
    </InvCtx.Provider>
  );
}

function Head({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex items-center gap-3 border-b border-line px-5 py-3.5">
      <h2 className="flex-1 font-display text-xl font-bold">{title}</h2>
      <CloseButton onClick={onClose} />
    </div>
  );
}

/** Pilih item dengan pencarian (daftar dipersempit saat mengetik). */
function ItemPicker({ id, value, onChange, kind }: { id: string; value: string; onChange: (v: string) => void; kind?: "consumable" | "retail" }) {
  const { items } = useInv();
  const [q, setQ] = useState("");
  const list = items.filter((i) => i.active && (!kind || i.kind === kind) && i.name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="grid gap-2 min-[560px]:grid-cols-[1fr_1.4fr]">
      <input type="search" aria-label="Cari item" placeholder="Cari item…" className="input" value={q} onChange={(e) => setQ(e.target.value)} />
      <select id={id} className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Pilih item…</option>
        {(["consumable", "retail"] as const).map((k) => (
          <optgroup key={k} label={k === "consumable" ? "Bahan HPP" : "Barang ritel"}>
            {list.filter((i) => i.kind === k).map((i) => <option key={i.item_id} value={i.item_id}>{i.name} ({qtyFmt(i.qty)} {i.unit})</option>)}
          </optgroup>
        ))}
      </select>
    </div>
  );
}

const num = (s: string) => (s.trim() === "" ? NaN : Number(s.replace(",", ".")));

function StockIn({ initial, onDone }: { initial?: string; onDone: () => void }) {
  const { items, suppliers, settings } = useInv();
  const toast = useToast(); const router = useRouter(); const online = useOnline();
  const [itemId, setItemId] = useState(initial ?? "");
  const it = items.find((i) => i.item_id === itemId);
  const [f, setF] = useState({ qty: "", price: "", total: false, supplier: it?.supplier_id ?? "", invoice: "", note: "" });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const qty = num(f.qty), price = num(f.price);
  const unitCost = f.total ? price / qty : price;
  const valid = !!it && qty > 0 && unitCost >= 0 && Number.isFinite(unitCost);
  const next = valid ? newUnitCost(settings.method, it.qty, it.unit_cost, qty, unitCost) : null;

  async function save() {
    if (!valid || !it) return;
    setBusy(true);
    const supabase = createClient();
    let path: string | null = null;
    if (file) {
      let ready;
      try { ready = await toUploadable(file); } catch (e) { setBusy(false); return toast(e instanceof Error ? e.message : String(e), "error"); }
      path = `${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${ready.ext}`;
      const up = await supabase.storage.from("receipts").upload(path, ready.blob, { contentType: ready.type });
      if (up.error) { setBusy(false); return toast(`Foto nota gagal diunggah: ${up.error.message}`, "error"); }
    }
    const { error } = await supabase.rpc("receive_stock", {
      p_item_id: it.item_id, p_qty: qty, p_unit_cost: Math.round(unitCost * 10000) / 10000,
      p_supplier_id: f.supplier || undefined, p_invoice_no: f.invoice || undefined, p_note: f.note || undefined, p_attachment_path: path ?? undefined,
    });
    setBusy(false);
    if (error) return toast(error.message, "error");
    toast(`Stok ${it.name} +${qtyFmt(qty)} ${it.unit}`);
    router.refresh(); onDone();
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); save(); }}>
      <Head title="Stok masuk" onClose={onDone} />
      <div className="flex flex-col gap-3 p-5">
        <Field label="Item" htmlFor="si-item"><ItemPicker id="si-item" value={itemId} onChange={(v) => { setItemId(v); setF({ ...f, supplier: items.find((i) => i.item_id === v)?.supplier_id ?? "" }); }} /></Field>
        {it && <p className="text-sm text-muted tabular">Stok sekarang <b className="text-ink">{qtyFmt(it.qty)} {it.unit}</b> · harga pokok <b className="text-ink">{formatUnitCost(it.unit_cost)}</b>/{it.unit}</p>}
        <div className="grid grid-cols-2 gap-3">
          <Field label={`Jumlah masuk${it ? ` (${it.unit})` : ""}`} htmlFor="si-qty">
            <input id="si-qty" inputMode="decimal" className="input" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} />
          </Field>
          <Field label={f.total ? "Total harga beli (Rp)" : `Harga beli per ${it?.unit ?? "satuan"} (Rp)`} htmlFor="si-price">
            <input id="si-price" inputMode="decimal" className="input" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} />
          </Field>
        </div>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" className="size-5 accent-accent" checked={f.total} onChange={(e) => setF({ ...f, total: e.target.checked })} />
          Saya isi total harga nota (dihitung per satuan otomatis)
        </label>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Pemasok" htmlFor="si-sup">
            <select id="si-sup" className="input" value={f.supplier} onChange={(e) => setF({ ...f, supplier: e.target.value })}>
              <option value="">—</option>
              {suppliers.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="No. nota" htmlFor="si-inv"><input id="si-inv" className="input" value={f.invoice} onChange={(e) => setF({ ...f, invoice: e.target.value })} /></Field>
        </div>
        <Field label="Foto nota (opsional)" htmlFor="si-file">
          <input id="si-file" type="file" accept={`${IMAGE_ACCEPT},application/pdf`} className="input py-2" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </Field>
        <Field label="Catatan" htmlFor="si-note"><input id="si-note" className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
        {valid && next !== null && (
          <p role="status" className="rounded-[10px] bg-paper px-3.5 py-3 text-sm tabular">
            Stok {qtyFmt(it.qty)} → <b>{qtyFmt(it.qty + qty)} {it.unit}</b> · harga pokok {formatUnitCost(it.unit_cost)} → <b>{formatUnitCost(next)}</b>
            {f.total && <span className="block text-xs text-muted">{formatUnitCost(unitCost, 4)} per {it.unit}</span>}
          </p>
        )}
        <button disabled={!valid || busy || !online} className="btn-ink h-12">{busy ? "Menyimpan…" : "Simpan stok masuk"}</button>
      </div>
    </form>
  );
}

function Adjust({ initial, onDone }: { initial?: string; onDone: () => void }) {
  const { items } = useInv();
  const toast = useToast(); const router = useRouter(); const online = useOnline();
  const [itemId, setItemId] = useState(initial ?? "");
  const [f, setF] = useState({ sign: -1, qty: "", reason: "", note: "" });
  const it = items.find((i) => i.item_id === itemId);
  const qty = num(f.qty) * f.sign;
  const valid = !!it && Number.isFinite(qty) && qty !== 0 && !!f.reason;
  async function save() {
    const { error } = await createClient().rpc("adjust_stock", { p_item_id: itemId, p_qty: qty, p_reason: f.reason, p_note: f.note || undefined });
    if (error) return toast(error.message, "error");
    toast("Penyesuaian dicatat"); router.refresh(); onDone();
  }
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (valid) save(); }}>
      <Head title="Penyesuaian stok" onClose={onDone} />
      <div className="flex flex-col gap-3 p-5">
        <Field label="Item" htmlFor="ad-item"><ItemPicker id="ad-item" value={itemId} onChange={setItemId} /></Field>
        <div role="radiogroup" aria-label="Arah" className="grid grid-cols-2 gap-2">
          {[[-1, "Kurangi"], [1, "Tambah"]].map(([v, l]) => (
            <button type="button" role="radio" key={v} aria-checked={f.sign === v} onClick={() => setF({ ...f, sign: v as number })}
              className={`h-11 rounded-[10px] border-2 text-sm font-bold ${f.sign === v ? "border-ink bg-ink text-white" : "border-line bg-card"}`}>{l}</button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={`Jumlah${it ? ` (${it.unit})` : ""}`} htmlFor="ad-qty"><input id="ad-qty" inputMode="decimal" className="input" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} /></Field>
          <Field label="Alasan" htmlFor="ad-reason">
            <select id="ad-reason" className="input" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })}>
              <option value="">Pilih…</option>
              {ADJUST_REASONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Catatan" htmlFor="ad-note"><input id="ad-note" className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
        {it && Number.isFinite(qty) && qty !== 0 && (
          <p role="status" className="rounded-[10px] bg-paper px-3.5 py-3 text-sm tabular">
            Stok {qtyFmt(it.qty)} → <b>{qtyFmt(it.qty + qty)} {it.unit}</b> · nilai <b>{qty < 0 ? "−" : "+"}{formatRupiah(Math.abs(Math.round(qty * it.unit_cost)))}</b>
          </p>
        )}
        <button disabled={!valid || !online} className="btn-ink h-12">Catat penyesuaian</button>
      </div>
    </form>
  );
}

function SetCost({ initial, onDone }: { initial?: string; onDone: () => void }) {
  const { items } = useInv();
  const toast = useToast(); const router = useRouter();
  const [itemId, setItemId] = useState(initial ?? "");
  const [cost, setCost] = useState(""); const [reason, setReason] = useState("");
  const it = items.find((i) => i.item_id === itemId);
  async function save() {
    const { error } = await createClient().rpc("set_unit_cost", { p_item_id: itemId, p_unit_cost: num(cost), p_reason: reason });
    if (error) return toast(error.message, "error");
    toast("Harga pokok diperbarui"); router.refresh(); onDone();
  }
  return (
    <form onSubmit={(e) => { e.preventDefault(); save(); }}>
      <Head title="Penyesuaian harga pokok" onClose={onDone} />
      <div className="flex flex-col gap-3 p-5">
        <p className="text-sm text-muted">Biasanya harga pokok berubah otomatis lewat Stok masuk. Pakai ini hanya untuk koreksi (mis. salah input nota). Transaksi lama tidak berubah.</p>
        <Field label="Item" htmlFor="sc-item"><ItemPicker id="sc-item" value={itemId} onChange={setItemId} /></Field>
        {it && <p className="text-sm tabular">Sekarang {formatUnitCost(it.unit_cost, 4)} per {it.unit}</p>}
        <Field label="Harga pokok baru per satuan (Rp)" htmlFor="sc-cost"><input id="sc-cost" inputMode="decimal" className="input" value={cost} onChange={(e) => setCost(e.target.value)} /></Field>
        <Field label="Alasan (wajib)" htmlFor="sc-reason"><input id="sc-reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <button disabled={!it || !(num(cost) >= 0) || !reason.trim()} className="btn-ink h-12">Simpan harga pokok</button>
      </div>
    </form>
  );
}

type ShopLine = { item_id: string; name: string; unit: string; qty: number; reorder_at: number; status: string; suggested: number; unit_cost: number;
  supplier_id: string | null; supplier_name: string | null; supplier_whatsapp: string | null };

function ShoppingList({ onDone }: { onDone: () => void }) {
  const { settings } = useInv();
  const toast = useToast();
  const [rows, setRows] = useState<ShopLine[] | null>(null);
  const [qty, setQty] = useState<Record<string, string>>({});
  useEffect(() => {
    createClient().rpc("shopping_list").then(({ data, error }) => {
      if (error) toast(error.message, "error");
      setRows((data ?? []) as ShopLine[]);
    });
  }, [toast]);
  const q = (r: ShopLine) => { const v = num(qty[r.item_id] ?? String(r.suggested)); return Number.isFinite(v) && v > 0 ? v : 0; };
  const groups = [...new Map((rows ?? []).map((r) => [r.supplier_id ?? "", { name: r.supplier_name ?? "Lainnya", wa: r.supplier_whatsapp, rows: [] as ShopLine[] }]))]
    .map(([id, g]) => ({ id, ...g, rows: (rows ?? []).filter((r) => (r.supplier_id ?? "") === id) }));
  const text = (g: (typeof groups)[number]) =>
    supplierMessage(g.id ? g.name : "", settings.shop, g.rows.filter((r) => q(r) > 0).map((r) => ({ name: r.name, qty: q(r), unit: r.unit }))).replace("Halo , ", "Halo, ");
  const all = () => groups.map((g) => `${g.name}\n${g.rows.filter((r) => q(r) > 0).map((r) => `- ${r.name} ${qtyFmt(q(r))} ${r.unit}`).join("\n")}`).join("\n\n");

  function print() {
    const w = window.open("", "_blank", "width=720,height=900");
    if (!w) return;
    const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
    w.document.write(`<!doctype html><meta charset="utf-8"><title>Daftar belanja</title><body style="font:14px system-ui;padding:24px">
      <h1 style="font-size:20px">Daftar belanja — ${esc(settings.shop)}</h1><pre style="font:14px system-ui;white-space:pre-wrap">${esc(all())}</pre>
      <script>print()</script></body>`);
    w.document.close();
  }

  return (
    <div>
      <Head title="Daftar belanja" onClose={onDone} />
      <div className="flex flex-col gap-4 p-5">
        {rows === null ? <p className="text-muted">Memuat…</p> : !rows.length ? <p className="text-muted">Semua stok aman — tidak ada yang perlu dibeli.</p> : groups.map((g) => (
          <section key={g.id || "lain"} className="flex flex-col gap-2 rounded-[14px] border border-line p-3.5">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="flex-1 text-base font-bold">{g.name}</h3>
              <a className={`btn h-11 rounded-[10px] bg-[#1F7A45] text-white ${!g.rows.some((r) => q(r) > 0) ? "pointer-events-none opacity-50" : ""}`} target="_blank" rel="noopener"
                href={`https://wa.me/${g.wa ?? ""}?text=${encodeURIComponent(text(g))}`}>Kirim via WhatsApp</a>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm tabular">
                <thead><tr className="text-left text-xs text-muted"><th className="py-1.5 font-semibold">Item</th><th className="font-semibold">Stok</th><th className="font-semibold">Ambang</th><th className="font-semibold">Saran beli</th><th className="text-right font-semibold">Estimasi</th></tr></thead>
                <tbody>
                  {g.rows.map((r) => (
                    <tr key={r.item_id} className="border-t border-[#EEEEEA]">
                      <td className="py-1.5 font-semibold">{r.name}</td>
                      <td className={r.status === "reorder" ? "font-bold text-[#A12A2A]" : ""}>{qtyFmt(r.qty)} {r.unit}</td>
                      <td>{qtyFmt(r.reorder_at)}</td>
                      <td>
                        <label className="sr-only" htmlFor={`sl-${r.item_id}`}>Jumlah beli {r.name}</label>
                        <input id={`sl-${r.item_id}`} inputMode="decimal" className="input w-28" value={qty[r.item_id] ?? String(r.suggested)}
                          onChange={(e) => setQty({ ...qty, [r.item_id]: e.target.value })} /> <span className="text-muted">{r.unit}</span>
                      </td>
                      <td className="text-right">{formatRupiah(Math.round(q(r) * r.unit_cost))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
        {!!rows?.length && (
          <div className="flex flex-wrap items-center gap-2">
            <b className="flex-1 tabular">Estimasi total {formatRupiah(rows.reduce((a, r) => a + Math.round(q(r) * r.unit_cost), 0))}</b>
            <button type="button" className="btn-ghost h-11" onClick={() => navigator.clipboard.writeText(all()).then(() => toast("Daftar disalin"))}>Salin daftar</button>
            <button type="button" className="btn-ghost h-11" onClick={print}>Cetak</button>
          </div>
        )}
        <p className="text-xs text-muted">Saran = sampai {settings.multiplier}× ambang reorder{"; "}dibulatkan ke kelipatan minimal order bila diisi. Contoh: {suggestOrder(35, 100, settings.multiplier)} untuk stok 35 / ambang 100.</p>
      </div>
    </div>
  );
}

/** Tombol utama di header Inventaris. */
export function InvHeader() {
  const { open } = useInv();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <h1 className="flex-1 font-display text-[28px] font-bold tracking-tight">Inventaris</h1>
      <button onClick={() => open({ kind: "shopping" })} className="btn-ghost h-11">Daftar belanja</button>
      <button onClick={() => open({ kind: "in" })} className="btn-ink h-11">+ Stok masuk</button>
    </div>
  );
}
