"use client";

import { useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { useKapster } from "@/features/kapster/provider";
import { formatJam } from "@/lib/domain/format";
import { HAIR_LABEL, normalizeConsult, sheetStyles, type ConsultResult, type Recommendation } from "@/lib/domain/hair";
import { STATUS } from "@/lib/domain/status";
import { compressImage, IMAGE_ACCEPT } from "@/lib/image";
import { CutList, RecordSheet, StyleCard, daysAgo, useCatalog, useStyleHistory, type Pick } from "./parts";
import { CatalogSheet, type SheetData } from "./sheet";

type Success = Extract<ConsultResult, { status: "success" }> & { consult_id: string };
const ORDER = ["in_service", "arrived", "completed", "booked", "paid"];

async function post(url: string, form: FormData) {
  const res = await fetch(url, { method: "POST", body: form });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? "Gagal menghubungi server.");
  return body;
}

/**
 * Konsultasi gaya (kapster): pilih pelanggan dari booking → riwayat (potongan terakhir & rekomendasi tersimpan, tanpa AI)
 * → bila perlu analisis ulang dari foto → pratinjau saat diketuk → catat potongan yang dipakai. Foto hanya di memori.
 */
export function HairConsult() {
  const { appts } = useKapster();
  const params = useSearchParams();
  const [bookingId, setBookingId] = useState<string | null>(params.get("booking"));
  const today = (appts ?? []).filter((a) => ORDER.includes(a.status) && new Date(a.start_at).toDateString() === new Date().toDateString())
    .sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || a.start_at.localeCompare(b.start_at));
  const booking = bookingId && bookingId !== "walkin" ? (appts ?? []).find((a) => a.id === bookingId) ?? null : null;

  if (!bookingId) {
    return (
      <section className="flex flex-col gap-3 rounded-[14px] border border-line bg-card p-5">
        <h1 className="font-display text-2xl font-bold">Konsultasi gaya</h1>
        <p className="text-sm text-muted">Untuk pelanggan siapa? Riwayat & hasil tersimpan di profil pelanggan.</p>
        {!appts ? <p className="text-sm text-muted">Memuat…</p> : !today.length && <p className="text-sm text-muted">Belum ada booking hari ini.</p>}
        {today.map((a) => (
          <button key={a.id} onClick={() => setBookingId(a.id)} className="flex min-h-14 items-center gap-3 rounded-[12px] border border-line px-4 text-left hover:bg-paper">
            <span className="w-12 font-semibold tabular">{formatJam(a.start_at)}</span>
            <span className="min-w-0 flex-1"><b className="block truncate">{a.customer_name ?? "Walk-in"}</b>
              {!a.customer_id && <span className="text-xs text-muted">tanpa data pelanggan — tidak tersimpan</span>}</span>
            <span className="rounded-full px-2 py-0.5 text-xs font-bold" style={{ background: STATUS[a.status].bg, color: STATUS[a.status].fg }}>{STATUS[a.status].short}</span>
          </button>
        ))}
        <button onClick={() => setBookingId("walkin")} className="btn-ghost h-12 rounded-xl">Walk-in tanpa booking (tidak disimpan)</button>
      </section>
    );
  }
  return <Consult key={bookingId} appointmentId={booking?.id ?? null} customerId={booking?.customer_id ?? null}
    customerName={booking?.customer_name ?? "Walk-in"} onChange={() => setBookingId(null)} />;
}

function Consult({ appointmentId, customerId, customerName, onChange }: { appointmentId: string | null; customerId: string | null; customerName: string; onChange: () => void }) {
  const catalog = useCatalog();
  const { data: history, refresh } = useStyleHistory(customerId);
  const [consent, setConsent] = useState(false);
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<(ConsultResult & { consult_id?: string }) | null>(null);
  const [sheet, setSheet] = useState<{ state: "loading" | "error"; error?: string } | SheetData | null>(null);
  const [pick, setPick] = useState<Pick | null>(null);
  const camera = useRef<HTMLInputElement>(null), gallery = useRef<HTMLInputElement>(null);
  const canSave = !!appointmentId && !!customerId;

  const stored = history?.consult && catalog ? normalizeConsult(history.consult.result, catalog) : null;

  async function analyze(file: File | undefined) {
    if (!file) return;
    if (photo) URL.revokeObjectURL(photo.url);
    setResult(null); setError(""); setSheet(null); setBusy(true);
    try {
      const blob = await compressImage(file, { maxSide: 1024, type: "image/jpeg", maxBytes: 1.5 * 1024 * 1024 });
      setPhoto({ blob, url: URL.createObjectURL(blob) });
      const f = new FormData();
      f.append("photo", blob, "pelanggan.jpg"); f.append("consent", "1");
      if (appointmentId) f.append("appointment_id", appointmentId);
      const r = await post("/api/gaya/analisis", f) as ConsultResult & { consult_id: string };
      setResult(r);
      // pratinjau langsung: katalog (grid depan/samping 5 model teratas) dibuat otomatis setelah analisis
      if (r.status === "success") void buildSheet(r as Success, blob);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      if (camera.current) camera.current.value = "";
      if (gallery.current) gallery.current.value = "";
    }
  }

  async function buildSheet(r: Success, blob = photo?.blob) {
    if (!blob) return;
    setSheet({ state: "loading" });
    const f = new FormData();
    f.append("photo", blob, "pelanggan.jpg"); f.append("consult_id", r.consult_id);
    try {
      const { image } = await post("/api/gaya/katalog", f) as { image: string };
      setSheet({ image });
    } catch (e) {
      setSheet({ state: "error", error: e instanceof Error ? e.message : String(e) });
    }
  }

  const use = (x: Recommendation, consultId: string | null) => setPick({
    code: x.hair_style_id, name: x.hair_style_name, consultId,
    notes: catalog?.find((s) => s.hair_style_id === x.hair_style_id)?.cut_notes ?? "",
  });
  const live = result?.status === "success" ? (result as Success) : null;

  return (
    <div className="flex flex-col gap-4">
      <section className="flex items-center gap-3 rounded-[14px] border border-line bg-card p-4">
        {photo && (
          // eslint-disable-next-line @next/next/no-img-element -- blob lokal
          <img src={photo.url} alt="Foto pelanggan" className="size-14 shrink-0 rounded-full object-cover" />
        )}
        <span className="min-w-0 flex-1"><span className="text-xs text-muted">Konsultasi gaya untuk</span><b className="block truncate text-lg">{customerName}</b></span>
        <button onClick={onChange} className="btn-ghost h-10 rounded-[10px] px-3 text-sm">Ganti</button>
      </section>
      {!canSave && <p className="rounded-[10px] bg-[#FFF1C2] px-3.5 py-3 text-sm text-[#5A4300]">Tanpa data pelanggan — hasil & catatan potongan tidak disimpan.</p>}

      {/* RIWAYAT: pelanggan yang kembali tidak perlu ditanya / dianalisis ulang */}
      {customerId && (
        <section className="flex flex-col gap-3 rounded-[14px] border border-line bg-card p-4">
          <h2 className="text-base font-bold">Riwayat gaya</h2>
          {!history ? <p className="text-sm text-muted">Memuat…</p> : <CutList cuts={history.cuts} onRepeat={canSave ? setPick : undefined} />}
          {stored?.status === "success" && !live && (
            <div className="flex flex-col gap-3 border-t border-line pt-3">
              <p className="text-sm"><b>Rekomendasi tersimpan</b> <span className="text-muted">· dianalisis {daysAgo(history!.consult!.created_at)}</span></p>
              {stored.overall_insight && <p className="text-sm text-[#4A463F]">{stored.overall_insight}</p>}
              <div className="grid grid-cols-2 gap-3 min-[700px]:grid-cols-3">
                {[...stored.primary_recommendations, ...stored.alternatives].map((x) => (
                  <StyleCard key={x.hair_style_id} rec={x} onUse={canSave ? () => use(x, null) : undefined} />
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* ANALISIS FOTO */}
      {busy ? (
        <section aria-busy="true" className="flex flex-col items-center gap-4 rounded-[14px] border border-line bg-card p-8 text-center">
          <span className="size-8 animate-spin rounded-full border-[3px] border-line border-t-ink" aria-hidden="true" />
          <p className="font-semibold">Membaca bentuk wajah & karakter rambut…</p>
        </section>
      ) : !live && (
        <section className="flex flex-col gap-3 rounded-[14px] border border-line bg-card p-4">
          <h2 className="text-base font-bold">{stored?.status === "success" ? "Analisis ulang dari foto" : "Konsultasi dari foto"}</h2>
          {result && result.status !== "success" && (
            <p role="alert" className="rounded-[10px] bg-[#FFF1C2] px-3.5 py-3 text-sm text-[#5A4300]">{result.reason} {result.suggestion}</p>
          )}
          {/* kualitas foto paling menentukan apakah wajah di pratinjau tetap mirip */}
          <details className="rounded-[10px] border border-line p-3 text-sm" open={!stored}>
            <summary className="cursor-pointer font-semibold">Tips foto agar wajah di pratinjau tetap mirip</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-[#4A463F]">
              <li>Kapster yang memotret dengan <b>kamera belakang</b>, jarak ±1 meter — bukan selfie dekat.</li>
              <li>Kepala & bahu terlihat, <b>ada ruang di atas kepala</b>; rambut tidak terpotong bingkai.</li>
              <li>Cahaya terang & merata dari depan; hindari ruangan gelap dan kilau minyak di wajah.</li>
              <li>Pelanggan <b>menatap kamera</b>, wajah lurus, ekspresi netral, mulut tertutup.</li>
            </ul>
          </details>
          <label className="flex items-start gap-3 rounded-[10px] bg-paper p-3.5 text-sm">
            <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-[#1c1b19]" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>Pelanggan setuju fotonya dipakai untuk rekomendasi gaya. <span className="text-muted">Foto tidak disimpan.</span></span>
          </label>
          {error && <p role="alert" className="rounded-[10px] bg-[#FFDADA] px-3.5 py-3 text-sm text-[#6E1616]">{error}</p>}
          <input ref={camera} type="file" accept="image/*" capture="environment" className="sr-only" aria-label="Ambil foto pelanggan" onChange={(e) => analyze(e.target.files?.[0])} />
          <input ref={gallery} type="file" accept={IMAGE_ACCEPT} className="sr-only" aria-label="Pilih foto dari galeri" onChange={(e) => analyze(e.target.files?.[0])} />
          <div className="grid grid-cols-2 gap-2">
            <button type="button" disabled={!consent} onClick={() => camera.current?.click()} className="btn-ink h-14 rounded-xl text-base">Ambil foto</button>
            <button type="button" disabled={!consent} onClick={() => gallery.current?.click()} className="btn-ghost h-14 rounded-xl">Dari galeri</button>
          </div>
        </section>
      )}

      {live && (
        <>
          {/* hasil konsultasi = katalog: teks langsung tampil, foto depan/samping menyusul (satu grid, ± 1,5 menit) */}
          {catalog && (
            <CatalogSheet recs={sheetStyles(live)} image={sheet && "image" in sheet ? sheet.image : null}
              error={sheet && "error" in sheet ? sheet.error ?? "Gagal membuat pratinjau." : null} onRetry={() => buildSheet(live)}
              catalog={catalog} customerName={customerName} insight={live.overall_insight} summary={live.customer_summary}
              onPick={canSave ? (rec, col) => setPick({ code: rec.hair_style_id, name: rec.hair_style_name, consultId: live.consult_id, preview: col ?? undefined,
                notes: catalog.find((s) => s.hair_style_id === rec.hair_style_id)?.cut_notes ?? "" }) : undefined} />
          )}
          <details className="rounded-[14px] border border-line bg-card p-4 text-sm">
            <summary className="cursor-pointer font-semibold">Detail analisis</summary>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
              {([["Bentuk wajah", live.analysis.face_shape], ["Jenis rambut", live.analysis.hair_type], ["Ketebalan", live.analysis.hair_density],
                 ["Panjang sekarang", live.analysis.current_length], ["Dahi", live.analysis.forehead], ["Garis rambut", live.analysis.hairline],
                 ["Arah tumbuh", live.analysis.hair_direction], ["Perawatan cocok", live.analysis.maintenance_level],
                 ["Tekstur", live.analysis.hair_texture], ["Gaya sekarang", live.analysis.current_style]] as const).map(([k, v]) => (
                <div key={k}><dt className="text-xs text-muted">{k}</dt><dd className="font-semibold">{HAIR_LABEL[v] ?? v}</dd></div>
              ))}
            </dl>
          </details>
          <button type="button" onClick={() => { setResult(null); }} className="btn-ghost h-12 rounded-xl">Foto ulang</button>
        </>
      )}

      {pick && appointmentId && (
        <RecordSheet key={`${pick.code}-${pick.name}`} pick={pick} appointmentId={appointmentId} onClose={() => setPick(null)}
          onSaved={() => { setPick(null); refresh(); }} />
      )}
    </div>
  );
}
