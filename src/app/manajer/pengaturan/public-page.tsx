"use client";

import { useActionState, useState } from "react";
import { compressImage, IMAGE_ACCEPT } from "@/lib/image";
import { useToast } from "@/components/ui";
import { HARI } from "@/lib/domain/hours";
import { formatJam, formatTanggal } from "@/lib/domain/format";
import { photoUrl } from "@/lib/storage";
import { createClient } from "@/lib/supabase/client";
import { addClosure, refreshPublicPages, removeClosure, saveHours } from "./actions";

type Hours = { weekday: number; open_time: string; close_time: string; closed: boolean };
type Photo = { id: string; kind: string; path: string; caption: string; sort: number };
type Msg = { id: string; channel: string; to_address: string; template: string; status: string; attempts: number; last_error: string | null; created_at: string };

async function upload(file: File, folder: string) {
  const blob = await compressImage(file, { maxSide: 2400, maxBytes: 4.5 * 1024 * 1024 }); // foto landing tampil besar di layar retina
  const path = `${folder}/${crypto.randomUUID()}.webp`;
  const { error } = await createClient().storage.from("site").upload(path, blob, { contentType: "image/webp", upsert: false });
  if (error) throw error;
  return path;
}

export function HoursForm({ hours }: { hours: Hours[] }) {
  const [s, action, pending] = useActionState(saveHours, undefined);
  const by = new Map(hours.map((h) => [h.weekday, h]));
  return (
    <form action={action} className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-5">
      <h2 className="font-display text-lg font-semibold">Jam buka per hari</h2>
      {[1, 2, 3, 4, 5, 6, 0].map((d) => {
        const h = by.get(d);
        return (
          <div key={d} className="grid grid-cols-[5.5rem_1fr_1fr_auto] items-center gap-2">
            <b className="text-sm">{HARI[d]}</b>
            <input aria-label={`Buka ${HARI[d]}`} type="time" name={`open_${d}`} defaultValue={h?.open_time.slice(0, 5)} className="input" />
            <input aria-label={`Tutup ${HARI[d]}`} type="time" name={`close_${d}`} defaultValue={h?.close_time.slice(0, 5)} className="input" />
            <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name={`closed_${d}`} defaultChecked={h?.closed} className="size-5 accent-[#5646C8]" />Libur</label>
          </div>
        );
      })}
      <div className="flex items-center gap-3">
        <button disabled={pending} className="btn-primary">Simpan jam buka</button>
        {s && <span role={s.error ? "alert" : "status"} className={`text-xs ${s.error ? "text-danger" : "text-green-700"}`}>{s.error ?? s.ok}</span>}
      </div>
      <p className="text-xs text-muted">Grid Jadwal konter otomatis mengikuti rentang jam terluas.</p>
    </form>
  );
}

export function ClosuresForm({ closures }: { closures: { date: string; reason: string }[] }) {
  const toast = useToast();
  const [s, action, pending] = useActionState(addClosure, undefined);
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-5">
      <h2 className="font-display text-lg font-semibold">Hari libur khusus</h2>
      <form action={action} className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs font-bold text-muted">Tanggal<input type="date" name="date" required className="input" /></label>
        <label className="flex min-w-40 flex-1 flex-col gap-1 text-xs font-bold text-muted">Keterangan<input name="reason" className="input" placeholder="Mis. Idulfitri" /></label>
        <button disabled={pending} className="btn-primary">Tambah</button>
      </form>
      {s?.error && <p role="alert" className="text-xs text-danger">{s.error}</p>}
      {closures.map((c) => (
        <div key={c.date} className="flex items-center gap-2 border-t border-[#F0EDE6] pt-2 text-sm">
          <span className="flex-1 tabular">{formatTanggal(`${c.date}T12:00:00+07:00`)}{c.reason && ` · ${c.reason}`}</span>
          <button onClick={async () => { const r = await removeClosure(c.date); toast(r?.error ?? "Dihapus", r?.error ? "error" : "ok"); }} className="btn-danger h-10 px-3">Hapus</button>
        </div>
      ))}
      {!closures.length && <p className="text-sm text-muted">Belum ada.</p>}
    </div>
  );
}

function Thumb({ path, alt }: { path: string | null; alt: string }) {
  return path
    // eslint-disable-next-line @next/next/no-img-element -- pratinjau kecil di admin
    ? <img src={photoUrl(path)!} alt={alt} className="size-20 rounded-lg border border-line object-cover" />
    : <span className="flex size-20 items-center justify-center rounded-lg border border-dashed border-line text-xs text-muted">Belum ada</span>;
}

function Pick({ id, busy, onFile, multiple, label }: { id: string; busy: string | null; onFile: (f: FileList | null) => void; multiple?: boolean; label: string }) {
  return (
    <label className={`btn-ghost h-11 cursor-pointer rounded-[10px] ${busy === id ? "opacity-50" : ""}`}>
      {busy === id ? "Mengunggah…" : label}
      <input type="file" accept={IMAGE_ACCEPT} multiple={multiple} className="sr-only" disabled={!!busy} onChange={(e) => { onFile(e.target.files); e.target.value = ""; }} />
    </label>
  );
}

/** Foto hero/Barbershop/Nail (satu per jenis), galeri (urut & keterangan), dan foto staf. */
export function PhotoManager({ photos, staff }: { photos: Photo[]; staff: { id: string; name: string; photo_path: string | null }[] }) {
  const toast = useToast();
  const [list, setList] = useState(photos);
  const [people, setPeople] = useState(staff);
  const [busy, setBusy] = useState<string | null>(null);
  const supabase = createClient();

  async function done(msg: string) { await refreshPublicPages(); toast(msg); }
  async function setSingle(kind: string, file?: File) {
    if (!file) return;
    setBusy(kind);
    try {
      const path = await upload(file, kind);
      const old = list.filter((p) => p.kind === kind);
      const { data, error } = await supabase.from("site_photos").insert({ kind, path }).select().single();
      if (error) throw error;
      if (old.length) {
        await supabase.from("site_photos").delete().in("id", old.map((p) => p.id));
        await supabase.storage.from("site").remove(old.map((p) => p.path));
      }
      setList([...list.filter((p) => p.kind !== kind), data]);
      await done("Foto disimpan");
    } catch (e) { toast((e as Error).message, "error"); }
    setBusy(null);
  }
  async function addGallery(files: FileList | null) {
    if (!files?.length) return;
    setBusy("gallery");
    try {
      let sort = Math.max(0, ...list.filter((p) => p.kind === "gallery").map((p) => p.sort)) + 1;
      const added: Photo[] = [];
      for (const f of Array.from(files)) {
        const path = await upload(f, "gallery");
        const { data, error } = await supabase.from("site_photos").insert({ kind: "gallery", path, sort: sort++ }).select().single();
        if (error) throw error;
        added.push(data);
      }
      setList([...list, ...added]);
      await done(`${added.length} foto galeri ditambahkan`);
    } catch (e) { toast((e as Error).message, "error"); }
    setBusy(null);
  }
  async function remove(p: Photo) {
    await supabase.from("site_photos").delete().eq("id", p.id);
    await supabase.storage.from("site").remove([p.path]);
    setList(list.filter((x) => x.id !== p.id));
    await done("Foto dihapus");
  }
  async function caption(p: Photo, c: string) {
    if (c === p.caption) return;
    await supabase.from("site_photos").update({ caption: c }).eq("id", p.id);
    setList(list.map((x) => (x.id === p.id ? { ...x, caption: c } : x)));
    await done("Keterangan disimpan");
  }
  async function move(p: Photo, dir: -1 | 1) {
    const g = list.filter((x) => x.kind === "gallery").sort((a, b) => a.sort - b.sort);
    const i = g.findIndex((x) => x.id === p.id), j = i + dir;
    if (j < 0 || j >= g.length) return;
    [g[i], g[j]] = [g[j], g[i]];
    const upd = g.map((x, k) => ({ ...x, sort: k + 1 }));
    await Promise.all(upd.map((x) => supabase.from("site_photos").update({ sort: x.sort }).eq("id", x.id)));
    setList([...list.filter((x) => x.kind !== "gallery"), ...upd]);
    await done("Urutan disimpan");
  }
  async function staffPhoto(id: string, file?: File) {
    if (!file) return;
    setBusy(id);
    try {
      const path = await upload(file, "staff");
      const old = people.find((s) => s.id === id)?.photo_path;
      const { error } = await supabase.from("staff").update({ photo_path: path }).eq("id", id);
      if (error) throw error;
      if (old) await supabase.storage.from("site").remove([old]);
      setPeople(people.map((s) => (s.id === id ? { ...s, photo_path: path } : s)));
      await done("Foto staf disimpan");
    } catch (e) { toast((e as Error).message, "error"); }
    setBusy(null);
  }

  const gallery = list.filter((p) => p.kind === "gallery").sort((a, b) => a.sort - b.sort);

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-line bg-card p-5">
      <h2 className="font-display text-lg font-semibold">Foto</h2>
      <p className="-mt-2 text-xs text-muted">Dikompres otomatis ke WebP (sisi terpanjang 2400 px). Unggah foto asli (bukan tangkapan layar/hasil kirim WhatsApp) agar tetap tajam; hero & kartu layanan berbentuk lengkung tegak — foto potret paling pas. Tanpa foto, landing memakai ilustrasi garis.</p>
      <div className="grid gap-4 min-[700px]:grid-cols-2 min-[1200px]:grid-cols-4">
        {[["hero", "Hero (bingkai lengkung)"], ["groom", "Kartu Barbershop"], ["bloom", "Kartu Nail Art"], ["lashes", "Kartu Lashes"]].map(([k, l]) => (
          <div key={k} className="flex items-center gap-3">
            <Thumb path={list.find((p) => p.kind === k)?.path ?? null} alt={l} />
            <div className="flex flex-col gap-2"><b className="text-sm">{l}</b><Pick id={k} busy={busy} label="Ganti foto" onFile={(f) => setSingle(k, f?.[0])} /></div>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-2 border-t border-[#F0EDE6] pt-4">
        <div className="flex items-center gap-3"><b className="flex-1 text-sm">Galeri hasil kerja</b><Pick id="gallery" busy={busy} multiple label="Tambah foto" onFile={addGallery} /></div>
        {gallery.map((p, i) => (
          <div key={p.id} className="flex flex-wrap items-center gap-2">
            <Thumb path={p.path} alt={p.caption || `Galeri ${i + 1}`} />
            <input aria-label={`Keterangan foto ${i + 1}`} defaultValue={p.caption} onBlur={(e) => caption(p, e.target.value.trim())} className="input min-w-40 flex-1" placeholder="Keterangan (opsional)" />
            <button onClick={() => move(p, -1)} disabled={i === 0} aria-label="Geser ke atas" className="btn-ghost h-11 rounded-[10px] px-3">↑</button>
            <button onClick={() => move(p, 1)} disabled={i === gallery.length - 1} aria-label="Geser ke bawah" className="btn-ghost h-11 rounded-[10px] px-3">↓</button>
            <button onClick={() => remove(p)} className="btn-danger h-11 px-3">Hapus</button>
          </div>
        ))}
        {!gallery.length && <p className="text-sm text-muted">Belum ada foto galeri.</p>}
      </div>
      <div className="flex flex-col gap-2 border-t border-[#F0EDE6] pt-4">
        <b className="text-sm">Foto staf</b>
        <div className="grid gap-3 min-[1000px]:grid-cols-3">
          {people.map((s) => (
            <div key={s.id} className="flex items-center gap-3"><Thumb path={s.photo_path} alt={s.name} />
              <div className="flex flex-col gap-2"><b className="text-sm">{s.name}</b><Pick id={s.id} busy={busy} label="Ganti foto" onFile={(f) => staffPhoto(s.id, f?.[0])} /></div></div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function OutboundLog({ rows }: { rows: Msg[] }) {
  const tone: Record<string, string> = { sent: "bg-[#D9F2E1] text-[#144D2A]", queued: "bg-[#FFF1C2] text-[#5A4300]", sending: "bg-[#DCEBFF] text-[#163D78]", failed: "bg-[#FFDADA] text-[#6E1616]", skipped: "bg-[#EEEBE4] text-[#4A463F]" };
  const T: Record<string, string> = { booking_confirmed: "Konfirmasi", booking_pending: "Menunggu review", reminder_h1: "Pengingat H-1" };
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-line bg-card p-5">
      <h2 className="font-display text-lg font-semibold">Pesan keluar ke pelanggan</h2>
      <p className="-mt-1 text-xs text-muted">Email terkirim bila RESEND_API_KEY diisi; WhatsApp otomatis bila kredensial penyedia diisi (lihat README). &quot;Dilewati&quot; = kanal belum aktif.</p>
      {rows.map((m) => (
        <div key={m.id} className="flex flex-wrap items-center gap-2 border-t border-[#F0EDE6] pt-2 text-[13px] tabular">
          <span className="w-32 text-muted">{formatTanggal(m.created_at).split(",")[1]} {formatJam(m.created_at)}</span>
          <span className="w-28">{T[m.template] ?? m.template}</span>
          <span className="w-20 uppercase text-muted">{m.channel === "email" ? "Email" : "WA"}</span>
          <span className="min-w-32 flex-1 truncate">{m.to_address}</span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${tone[m.status]}`}>{{ sent: "Terkirim", queued: "Antre", sending: "Mengirim", failed: "Gagal", skipped: "Dilewati" }[m.status]}</span>
          {m.last_error && <span className="w-full text-xs text-muted">{m.last_error}</span>}
        </div>
      ))}
      {!rows.length && <p className="text-sm text-muted">Belum ada pesan.</p>}
    </div>
  );
}
