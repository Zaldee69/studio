"use client";

import { useState } from "react";
import { CloseButton, Field } from "@/components/ui";
import { CUSTOMER_SOURCES, type CustomerSource } from "@/lib/domain/customer";
import { normalizeWhatsApp } from "@/lib/domain/format";
import { createClient } from "@/lib/supabase/client";
import type { Customer } from "./types";

/** Form pelanggan baru (kasir & menu Pelanggan). "Tahu dari mana?" wajib — dasar laporan campaign. */
export function NewCustomer({ online, onClose, onSaved, initial = "" }: { online: boolean; onClose: () => void; onSaved: (c: Customer) => void; initial?: string }) {
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
  return (
    <form onSubmit={(e) => { e.preventDefault(); save(); }} className="flex flex-col gap-4 p-6">
      <div className="flex items-center gap-3"><h2 className="flex-1 font-display text-2xl font-bold">Pelanggan baru</h2><CloseButton onClick={onClose} /></div>
      <Field label="Nama" htmlFor="nc-name"><input id="nc-name" className="input" autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <Field label="No. WhatsApp" htmlFor="nc-wa"><input id="nc-wa" className="input tabular" inputMode="tel" placeholder="08…" value={f.wa} onChange={(e) => setF({ ...f, wa: e.target.value })} /></Field>
      <Field label="Tahu D'Pras dari mana?" htmlFor="nc-source">
        <select id="nc-source" className="input" value={f.source} onChange={(e) => setF({ ...f, source: e.target.value as CustomerSource })}>
          <option value="">— Pilih —</option>
          {CUSTOMER_SOURCES.filter(([v]) => v !== "web").map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </Field>
      <Field label="Catatan preferensi (opsional)" htmlFor="nc-notes"><textarea id="nc-notes" rows={3} className="input py-2.5" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      {error && <p role="alert" className="text-[13px] font-semibold text-[#A12A2A]">{error}</p>}
      <div className="flex justify-end gap-2.5">
        <button type="button" onClick={onClose} className="btn-ghost h-12 rounded-[10px]">Batal</button>
        <button disabled={!online} className="btn-ink h-12 px-6">Simpan</button>
      </div>
    </form>
  );
}
