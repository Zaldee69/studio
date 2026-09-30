"use client";

import { useEffect, useMemo, useState } from "react";
import { CloseButton, Field, useOnline, useToast } from "@/components/ui";
import { formatJam, formatRupiah, normalizeWhatsApp } from "@/lib/domain/format";
import { findConflicts, jktIso, jktMinutes, minToTime, timeToMin } from "@/lib/domain/schedule";
import { approvedOffFor, offLabel } from "@/lib/domain/staff";
import { createClient } from "@/lib/supabase/client";
import { CustomerCombobox } from "../counter/customer-combobox";
import { useDayAppointments, useDayTimeOff } from "../counter/hooks";
import type { Cat, Customer, DayAppt, Master } from "../counter/types";

export type FormInit = {
  date: string; startMin: number; resourceId: string;
  appt?: DayAppt; customer?: Customer | null;
};
type Source = "walk_in" | "whatsapp" | "admin";
type Conflict = { id: string; start_at: string; end_at: string; customer_name: string; staff_name: string | null; resource_name: string };

/** Form booking cepat (baru & ubah). Bentrok = peringatan lunak → "Tetap simpan". */
export function BookingForm({ master, init, today, onClose, onSaved }: {
  master: Master; init: FormInit; today: string; onClose: () => void; onSaved: (date: string) => void;
}) {
  const toast = useToast();
  const online = useOnline();
  const edit = init.appt;
  const svcById = useMemo(() => new Map(master.services.map((s) => [s.id, s])), [master.services]);
  const bookable = master.services.filter((s) => s.active && s.category !== "retail");
  const activeStaff = master.staff.filter((s) => s.active);

  const [customer, setCustomer] = useState<Customer | null>(edit?.customer ?? init.customer ?? null);
  const [newName, setNewName] = useState("");
  const [newWa, setNewWa] = useState("");
  const [sel, setSel] = useState<string[]>(edit?.appointment_services.map((s) => s.service_id) ?? []);
  // Ubah booking: pertahankan durasi lama bila sebelumnya di-override.
  const [durOverride, setDurOverride] = useState<number | null>(() => {
    if (!edit) return null;
    const auto = edit.appointment_services.reduce((a, s) => a + (svcById.get(s.service_id)?.duration_min ?? 0), 0);
    return edit.duration_min !== auto ? edit.duration_min : null;
  });
  const [resourceId, setResourceId] = useState(edit?.resource_id ?? init.resourceId);
  const [staffPick, setStaffPick] = useState<string | null>(edit?.staff_id ?? null);
  const [date, setDate] = useState(init.date);
  const [start, setStart] = useState(edit ? jktMinutes(edit.start_at) : init.startMin);
  const [notes, setNotes] = useState(edit?.notes ?? "");
  const [source, setSource] = useState<Source>(init.date === today ? "walk_in" : "admin");
  const [serverConflicts, setServerConflicts] = useState<Conflict[] | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [waOwner, setWaOwner] = useState<{ wa: string; name: string } | null>(null);

  const { data: dayAppts } = useDayAppointments(date);
  const { data: dayOffs } = useDayTimeOff(date);
  const autoDur = sel.reduce((a, id) => a + (svcById.get(id)?.duration_min ?? 0), 0) || 30;
  const duration = durOverride ?? autoDur;
  const resource = master.resources.find((r) => r.id === resourceId);
  const startIso = jktIso(date, start), endIso = jktIso(date, start + duration);

  // Kapster default: staf aktif kategori sesuai yang kosong di jam itu (sampai dipilih manual).
  const cat: Cat = (sel.map((id) => svcById.get(id)?.category).find((c) => c !== "retail") as Cat | undefined) ?? resource?.type ?? "barbershop";
  const others = (dayAppts ?? []).filter((a) => a.id !== edit?.id);
  // lewati staf yang izin; utamakan yang kosong di jam itu
  const defaultStaff = useMemo(() => {
    const pool = activeStaff.filter((s) => s.category === cat && !approvedOffFor(dayOffs ?? [], s.id, startIso, endIso));
    return (pool.find((s) => !findConflicts(others, { resourceId: "-", staffId: s.id, start: startIso, end: endIso }).length) ?? pool[0])?.id ?? null;
  }, [activeStaff, cat, others, startIso, endIso, dayOffs]);
  const staffId = staffPick ?? defaultStaff;

  const conflicts = findConflicts(others, { resourceId, staffId, start: startIso, end: endIso });
  const staffOff = approvedOffFor(dayOffs ?? [], staffId, startIso, endIso);
  const conflictText = (serverConflicts ?? conflicts.map((a) => ({
    id: a.id, start_at: a.start_at, end_at: a.end_at, customer_name: a.customer?.name ?? "Walk-in",
    staff_name: master.staff.find((s) => s.id === a.staff_id)?.name ?? null,
    resource_name: master.resources.find((r) => r.id === a.resource_id)?.name ?? "",
  }))).map((c) => `${c.customer_name} ${formatJam(c.start_at)}–${formatJam(c.end_at)} (${c.resource_name}${c.staff_name ? ` · ${c.staff_name}` : ""})`);
  const hasConflict = conflictText.length > 0;

  // No. WA yang diketik ternyata milik pelanggan lama → beri tahu & pakai pelanggan itu.
  const waNorm = normalizeWhatsApp(newWa);
  useEffect(() => {
    if (!waNorm || customer) return;
    let alive = true;
    createClient().from("customers").select("name").eq("whatsapp", waNorm).maybeSingle()
      .then(({ data }) => { if (alive) setWaOwner(data ? { wa: waNorm, name: data.name } : null); });
    return () => { alive = false; };
  }, [waNorm, customer]);
  const existingOwner = waOwner && waOwner.wa === waNorm && !customer ? waOwner.name : null;

  const times: number[] = [];
  for (let t = timeToMin(master.shop.open); t < timeToMin(master.shop.close); t += 15) times.push(t);
  if (!times.includes(start)) { times.push(start); times.sort((a, b) => a - b); }

  async function save() {
    setError("");
    if (!sel.length) return setError("Pilih minimal satu layanan.");
    if (!staffId) return setError("Pilih kapster/teknisi.");
    if (!customer && newWa.trim() && !waNorm) return setError("No. WhatsApp belum valid.");
    setSaving(true);
    const supabase = createClient();
    const force = hasConflict;
    const { data, error } = edit
      ? await supabase.rpc("update_booking_admin", {
        p_id: edit.id, p_resource_id: resourceId, p_staff_id: staffId, p_start_at: startIso, p_service_ids: sel,
        p_duration: duration !== autoDur ? duration : undefined, p_notes: notes, p_force: force,
      })
      : await supabase.rpc("create_booking_admin", {
        p_resource_id: resourceId, p_staff_id: staffId, p_start_at: startIso, p_service_ids: sel,
        p_customer_id: customer?.id, p_name: customer ? undefined : newName.trim() || undefined,
        p_whatsapp: customer ? undefined : newWa.trim() || undefined, p_source: source, p_notes: notes,
        p_force: force, p_duration: duration !== autoDur ? duration : undefined,
      });
    setSaving(false);
    if (error) return setError(error.message);
    const r = data as { saved: boolean; conflicts: Conflict[]; customer_existing?: boolean };
    if (!r.saved) { setServerConflicts(r.conflicts); return; } // bentrok baru dari perangkat lain → minta konfirmasi
    toast(r.customer_existing ? `Booking disimpan · pakai pelanggan lama ${existingOwner ?? ""}`.trim()
      : force ? "Booking disimpan (dengan bentrok jadwal)" : edit ? "Booking diperbarui" : "Booking disimpan");
    onSaved(date);
  }

  const chip = (on: boolean) => `min-h-11 rounded-full border px-3.5 text-[13px] font-semibold ${on ? "border-ink bg-ink text-white" : "border-[#D9D4C8] bg-card"}`;

  return (
    <form onSubmit={(e) => { e.preventDefault(); save(); }} className="flex flex-col gap-4 p-6">
      <div className="flex items-center gap-3">
        <h2 className="flex-1 font-display text-2xl font-bold">{edit ? "Ubah booking" : "Booking baru"}</h2>
        <CloseButton onClick={onClose} />
      </div>

      {edit ? (
        <p className="rounded-[10px] bg-paper px-3 py-2.5 text-sm"><b>{edit.customer?.name ?? "Walk-in"}</b>{edit.customer?.whatsapp && <span className="text-muted tabular"> · {edit.customer.whatsapp}</span>}</p>
      ) : (
        <>
          <Field label="Pelanggan" htmlFor="f-cust">
            <CustomerCombobox id="f-cust" value={customer} onChange={(c) => { setCustomer(c); setServerConflicts(null); }} emptyLabel="Pelanggan baru" />
          </Field>
          {!customer && (
            <div className="grid grid-cols-1 gap-3 min-[520px]:grid-cols-2">
              <Field label="Nama baru (kosong = walk-in)" htmlFor="f-name">
                <input id="f-name" className="input" autoComplete="off" value={newName} onChange={(e) => setNewName(e.target.value)} />
              </Field>
              <Field label="No. WhatsApp" htmlFor="f-wa">
                <input id="f-wa" className="input tabular" inputMode="tel" placeholder="08…" value={newWa} onChange={(e) => setNewWa(e.target.value)} />
              </Field>
              {existingOwner && (
                <p role="status" className="rounded-[10px] bg-[#EEEBFA] px-3 py-2 text-[13px] text-[#2E2670] min-[520px]:col-span-2">
                  No. WA ini sudah terdaftar atas nama <b>{existingOwner}</b> — booking akan memakai pelanggan tersebut.
                </p>
              )}
            </div>
          )}
        </>
      )}

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-xs font-bold text-muted">Layanan (boleh lebih dari satu)</legend>
        {(["barbershop", "nail"] as const).map((c) => (
          <div key={c} className="flex flex-col gap-1.5">
            <span className={`text-xs font-bold ${c === "barbershop" ? "text-[#3A2F8F]" : "text-[#8A2352]"}`}>{c === "barbershop" ? "Barbershop" : "Nail & Spa"}</span>
            <div className="flex flex-wrap gap-1.5">
              {bookable.filter((s) => s.category === c).map((s) => {
                const on = sel.includes(s.id);
                return (
                  <button type="button" key={s.id} aria-pressed={on} className={chip(on)}
                    onClick={() => { setSel(on ? sel.filter((x) => x !== s.id) : [...sel, s.id]); setDurOverride(null); setServerConflicts(null); }}>
                    {s.name} <span className={`tabular ${on ? "text-white/70" : "text-muted"}`}>· {formatRupiah(s.price)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </fieldset>

      <div className="grid grid-cols-1 gap-3 min-[520px]:grid-cols-2">
        <Field label="Kursi / meja" htmlFor="f-res">
          <select id="f-res" className="input" value={resourceId} onChange={(e) => { setResourceId(e.target.value); setServerConflicts(null); }}>
            {master.resources.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </Field>
        <Field label="Kapster / teknisi" htmlFor="f-staff">
          <select id="f-staff" className="input" value={staffId ?? ""} onChange={(e) => { setStaffPick(e.target.value); setServerConflicts(null); }}>
            {(["barbershop", "nail"] as const).map((c) => (
              <optgroup key={c} label={c === "barbershop" ? "Barbershop" : "Nail & Spa"}>
                {activeStaff.filter((s) => s.category === c).map((s) => (
                  <option key={s.id} value={s.id}>{s.name}{approvedOffFor(dayOffs ?? [], s.id, startIso, endIso) ? " (izin)" : ""}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </Field>
        <Field label="Tanggal" htmlFor="f-date">
          <input id="f-date" type="date" className="input" value={date} onChange={(e) => { if (e.target.value) setDate(e.target.value); setServerConflicts(null); }} />
        </Field>
        <Field label="Jam mulai" htmlFor="f-start">
          <select id="f-start" className="input tabular" value={start} onChange={(e) => { setStart(+e.target.value); setServerConflicts(null); }}>
            {times.map((t) => <option key={t} value={t}>{minToTime(t)}</option>)}
          </select>
        </Field>
        <Field label={`Durasi (menit) · otomatis ${autoDur}`} htmlFor="f-dur">
          <input id="f-dur" type="number" inputMode="numeric" min={5} max={720} step={5} className="input tabular" value={duration}
            onChange={(e) => { setDurOverride(e.target.value ? +e.target.value : null); setServerConflicts(null); }} />
        </Field>
        {!edit && (
          <fieldset className="flex min-w-0 flex-col gap-1.5">
            <legend className="mb-1.5 text-xs font-bold text-muted">Sumber</legend>
            <div className="grid grid-cols-3 gap-1.5">
              {([["walk_in", "Walk-in"], ["whatsapp", "WhatsApp"], ["admin", "Admin"]] as const).map(([v, l]) => (
                <button type="button" key={v} aria-pressed={source === v} onClick={() => setSource(v)}
                  className={`min-h-11 rounded-[10px] border-2 text-[13px] font-bold ${source === v ? "border-ink bg-ink text-white" : "border-line bg-card"}`}>{l}</button>
              ))}
            </div>
          </fieldset>
        )}
      </div>

      <Field label="Catatan" htmlFor="f-notes">
        <textarea id="f-notes" rows={2} className="input py-2.5" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>

      {staffOff && (
        <div role="alert" className="rounded-[10px] bg-[#EEEBE4] px-3.5 py-3 text-[13px] font-semibold text-[#4A463F]">
          {activeStaff.find((s) => s.id === staffId)?.name} sedang izin/cuti ({offLabel(staffOff)}). Pilih kapster lain.
        </div>
      )}
      {hasConflict && (
        <div role="alert" className="flex gap-2.5 rounded-[10px] bg-[#FFF1C2] px-3.5 py-3 text-[13px] leading-normal text-[#5A4300]">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-px shrink-0"><path d="M12 3l10 18H2z" /><path d="M12 10v5M12 18h.01" /></svg>
          <span><b>Jadwal bentrok:</b> {conflictText.join("; ")}. Anda tetap bisa menyimpan.</span>
        </div>
      )}
      {error && <p role="alert" className="text-[13px] font-semibold text-[#A12A2A]">{error}</p>}

      <div className="flex justify-end gap-2.5">
        <button type="button" onClick={onClose} className="btn-ghost h-12 rounded-[10px]">Batal</button>
        <button type="submit" disabled={saving || !online}
          className={`btn h-12 rounded-[10px] px-6 text-white ${hasConflict ? "bg-[#B25E00] hover:bg-[#8F4B00]" : "bg-ink hover:bg-[#33312D]"}`}>
          {saving ? "Menyimpan…" : hasConflict ? "Tetap simpan" : edit ? "Simpan perubahan" : "Simpan booking"}
        </button>
      </div>
    </form>
  );
}
