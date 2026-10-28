"use client";

import { useState } from "react";
import { CloseButton, Field, useOnline, useToast } from "@/components/ui";
import { CAT_NAME, CAT_TONE } from "@/lib/domain/category";
import { formatJam, formatRupiah } from "@/lib/domain/format";
import { findConflicts } from "@/lib/domain/schedule";
import { createClient } from "@/lib/supabase/client";
import { CustomerCombobox } from "../counter/customer-combobox";
import { NewCustomer } from "../counter/new-customer";
import type { Cat, Customer, DayAppt, Master, TimeOffRow } from "../counter/types";
import { floorStaff, staffNow } from "./now";

type Conflict = { customer_name: string; start_at: string; end_at: string; resource_name: string };

/**
 * Walk-in sekarang: pilih kapster (default yang kosong) → layanan → Mulai. Booking dibuat mulai saat ini dan langsung
 * "Sedang dilayani" (tanpa Booked/Datang — pelanggannya sudah di depan kasir). Kursi: kursi milik kapster, atau yang kosong.
 */
export function WalkInForm({ master, appts, offs, initialStaff, onClose, onDone }: {
  master: Master; appts: DayAppt[]; offs: TimeOffRow[]; initialStaff?: string | null; onClose: () => void; onDone: () => void;
}) {
  const toast = useToast(); const online = useOnline();
  const staff = floorStaff(master).map((s) => ({ ...s, now: staffNow(appts, offs, s.id) }))
    .sort((a, b) => Number(b.now.free) - Number(a.now.free));
  const [staffPick, setStaffPick] = useState<string | null>(initialStaff ?? null);
  // default dihitung tiap render (data izin/jadwal bisa baru selesai dimuat): yang dipilih bila tidak izin, lalu yang kosong
  const staffId = [staffPick, staff.find((s) => s.now.free)?.id, staff.find((s) => !s.now.off)?.id]
    .find((id) => id && !staff.find((s) => s.id === id)?.now.off) ?? "";
  const [sel, setSel] = useState<string[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [guest, setGuest] = useState("");
  const [adding, setAdding] = useState(false);
  const [conflicts, setConflicts] = useState<Conflict[] | null>(null);
  const [busy, setBusy] = useState(false);

  const who = staff.find((s) => s.id === staffId);
  const cat = who?.category as Cat | undefined;
  const services = master.services.filter((s) => s.active && s.category === cat);
  const dur = sel.reduce((a, id) => a + (master.services.find((s) => s.id === id)?.duration_min ?? 0), 0) || 30;
  const price = sel.reduce((a, id) => a + (master.services.find((s) => s.id === id)?.price ?? 0), 0);

  /** Kursi milik kapster bila kosong sekarang, selain itu kursi sekategori yang kosong, selain itu kursi milik kapster. */
  function pickResource(startIso: string, endIso: string) {
    const pool = master.resources.filter((r) => r.type === cat)
      .sort((x, y) => Number(y.id === who?.home_resource_id) - Number(x.id === who?.home_resource_id));
    return (pool.find((r) => !findConflicts(appts, { resourceId: r.id, staffId: null, start: startIso, end: endIso }).length) ?? pool[0])?.id;
  }

  async function start(force = false) {
    if (!who || !sel.length) return;
    setBusy(true);
    const now = new Date(); now.setSeconds(0, 0);
    const startIso = now.toISOString(), endIso = new Date(now.getTime() + dur * 60_000).toISOString();
    const supabase = createClient();
    const { data, error } = await supabase.rpc("create_booking_admin", {
      p_resource_id: pickResource(startIso, endIso)!, p_staff_id: who.id, p_start_at: startIso, p_service_ids: sel,
      p_customer_id: customer?.id, p_source: "walk_in", p_force: force, p_guest_name: customer ? undefined : guest.trim() || undefined,
    });
    if (error) { setBusy(false); return toast(error.message, "error"); }
    const r = data as { saved: boolean; appointment_id?: string; conflicts: Conflict[] };
    if (!r.saved) { setBusy(false); return setConflicts(r.conflicts); }
    const st = await supabase.rpc("set_appointment_status", { p_id: r.appointment_id!, p_status: "in_service" });
    setBusy(false);
    if (st.error) toast(`Booking dibuat, tapi status belum diubah: ${st.error.message}`, "error");
    else toast(`${customer?.name ?? (guest.trim() || "Walk-in")} mulai dilayani ${who.name}`);
    onDone();
  }

  return (
    <div className="flex flex-col gap-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div><h2 className="font-display text-2xl font-bold">Walk-in sekarang</h2><p className="text-sm text-muted">Mulai dilayani saat ini · {formatJam(new Date())}</p></div>
        <CloseButton onClick={onClose} />
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-xs font-bold text-muted">Dilayani oleh</legend>
        <div className="grid grid-cols-2 gap-2 min-[560px]:grid-cols-3">
          {staff.map((s) => {
            const on = s.id === staffId;
            const note = s.now.off ? "Izin" : s.now.current ? `${s.now.current.status === "in_service" ? "Melayani" : "Menunggu"} s/d ${formatJam(s.now.current.end_at)}` : s.now.free ? "Kosong" : "Ada jadwal";
            return (
              <button key={s.id} type="button" role="radio" aria-checked={on} disabled={s.now.off}
                onClick={() => { setStaffPick(s.id); if (s.category !== cat) setSel([]); setConflicts(null); }}
                className={`flex min-h-14 flex-col items-start justify-center rounded-xl border-2 px-3 text-left disabled:opacity-40 ${on ? "border-ink bg-ink text-white" : "border-line bg-card"}`}>
                <b className="text-sm">{s.name}</b>
                <span className={`text-xs ${on ? "text-white/80" : s.now.free ? "text-[#1F7A45]" : "text-muted"}`}>{CAT_NAME[s.category]} · {note}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      {cat && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-xs font-bold" style={{ color: CAT_TONE[cat].fg }}>Layanan {CAT_NAME[cat]}</legend>
          <div className="flex flex-wrap gap-2">
            {services.map((s) => {
              const on = sel.includes(s.id);
              return (
                <button key={s.id} type="button" aria-pressed={on} onClick={() => { setSel(on ? sel.filter((x) => x !== s.id) : [...sel, s.id]); setConflicts(null); }}
                  className={`min-h-11 rounded-full border px-3.5 text-sm font-semibold ${on ? "border-ink bg-ink text-white" : "border-line bg-card"}`}>
                  {s.name} <span className={on ? "text-white/75" : "text-muted"}>· {formatRupiah(s.price)}</span>
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      <div className="grid grid-cols-1 gap-3 min-[560px]:grid-cols-2">
        <Field label="Pelanggan terdaftar (opsional)" htmlFor="wi-cust">
          <CustomerCombobox id="wi-cust" value={customer} onChange={setCustomer} emptyLabel="Cari nama / no. WA" />
        </Field>
        {!customer && (
          <Field label="Nama panggilan (opsional)" htmlFor="wi-guest">
            <input id="wi-guest" className="input" maxLength={40} placeholder="mis. Budi kaos merah" value={guest} onChange={(e) => setGuest(e.target.value)} />
          </Field>
        )}
      </div>
      {!customer && (adding ? (
        <div className="rounded-xl border border-line">
          <NewCustomer online={online} onClose={() => setAdding(false)} onSaved={(c) => { setCustomer(c); setAdding(false); toast(`${c.name} ditambahkan`); }} />
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="btn-ghost h-11 self-start rounded-[10px]">+ Pelanggan baru (dengan no. WA)</button>
      ))}

      {conflicts && (
        <div role="alert" className="flex flex-col gap-2 rounded-[10px] bg-[#F9E6E6] p-3 text-sm text-[#6E1616]">
          <b>Masih ada jadwal di jam ini:</b>
          {conflicts.map((c, i) => <span key={i}>{c.customer_name} {formatJam(c.start_at)}–{formatJam(c.end_at)} · {c.resource_name}</span>)}
          <span className="text-xs">Kalau pelanggan sebelumnya sudah selesai, tandai Selesai dulu — atau tetap mulai.</span>
          <button onClick={() => start(true)} disabled={busy || !online} className="btn self-start rounded-[10px] bg-[#6E1616] px-4 text-white">Tetap mulai</button>
        </div>
      )}

      <button onClick={() => start()} disabled={!sel.length || !who || busy || !online} className="btn-ink h-14 rounded-xl text-base">
        {busy ? "Menyimpan…" : sel.length ? `Mulai dilayani · ${dur} mnt · ${formatRupiah(price)}` : "Pilih layanan"}
      </button>
    </div>
  );
}
