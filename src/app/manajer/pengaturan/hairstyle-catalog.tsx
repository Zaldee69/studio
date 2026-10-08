"use client";

import { useState } from "react";
import { useConfirm } from "@/components/alert-dialog";
import { CloseButton, Empty, Field, Sheet, useToast } from "@/components/ui";
import { HAIR_LABEL } from "@/lib/domain/hair";
import { useRealtimeTable } from "@/lib/hooks/useRealtimeTable";
import { compressImage, IMAGE_ACCEPT } from "@/lib/image";
import { createClient } from "@/lib/supabase/client";

type Img = { id: string; view: "front" | "side" | "back" | "other"; path: string; sort: number };
type Style = {
  id: string; code: string; name: string; category: string; description: string; face_shapes: string[]; hair_types: string[];
  hair_density: string[]; suitable_lengths: string[]; maintenance_level: string; style_character: string[]; cut_notes: string;
  highlights: string[]; active: boolean; sort: number; hairstyle_images: Img[];
};
const OPTS = {
  face_shapes: ["oval", "round", "square", "oblong", "heart", "diamond"],
  hair_types: ["straight", "slightly_wavy", "wavy", "curly"],
  hair_density: ["thin", "medium", "thick"],
  suitable_lengths: ["very_short", "short", "medium", "long"],
} as const;
const VIEW = { front: "Depan", side: "Samping", back: "Belakang", other: "Lainnya" } as const;
const CATEGORY: Record<string, string> = { Short: "Pendek", Medium: "Sedang", Long: "Panjang" };
const url = (path: string) => `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/hairstyles/${path}`;
const blank = (sort: number, code: string): Omit<Style, "id" | "hairstyle_images"> => ({
  code, name: "", category: "Short", description: "", face_shapes: [], hair_types: [], hair_density: [], suitable_lengths: [],
  maintenance_level: "medium", style_character: [], cut_notes: "", highlights: [], active: true, sort,
});

/** Katalog gaya rambut (manajer): sumber rekomendasi konsultasi gaya. Hanya model aktif yang punya foto yang direkomendasikan. */
export function HairstyleCatalog() {
  const { data, refresh } = useRealtimeTable(["hairstyles", "hairstyle_images"], async () => {
    const { data } = await createClient().from("hairstyles").select("*, hairstyle_images(id, view, path, sort)").order("sort");
    return (data ?? []) as Style[];
  });
  const [editing, setEditing] = useState<Style | "new" | null>(null);
  const current = editing === "new" || !editing ? editing : data?.find((s) => s.id === editing.id) ?? null;
  const nextCode = () => `HS${String(Math.max(0, ...(data ?? []).map((s) => Number(s.code.replace(/\D/g, "")) || 0)) + 1).padStart(3, "0")}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="flex-1 text-sm text-muted">Dipakai kapster di menu <b>Gaya</b>. Model hanya direkomendasikan bila aktif & punya foto referensi (utamakan foto depan + samping).</p>
        <button onClick={() => setEditing("new")} className="btn-ink h-11">+ Tambah model</button>
      </div>
      {!data ? <Empty>Memuat…</Empty> : !data.length ? <Empty>Belum ada model.</Empty> : (
        <div className="grid grid-cols-2 gap-3 min-[700px]:grid-cols-3 xl:grid-cols-4">
          {data.map((s) => {
            const cover = [...s.hairstyle_images].sort((a, b) => a.sort - b.sort)[0];
            return (
              <button key={s.id} onClick={() => setEditing(s)} aria-label={`Ubah ${s.name}`}
                className={`flex flex-col overflow-hidden rounded-[14px] border border-line bg-card text-left ${s.active ? "" : "opacity-55"}`}>
                <div className="flex aspect-[3/4] items-center justify-center bg-paper text-xs text-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element -- foto katalog dari Storage */}
                  {cover ? <img src={url(cover.path)} alt="" className="size-full object-cover" /> : "Belum ada foto"}
                </div>
                <span className="flex flex-col gap-0.5 p-3">
                  <b className="text-sm">{s.name}</b>
                  <span className="text-xs text-muted">{s.code} · {CATEGORY[s.category] ?? s.category} · {s.hairstyle_images.length} foto{s.active ? "" : " · nonaktif"}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
      {current && (
        <Editor key={current === "new" ? "new" : current.id} style={current === "new" ? null : current}
          init={current === "new" ? blank((data?.length ?? 0) + 1, nextCode()) : current} onClose={() => setEditing(null)}
          onSaved={(s) => { refresh(); setEditing(s); }} onChanged={refresh} />
      )}
    </div>
  );
}

function Editor({ style, init, onClose, onSaved, onChanged }: {
  style: Style | null; init: Omit<Style, "id" | "hairstyle_images">; onClose: () => void; onSaved: (s: Style) => void; onChanged: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [f, setF] = useState(init);
  const [chars, setChars] = useState(init.style_character.join(", "));
  const [points, setPoints] = useState(init.highlights.join("\n"));
  const [view, setView] = useState<Img["view"]>("front");
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF({ ...f, [k]: v });
  const toggle = (k: keyof typeof OPTS, v: string) => set(k, f[k].includes(v) ? f[k].filter((x) => x !== v) : [...f[k], v]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!f.name.trim()) return toast("Isi nama model", "error");
    setBusy(true);
    const row = { ...f, name: f.name.trim(), code: f.code.trim().toUpperCase(), style_character: chars.split(",").map((x) => x.trim()).filter(Boolean),
      highlights: points.split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 4) };
    const q = createClient().from("hairstyles");
    const { data, error } = await (style ? q.update(row).eq("id", style.id) : q.insert(row)).select("*, hairstyle_images(id, view, path, sort)").single();
    setBusy(false);
    if (error) return toast(error.message.includes("duplicate") ? "Kode sudah dipakai model lain" : error.message, "error");
    toast(style ? "Model disimpan" : "Model ditambahkan — sekarang unggah foto referensi");
    onSaved(data as Style);
  }

  async function upload(file: File | undefined) {
    if (!file || !style) return;
    setBusy(true);
    try {
      const blob = await compressImage(file);
      const path = `${style.id}/${crypto.randomUUID()}.webp`;
      const sb = createClient();
      const { error } = await sb.storage.from("hairstyles").upload(path, blob, { contentType: "image/webp" });
      if (error) throw error;
      const { error: e2 } = await sb.from("hairstyle_images").insert({ hairstyle_id: style.id, view, path, sort: style.hairstyle_images.length });
      if (e2) { await sb.storage.from("hairstyles").remove([path]); throw e2; }
      toast("Foto ditambahkan"); onChanged();
    } catch (e) { toast(e instanceof Error ? e.message : String(e), "error"); }
    setBusy(false);
  }

  async function removeImg(img: Img) {
    if (!(await confirm({ title: "Hapus foto ini?", confirmLabel: "Hapus", tone: "danger" }))) return;
    const sb = createClient();
    const { error } = await sb.from("hairstyle_images").delete().eq("id", img.id);
    if (error) return toast(error.message, "error");
    await sb.storage.from("hairstyles").remove([img.path]);
    onChanged();
  }

  async function removeStyle() {
    if (!style || !(await confirm({ title: `Hapus model ${style.name}?`, description: "Foto referensinya ikut terhapus. Untuk sementara menyembunyikan, matikan \"Aktif\" saja.", confirmLabel: "Hapus", tone: "danger" }))) return;
    const sb = createClient();
    const { error } = await sb.from("hairstyles").delete().eq("id", style.id);
    if (error) return toast(error.message, "error");
    if (style.hairstyle_images.length) await sb.storage.from("hairstyles").remove(style.hairstyle_images.map((i) => i.path));
    toast("Model dihapus"); onChanged(); onClose();
  }

  const chips = (k: keyof typeof OPTS, label: string) => (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1 text-xs font-bold text-muted">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {OPTS[k].map((v) => (
          <button key={v} type="button" aria-pressed={f[k].includes(v)} onClick={() => toggle(k, v)}
            className={`h-9 rounded-full border px-3 text-xs font-bold ${f[k].includes(v) ? "border-ink bg-ink text-white" : "border-line bg-card"}`}>{HAIR_LABEL[v]}</button>
        ))}
      </div>
    </fieldset>
  );

  return (
    <Sheet open onClose={onClose} label={style ? `Ubah ${style.name}` : "Model baru"} variant="drawer">
      <form onSubmit={save} className="flex flex-col gap-4 p-5">
        <div className="flex items-center gap-3">
          <h2 className="flex-1 font-display text-xl font-bold">{style ? style.name : "Model baru"}</h2>
          <CloseButton onClick={onClose} />
        </div>
        <div className="grid grid-cols-[1fr_7rem] gap-3">
          <Field label="Nama model" htmlFor="hs-name"><input id="hs-name" className="input" value={f.name} onChange={(e) => set("name", e.target.value)} /></Field>
          <Field label="Kode" htmlFor="hs-code"><input id="hs-code" className="input uppercase" value={f.code} onChange={(e) => set("code", e.target.value)} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Kategori" htmlFor="hs-cat">
            <select id="hs-cat" className="input" value={f.category} onChange={(e) => set("category", e.target.value)}>
              {Object.entries(CATEGORY).map(([c, l]) => <option key={c} value={c}>{l}</option>)}
            </select>
          </Field>
          <Field label="Perawatan" htmlFor="hs-maint">
            <select id="hs-maint" className="input" value={f.maintenance_level} onChange={(e) => set("maintenance_level", e.target.value)}>
              {["low", "medium", "high"].map((m) => <option key={m} value={m}>{HAIR_LABEL[m]}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Deskripsi" htmlFor="hs-desc"><textarea id="hs-desc" rows={2} className="input py-2" value={f.description} onChange={(e) => set("description", e.target.value)} /></Field>
        {chips("face_shapes", "Cocok untuk bentuk wajah")}
        {chips("hair_types", "Jenis rambut")}
        {chips("hair_density", "Ketebalan rambut")}
        {chips("suitable_lengths", "Panjang rambut awal yang bisa dibentuk")}
        <Field label="Poin singkat untuk katalog (satu per baris, maks. 4)" htmlFor="hs-points" hint="Tampil di katalog lengkap, mis. Modern & rapi / Samping tipis (low taper).">
          <textarea id="hs-points" rows={4} className="input py-2" value={points} onChange={(e) => setPoints(e.target.value)} />
        </Field>
        <Field label="Karakter gaya (pisahkan koma)" htmlFor="hs-char"><input id="hs-char" className="input" placeholder="modern, clean" value={chars} onChange={(e) => setChars(e.target.value)} /></Field>
        <Field label="Catatan potong (opsional)" htmlFor="hs-notes" hint="Mis. guard sisi, tinggi fade — boleh dikutip di catatan kapster.">
          <textarea id="hs-notes" rows={2} className="input py-2" value={f.cut_notes} onChange={(e) => set("cut_notes", e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-5 accent-[#1c1b19]" checked={f.active} onChange={(e) => set("active", e.target.checked)} />Aktif</label>
          <Field label="Urut" htmlFor="hs-sort"><input id="hs-sort" type="number" className="input" value={f.sort} onChange={(e) => set("sort", Number(e.target.value))} /></Field>
        </div>
        <button disabled={busy} className="btn-ink h-12">{busy ? "Menyimpan…" : style ? "Simpan" : "Tambah model"}</button>

        {style && (
          <section className="flex flex-col gap-3 border-t border-line pt-4">
            <h3 className="font-bold">Foto referensi</h3>
            {!style.hairstyle_images.length && <p className="text-sm text-muted">Belum ada foto — model ini belum bisa direkomendasikan.</p>}
            <div className="grid grid-cols-3 gap-2">
              {[...style.hairstyle_images].sort((a, b) => a.sort - b.sort).map((i) => (
                <div key={i.id} className="relative overflow-hidden rounded-lg border border-line">
                  {/* eslint-disable-next-line @next/next/no-img-element -- foto katalog dari Storage */}
                  <img src={url(i.path)} alt={`${style.name} — ${VIEW[i.view]}`} className="aspect-[3/4] w-full object-cover" />
                  <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 text-[11px] font-semibold text-white">{VIEW[i.view]}</span>
                  <button type="button" onClick={() => removeImg(i)} aria-label={`Hapus foto ${VIEW[i.view]}`} className="absolute right-1 top-1 rounded bg-white/90 px-1.5 text-xs font-bold text-danger">✕</button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <label htmlFor="hs-view" className="sr-only">Sudut foto</label>
              <select id="hs-view" className="input w-32" value={view} onChange={(e) => setView(e.target.value as Img["view"])}>
                {Object.entries(VIEW).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
              <label className={`btn-ghost h-11 flex-1 cursor-pointer rounded-[10px] ${busy ? "pointer-events-none opacity-50" : ""}`}>
                Unggah foto
                <input type="file" accept={IMAGE_ACCEPT} className="sr-only" aria-label="Unggah foto referensi" onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ""; }} />
              </label>
            </div>
            <button type="button" onClick={removeStyle} className="btn-danger mt-2 h-11 self-start px-3">Hapus model</button>
          </section>
        )}
      </form>
    </Sheet>
  );
}
