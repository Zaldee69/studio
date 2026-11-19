"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import { useState } from "react";
import { CloseButton, Field } from "@/components/ui";
import { CUSTOMER_SOURCES, type CustomerSource } from "@/lib/domain/customer";
import { normalizeWhatsApp } from "@/lib/domain/format";
import { createClient } from "@/lib/supabase/client";
import type { Customer } from "./types";

/** Form pelanggan baru (kasir & menu Pelanggan). "Tahu dari mana?" wajib — dasar laporan campaign. */
/** embedded = dipakai di dalam dialog lain (mis. Walk-in): judul kecil, tanpa header/footer tetap. */
export function NewCustomer({ online, onClose, onSaved, initial = "", embedded = false }: { online: boolean; onClose: () => void; onSaved: (c: Customer) => void; initial?: string; embedded?: boolean }) {
  // isian awal dari pencarian kasir: angka → No. WA, selain itu → nama
  const isNum = /^[\d\s+-]{6,}$/.test(initial.trim());
  const [f, setF] = useState({ name: isNum ? "" : initial.trim(), wa: isNum ? initial.trim() : "", notes: "", source: "" as CustomerSource | "" });
  const [error, setError] = useState("");
  async function save() {
    setError("");
    const wa = f.wa.trim() ? normalizeWhatsApp(f.wa) : null;
    if (!f.name.trim()) return setError("Isi nama.");
    if (f.wa.trim() && !wa) return setError("No. WhatsApp belum valid.");
    if (!f.source) return setError("Pilih tahu D'Pras dari mana.");
    const c = { name: f.name.trim(), whatsapp: wa, notes: f.notes.trim() };
    const { data, error } = await createClient().from("customers").insert({ ...c, source: f.source }).select("id").single();
    if (error) return setError(error.code === "23505" ? "No. WhatsApp sudah terdaftar — cari di daftar pelanggan." : error.message);
    onSaved({ id: data.id, ...c });
  }
  const head = embedded
    ? <div className="flex items-center gap-3"><h3 className="flex-1 text-base font-medium">Pelanggan baru</h3><CloseButton onClick={onClose} /></div>
    : <div className="sticky top-0 z-10 -mx-6 flex items-center gap-3 border-b border-line bg-card px-6 py-4"><h2 className="flex-1 font-display text-xl font-medium">Pelanggan baru</h2><CloseButton onClick={onClose} /></div>;
  const foot = (
    <div className={embedded ? "flex justify-end gap-2.5" : "sticky bottom-0 z-10 -mx-6 mt-1 flex justify-end gap-2.5 border-t border-line bg-paper px-6 py-4"}>
      <Button type="button" onClick={onClose} variant="ghost" className="h-12">Batal</Button>
      <Button disabled={!online} className="h-12 px-6">Simpan</Button>
    </div>
  );
  return (
    <form onSubmit={(e) => { e.preventDefault(); save(); }} className={embedded ? "flex flex-col gap-3 p-4" : "flex flex-col gap-4 px-6"}>
      {head}
      <Field label="Nama" htmlFor="nc-name"><Input id="nc-name" autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <Field label="No. WhatsApp" htmlFor="nc-wa"><Input id="nc-wa" className="tabular" inputMode="tel" placeholder="08…" value={f.wa} onChange={(e) => setF({ ...f, wa: e.target.value })} /></Field>
      <Field label="Tahu D'Pras dari mana?" htmlFor="nc-source">
        <NativeSelect id="nc-source" value={f.source} onChange={(e) => setF({ ...f, source: e.target.value as CustomerSource })}>
          <option value="">— Pilih —</option>
          {CUSTOMER_SOURCES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </NativeSelect>
      </Field>
      <Field label="Catatan preferensi (opsional)" htmlFor="nc-notes"><Textarea id="nc-notes" rows={embedded ? 2 : 3} className="py-2.5" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      {error && <p role="alert" className="text-[13px] font-medium text-[#A12A2A]">{error}</p>}
      {foot}
    </form>
  );
}
