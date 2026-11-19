import { isLocalDb } from "@/lib/notifications/adapters";
import { readDeviceInfo } from "@/lib/notifications/wablas-status";
import { pushSecretOk } from "@/lib/push-secret";
import { log } from "@/lib/log";
import { createAdminClient } from "@/lib/supabase/server";

// Dipanggil pg_cron tiap 5 menit: cek sambungan perangkat Wablas, lalu DB yang memutuskan perlu tidaknya kabar ke owner (Telegram).
export const maxDuration = 30;
export async function POST(req: Request) {
  if (!pushSecretOk(req.headers.get("x-push-secret"))) return Response.json({ error: "unauthorized" }, { status: 401 });
  // DB lokal berbagi kredensial dengan prod: jangan memeriksa/mengabari dari sini (hindari kabar ganda ke owner)
  if (isLocalDb()) return Response.json({ skipped: "lokal" });
  const token = process.env.WABLAS_TOKEN, secret = process.env.WABLAS_SECRET_KEY;
  if (!token || !secret) return Response.json({ skipped: "wablas belum dikonfigurasi" });
  const base = (process.env.WABLAS_URL || "https://wablas.com").replace(/\/$/, "");
  let httpOk = false, body: unknown = null;
  try {
    const r = await fetch(`${base}/api/device/info?token=${encodeURIComponent(token)}`, {
      headers: { Authorization: `${token}.${secret}` }, signal: AbortSignal.timeout(10_000), cache: "no-store",
    });
    httpOk = r.ok; body = await r.json().catch(() => null);
  } catch (e) { log("warn", "wa_health_fetch_failed", { error: e instanceof Error ? e.message : String(e) }); }
  const h = readDeviceInfo(httpOk, body);
  const { error } = await createAdminClient().rpc("wa_health_record", { p_ok: h.ok, p_connected: h.connected, p_expired: h.expired ?? undefined, p_quota: h.quota ?? undefined, p_detail: h.detail });
  if (error) { log("error", "wa_health_record_failed", { error: error.message }); return Response.json({ error: "db" }, { status: 500 }); }
  if (h.ok && !h.connected) log("warn", "wa_disconnected", { detail: h.detail });
  return Response.json({ ok: h.ok, connected: h.connected });
}
