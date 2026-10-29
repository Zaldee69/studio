"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/server";
import { log } from "@/lib/log";

export type WaitState = { ok?: string; error?: string } | undefined;

const Input = z.object({
  name: z.string().trim().min(2, "Nama wajib diisi").max(60),
  whatsapp: z.string().trim().min(8, "No. WhatsApp tidak valid").max(20),
  interests: z.array(z.enum(["nail", "lashes"])).min(1, "Pilih Nail Art atau Lashes"),
  source: z.string().regex(/^[a-z_]{1,20}$/).optional().catch(undefined),
});
// pesan dari join_waitlist() yang aman ditampilkan apa adanya
const KNOWN = ["Nama wajib diisi", "No. WhatsApp tidak valid", "Pilih Nail Art atau Lashes", "Terlalu banyak percobaan, coba lagi nanti"];

/** Daftar tunggu publik: RPC hanya bisa dipanggil server (service role); dibatasi per No. WA & IP di database. */
export async function joinWaitlist(_: WaitState, fd: FormData): Promise<WaitState> {
  if (fd.get("website")) return { ok: "Terima kasih, Kak." }; // honeypot: bot mengisi kolom tersembunyi
  const r = Input.safeParse({ name: fd.get("name"), whatsapp: fd.get("whatsapp"), interests: fd.getAll("interest"), source: fd.get("src") || undefined });
  if (!r.success) return { error: r.error.issues[0].message };
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "";
  const { error } = await createAdminClient().rpc("join_waitlist", { p: { ...r.data, ip } });
  if (error) {
    const known = KNOWN.find((m) => error.message.includes(m));
    if (!known) log("error", "waitlist_failed", { error: error.message });
    return { error: known ?? "Gagal mendaftar. Coba lagi sebentar lagi." };
  }
  const first = r.data.name.split(/\s+/)[0];
  return { ok: `Terima kasih, Kak ${first}. Kami akan mengabari Kakak lewat WhatsApp begitu ${r.data.interests.length > 1 ? "Nail Art & Lashes" : r.data.interests[0] === "nail" ? "Nail Art" : "Lashes"} dibuka.` };
}
