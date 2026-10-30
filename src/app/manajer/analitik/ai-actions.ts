"use server";

import Anthropic from "@anthropic-ai/sdk";
import { loadAnalytics } from "@/features/analitik/load";
import { analitikAnswer } from "@/lib/ai/analitik";
import { getProfile } from "@/lib/auth";
import { log } from "@/lib/log";
import { createAdminClient, createClient } from "@/lib/supabase/server";

export type AiResult = { ok: true; text: string; left: number } | { ok: false; error: string };
type Period = { periode?: string; dari?: string; sampai?: string; kategori?: string; staf?: string };
// ponytail: batas dihitung di booking_attempts (tabel rate-limit yang sudah ada), 24 jam bergulir per manajer
const LIMIT = Number(process.env.AI_ANALITIK_DAILY_LIMIT) || 20;

/** question null = "Jelaskan periode ini". Data dimuat ulang di server dari periode yang sama, tidak dipercaya dari klien. */
export async function analitikAi(p: Period, question: string | null): Promise<AiResult> {
  const me = await getProfile();
  if (me?.role !== "manager" || !me.active) return { ok: false, error: "Akses ditolak." };
  if (!process.env.ANTHROPIC_API_KEY) return { ok: false, error: "Asisten AI belum aktif (ANTHROPIC_API_KEY belum diisi di server)." };
  const q = question === null ? null : question.trim().slice(0, 500);
  if (q === "") return { ok: false, error: "Tulis pertanyaannya dulu." };

  const admin = createAdminClient(), key = `ai-analitik:${me.id}`;
  const { count } = await admin.from("booking_attempts").select("id", { count: "exact", head: true })
    .eq("key", key).gte("created_at", new Date(Date.now() - 86_400_000).toISOString());
  const used = count ?? 0;
  if (used >= LIMIT) return { ok: false, error: `Batas ${LIMIT} permintaan AI per 24 jam sudah tercapai. Coba lagi besok.` };
  await admin.from("booking_attempts").insert({ key });

  const analitik = { ...(await loadAnalytics(p)), staffList: undefined }; // daftar staf tidak perlu dikirim ke AI
  const { data: campaign } = await (await createClient()).rpc("campaign_report", { p_from: analitik.from, p_to: analitik.to });
  try {
    const text = await analitikAnswer(new Anthropic(), { analitik, campaign }, q);
    return { ok: true, text, left: LIMIT - used - 1 };
  } catch (e) {
    const reason = e instanceof Anthropic.RateLimitError ? "batas pemakaian API tercapai"
      : e instanceof Anthropic.AuthenticationError ? "kunci API tidak valid"
      : e instanceof Anthropic.APIError ? `API error ${e.status}` : (e as Error).message;
    log("error", "ai_analitik_failed", { reason });
    return { ok: false, error: `AI gagal menjawab: ${reason}.` };
  }
}
