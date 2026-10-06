"use client";

import { useState } from "react";
import { CloseButton, Field, Sheet, useOnline, useToast } from "@/components/ui";
import { formatRupiah } from "@/lib/domain/format";
import { createClient } from "@/lib/supabase/client";
import type { Customer, Pack } from "../counter/types";

const num = (v: string) => Number(v.replace(/\D/g, "")) || 0;

/** Top-up deposit: paket (bayar X → saldo Y) atau nominal manual. */
export function TopupModal({ customer, balance, packs, open, onClose, onDone, canBonus = false }: {
  customer: Customer; balance: number; packs: Pack[]; open: boolean; onClose: () => void; onDone: (newBalance: number) => void;
  /** manajer: boleh isi saldo > dibayar tanpa paket. Kasir: bonus hanya lewat paket resmi (dijaga juga di server). */
  canBonus?: boolean;
}) {
  const toast = useToast();
  const online = useOnline();
  const [pack, setPack] = useState<string | null>(null);
  const [paid, setPaid] = useState("");
  const [credited, setCredited] = useState("");
  const [method, setMethod] = useState<"cash" | "qris">("cash");
  const [qrisRef, setQrisRef] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const p = packs.find((x) => x.id === pack);
  const amountPaid = p ? p.amount_paid : num(paid);
  const amountCredited = p ? p.amount_credited : (canBonus && num(credited)) || amountPaid;

  async function save() {
    setError("");
    if (amountPaid <= 0) return setError("Pilih paket atau isi nominal.");
    if (amountCredited < amountPaid) return setError("Saldo masuk tidak boleh lebih kecil dari yang dibayar.");
    if (method === "qris" && qrisRef.replace(/[\s-]/g, "").length < 4) return setError("Isi No. referensi QRIS dari bukti bayar.");
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("topup_deposit", {
      p_customer_id: customer.id, p_method: method, p_package_id: p?.id,
      p_amount_paid: p ? undefined : amountPaid, p_amount_credited: p ? undefined : amountCredited,
      p_qris_ref: method === "qris" ? qrisRef : undefined,
    });
    if (error) { setSaving(false); return setError(error.message); }
    const { data } = await supabase.from("customer_stats").select("deposit_balance").eq("customer_id", customer.id).single();
    setSaving(false);
    const nb = data?.deposit_balance ?? balance + amountCredited;
    toast(`Top-up tercatat · saldo ${customer.name.split(" ")[0]} ${formatRupiah(nb)}`);
    setPack(null); setPaid(""); setCredited(""); setQrisRef("");
    onDone(nb);
  }

  return (
    <Sheet open={open} onClose={onClose} label="Top-up deposit" width={480}>
      <form onSubmit={(e) => { e.preventDefault(); save(); }} className="flex flex-col gap-4 p-6">
        <div className="flex items-start gap-3">
          <div className="flex flex-1 flex-col gap-1">
            <h2 className="font-display text-2xl font-bold">Top-up deposit</h2>
            <span className="text-[13px] text-muted tabular">{customer.name} · saldo sekarang {formatRupiah(balance)}</span>
          </div>
          <CloseButton onClick={onClose} />
        </div>
        <div className="flex flex-col gap-2">
          {packs.map((x) => (
            <button type="button" key={x.id} aria-pressed={pack === x.id} onClick={() => setPack(pack === x.id ? null : x.id)}
              className={`flex min-h-[52px] items-center justify-between rounded-[10px] border-2 px-3.5 text-sm tabular ${pack === x.id ? "border-ink bg-paper" : "border-line bg-card"}`}>
              <span><b>{x.name}</b> · Bayar <b>{formatRupiah(x.amount_paid)}</b></span>
              <span>Saldo <b>{formatRupiah(x.amount_credited)}</b>{" "}
                <span className="text-xs font-bold text-[#1F7A45]">+{formatRupiah(x.amount_credited - x.amount_paid)}</span></span>
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Dibayar (Rp)" htmlFor="tp-paid">
            <input id="tp-paid" inputMode="numeric" className="input tabular" disabled={!!p} placeholder="Nominal manual"
              value={p ? p.amount_paid.toLocaleString("id-ID") : paid} onChange={(e) => setPaid(e.target.value)} />
          </Field>
          <Field label="Saldo masuk (Rp)" htmlFor="tp-cr">
            <input id="tp-cr" inputMode="numeric" className="input tabular" disabled={!!p || !canBonus} placeholder="= dibayar"
              value={p ? p.amount_credited.toLocaleString("id-ID") : canBonus ? credited : amountPaid ? amountPaid.toLocaleString("id-ID") : ""} onChange={(e) => setCredited(e.target.value)} />
          </Field>
        </div>
        <div role="radiogroup" aria-label="Metode" className="grid grid-cols-2 gap-2">
          {([["cash", "Tunai"], ["qris", "QRIS"]] as const).map(([v, l]) => (
            <button type="button" role="radio" aria-checked={method === v} key={v} onClick={() => setMethod(v)}
              className={`h-11 rounded-[10px] border-2 text-sm font-bold ${method === v ? "border-ink bg-ink text-white" : "border-line bg-card"}`}>{l}</button>
          ))}
        </div>
        {method === "qris" && (
          <div className="flex flex-col gap-1 rounded-[10px] bg-paper p-3">
                  <label htmlFor="tp-qris-ref" className="text-[13px] font-bold">No. referensi QRIS</label>
                  <input id="tp-qris-ref" autoComplete="off" className="input h-11 uppercase tabular placeholder:normal-case" placeholder="mis. 4 digit terakhir No. Ref"
                    value={qrisRef} onChange={(e) => setQrisRef(e.target.value)} />
                  <span className="text-xs text-muted">Dari bukti bayar di HP pelanggan / notifikasi bank. Satu nomor hanya untuk satu transaksi.</span>
                </div>
        )}
        {error && <p role="alert" className="text-[13px] font-semibold text-[#A12A2A]">{error}</p>}
        <div className="flex justify-end gap-2.5">
          <button type="button" onClick={onClose} className="btn-ghost h-12 rounded-[10px]">Batal</button>
          <button disabled={saving || !online} className="btn-ink h-12 px-6">
            {saving ? "Menyimpan…" : `Simpan top-up · ${formatRupiah(amountPaid)}`}
          </button>
        </div>
      </form>
    </Sheet>
  );
}
