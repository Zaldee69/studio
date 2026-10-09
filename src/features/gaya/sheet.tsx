"use client";

import { useState } from "react";
import type { CatalogStyle, Recommendation } from "@/lib/domain/hair";

export type SheetData = { image: string };
type Col = { rec: Recommendation; style?: CatalogStyle };

const loadImg = (src: string) => new Promise<HTMLImageElement>((ok, err) => { const i = new Image(); i.onload = () => ok(i); i.onerror = err; i.src = src; });
const bullets = (c: Col) => (c.style?.highlights.length ? c.style.highlights : c.style?.style_character ?? []).slice(0, 4);

/** Satu kolom grid (depan di atas, samping di bawah) → data URL JPEG — disimpan sebagai pratinjau gaya yang dipilih. */
export async function cropColumn(grid: string, i: number, n: number) {
  const img = await loadImg(grid);
  const cw = img.naturalWidth / n, c = document.createElement("canvas");
  c.width = Math.round(cw); c.height = img.naturalHeight;
  c.getContext("2d")!.drawImage(img, i * cw, 0, cw, img.naturalHeight, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.88);
}

/** Potongan sel grid sebagai latar (tanpa memotong file): baris 0 = depan, 1 = samping. */
const cell = (grid: string, i: number, n: number, row: 0 | 1): React.CSSProperties => ({
  backgroundImage: `url(${grid})`, backgroundSize: `${n * 100}% 200%`,
  backgroundPosition: `${n > 1 ? (i / (n - 1)) * 100 : 0}% ${row * 100}%`,
});

/**
 * Katalog hasil konsultasi ala poster: n model × (depan, poin, samping) + tips & rekomendasi pribadi.
 * Teks tampil seketika; foto depan/samping menyusul dari satu grid (`image` null = masih dibuat).
 */
export function CatalogSheet({ recs, image, error, onRetry, catalog, customerName, insight, summary, onPick }: {
  recs: Recommendation[]; image: string | null; error: string | null; onRetry: () => void;
  catalog: CatalogStyle[]; customerName: string; insight: string; summary: string;
  onPick?: (rec: Recommendation, preview: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const cols: Col[] = recs.map((rec) => ({ rec, style: catalog.find((s) => s.hair_style_id === rec.hair_style_id) }));
  const n = cols.length, top = cols[0];
  const tips = [...new Set([top.rec.barber_note, top.style?.cut_notes, cols[1]?.rec.barber_note].filter((t): t is string => !!t))];
  const first = customerName === "Walk-in" ? "kamu" : customerName.split(" ")[0];

  async function share() {
    if (!image) return;
    setBusy(true);
    try {
      const blob = await renderSheetImage(image, cols, first, tips, top.rec.hair_style_name, summary || top.rec.insight);
      const file = new File([blob], `katalog-gaya-${first.toLowerCase()}.jpg`, { type: "image/jpeg" });
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: "Rekomendasi gaya rambut" });
      else {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob); a.download = file.name; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) console.error(e); // batal berbagi = bukan error
    } finally { setBusy(false); }
  }

  return (
    <section aria-label="Katalog lengkap"
      // lebih lebar dari kolom halaman kapster (960px) agar 5 kolom foto tidak sempit; tetap di tengah layar
      className="flex w-[min(calc(100vw-1.5rem),1480px)] flex-col gap-3 self-center rounded-[14px] border border-line bg-[#F3F2EF] p-3 min-[700px]:p-5">
      <div className="text-center">
        <h2 className="font-display text-2xl font-extrabold uppercase tracking-tight min-[700px]:text-3xl">{n} model rambut</h2>
        <p className="text-sm uppercase tracking-[0.08em] text-[#4A4C46]">Cocok untuk wajah & gaya {first}</p>
      </div>
      {insight && <p className="text-center text-sm text-[#4A4C46]">{insight}</p>}
      {!image && !error && (
        <p aria-busy="true" className="flex items-center justify-center gap-2 text-sm font-semibold">
          <span className="size-4 animate-spin rounded-full border-2 border-line border-t-ink" aria-hidden="true" />
          Membuat pratinjau {n} model di wajah pelanggan… ± 1,5 menit
        </p>
      )}
      {error && (
        <p role="alert" className="flex flex-wrap items-center justify-center gap-3 text-sm text-danger">
          {error} <button type="button" onClick={onRetry} className="btn-ghost h-9 rounded-[10px] px-3 text-ink">Coba lagi</button>
        </p>
      )}
      <div className="overflow-x-auto pb-1">
        {/* subgrid: judul, foto depan, poin, foto samping, tombol sejajar antar kolom walau panjang poin berbeda */}
        <div className="grid gap-x-2.5" style={{ gridTemplateColumns: `repeat(${n}, minmax(150px, 1fr))`, gridTemplateRows: "repeat(5, auto)" }}>
          {cols.map((c, i) => (
            <article key={c.rec.hair_style_id} aria-label={`Katalog ${c.rec.hair_style_name}`} className="row-span-5 grid grid-rows-subgrid overflow-hidden rounded-[10px] bg-white">
              <h3 className="flex min-h-14 items-center justify-center bg-[#1E2230] px-2 text-center text-[13px] font-bold uppercase leading-tight text-white">{i + 1}. {c.rec.hair_style_name}</h3>
              <Cell image={image} i={i} n={n} row={0} label={`${c.rec.hair_style_name} tampak depan`} />
              <ul className="list-disc space-y-0.5 bg-[#E9E7E2] py-2.5 pl-6 pr-2 text-xs">
                {bullets(c).map((b) => <li key={b}>{b}</li>)}
              </ul>
              <Cell image={image} i={i} n={n} row={1} label={`${c.rec.hair_style_name} tampak samping`} />
              {onPick ? (
                <button type="button" onClick={async () => onPick(c.rec, image ? await cropColumn(image, i, n) : null)} className="btn-ink m-2 h-10 rounded-[10px] text-sm">Pilih gaya ini</button>
              ) : <span />}
            </article>
          ))}
        </div>
      </div>
      <div className="grid gap-3 rounded-[12px] bg-[#1E2230] p-4 text-white min-[700px]:grid-cols-2">
        {!!tips.length && (
          <div>
            <h3 className="mb-1.5 text-sm font-bold uppercase tracking-[0.06em] text-[#B08A2E]">Tips tambahan</h3>
            <ul className="list-disc space-y-1 pl-5 text-sm">{tips.map((t) => <li key={t}>{t}</li>)}</ul>
          </div>
        )}
        <div className="rounded-[10px] border border-white/25 p-3">
          <h3 className="text-sm font-bold uppercase tracking-[0.06em] text-[#B08A2E]">Rekomendasi pribadi</h3>
          <p className="mt-1 font-display text-lg font-bold text-[#E8CF8E]">★ {top.rec.hair_style_name}</p>
          <p className="text-sm">{summary || top.rec.insight}</p>
        </div>
      </div>
      <button type="button" onClick={share} disabled={busy || !image} className="btn-ink h-12 rounded-xl">{busy ? "Menyiapkan gambar…" : "Bagikan / simpan gambar katalog"}</button>
    </section>
  );
}

function Cell({ image, i, n, row, label }: { image: string | null; i: number; n: number; row: 0 | 1; label: string }) {
  return image ? <div role="img" aria-label={label} className="aspect-[3/5] bg-paper" style={cell(image, i, n, row)} />
    : <div aria-hidden="true" className="flex aspect-[3/5] items-center justify-center bg-paper"><span className="size-5 animate-spin rounded-full border-2 border-line border-t-ink" /></div>;
}

/** Gambar katalog (untuk WhatsApp/galeri) digambar di canvas dari grid + teks aplikasi — teks tidak pernah dari AI. */
async function renderSheetImage(grid: string, cols: Col[], name: string, tips: string[], best: string, summary: string) {
  const img = await loadImg(grid);
  const n = cols.length, CW = 300, G = 14, P = 28, W = P * 2 + n * CW + (n - 1) * G;
  const cellW = img.naturalWidth / n, cellH = img.naturalHeight / 2, photoH = Math.round(CW * cellH / cellW);
  const font = getComputedStyle(document.body).fontFamily;
  const c = document.createElement("canvas"), x = c.getContext("2d")!;
  const lines = (t: string, w: number, size: number, weight = 400) => {
    x.font = `${weight} ${size}px ${font}`;
    const out: string[] = []; let cur = "";
    for (const word of t.split(/\s+/)) {
      const next = cur ? `${cur} ${word}` : word;
      if (x.measureText(next).width > w && cur) { out.push(cur); cur = word; } else cur = next;
    }
    if (cur) out.push(cur);
    return out;
  };
  const tipLines = tips.flatMap((t) => lines(`• ${t}`, W / 2 - P * 2, 18));
  const sumLines = lines(summary, W / 2 - P * 2, 18);
  const bulletLines = cols.map((col) => bullets(col).flatMap((b) => lines(b, CW - 44, 19).slice(0, 2).map((l, k) => (k ? `   ${l}` : `• ${l}`))));
  const bulletH = Math.max(...bulletLines.map((l) => l.length)) * 26 + 24, colH = 70 + photoH + bulletH + photoH;
  const footH = Math.max(tipLines.length, sumLines.length + 2) * 28 + 70;
  c.width = W; c.height = 150 + colH + G + footH + P;

  x.fillStyle = "#F3F2EF"; x.fillRect(0, 0, c.width, c.height);
  x.fillStyle = "#14161F"; x.textAlign = "center";
  x.font = `800 56px ${font}`; x.fillText(`${n} MODEL RAMBUT`, W / 2, 72);
  x.font = `500 26px ${font}`; x.fillText(`COCOK UNTUK WAJAH & GAYA ${name.toUpperCase()}`, W / 2, 112);
  cols.forEach((col, i) => {
    const cx = P + i * (CW + G), y0 = 140;
    x.fillStyle = "#fff"; x.fillRect(cx, y0, CW, colH);
    x.fillStyle = "#1E2230"; x.fillRect(cx, y0, CW, 70);
    x.fillStyle = "#fff"; x.textAlign = "center";
    lines(`${i + 1}. ${col.rec.hair_style_name.toUpperCase()}`, CW - 20, 22, 700).slice(0, 2)
      .forEach((l, k, arr) => x.fillText(l, cx + CW / 2, y0 + 35 - (arr.length - 1) * 13 + k * 26 + 8));
    x.drawImage(img, i * cellW, 0, cellW, cellH, cx, y0 + 70, CW, photoH);
    x.fillStyle = "#E9E7E2"; x.fillRect(cx, y0 + 70 + photoH, CW, bulletH);
    x.fillStyle = "#14161F"; x.textAlign = "left"; x.font = `400 19px ${font}`;
    bulletLines[i].forEach((l, k) => x.fillText(l, cx + 16, y0 + 70 + photoH + 34 + k * 26));
    x.drawImage(img, i * cellW, cellH, cellW, cellH, cx, y0 + 70 + photoH + bulletH, CW, photoH);
  });
  const fy = 140 + colH + G;
  x.fillStyle = "#1E2230"; x.fillRect(P, fy, W - P * 2, footH);
  x.textAlign = "left"; x.fillStyle = "#B08A2E"; x.font = `700 22px ${font}`;
  if (tips.length) x.fillText("TIPS TAMBAHAN", P + 24, fy + 40);
  x.fillText("REKOMENDASI PRIBADI", W / 2 + 12, fy + 40);
  x.fillStyle = "#fff"; x.font = `400 18px ${font}`;
  tipLines.forEach((l, k) => x.fillText(l, P + 24, fy + 76 + k * 28));
  x.fillStyle = "#E8CF8E"; x.font = `700 24px ${font}`; x.fillText(`★ ${best}`, W / 2 + 12, fy + 78);
  x.fillStyle = "#fff"; x.font = `400 18px ${font}`;
  sumLines.forEach((l, k) => x.fillText(l, W / 2 + 12, fy + 110 + k * 28));
  return new Promise<Blob>((ok, err) => c.toBlob((b) => (b ? ok(b) : err(new Error("Gagal membuat gambar"))), "image/jpeg", 0.9));
}
