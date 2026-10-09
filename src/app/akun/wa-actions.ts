"use server";

import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { log } from "@/lib/log";
import { sendWhatsAppAdapter, sendWhatsAppOtp } from "@/lib/notifications/adapters";
import { createAdminClient, createClient } from "@/lib/supabase/server";

export type WaResult = { ok: true; whatsapp: string; merged?: boolean } | { ok: false; message: string };

async function me() {
  const { data } = await (await createClient()).auth.getClaims();
  return data?.claims.sub ?? null;
}

/** Kirim kode 6 digit ke nomor WA (hash disimpan di DB; batas permintaan dijaga wa_otp_request). */
export async function requestWaOtp(whatsapp: string): Promise<WaResult> {
  const uid = await me();
  if (!uid) return { ok: false, message: "Sesi berakhir. Masuk lagi." };
  if (!sendWhatsAppAdapter()) return { ok: false, message: "Verifikasi WhatsApp belum tersedia. Hubungi studio untuk menyambungkan nomor Anda." };
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const { data, error } = await createAdminClient().rpc("wa_otp_request", { p_uid: uid, p_wa: whatsapp, p_code: code });
  if (error) { log("error", "wa_otp_request_failed", { user: uid, error: error.message }); return { ok: false, message: "Gagal meminta kode. Coba lagi." }; }
  const r = data as { ok: boolean; whatsapp?: string; message?: string };
  if (!r.ok) return { ok: false, message: r.message ?? "Gagal meminta kode." };
  try {
    await sendWhatsAppOtp(r.whatsapp!, code);
  } catch (e) {
    log("error", "wa_otp_send_failed", { user: uid, error: (e as Error).message });
    return { ok: false, message: "Kode gagal dikirim ke WhatsApp. Periksa nomor lalu coba lagi." };
  }
  return { ok: true, whatsapp: r.whatsapp! };
}

export async function verifyWaOtp(code: string): Promise<WaResult> {
  const uid = await me();
  if (!uid) return { ok: false, message: "Sesi berakhir. Masuk lagi." };
  const { data, error } = await createAdminClient().rpc("wa_otp_verify", { p_uid: uid, p_code: code.trim() });
  if (error) { log("error", "wa_otp_verify_failed", { user: uid, error: error.message }); return { ok: false, message: "Gagal memverifikasi. Coba lagi." }; }
  const r = data as { ok: boolean; whatsapp?: string; merged?: boolean; message?: string };
  if (!r.ok) return { ok: false, message: r.message ?? "Kode salah." };
  log("info", "wa_verified", { user: uid, merged: !!r.merged });
  revalidatePath("/akun");
  return { ok: true, whatsapp: r.whatsapp!, merged: r.merged };
}
