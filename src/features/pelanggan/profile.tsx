"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { CloseButton, Field, useToast } from "@/components/ui";
import { METHOD_LABEL } from "@/lib/domain/closing";
import { followupLink } from "@/lib/domain/customer";
import { formatJam, formatRupiah, formatTanggal, normalizeWhatsApp } from "@/lib/domain/format";
import { useRealtimeTable } from "@/lib/hooks/useRealtimeTable";
import { createClient } from "@/lib/supabase/client";
import type { Master, TxRow } from "../counter/types";
import { TX_SELECT } from "../counter/types";
import { TopupModal } from "../kasir/topup-modal";

export type CustRow = {
  id: string; name: string; whatsapp: string | null; notes: string;
  stats: { lifetime_value: number; visit_count: number; last_visit_at: string | null; deposit_balance: number; is_churn: boolean } | null;
};

const WEEK = 7 * 864e5;

/** Profil pelanggan: edit nama/WA, catatan (simpan otomatis), follow-up, top-up, riwayat & mutasi deposit. */
export function Profile({ c, master, onClose }: { c: CustRow; master: Master; onClose?: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(c.name);
  const [wa, setWa] = useState(c.whatsapp ?? "");
  const [notes, setNotes] = useState(c.notes);
  const [noteState, setNoteState] = useState<"" | "saving" | "saved" | "error">("");
  const [fieldErr, setFieldErr] = useState("");
  const [topup, setTopup] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [now] = useState(() => Date.now());

  const { data: extra } = useRealtimeTable(["appointments", "transactions", "deposit_topups"], async () => {
    const supabase = createClient();
    const [up, tx, tp] = await Promise.all([
      supabase.from("appointments").select("id, start_at, appointment_services(service_id)").eq("customer_id", c.id)
        .gte("start_at", new Date().toISOString()).not("status", "in", "(paid,cancelled)").order("start_at").limit(5),
      supabase.from("transactions").select(TX_SELECT).eq("customer_id", c.id).order("created_at", { ascending: false }).limit(20),
      supabase.from("deposit_topups").select("id, created_at, amount_paid, amount_credited, method").eq("customer_id", c.id).order("created_at", { ascending: false }),
    ]);
    return { upcoming: up.data ?? [], txs: (tx.data ?? []) as unknown as TxRow[], topups: tp.data ?? [] };
  }, c.id);

  const s = c.stats;
  const ledger = [
    ...(extra?.topups ?? []).map((t) => ({ id: t.id, at: t.created_at, label: `Top-up ${METHOD_LABEL[t.method]} (bayar ${formatRupiah(t.amount_paid)})`, amount: t.amount_credited })),
    ...(extra?.txs ?? []).filter((t) => t.deposit_used > 0 && !t.voided_at).map((t) => ({ id: t.id, at: t.created_at, label: "Dipakai di kasir", amount: -t.deposit_used })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  const weeks = s?.last_visit_at ? Math.floor((now - Date.parse(s.last_visit_at)) / WEEK) : 0;

  async function saveField(patch: { name?: string; whatsapp?: string | null }) {
    setFieldErr("");
    const { error } = await createClient().from("customers").update(patch).eq("id", c.id);
    if (error) setFieldErr(error.code === "23505" ? "No. WhatsApp sudah dipakai pelanggan lain." : error.message);
    else toast("Data pelanggan disimpan");
  }
  function onNotes(v: string) {
    setNotes(v); setNoteState("saving");
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const { error } = await createClient().from("customers").update({ notes: v }).eq("id", c.id);
      setNoteState(error ? "error" : "saved");
    }, 700);
  }

  const card = (k: string, v: string, accent = false) => (
    <div className={`flex flex-col gap-0.5 rounded-[10px] p-3 ${accent ? "bg-[#EEEBFA]" : "bg-paper"}`}>
      <span className={`text-xs ${accent ? "text-[#3A2F8F]" : "text-muted"}`}>{k}</span>
      <b className={`text-[17px] tabular ${accent ? "text-[#2E2670]" : ""}`}>{v}</b>
    </div>
  );
  const head = "text-xs font-bold uppercase tracking-[0.06em] text-muted";

  return (
    <div className="flex flex-col gap-4 p-5">
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between"><label htmlFor="pf-name" className="text-xs font-bold text-muted">Nama</label>{onClose && <CloseButton onClick={onClose} label="Tutup profil" />}</div>
        <input id="pf-name" className="input font-bold" value={name} onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name.trim() !== c.name && saveField({ name: name.trim() })} />
        <label htmlFor="pf-wa" className="text-xs font-bold text-muted">No. WhatsApp</label>
        <input id="pf-wa" className="input tabular" inputMode="tel" value={wa} onChange={(e) => setWa(e.target.value)}
          onBlur={() => {
            const n = wa.trim() ? normalizeWhatsApp(wa) : null;
            if (wa.trim() && !n) return setFieldErr("No. WhatsApp belum valid.");
            if (n !== c.whatsapp) { setWa(n ?? ""); saveField({ whatsapp: n }); }
          }} />
        {fieldErr && <p role="alert" className="text-[13px] font-semibold text-[#A12A2A]">{fieldErr}</p>}
      </div>

      {s?.is_churn ? (
        <div className="flex flex-col gap-2.5 rounded-[10px] bg-[#FFDADA] p-3 text-[#6E1616]">
          <span className="text-[13px] font-semibold">Belum bertransaksi {weeks} minggu — saatnya follow-up.</span>
          {c.whatsapp && (
            <a href={followupLink(c.whatsapp, master.shop.waTemplate, c.name)} target="_blank" rel="noopener"
              onClick={() => { // efektivitas follow-up (Analitik): catat setiap pengiriman
                createClient().auth.getUser().then(({ data }) => createClient().from("followup_events").insert({ customer_id: c.id, sent_by: data.user!.id }));
              }}
              className="btn h-11 rounded-[10px] bg-[#1F7A45] text-white">Kirim WhatsApp follow-up</a>
          )}
        </div>
      ) : c.whatsapp && (
        <a href={`https://wa.me/${c.whatsapp}`} target="_blank" rel="noopener" className="btn-ghost h-11 rounded-[10px]">Chat WhatsApp</a>
      )}

      <div className="grid grid-cols-2 gap-2">
        {card("Total belanja", formatRupiah(s?.lifetime_value ?? 0))}
        {card("Jumlah transaksi", String(s?.visit_count ?? 0))}
        {card("Kunjungan terakhir", s?.last_visit_at ? formatTanggal(s.last_visit_at) : "—")}
        {card("Saldo deposit", formatRupiah(s?.deposit_balance ?? 0), true)}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => setTopup(true)} className="btn-ghost h-11 rounded-[10px]">Top-up saldo</button>
        <Link href={`${master.base}/jadwal?new=1&customer=${c.id}`} className="btn-ink h-11">Buat booking</Link>
      </div>

      <Field label="Catatan preferensi teknis" htmlFor="pf-notes"
        hint={noteState === "saving" ? "Menyimpan…" : noteState === "saved" ? "Tersimpan ✓" : noteState === "error" ? "Gagal menyimpan — coba lagi" : "Tersimpan otomatis"}>
        <textarea id="pf-notes" rows={4} className="input py-2.5 leading-normal" value={notes} onChange={(e) => onNotes(e.target.value)}
          placeholder="Mis. ukuran clipper, formulasi warna gel polish, sensitivitas kulit…" />
      </Field>

      {!!extra?.upcoming.length && (
        <div className="flex flex-col gap-1.5">
          <span className={head}>Booking mendatang</span>
          {extra.upcoming.map((b) => (
            <div key={b.id} className="flex justify-between gap-2 text-[13px] tabular">
              <span>{formatTanggal(b.start_at)} · {formatJam(b.start_at)}</span>
              <span className="truncate text-muted">{b.appointment_services.map((x) => master.services.find((s) => s.id === x.service_id)?.name).join(", ")}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <span className={head}>Riwayat transaksi</span>
        {!extra ? <span className="text-[13px] text-muted">Memuat…</span> : !extra.txs.length ? <span className="text-[13px] text-muted">Belum ada transaksi.</span>
          : extra.txs.map((t) => (
            <div key={t.id} className={`flex flex-col gap-0.5 border-b border-[#F0EDE6] py-2.5 ${t.voided_at ? "opacity-60" : ""}`}>
              <div className="flex justify-between text-[13px] tabular"><b>{formatTanggal(t.created_at)}</b><b className={t.voided_at ? "line-through" : ""}>{formatRupiah(t.total)}</b></div>
              <span className="text-xs text-[#4A463F]">{t.transaction_items.map((i) => i.name).join(", ")}</span>
              <span className="text-xs text-muted">
                {t.voided_at ? `Void · ${t.void_reason}` : [METHOD_LABEL[t.payment_method], t.discount_amount ? `diskon ${formatRupiah(t.discount_amount)}` : "", t.deposit_used ? `deposit ${formatRupiah(t.deposit_used)}` : ""].filter(Boolean).join(" · ")}
              </span>
            </div>
          ))}
      </div>

      <div className="flex flex-col gap-2">
        <span className={head}>Mutasi deposit</span>
        {!ledger.length ? <span className="text-[13px] text-muted">Belum ada mutasi.</span> : ledger.map((d) => (
          <div key={d.id + d.amount} className="flex justify-between gap-2 py-1 text-[13px] tabular">
            <span>{formatTanggal(d.at)} · {d.label}</span>
            <b className={d.amount > 0 ? "text-[#1F7A45]" : "text-[#A12A2A]"}>{d.amount > 0 ? "+" : "−"}{formatRupiah(Math.abs(d.amount))}</b>
          </div>
        ))}
      </div>

      <TopupModal customer={c} balance={s?.deposit_balance ?? 0} packs={master.packs} open={topup} onClose={() => setTopup(false)} onDone={() => setTopup(false)} />
    </div>
  );
}
