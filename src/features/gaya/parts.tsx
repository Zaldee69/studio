"use client";

import { useState } from "react";
import { CloseButton, Field, Sheet, useToast } from "@/components/ui";
import { CATALOG_SELECT, hairstyleImageUrl, REACTION, toCatalogStyle, type CatalogRow, type CatalogStyle, type Recommendation } from "@/lib/domain/hair";
import { useRealtimeTable } from "@/lib/hooks/useRealtimeTable";
import { createClient } from "@/lib/supabase/client";

export type Preview = { state: "loading" | "done" | "error"; image?: string; error?: string };
/** Gaya yang akan dicatat sebagai potongan. */
export type Pick = { code: string | null; name: string; notes: string; preview?: string; consultId?: string | null };

/** Katalog aktif (untuk menempel gambar ke rekomendasi tersimpan & "lihat semua yang cocok"). */
export function useCatalog() {
  const { data } = useRealtimeTable(["hairstyles", "hairstyle_images"], async () => {
    const { data } = await createClient().from("hairstyles").select(CATALOG_SELECT).eq("active", true).order("sort");
    return (data ?? []).map((s) => toCatalogStyle(s as CatalogRow, hairstyleImageUrl));
  });
  return data;
}

export const daysAgo = (iso: string) => {
  const d = Math.floor((Date.now() - Date.parse(iso)) / 864e5);
  return d <= 0 ? "hari ini" : d === 1 ? "kemarin" : d < 31 ? `${d} hari lalu` : `${Math.round(d / 30)} bulan lalu`;
};

/** Kartu satu gaya: pratinjau (bila ada) / foto referensi, alasan & catatan kapster, aksi. */
export function StyleCard({ rec, big = false, preview, onPreview, onUse }: {
  rec: Recommendation; big?: boolean; preview?: Preview; onPreview?: () => void; onUse?: () => void;
}) {
  const [view, setView] = useState<"preview" | number>("preview");
  const showPreview = view === "preview" && preview?.state === "done";
  const img = showPreview ? preview!.image! : rec.reference_images[typeof view === "number" ? view : 0]?.image_url;
  return (
    <article aria-label={rec.hair_style_name} className={`flex flex-col overflow-hidden rounded-[14px] border bg-card ${big && rec.rank === 1 ? "border-ink" : "border-line"}`}>
      <div className="relative aspect-[2/3] max-h-[62vh] w-full bg-paper">
        {view === "preview" && preview?.state === "loading" ? (
          <div className="flex size-full flex-col items-center justify-center gap-3 p-4 text-center text-xs text-muted" aria-busy="true">
            <span className="size-6 animate-spin rounded-full border-[3px] border-line border-t-ink" aria-hidden="true" />Membuat pratinjau…
            <span>± 1–1,5 menit. Sambil menunggu, lihat foto contoh model di bawah.</span>
          </div>
        ) : img ? (
          /* eslint-disable-next-line @next/next/no-img-element -- data URL pratinjau / foto katalog */
          <img src={img} alt={showPreview ? `Pratinjau pelanggan dengan ${rec.hair_style_name}` : `Contoh ${rec.hair_style_name}`} className="size-full object-cover" />
        ) : null}
        {big && rec.rank === 1 && <span className="absolute left-2 top-2 rounded-full bg-ink px-2.5 py-1 text-[11px] font-bold text-white">★ Paling cocok</span>}
        <span className="absolute bottom-2 left-2 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-semibold text-white">{showPreview ? "Pratinjau" : "Contoh model"}</span>
      </div>
      <div className="flex flex-wrap gap-1.5 px-3 pt-2.5">
        {(preview?.state === "done" || preview?.state === "loading") && (
          <button type="button" aria-pressed={view === "preview"} onClick={() => setView("preview")} className={`h-8 rounded-full border px-2.5 text-xs font-bold ${view === "preview" ? "border-ink bg-ink text-white" : "border-line"}`}>Pratinjau</button>
        )}
        {rec.reference_images.map((r, i) => (
          <button key={r.image_id} type="button" aria-pressed={view === i} onClick={() => setView(i)}
            className={`h-8 rounded-full border px-2.5 text-xs font-bold ${view === i ? "border-ink bg-ink text-white" : "border-line"}`}>
            {r.view === "front" ? "Depan" : r.view === "side" ? "Samping" : r.view === "back" ? "Belakang" : "Contoh"}
          </button>
        ))}
        {onPreview && (!preview || preview.state === "error") && (
          <button type="button" onClick={() => { setView("preview"); onPreview(); }} className="h-8 rounded-full border border-dashed border-ink px-2.5 text-xs font-bold">
            {preview?.state === "error" ? "Coba pratinjau lagi" : "Buat pratinjau"}
          </button>
        )}
      </div>
      {preview?.state === "error" && <p role="alert" className="px-3 pt-1.5 text-xs text-danger">{preview.error}</p>}
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <b className={big ? "font-display text-lg" : "text-sm"}>{rec.hair_style_name}</b>
        {rec.insight && <p className={`${big ? "text-sm" : "text-xs"} leading-relaxed`}>{rec.insight}</p>}
        {rec.barber_note && <p className="rounded-lg bg-paper px-2.5 py-2 text-xs"><b>Catatan kapster:</b> {rec.barber_note}</p>}
        {onUse && <button type="button" onClick={onUse} className="btn-ink mt-auto h-10 rounded-[10px] text-sm">Pakai gaya ini</button>}
      </div>
    </article>
  );
}

/** Catat potongan yang dilakukan: gaya, detail teknis, reaksi; pratinjau disimpan hanya dengan persetujuan. */
export function RecordSheet({ pick, appointmentId, onClose, onSaved }: { pick: Pick | null; appointmentId: string; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [notes, setNotes] = useState(pick?.notes ?? "");
  const [reaction, setReaction] = useState<keyof typeof REACTION>("puas");
  const [savePreview, setSavePreview] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!pick) return null;
  async function save() {
    setBusy(true);
    const res = await fetch("/api/gaya/catat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
      appointment_id: appointmentId, consult_id: pick!.consultId ?? null, style_code: pick!.code, style_name: pick!.name,
      notes, reaction, preview: savePreview ? pick!.preview : null }) });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return toast(body.error ?? "Gagal menyimpan", "error");
    toast(`Potongan "${pick!.name}" tercatat di riwayat pelanggan`);
    onSaved();
  }
  return (
    <Sheet open onClose={onClose} label="Catat potongan" width={480}>
      <div className="flex flex-col gap-4 p-5">
        <div className="flex items-center gap-3">
          <h2 className="flex-1 font-display text-xl font-bold">Catat potongan · {pick.name}</h2>
          <CloseButton onClick={onClose} />
        </div>
        <Field label="Detail potongan" htmlFor="cut-notes" hint="Mis. sisi guard 1, fade rendah, atas ±5 cm. Muncul paling atas di kunjungan berikutnya.">
          <textarea id="cut-notes" rows={3} className="input py-2.5" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1 text-xs font-bold text-muted">Reaksi pelanggan</legend>
          <div className="grid grid-cols-3 gap-2">
            {(Object.entries(REACTION) as [keyof typeof REACTION, string][]).map(([k, l]) => (
              <button key={k} type="button" role="radio" aria-checked={reaction === k} onClick={() => setReaction(k)}
                className={`h-11 rounded-[10px] border-2 text-sm font-bold ${reaction === k ? "border-ink bg-ink text-white" : "border-line"}`}>{l}</button>
            ))}
          </div>
        </fieldset>
        {pick.preview && (
          <label className="flex items-start gap-3 rounded-[10px] bg-paper p-3 text-sm">
            <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-[#1f2320]" checked={savePreview} onChange={(e) => setSavePreview(e.target.checked)} />
            <span>Simpan pratinjau di profil pelanggan. <span className="text-muted">Hanya bila pelanggan setuju; terhapus otomatis setelah 6 bulan.</span></span>
          </label>
        )}
        <button type="button" onClick={save} disabled={busy} className="btn-ink h-12">{busy ? "Menyimpan…" : "Simpan ke riwayat"}</button>
      </div>
    </Sheet>
  );
}

type CutRow = { id: string; created_at: string; style_name: string; notes: string; reaction: keyof typeof REACTION;
  preview_path: string | null; preview_expires_at: string | null; staff: { name: string } | null; hairstyle: { code: string } | null };
export type StoredConsult = { id: string; created_at: string; result: unknown };

/** Riwayat gaya pelanggan: potongan terakhir (paling atas) + rekomendasi tersimpan terakhir. Tanpa AI. */
export function useStyleHistory(customerId: string | null) {
  return useRealtimeTable(["hair_cut_records", "hair_consults"], async () => {
    if (!customerId) return null;
    const sb = createClient();
    const [{ data: cuts }, { data: consult }] = await Promise.all([
      sb.from("hair_cut_records").select("id, created_at, style_name, notes, reaction, preview_path, preview_expires_at, staff(name), hairstyle:hairstyles(code)")
        .eq("customer_id", customerId).order("created_at", { ascending: false }).limit(5),
      sb.from("hair_consults").select("id, created_at, result").eq("customer_id", customerId).eq("status", "success")
        .order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    const rows = (cuts ?? []) as unknown as CutRow[];
    const live = rows.filter((c) => c.preview_path && c.preview_expires_at && Date.parse(c.preview_expires_at) > Date.now());
    const signed = live.length ? (await sb.storage.from("hair-previews").createSignedUrls(live.map((c) => c.preview_path!), 3600)).data ?? [] : [];
    const urls = new Map(signed.map((s) => [s.path, s.signedUrl]));
    return { cuts: rows.map((c) => ({ ...c, previewUrl: c.preview_path ? urls.get(c.preview_path) ?? null : null })), consult: consult as StoredConsult | null };
  }, customerId ?? "");
}

export function CutList({ cuts, onRepeat }: { cuts: (CutRow & { previewUrl: string | null })[]; onRepeat?: (p: Pick) => void }) {
  if (!cuts.length) return <p className="text-sm text-muted">Belum ada potongan tercatat.</p>;
  const [last, ...older] = cuts;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-3 rounded-[12px] border border-ink p-3">
        {last.previewUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- signed URL privat
          <img src={last.previewUrl} alt={`Pratinjau ${last.style_name}`} className="h-28 w-20 shrink-0 rounded-lg object-cover" />
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
          <span className="text-xs font-bold uppercase tracking-[0.06em] text-muted">Terakhir · {daysAgo(last.created_at)}{last.staff ? ` · ${last.staff.name}` : ""}</span>
          <b className="font-display text-lg">{last.style_name}</b>
          {last.notes && <p>{last.notes}</p>}
          <span className={`self-start rounded-full px-2 py-0.5 text-xs font-bold ${last.reaction === "kurang" ? "bg-[#F9E6E6] text-[#6E1616]" : last.reaction === "biasa" ? "bg-[#FBF3DE] text-[#5A4300]" : "bg-[#E6F1E4] text-[#144D2A]"}`}>Pelanggan: {REACTION[last.reaction]}</span>
          {onRepeat && <button type="button" onClick={() => onRepeat({ code: last.hairstyle?.code ?? null, name: last.style_name, notes: last.notes })}
            className="btn-ink mt-1 h-10 self-start rounded-[10px] px-4 text-sm">Ulangi potongan ini</button>}
        </div>
      </div>
      {older.map((c) => (
        <div key={c.id} className="flex justify-between gap-3 border-t border-[#EEEEEA] pt-2 text-sm">
          <span className="min-w-0"><b>{c.style_name}</b>{c.notes && <span className="block truncate text-xs text-muted">{c.notes}</span>}</span>
          <span className="shrink-0 text-xs text-muted">{daysAgo(c.created_at)} · {REACTION[c.reaction]}</span>
        </div>
      ))}
    </div>
  );
}

export type CatalogMatch = { style: CatalogStyle; score: number };
