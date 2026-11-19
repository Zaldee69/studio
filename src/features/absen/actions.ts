"use server";

import { headers } from "next/headers";
import { clientIp } from "@/lib/absen-ip";
import { createAdminClient, createClient } from "@/lib/supabase/server";

type Result = { ok: true; in_at: string; out_at: string | null; late_min: number } | { ok: false; error: string };

/** Absen dari HP sendiri. IP dicek di sini (bukan di browser); fungsi database hanya bisa dipanggil lewat kunci admin. */
export async function absen(aksi: "masuk" | "pulang"): Promise<Result> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Silakan masuk lagi" };
  const ip = clientIp(await headers());
  const admin = createAdminClient();
  const { data: wifi } = await admin.from("absen_wifi").select("ip");
  if (!wifi?.length) return { ok: false, error: "WiFi toko belum didaftarkan. Hubungi manajer." };
  if (!wifi.some((w) => w.ip === ip)) return { ok: false, error: "Absen hanya bisa dari WiFi toko. Sambungkan HP ke WiFi toko, matikan data seluler, lalu coba lagi." };
  const { data, error } = await admin.rpc("absen_catat", { p_profile: user.id, p_aksi: aksi });
  if (error) return { ok: false, error: error.message };
  return { ok: true, ...(data as { in_at: string; out_at: string | null; late_min: number }) };
}

/** Manajer: daftarkan sambungan yang sedang dipakai sebagai WiFi toko. */
export async function daftarkanWifi(label: string): Promise<{ ok: boolean; error?: string; ip?: string }> {
  const supabase = await createClient();
  if ((await supabase.rpc("auth_role")).data !== "manager") return { ok: false, error: "Akses ditolak" };
  const ip = clientIp(await headers());
  if (!ip) return { ok: false, error: "IP tidak terbaca" };
  const { error } = await supabase.from("absen_wifi").upsert({ ip, label: label.trim().slice(0, 60) });
  return error ? { ok: false, error: error.message } : { ok: true, ip };
}
