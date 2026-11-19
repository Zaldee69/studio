"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { RouteTabs, PELANGGAN_TABS } from "@/components/route-tabs";
import { useToast } from "@/components/ui";
import { draftReviewReply } from "./actions";

/** Ulasan Google: status pengiriman permintaan ulasan + penulis draf balasan (ditempel manual di Google). */
export function UlasanScreen({ reviewUrl, asked }: { reviewUrl: string | null; asked: number }) {
  const toast = useToast();
  const [rating, setRating] = useState("5");
  const [review, setReview] = useState("");
  const [draft, setDraft] = useState("");
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const make = () => start(async () => {
    setErr("");
    const r = await draftReviewReply(+rating, review);
    if (r.ok) setDraft(r.text); else setErr(r.message);
  });
  async function copy() {
    try { await navigator.clipboard.writeText(draft); toast("Draf disalin"); } catch { toast("Salin manual: pilih teks lalu Ctrl+C", "error"); }
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-0.5">
        <h1 className="font-display text-[28px] font-medium tracking-tight">Ulasan</h1>
        <span className="text-[13px] text-muted">Minta ulasan Google otomatis dan balas ulasan yang masuk</span>
      </div>
      <RouteTabs tabs={PELANGGAN_TABS} label="Bagian pelanggan" />

      <section className="flex flex-col gap-2 rounded-3xl border border-line bg-card p-5">
        <h2 className="text-base font-semibold">Permintaan ulasan otomatis</h2>
        {reviewUrl ? (
          <p className="text-sm text-muted">Aktif. Pelanggan yang punya WhatsApp menerima tautan ulasan sekitar satu jam setelah transaksi, sekali seumur pelanggan. Sudah terkirim ke <b className="text-ink tabular">{asked}</b> pelanggan.</p>
        ) : (
          <p role="alert" className="rounded-2xl bg-[#FBF2E4] px-4 py-3 text-sm text-[#6B4A10]">
            Belum aktif karena tautan ulasan Google belum diisi, jadi belum ada pesan yang terkirim. Isi di{" "}
            <Link href="/manajer/pengaturan?tab=pesan" className="font-semibold underline">Pengaturan, Pesan otomatis</Link>.
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-3xl border border-line bg-card p-5">
        <div>
          <h2 className="text-base font-semibold">Buat draf balasan</h2>
          <span className="text-[13px] text-muted">Tempel ulasan dari Google, lalu periksa dan ubah drafnya sebelum ditempel kembali di Google.</span>
        </div>
        <div className="grid gap-3 md:grid-cols-[160px_1fr]">
          <label className="flex flex-col gap-1.5 text-sm font-medium">Bintang
            <NativeSelect value={rating} onChange={(e) => setRating(e.target.value)}>
              {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} bintang</option>)}
            </NativeSelect>
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">Isi ulasan
            <Textarea rows={4} className="py-2.5 leading-normal" maxLength={1500} value={review} onChange={(e) => setReview(e.target.value)} placeholder="Tempel ulasan pelanggan di sini" />
          </label>
        </div>
        <div><Button onClick={make} disabled={pending || review.trim().length < 3} className="h-11">{pending ? "Menulis…" : "Buatkan draf"}</Button></div>
        {err && <p role="alert" className="text-sm font-medium text-danger">{err}</p>}
        {draft && (
          <div className="flex flex-col gap-2 rounded-2xl bg-paper p-4">
            <label htmlFor="ul-draft" className="text-sm font-semibold">Draf balasan</label>
            <Textarea id="ul-draft" rows={5} className="py-2.5 leading-normal" value={draft} onChange={(e) => setDraft(e.target.value)} />
            <div><Button variant="outline" onClick={copy} className="h-11">Salin</Button></div>
          </div>
        )}
      </section>
    </div>
  );
}
