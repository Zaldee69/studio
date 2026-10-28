"use client";

// Analitik ringan tanpa cookie: id sesi acak di sessionStorage, satu event per langkah per sesi.
type Step = "landing" | "booking_open" | "service" | "time" | "booked";

function sessionId() {
  try {
    let id = sessionStorage.getItem("gb-funnel");
    if (!id) { id = crypto.randomUUID(); sessionStorage.setItem("gb-funnel", id); }
    return id;
  } catch { return null; }
}

const ALIAS: Record<string, string> = { ig: "instagram", instagram: "instagram", maps: "google_maps", gmaps: "google_maps", google_maps: "google_maps",
  wa: "whatsapp", whatsapp: "whatsapp", fb: "facebook", facebook: "facebook", tiktok: "tiktok" };

/**
 * Dari mana pengunjung datang: ?src= / ?utm_source= pada tautan kita (bio IG ?src=ig, Google Maps ?src=maps, blast WA ?src=wa),
 * atau domain perujuk. Tanpa keduanya = "langsung" (ketik alamat / tautan tanpa jejak).
 */
export function landingSource(search: string, referrer: string, ownHost = typeof location === "undefined" ? "" : location.hostname): string {
  const q = new URLSearchParams(search), raw = (q.get("src") ?? q.get("utm_source") ?? "").toLowerCase().trim();
  if (raw) return ALIAS[raw] ?? (raw.replace(/[^a-z_]/g, "").slice(0, 20) || "lainnya");
  let host = "";
  try { host = referrer ? new URL(referrer).hostname : ""; } catch { /* perujuk rusak */ }
  if (!host) return "langsung";
  if (/(^|\.)instagram\.com$/.test(host)) return "instagram";
  if (/(^|\.)(facebook\.com|fb\.com)$/.test(host)) return "facebook";
  if (/(^|\.)tiktok\.com$/.test(host)) return "tiktok";
  if (/(^|\.)(wa\.me|whatsapp\.com)$/.test(host)) return "whatsapp";
  if (/(^|\.)google\.[a-z.]+$/.test(host)) return "google"; // pencarian & Maps sama-sama google.* — pakai ?src=maps di Google Business
  return ownHost === host ? "langsung" : "lainnya";
}

export function track(step: Step) {
  const id = sessionId();
  if (!id) return;
  const source = step === "landing" ? landingSource(location.search, document.referrer) : null;
  // fetch biasa (anon), bukan supabase-js — landing tidak perlu memuat ~250 KB klien hanya untuk satu event
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
  fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/track_funnel`, {
    method: "POST", keepalive: true,
    headers: { "Content-Type": "application/json", apikey: key },
    body: JSON.stringify({ p_session: id, p_step: step, p_source: source }),
  }).catch(() => {});
}
