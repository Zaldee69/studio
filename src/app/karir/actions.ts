"use server";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/server";
import { readAnswers, type Position } from "@/lib/domain/lamaran";
import { log } from "@/lib/log";

export type ApplyState = { ok?: string; error?: string } | undefined;
// pesan dari apply_job() yang aman ditampilkan apa adanya
const KNOWN = ["Nama wajib diisi", "No. WhatsApp tidak valid", "Terlalu banyak percobaan, coba lagi nanti", "Jawaban terlalu panjang"];

/** Lamaran publik: RPC hanya bisa dipanggil server (service role); dibatasi per No. WA & IP di database. */
export async function applyJob(_: ApplyState, fd: FormData): Promise<ApplyState> {
  if (fd.get("website")) return { ok: "Terima kasih, lamaran sudah kami terima." }; // honeypot
  const position = fd.get("position");
  if (position !== "capster" && position !== "kasir") return { error: "Pilih posisi" };
  const name = String(fd.get("name") ?? "").trim();
  if (name.length < 2) return { error: "Nama wajib diisi" };
  const r = readAnswers(position as Position, (k) => fd.getAll(k).map(String));
  if ("error" in r) return r;
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "";
  const { error } = await createAdminClient().rpc("apply_job", { p: { position, name, whatsapp: String(fd.get("whatsapp") ?? ""), answers: r.answers, ip } });
  if (error) {
    const known = KNOWN.find((m) => error.message.includes(m));
    if (!known) log("error", "apply_job_failed", { error: error.message });
    return { error: known ?? "Gagal mengirim. Coba lagi sebentar lagi." };
  }
  return { ok: `Terima kasih, ${name.split(/\s+/)[0]}. Lamaran sudah kami terima; kami hubungi lewat WhatsApp bila cocok untuk tahap berikutnya.` };
}
