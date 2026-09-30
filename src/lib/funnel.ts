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

export function track(step: Step) {
  const id = sessionId();
  if (!id) return;
  // fetch biasa (anon), bukan supabase-js — landing tidak perlu memuat ~250 KB klien hanya untuk satu event
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
  fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/track_funnel`, {
    method: "POST", keepalive: true,
    headers: { "Content-Type": "application/json", apikey: key },
    body: JSON.stringify({ p_session: id, p_step: step }),
  }).catch(() => {});
}
