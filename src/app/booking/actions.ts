"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { COMING_SOON } from "@/lib/domain/category";
import { log } from "@/lib/log";
import { verifyTurnstile } from "@/lib/turnstile";

// z.guid(): format uuid saja — id seed (0000…-0001-…) bukan RFC v4 tapi sah di Postgres
const Input = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  service_ids: z.array(z.guid()).min(1).max(10),
  staff_pick: z.record(z.string(), z.guid()).default({}),
  together: z.boolean(),
  name: z.string().max(80).optional(),
  whatsapp: z.string().max(30).optional(),
  notes: z.string().max(500).optional(),
  client_request_id: z.string().min(8).max(64),
  captcha_token: z.string().max(4096).optional(),
  consent: z.boolean().optional(),
  reschedule_group: z.guid().optional(),
});

export type BookedAppt = { id: string; category: "barbershop" | "nail"; start_at: string; status: string; staff_name: string | null };
export type BookResult =
  | { ok: true; code: string; group_id: string; status: string; duplicate?: boolean; appointments: BookedAppt[] }
  | { ok: false; code: string; message: string };

/**
 * Booking online: tamu wajib persetujuan privasi + captcha (bila TURNSTILE_SECRET_KEY diisi).
 * Identitas pelanggan diambil dari sesi di server — tidak pernah dari klien. RPC book_online hanya bisa dipanggil server.
 */
export async function bookOnline(raw: unknown): Promise<BookResult> {
  const r = Input.safeParse(raw);
  if (!r.success) {
    log("warn", "booking_invalid_input", { issue: r.error.issues[0]?.path.join(".") });
    return { ok: false, code: "invalid", message: "Data booking tidak valid." };
  }
  const { captcha_token, consent, ...v } = r.data;
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "";
  const { data: jwt } = await (await createClient()).auth.getClaims();
  const user = jwt?.claims.sub ? { id: jwt.claims.sub } : null;
  if (!user) {
    if (!consent) return { ok: false, code: "consent", message: "Setujui kebijakan privasi untuk lanjut sebagai tamu." };
    if (!(await verifyTurnstile(captcha_token, ip))) {
      log("warn", "booking_captcha_failed", { ip });
      return { ok: false, code: "captcha", message: "Verifikasi keamanan gagal. Muat ulang lalu coba lagi." };
    }
  }
  const admin = createAdminClient();
  // lini "Segera hadir" tidak dibuka untuk booking online walau ada staf & meja (mis. tautan lama / panggilan langsung)
  const { data: cats } = await admin.from("services").select("category").in("id", v.service_ids);
  if ((cats ?? []).some((c) => COMING_SOON.includes(c.category))) {
    return { ok: false, code: "services", message: "Layanan ini belum dibuka untuk reservasi online." };
  }
  const { data, error } = await admin.rpc("book_online", { p: { ...v, actor: user?.id ?? null, ip } });
  if (error) {
    log("error", "booking_rpc_failed", { db_code: error.code, error: error.message, user: user?.id ?? null });
    return { ok: false, code: "error", message: "Gagal menyimpan booking. Coba lagi." };
  }
  const res = data as unknown as BookResult;
  if (!res.ok && res.message === "Tim memakai jadwal admin") {
    return { ok: false, code: "team", message: "Akun tim tidak bisa booking dari halaman pelanggan. Buat booking lewat menu Jadwal, atau keluar dulu untuk booking sebagai pelanggan." };
  }
  // slot_taken / penuh = wajar; batas percobaan & batas booking aktif = sinyal penyalahgunaan
  if (!res.ok && (res.code === "rate" || res.code === "limit")) log("warn", "booking_blocked", { reason: res.code, ip, user: user?.id ?? null });
  else if (res.ok && !res.duplicate) log("info", "booking_created", { group: res.group_id, status: res.status, guest: !user, reschedule: !!v.reschedule_group });
  return res;
}
