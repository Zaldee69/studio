"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/server";

const TOKEN = /^[0-9a-f]{24}$/;

/** Pelanggan menekan "Ya, saya datang" dari pengingat. Token = kunci; hanya server yang memanggil RPC-nya. */
export async function confirmBooking(token: string): Promise<{ ok: boolean; message: string }> {
  if (!TOKEN.test(token)) return { ok: false, message: "Tautan tidak valid." };
  const { data, error } = await createAdminClient().rpc("booking_token_confirm", { p_token: token });
  if (error || !data) return { ok: false, message: "Booking tidak ditemukan atau sudah selesai." };
  revalidatePath(`/b/${token}`);
  return { ok: true, message: "Terima kasih, kehadiran Kakak sudah kami catat." };
}

export async function cancelBooking(token: string): Promise<{ ok: boolean; message: string }> {
  if (!TOKEN.test(token)) return { ok: false, message: "Tautan tidak valid." };
  const { data, error } = await createAdminClient().rpc("booking_token_cancel", { p_token: token });
  if (error) return { ok: false, message: "Belum berhasil membatalkan. Coba lagi sebentar." };
  const r = data as { ok: boolean; reason?: string; hours?: number };
  if (r.ok) { revalidatePath(`/b/${token}`); return { ok: true, message: "Booking dibatalkan. Terima kasih sudah mengabari kami." }; }
  if (r.reason === "cutoff") return { ok: false, message: `Pembatalan lewat tautan hanya sampai ${r.hours} jam sebelum jadwal. Silakan hubungi kami lewat WhatsApp.` };
  return { ok: false, message: "Booking ini sudah tidak bisa dibatalkan." };
}
