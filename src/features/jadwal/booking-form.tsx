"use client";

import { CAT_NAME, CAT_TONE, CATS, STAFF_TITLE } from "@/lib/domain/category";
import { useEffect, useMemo, useState } from "react";
import { CloseButton, Field, useOnline, useToast } from "@/components/ui";
import { bundleDiscount } from "@/lib/domain/cart";
import { formatJam, formatRupiah, normalizeWhatsApp } from "@/lib/domain/format";
import { dayWindow } from "@/lib/domain/hours";
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
type Pair = { sel: string[]; resourceId: string | null; staffPick: string | null };

const hhmm = (m: number) => minToTime(m).replace(":", ".");

/**
 * Form booking cepat (baru & ubah). Satu booking = satu kategori (layanan, kursi/meja & staf sekategori — dijaga juga
 * di DB). Pasangan barber + nail = booking kedua di kategori lain, dibuat sekaligus pada jam yang sama.
 * Bentrok / di luar jam buka / tanggal lewat = peringatan lunak → tetap bisa disimpan.
 */
export function BookingForm({ master, init, today, onClose, onSaved }: {
  master: Master; init: FormInit; today: string; onClose: () => void; onSaved: (date: string) => void;
}) {
  const toast = useToast();
  const online = useOnline();
  const edit = init.appt;
  const svcById = useMemo(() => new Map(master.services.map((s) => [s.id, s])), [master.services]);
  const bookable = master.services.filter((s) => s.active && s.category !== "retail");
  const activeStaff = master.staff.filter((s) => s.active);
  const bufferMin = master.shop.bufferMin;

  const [customer, setCustomer] = useState<Customer | null>(edit?.customer ?? init.customer ?? null);
  const [newName, setNewName] = useState("");
  const [newWa, setNewWa] = useState("");
  const [sel, setSel] = useState<string[]>(edit?.appointment_services.map((s) => s.service_id) ?? []);
  const [pair, setPair] = useState<Pair>({ sel: [], resourceId: null, staffPick: null });
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
  const [sourcePick, setSourcePick] = useState<Source | null>(null);
  const [serverConflicts, setServerConflicts] = useState<Conflict[] | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [waOwner, setWaOwner] = useState<{ wa: string; name: string } | null>(null);
  const [nowMin] = useState(() => jktMinutes(new Date())); // untuk peringatan "jam sudah lewat"

  const { data: dayAppts } = useDayAppointments(date);
  const { data: dayOffs } = useDayTimeOff(date);
  const durOf = (ids: string[]) => ids.reduce((a, id) => a + (svcById.get(id)?.duration_min ?? 0), 0) || 30;
  const autoDur = durOf(sel);
  const duration = durOverride ?? autoDur;
  const resource = master.resources.find((r) => r.id === resourceId);
  const startIso = jktIso(date, start), endIso = jktIso(date, start + duration);
  // sumber mengikuti tanggal sampai dipilih manual (walk-in hanya masuk akal untuk hari ini)
  const source: Source = sourcePick ?? (date === today ? "walk_in" : "admin");

  // Kategori booking = kategori layanan terpilih; sebelum ada layanan = jenis kursi/meja yang diklik.
  const cat: Cat = (sel.map((id) => svcById.get(id)?.category).find((c) => c && c !== "retail") as Cat | undefined) ?? resource?.type ?? "barbershop";
  const others = useMemo(() => (dayAppts ?? []).filter((a) => a.id !== edit?.id), [dayAppts, edit?.id]);
  const busy = (draft: { resourceId: string; staffId: string | null; s: string; e: string }) =>
    findConflicts(others, { resourceId: draft.resourceId, staffId: draft.staffId, start: draft.s, end: draft.e, bufferMin });

  /** Kursi/meja kategori itu yang kosong di jam itu — kursi yang diklik di grid diutamakan bila sekategori. */
  const freeResource = (c: Cat, s: string, e: string, exclude?: string) => {
    const pool = master.resources.filter((r) => r.type === c && r.id !== exclude)
      .sort((x, y) => Number(y.id === init.resourceId) - Number(x.id === init.resourceId));
    return (pool.find((r) => !busy({ resourceId: r.id, staffId: null, s, e }).length) ?? pool[0])?.id ?? null;
  };
  /** Staf kategori itu: tidak izin, utamakan pemilik kursi ini, lalu yang kosong di jam itu. */
  const defaultStaffFor = (c: Cat, resId: string | null, s: string, e: string, exclude?: string | null) => {
    const pool = activeStaff.filter((x) => x.category === c && x.id !== exclude && !approvedOffFor(dayOffs ?? [], x.id, s, e));
    const free = pool.filter((x) => !busy({ resourceId: "-", staffId: x.id, s, e }).length);
    return (free.find((x) => x.home_resource_id === resId) ?? free[0] ?? pool[0])?.id ?? null;
  };
  const staffId = staffPick ?? defaultStaffFor(cat, resourceId, startIso, endIso);

  // ---------- booking kedua (pasangan, kategori lain) ----------
  const pairCat: Cat = (svcById.get(pair.sel[0] ?? "")?.category as Cat | undefined) ?? cat;
  const pairDur = durOf(pair.sel);
  const pairEndIso = jktIso(date, start + pairDur);
  const pairResource = pair.sel.length ? pair.resourceId ?? freeResource(pairCat, startIso, pairEndIso) : null;
  const pairStaff = pair.sel.length ? pair.staffPick ?? defaultStaffFor(pairCat, pairResource, startIso, pairEndIso) : null;

  function toggleService(id: string) {
    const s = svcById.get(id)!;
    const c = s.category as Cat;
    setDurOverride(null); setServerConflicts(null); setError("");
    if (!sel.length || c === cat) {
      const next = sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id];
      if (!next.length && pair.sel.length) {
        // layanan utama habis → booking kedua naik jadi utama
        setSel(pair.sel); setResourceId(pairResource ?? resourceId); setStaffPick(pair.staffPick);
        setPair({ sel: [], resourceId: null, staffPick: null });
        return;
      }
      setSel(next);
      if (!sel.length && resource?.type !== c) {
        // layanan pertama beda kategori dari kursi yang diklik → pindah ke kursi/meja kategori itu yang kosong
        const r = freeResource(c, startIso, jktIso(date, start + durOf([id])));
        if (r) setResourceId(r);
        setStaffPick(null);
      }
      return;
    }
    if (edit) return setError(`Ubah booking hanya untuk layanan ${CAT_NAME[cat]}. Buat booking baru untuk ${CAT_NAME[c]}.`);
    // booking kedua = satu kategori lain; pilih kategori ketiga → booking kedua diganti ke kategori itu
    setPair((p) => p.sel.length && svcById.get(p.sel[0])?.category !== c ? { sel: [id], resourceId: null, staffPick: null }
      : { ...p, sel: p.sel.includes(id) ? p.sel.filter((x) => x !== id) : [...p.sel, id] });
  }

  // ---------- peringatan ----------
  const conflicts = staffId || resourceId ? busy({ resourceId, staffId, s: startIso, e: endIso }) : [];
  const pairConflicts = pairResource ? busy({ resourceId: pairResource, staffId: pairStaff, s: startIso, e: pairEndIso }) : [];
  const describe = (list: DayAppt[]) => list.map((a) => ({
    id: a.id, start_at: a.start_at, end_at: a.end_at, customer_name: a.customer?.name ?? "Walk-in",
    staff_name: master.staff.find((s) => s.id === a.staff_id)?.name ?? null,
    resource_name: master.resources.find((r) => r.id === a.resource_id)?.name ?? "",
  }));
  const conflictText = (serverConflicts ?? describe([...conflicts, ...pairConflicts]))
    .map((c) => `${c.customer_name} ${formatJam(c.start_at)}–${formatJam(c.end_at)} (${c.resource_name}${c.staff_name ? ` · ${c.staff_name}` : ""})`);
  const hasConflict = conflictText.length > 0;
  const staffOff = approvedOffFor(dayOffs ?? [], staffId, startIso, endIso);
  const pairStaffOff = pairStaff ? approvedOffFor(dayOffs ?? [], pairStaff, startIso, pairEndIso) : null;

  const win = dayWindow(date, master.shop.hours, master.shop.closures);
  const endMin = start + Math.max(duration, pair.sel.length ? pairDur : 0);
  const notices = [
    !win && "Toko tutup pada tanggal ini (libur mingguan / libur khusus).",
    win && (start < win.open || endMin > win.close) && `Di luar jam buka hari itu (${hhmm(win.open)}–${hhmm(win.close)}): selesai ${hhmm(endMin)}.`,
    !edit && date < today && "Tanggal sudah lewat.",
    !edit && date === today && endMin <= nowMin && "Jam booking sudah lewat.",
  ].filter(Boolean) as string[];

  // ---------- tagihan perkiraan (diskon paket bila barber + nail) ----------
  const lines = [...sel, ...pair.sel].map((id) => svcById.get(id)!).filter(Boolean)
    .map((s) => ({ serviceId: s.id, name: s.name, category: s.category, price: s.price }));
  const subtotal = lines.reduce((a, l) => a + l.price, 0);
  const discount = bundleDiscount(lines, master.shop.bundlePct);

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

  // jam mulai: jendela buka hari itu (atau rentang terluas bila tutup)
  const [t0, t1] = win ? [win.open, win.close] : [timeToMin(master.shop.open), timeToMin(master.shop.close)];
  const times: number[] = [];
  for (let t = t0; t < t1; t += 15) times.push(t);
  if (!times.includes(start)) { times.push(start); times.sort((a, b) => a - b); }

  async function save() {
    setError("");
    if (!sel.length) return setError("Pilih minimal satu layanan.");
    if (!staffId) return setError(`Belum ada staf ${CAT_NAME[cat]} aktif.`);
    if (pair.sel.length && (!pairResource || !pairStaff)) return setError(`Belum ada kursi/meja atau staf ${CAT_NAME[pairCat]} aktif untuk booking kedua.`);
    if (!customer && newWa.trim() && !waNorm) return setError("No. WhatsApp belum valid.");
    if (!customer && waNorm && !newName.trim() && !existingOwner) return setError("Isi nama untuk pelanggan baru (atau kosongkan No. WhatsApp untuk walk-in).");
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
    if (error) { setSaving(false); return setError(error.message); }
    const r = data as { saved: boolean; conflicts: Conflict[]; customer_existing?: boolean; customer_id?: string | null };
    if (!r.saved) { setSaving(false); setServerConflicts(r.conflicts); return; } // bentrok baru dari perangkat lain → minta konfirmasi

    let pairMsg = "";
    if (!edit && pair.sel.length && pairResource && pairStaff) {
      const p2 = await supabase.rpc("create_booking_admin", {
        p_resource_id: pairResource, p_staff_id: pairStaff, p_start_at: startIso, p_service_ids: pair.sel,
        p_customer_id: r.customer_id ?? undefined, p_source: source, p_notes: notes, p_force: force,
      });
      const r2 = p2.data as { saved: boolean; conflicts: Conflict[] } | null;
      pairMsg = p2.error ? ` · booking ${CAT_NAME[pairCat]} gagal: ${p2.error.message}`
        : r2 && !r2.saved ? ` · booking ${CAT_NAME[pairCat]} belum disimpan (baru saja terisi) — buat dari grid` : ` + ${CAT_NAME[pairCat]}`;
    }
    setSaving(false);
    toast((r.customer_existing ? `Booking disimpan · pakai pelanggan lama ${existingOwner ?? ""}`.trim()
      : force ? "Booking disimpan (dengan bentrok jadwal)" : edit ? "Booking diperbarui" : "Booking disimpan") + pairMsg);
    onSaved(date);
  }

  const chip = (on: boolean) => `min-h-11 rounded-full border px-3.5 text-[13px] font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${on ? "border-ink bg-ink text-white" : "border-[#D9D4C8] bg-card"}`;
  const resOptions = (c: Cat) => master.resources.filter((r) => r.type === c);
  const staffOptions = (c: Cat, s: string, e: string) => activeStaff.filter((x) => x.category === c).map((x) => (
    <option key={x.id} value={x.id}>{x.name}{approvedOffFor(dayOffs ?? [], x.id, s, e) ? " (izin)" : ""}</option>
  ));

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
        <legend className="mb-1 text-xs font-bold text-muted">
          Layanan {edit ? `(${CAT_NAME[cat]})` : "— pilih kategori lain untuk pasangan (booking kedua di jam yang sama)"}
        </legend>
        {CATS.filter((c) => bookable.some((s) => s.category === c)).map((c) => (
          <div key={c} className="flex flex-col gap-1.5">
            <span className="text-xs font-bold" style={{ color: CAT_TONE[c].fg }}>
              {CAT_NAME[c]}{sel.length > 0 && c !== cat && !edit ? " · booking kedua" : ""}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {bookable.filter((s) => s.category === c).map((s) => {
                const on = sel.includes(s.id) || pair.sel.includes(s.id);
                return (
                  <button type="button" key={s.id} aria-pressed={on} className={chip(on)} disabled={!!edit && sel.length > 0 && c !== cat}
                    onClick={() => toggleService(s.id)}>
                    {s.name} <span className={`tabular ${on ? "text-white/70" : "text-muted"}`}>· {formatRupiah(s.price)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </fieldset>

      <div className="grid grid-cols-1 gap-3 min-[520px]:grid-cols-2">
        <Field label={`Kursi / meja · ${CAT_NAME[cat]}`} htmlFor="f-res">
          <select id="f-res" className="input" value={resourceId} onChange={(e) => { setResourceId(e.target.value); setStaffPick(null); setServerConflicts(null); }}>
            {resOptions(cat).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </Field>
        <Field label={STAFF_TITLE[cat]} htmlFor="f-staff">
          <select id="f-staff" className="input" value={staffId ?? ""} onChange={(e) => { setStaffPick(e.target.value); setServerConflicts(null); }}>
            {!staffId && <option value="">— tidak ada staf aktif —</option>}
            {staffOptions(cat, startIso, endIso)}
          </select>
        </Field>
        <Field label="Tanggal" htmlFor="f-date">
          <input id="f-date" type="date" className="input" value={date} min={edit ? undefined : today}
            onChange={(e) => { if (e.target.value) setDate(e.target.value); setServerConflicts(null); }} />
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
                <button type="button" key={v} aria-pressed={source === v} onClick={() => setSourcePick(v)}
                  className={`min-h-11 rounded-[10px] border-2 text-[13px] font-bold ${source === v ? "border-ink bg-ink text-white" : "border-line bg-card"}`}>{l}</button>
              ))}
            </div>
          </fieldset>
        )}
      </div>

      {pair.sel.length > 0 && (
        <section aria-label={`Booking kedua ${CAT_NAME[pairCat]}`} className="flex flex-col gap-3 rounded-[12px] border border-dashed border-[#C9C2B3] p-3.5">
          <b className="text-sm">Booking kedua · {CAT_NAME[pairCat]} <span className="font-normal text-muted">— jam sama ({minToTime(start)}, {pairDur} mnt), pelanggan sama</span></b>
          <div className="grid grid-cols-1 gap-3 min-[520px]:grid-cols-2">
            <Field label="Kursi / meja" htmlFor="f-res2">
              <select id="f-res2" className="input" value={pairResource ?? ""} onChange={(e) => { setPair({ ...pair, resourceId: e.target.value, staffPick: null }); setServerConflicts(null); }}>
                {resOptions(pairCat).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </Field>
            <Field label={STAFF_TITLE[pairCat]} htmlFor="f-staff2">
              <select id="f-staff2" className="input" value={pairStaff ?? ""} onChange={(e) => { setPair({ ...pair, staffPick: e.target.value }); setServerConflicts(null); }}>
                {!pairStaff && <option value="">— tidak ada staf aktif —</option>}
                {staffOptions(pairCat, startIso, pairEndIso)}
              </select>
            </Field>
          </div>
        </section>
      )}

      <Field label="Catatan" htmlFor="f-notes">
        <textarea id="f-notes" rows={2} className="input py-2.5" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>

      {lines.length > 0 && (
        <div className="flex items-baseline justify-between gap-3 rounded-[10px] bg-paper px-3.5 py-2.5 text-sm tabular">
          <span className="text-muted">Perkiraan tagihan{discount > 0 ? ` · paket ${master.shop.bundlePct}% −${formatRupiah(discount)}` : ""}</span>
          <b className="text-base">{formatRupiah(subtotal - discount)}</b>
        </div>
      )}

      {(staffOff || pairStaffOff) && (
        <div role="alert" className="rounded-[10px] bg-[#EEEBE4] px-3.5 py-3 text-[13px] font-semibold text-[#4A463F]">
          {[staffOff && `${activeStaff.find((s) => s.id === staffId)?.name} sedang izin/cuti (${offLabel(staffOff)})`,
            pairStaffOff && `${activeStaff.find((s) => s.id === pairStaff)?.name} sedang izin/cuti (${offLabel(pairStaffOff)})`].filter(Boolean).join(" · ")}. Pilih staf lain.
        </div>
      )}
      {notices.length > 0 && (
        <div role="alert" className="rounded-[10px] bg-[#EEEBE4] px-3.5 py-3 text-[13px] leading-normal text-[#4A463F]">
          <b>Perhatikan:</b> {notices.join(" ")} Anda tetap bisa menyimpan.
        </div>
      )}
      {hasConflict && (
        <div role="alert" className="flex gap-2.5 rounded-[10px] bg-[#FFF1C2] px-3.5 py-3 text-[13px] leading-normal text-[#5A4300]">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-px shrink-0"><path d="M12 3l10 18H2z" /><path d="M12 10v5M12 18h.01" /></svg>
          <span><b>Jadwal bentrok:</b> {conflictText.join("; ")}{bufferMin ? ` (termasuk jeda ${bufferMin} mnt)` : ""}. Anda tetap bisa menyimpan.</span>
        </div>
      )}
      {error && <p role="alert" className="text-[13px] font-semibold text-[#A12A2A]">{error}</p>}

      <div className="flex justify-end gap-2.5">
        <button type="button" onClick={onClose} className="btn-ghost h-12 rounded-[10px]">Batal</button>
        <button type="submit" disabled={saving || !online}
          className={`btn h-12 rounded-[10px] px-6 text-white ${hasConflict ? "bg-[#B25E00] hover:bg-[#8F4B00]" : "bg-ink hover:bg-[#33312D]"}`}>
          {saving ? "Menyimpan…" : hasConflict ? "Tetap simpan" : edit ? "Simpan perubahan" : pair.sel.length ? "Simpan 2 booking" : "Simpan booking"}
        </button>
      </div>
    </form>
  );
}

