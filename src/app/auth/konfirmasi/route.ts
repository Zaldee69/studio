import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { log } from "@/lib/log";
import { homeFor } from "@/lib/roles";
import type { Database } from "@/lib/supabase/database.types";

// Tautan konfirmasi email pendaftaran → tukar kode (PKCE) jadi sesi → beranda sesuai peran.
// Dibuka di perangkat/browser lain (tanpa code verifier) atau kedaluwarsa → ke halaman masuk dengan pesan.
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const code = url.searchParams.get("code");
  const fallback = url.searchParams.get("untuk") === "tim" ? "/login?status=terkonfirmasi" : "/akun?konfirmasi=1";
  // Cookie sesi ditulis langsung ke respons redirect (cookies() dari next/headers tidak ikut ke NextResponse.redirect).
  const jar: { name: string; value: string; options: CookieOptions }[] = [];
  const supabase = createServerClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: { getAll: () => req.cookies.getAll(), setAll: (list) => { jar.push(...list); } },
  });
  let to = fallback;
  if (!code) log("warn", "email_confirm_failed", { reason: url.searchParams.get("error_code") ?? "no_code" });
  else {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) log("warn", "email_confirm_failed", { reason: error.code ?? error.message });
    else {
      const { data: p } = await supabase.from("profiles").select("role, active").eq("id", data.user.id).single();
      to = !p ? "/" : !p.active ? "/login?status=pending" : homeFor(p.role);
    }
  }
  // Location relatif: tetap di host yang sama dengan cookie (nextUrl bisa menormalkan 127.0.0.1 → localhost / host internal proxy).
  const res = new NextResponse(null, { status: 303, headers: { Location: to } });
  jar.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
  return res;
}
