"use server";

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { log } from "@/lib/log";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { STATION_ACTIVE, STATION_COOKIE, STATION_IDLE_S } from "./constants";

// Mode stasiun: tablet bersama didaftarkan manajer (cookie perangkat acak, hanya hash-nya disimpan di DB).
// Kapster masuk dengan PIN → server menukar PIN dengan sesi Supabase akun kapster itu.
const secure = process.env.NODE_ENV === "production";
const IDLE_S = STATION_IDLE_S;
const hashToken = async (t: string) => createHash("sha256").update(t).digest("hex");

export type StationState = { error?: string; ok?: string } | undefined;

/** Manajer: daftarkan browser ini sebagai perangkat stasiun. */
export async function registerStation(_: StationState, fd: FormData): Promise<StationState> {
  const me = await getProfile();
  if (me?.role !== "manager" || !me.active) return { error: "Akses ditolak." };
  const token = randomBytes(32).toString("base64url");
  const { error } = await (await createClient()).rpc("register_station", { p_name: String(fd.get("name") ?? ""), p_token_hash: await hashToken(token) });
  if (error) return { error: error.message };
  (await cookies()).set(STATION_COOKIE, token, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 400 * 24 * 3600 });
  return { ok: "Perangkat ini terdaftar sebagai stasiun. Keluar, lalu buka /stasiun." };
}

export async function stationStaff() {
  const token = (await cookies()).get(STATION_COOKIE)?.value;
  if (!token) return null;
  const { data, error } = await createAdminClient().rpc("station_staff", { p_token_hash: await hashToken(token) });
  return error ? null : data ?? [];
}

export async function stationLogin(_: StationState, fd: FormData): Promise<StationState> {
  const store = await cookies();
  const token = store.get(STATION_COOKIE)?.value;
  if (!token) return { error: "Perangkat ini belum terdaftar sebagai stasiun." };
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("verify_staff_pin", {
    p_token_hash: await hashToken(token), p_staff_id: String(fd.get("staff_id")), p_pin: String(fd.get("pin") ?? ""),
  });
  if (error) return { error: "Gagal memeriksa PIN." };
  const r = data as { ok: boolean; reason?: string; email?: string; left?: number; locked_until?: string };
  if (!r.ok) {
    log("warn", "station_login_denied", { staff: String(fd.get("staff_id")), reason: r.reason ?? "unknown" });
    return { error: r.reason === "locked" ? "Terlalu banyak PIN salah. Coba lagi 5 menit lagi."
      : r.reason === "wrong" ? `PIN salah. Sisa ${r.left} percobaan.`
      : r.reason === "no_pin" ? "PIN belum diatur. Minta manajer mengatur PIN di Pengaturan."
      : r.reason === "device" ? "Perangkat stasiun tidak aktif." : "Akun kapster belum siap." };
  }
  // Tukar ke sesi tanpa kata sandi: magic link token (tidak dikirim ke email) → verifyOtp di server.
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: "magiclink", email: r.email! });
  if (linkErr || !link.properties?.hashed_token) return { error: "Gagal membuat sesi." };
  const supabase = await createClient();
  const { error: otpErr } = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (otpErr) return { error: "Gagal membuat sesi." };
  log("info", "station_login", { staff: String(fd.get("staff_id")) });
  store.set(STATION_ACTIVE, "1", { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: IDLE_S });
  redirect("/kapster");
}

/** Aktivitas di layar → perpanjang 5 menit. */
export async function stationPing() {
  const store = await cookies();
  if (store.get(STATION_COOKIE) && store.get(STATION_ACTIVE)) {
    store.set(STATION_ACTIVE, "1", { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: IDLE_S });
  }
}

export async function stationLogout() {
  const store = await cookies();
  await (await createClient()).auth.signOut();
  store.delete(STATION_ACTIVE);
  redirect("/stasiun");
}
