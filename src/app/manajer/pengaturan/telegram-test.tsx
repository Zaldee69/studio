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
      <p className="text-sm text-muted">
        Dikirim ke owner/manajer saat selisih tutup kasir melewati batas di atas dan tiap 08.00 bila kasir kemarin belum ditutup.
        Bot &amp; penerima diatur di server (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID).
      </p>
      <button onClick={send} disabled={busy} className="btn-ghost h-11">Kirim pesan tes</button>
    </section>
  );
}
