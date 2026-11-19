"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CloseButton, Sheet, useToast } from "@/components/ui";
import { upsellSuggestions } from "@/lib/domain/cart";
import { formatJam, formatRupiah } from "@/lib/domain/format";
import { createClient } from "@/lib/supabase/client";
import type { DayAppt, Master, Svc } from "../counter/types";

export type Offer = { s: Svc; from: Svc };

/** Tawaran naik paket: layanan yang dipilih punya pasangan (upsell_service_id) yang belum dipilih & belum dilewati. */
export function suggestFor(selected: string[], services: Svc[], skipped: string[] = []): Offer[] {
  return upsellSuggestions(selected, services.filter((s) => s.active), skipped).flatMap((id) => {
    const s = services.find((x) => x.id === id), from = services.find((x) => x.upsell_service_id === id && selected.includes(x.id));
    return s && from ? [{ s, from }] : [];
  });
}

/** Baris tawaran di form booking / walk-in: satu ketukan untuk menambah, satu untuk melewati. */
export function UpsellOffer({ items, onAdd, onSkip }: { items: Offer[]; onAdd: (id: string) => void; onSkip: (id: string) => void }) {
  if (!items.length) return null;
  return (
    <div className="flex flex-col gap-2" role="group" aria-label="Tawaran tambahan">
      {items.map(({ s, from }) => (
        <div key={s.id} className="flex flex-wrap items-center gap-2 rounded-2xl border border-dashed border-[#CBCFD6] bg-paper px-3 py-2.5">
          <span className="min-w-0 flex-1 text-[13px] leading-snug">
            Tawarkan <b className="font-semibold">{s.name}</b> setelah {from.name}? <span className="tabular text-muted">+{formatRupiah(s.price)} · +{s.duration_min} mnt</span>
          </span>
          <Button type="button" onClick={() => onAdd(s.id)} className="h-11 px-4 text-xs">Tambah</Button>
          <Button type="button" variant="ghost" onClick={() => onSkip(s.id)} className="h-11 px-3 text-xs text-muted">Lewati</Button>
        </div>
      ))}
    </div>
  );
}

/** Saat tombol "Datang" ditekan: tawarkan sekali sebelum layanan dimulai. Tambah → durasi booking bertambah bila tidak bentrok. */
export function ArrivalOffer({ appt, items, name, onClose, onContinue }: { appt: DayAppt; items: Offer[]; name: string; master?: Master; onClose: () => void; onContinue: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const db = createClient();
  async function add(o: Offer) {
    setBusy(true);
    const { data, error } = await db.rpc("upsell_add_on_arrival", { p_appointment: appt.id, p_service_id: o.s.id });
    setBusy(false);
    if (error) return toast(error.message, "error");
    const r = data as { ok: boolean; reason?: string; next_start?: string };
    if (r.ok) { toast(`${o.s.name} ditambahkan (+${o.s.duration_min} menit)`); return onContinue(); }
    if (r.reason === "bentrok") return toast(`Tidak muat: jadwal berikutnya${r.next_start ? ` jam ${formatJam(r.next_start)}` : ""} bertabrakan. Ubah jadwalnya dulu bila pelanggan mau.`, "error");
    toast("Layanan tidak bisa ditambahkan.", "error");
  }
  async function skip() {
    setBusy(true);
    const { error } = await db.rpc("upsell_decline", { p_appointment: appt.id });
    setBusy(false);
    if (error) return toast(error.message, "error");
    onContinue();
  }
  return (
    <div className="flex flex-col gap-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div><h2 className="text-lg font-semibold">Tawarkan sebelum mulai</h2><p className="text-sm text-muted">{name} sudah tiba. Tanyakan sekali, lalu lanjutkan.</p></div>
        <CloseButton onClick={onClose} />
      </div>
      {items.map((o) => (
        <div key={o.s.id} className="flex flex-col gap-2 rounded-2xl bg-paper p-4">
          <b className="text-base">{o.s.name}</b>
          <span className="text-sm text-muted">Tambahan setelah {o.from.name} · <span className="tabular">+{formatRupiah(o.s.price)} · +{o.s.duration_min} menit</span></span>
          <Button onClick={() => add(o)} disabled={busy} className="h-12">Tambahkan ke booking</Button>
        </div>
      ))}
      <Button variant="outline" onClick={skip} disabled={busy} className="h-12">Lewati, tandai sudah datang</Button>
    </div>
  );
}

export { Sheet };
