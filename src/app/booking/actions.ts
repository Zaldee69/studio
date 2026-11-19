"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { COMING_SOON } from "@/lib/domain/category";
import { log } from "@/lib/log";
import { verifyTurnstile } from "@/lib/turnstile";
import type { OnlineCat } from "@/lib/domain/category";

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
  voucher_code: z.string().trim().max(20).optional(),
  upsell_ids: z.array(z.guid()).max(10).optional(),
  upsell_offered: z.boolean().optional(),
});

export type BookedAppt = { id: string; category: OnlineCat; start_at: string; status: string; staff_name: string | null };
export type BookResult =
  | { ok: true; code: string; group_id: string; status: string; duplicate?: boolean; appointments: BookedAppt[] }
  | { ok: false; code: string; message: string };

/**
 * Booking online: tamu wajib persetujuan privasi + captcha (bila TURNSTILE_SECRET_KEY diisi).
 * Identitas pelanggan diambil dari sesi di server — tidak pernah dari klien. RPC book_online hanya bisa dipanggil server.
 */
export type VoucherPreview = { ok: true; code: string; label: string; discount: number; days?: string | null } | { ok: false; message: string };

/** Cek kode voucher untuk layanan & tanggal jadwal yang dipilih (sebelum booking). Dibatasi per IP di database. */
export async function previewVoucher(code: string, serviceIds: string[], date: string): Promise<VoucherPreview> {
  const r = z.object({ code: z.string().trim().min(1).max(20), ids: z.array(z.guid()).min(1).max(10), date: z.iso.date() })
    .safeParse({ code, ids: serviceIds, date });
  if (!r.success) return { ok: false, message: "Isi kode voucher" };
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "";
  const { data, error } = await createAdminClient().rpc("voucher_preview", { p_code: r.data.code, p_service_ids: r.data.ids, p_ip: ip, p_date: r.data.date });
  if (error) { log("error", "voucher_preview_failed", { error: error.message }); return { ok: false, message: "Gagal mengecek voucher. Coba lagi." }; }
  return data as unknown as VoucherPreview;
}

export async function bookOnline(raw: unknown): Promise<BookResult> {
  const r = Input.safeParse(raw);
  if (!r.success) {
    log("warn", "booking_invalid_input", { issue: r.error.issues[0]?.path.join(".") });
    return { ok: false, code: "invalid", message: "Data booking tidak valid." };
  }
  const { captcha_token, consent, upsell_ids, upsell_offered, ...v } = r.data;
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
  else if (res.ok && !res.duplicate && !v.reschedule_group && (upsell_offered || upsell_ids?.length)) {
    // tawaran tambahan di langkah pilih layanan: catat sudah ditawari + layanan yang diambil (hanya pasangan upsell yang sah)
    try {
      const { data: sv } = await admin.from("services").select("id, upsell_service_id").in("id", v.service_ids);
      const targets = new Set((sv ?? []).map((x) => x.upsell_service_id).filter(Boolean));
      const valid = (upsell_ids ?? []).filter((id) => targets.has(id) && v.service_ids.includes(id));
      const apptIds = res.appointments.map((a) => a.id);
      if (valid.length) await admin.from("appointment_services").update({ from_upsell: true, upsell_source: "online" }).in("appointment_id", apptIds).in("service_id", valid);
      await admin.from("appointments").update({ upsell_offered: true }).in("id", apptIds);
    } catch (e) { log("warn", "upsell_mark_failed", { error: e instanceof Error ? e.message : String(e) }); }
  }
  if (res.ok && !res.duplicate) log("info", "booking_created", { group: res.group_id, status: res.status, guest: !user, reschedule: !!v.reschedule_group });
  return res;
}
