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
