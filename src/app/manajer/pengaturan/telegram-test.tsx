"use client";

import { useState } from "react";
import { useToast } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

/** Kirim pesan tes ke Telegram owner (lewat antrean yang sama dengan notifikasi kritis). */
export function TelegramTest() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  async function send() {
    setBusy(true);
    const { error } = await createClient().rpc("send_test_alert");
    setBusy(false);
    if (error) return toast(error.message, "error");
    toast("Pesan tes masuk antrean. Cek Telegram dalam 1 menit; bila tidak masuk, lihat log pengiriman di tab Halaman publik.");
  }
  return (
    <section aria-labelledby="tg-h" className="mt-6 max-w-xl space-y-3 rounded-2xl border border-line bg-card p-6">
      <h2 id="tg-h" className="font-display text-xl font-bold">Notifikasi Telegram</h2>
      <p className="text-sm text-muted">Dikirim ke owner/manajer. Bot &amp; penerima diatur di server (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID).</p>
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
        <li>Langsung: transaksi dibatalkan/refund, kasbon baru, pengeluaran besar atau kasbon salah kategori, transaksi tercatat terlambat,
          akun tim baru/diaktifkan, perubahan harga layanan, pengaturan uang, aturan bayaran staf, dan voucher.</li>
        <li>Tiap tutup kasir: ringkasan harian (omzet, pelanggan per staf, pengeluaran, kasbon, selisih).</li>
        <li>08.00: kasir kemarin belum ditutup, komisi sudah ditutup tapi belum dibayar; Senin: ringkasan minggu lalu.</li>
        <li>15.00: staf yang belum dapat pelanggan.</li>
      </ul>
      <button onClick={send} disabled={busy} className="btn-ghost h-11">Kirim pesan tes</button>
    </section>
  );
}

/** Kirim WA tes lewat jalur yang sama dengan konfirmasi booking (Wablas). */
export function WhatsAppTest() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [phone, setPhone] = useState("");
  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await createClient().rpc("send_test_wa", { p_phone: phone });
    setBusy(false);
    if (error) return toast(error.message, "error");
    toast("WA tes masuk antrean. Cek WhatsApp dalam 1 menit; bila tidak masuk, lihat alasannya di Pesan keluar (tab Halaman publik).");
  }
  return (
    <section aria-labelledby="wa-h" className="mt-6 max-w-xl space-y-3 rounded-2xl border border-line bg-card p-6">
      <h2 id="wa-h" className="font-display text-xl font-bold">Notifikasi WhatsApp</h2>
      <p className="text-sm text-muted">Konfirmasi booking, pengingat H-1, kode masuk, dan blast dikirim lewat Wablas (WABLAS_URL, WABLAS_TOKEN,
        WABLAS_SECRET_KEY). Tes memakai 1 dari kuota harian Wablas; maksimal 3 tes per 10 menit.</p>
      <form onSubmit={send} className="flex flex-wrap gap-2">
        <input type="tel" inputMode="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="08…"
          aria-label="Nomor WhatsApp tujuan tes" className="input h-11 min-w-0 flex-1" />
        <button disabled={busy} className="btn-ghost h-11">Kirim WA tes</button>
      </form>
    </section>
  );
}
