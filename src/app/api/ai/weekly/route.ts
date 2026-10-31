import Anthropic from "@anthropic-ai/sdk";
import { pushSecretOk } from "@/lib/push-secret";
import { telegramBody, writeWeeklyMeeting } from "@/lib/ai/weekly";
import { log } from "@/lib/log";
import { createAdminClient } from "@/lib/supabase/server";

// Dipanggil pg_cron (kick_ai_weekly) setiap Senin 08.20 WIB. Hasilnya masuk antrean Telegram owner yang sama
// dengan notifikasi lain (dikirim /api/notifications/dispatch).
export const maxDuration = 300; // 3 langkah AI berurutan (2 putaran + GM); butuh Fluid Compute (bawaan project Vercel baru)
export async function POST(req: Request) {
  if (!pushSecretOk(req.headers.get("x-push-secret"))) {
    log("warn", "ai_weekly_unauthorized");
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    log("warn", "ai_weekly_skipped", { reason: "ANTHROPIC_API_KEY kosong" });
    return Response.json({ skipped: "ANTHROPIC_API_KEY belum diisi" }, { status: 503 });
  }
  const db = createAdminClient();
  const { data: facts, error } = await db.rpc("ai_weekly_facts");
  if (error || !facts) {
    log("error", "ai_weekly_facts_failed", { error: error?.message });
    return Response.json({ error: "facts" }, { status: 500 });
  }
  const { minggu = "", dari } = facts as { minggu?: string; dari?: string };
  let body: string;
  try {
    const notes = await writeWeeklyMeeting(new Anthropic(), facts);
    body = telegramBody(minggu, notes);
    // disimpan agar rapat Senin depan dibuka dengan rapor tindakan minggu ini
    const { error: mErr } = await db.from("ai_meetings").upsert({ week: dari!, notes });
    if (mErr) log("error", "ai_weekly_save_failed", { error: mErr.message });
  } catch (e) {
    const reason = e instanceof Anthropic.RateLimitError ? "batas pemakaian API tercapai"
      : e instanceof Anthropic.AuthenticationError ? "kunci API tidak valid"
      : e instanceof Anthropic.APIError ? `API error ${e.status} (${e.message.slice(0, 200)})`
      : (e as Error).message;
    log("error", "ai_weekly_failed", { reason });
    // owner tetap tahu analisis minggu ini tidak terkirim (ringkasan angka biasa tetap jalan 08.05)
    body = `🤖 Rapat mingguan AI minggu ${minggu} gagal dibuat: ${reason}. Ringkasan angka mingguan tetap terkirim seperti biasa.`;
  }
  const { error: qErr } = await db.from("outbound_messages").insert({ channel: "telegram", to_address: "ops", template: "alert", body });
  if (qErr) {
    log("error", "ai_weekly_enqueue_failed", { error: qErr.message });
    return Response.json({ error: "enqueue" }, { status: 500 });
  }
  log("info", "ai_weekly_sent", { minggu });
  return Response.json({ ok: true });
}
