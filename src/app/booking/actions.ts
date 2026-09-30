"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { createAdminClient, createClient } from "@/lib/supabase/server";
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
  if (!r.success) return { ok: false, code: "invalid", message: "Data booking tidak valid." };
  const { captcha_token, consent, ...v } = r.data;
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "";
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user) {
    if (!consent) return { ok: false, code: "consent", message: "Setujui kebijakan privasi untuk lanjut sebagai tamu." };
    if (!(await verifyTurnstile(captcha_token, ip))) return { ok: false, code: "captcha", message: "Verifikasi keamanan gagal. Muat ulang lalu coba lagi." };
  }
  const { data, error } = await createAdminClient().rpc("book_online", { p: { ...v, actor: user?.id ?? null, ip } });
  if (error) return { ok: false, code: "error", message: "Gagal menyimpan booking. Coba lagi." };
  return data as unknown as BookResult;
}
