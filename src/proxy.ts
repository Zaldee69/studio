import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { log } from "@/lib/log";
import { areaRole, homeFor } from "@/lib/roles";
import type { Database } from "@/lib/supabase/database.types";
import { STATION_ACTIVE, STATION_COOKIE, STATION_IDLE_S } from "@/features/stasiun/constants";

// Refresh sesi Supabase + redirect per peran. Otorisasi data yang sebenarnya = RLS + requireRole() di layout.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  // getClaims(): refresh token bila perlu (cookie baru ditulis via setAll) lalu verifikasi JWT secara lokal (JWKS, ES256)
  // — tanpa request ke server Auth di tiap navigasi seperti getUser().
  const { data: jwt, error: authErr } = await supabase.auth.getClaims();
  const user = jwt?.claims.sub ? { id: jwt.claims.sub } : null;
  const path = request.nextUrl.pathname;
  // Sesi dicabut / refresh token ditolak = pengguna "logout sendiri" — catat agar bisa ditelusuri.
  if (authErr && authErr.name !== "AuthSessionMissingError") log("warn", "session_invalid", { path, code: authErr.code ?? authErr.name, error: authErr.message });
  const area = areaRole(path);
  if (!area && path !== "/login") return response;

  const go = (to: string) => {
    const r = NextResponse.redirect(new URL(to, request.url));
    response.cookies.getAll().forEach((c) => r.cookies.set(c));
    return r;
  };

  if (!user) return area && area !== "customer" ? go("/login") : response;

  // Tablet stasiun: sesi kapster hanya hidup 5 menit sejak aktivitas terakhir.
  if (area === "staff" && request.cookies.get(STATION_COOKIE)) {
    if (!request.cookies.get(STATION_ACTIVE)) {
      await supabase.auth.signOut();
      return go("/stasiun");
    }
    response.cookies.set(STATION_ACTIVE, "1", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: STATION_IDLE_S });
  }

  const { data: p } = await supabase.from("profiles").select("role, active, mfa_enabled").eq("id", user.id).single();
  if (!p) return response;
  if (!p.active) return path === "/login" ? response : go("/login?status=pending");
  // Punya verifikasi 2 langkah tapi baru masuk dengan sandi → RLS belum mengenali perannya; minta kode dulu.
  // aal dari klaim JWT terverifikasi (getClaims), bukan getAuthenticatorAssuranceLevel() yang membaca cookie.
  if (p.mfa_enabled && jwt?.claims.aal !== "aal2") return path === "/login" ? response : go("/login?mfa=1");
  if (path === "/login") return p.role === "customer" ? go("/akun") : go(homeFor(p.role));
  if (area !== p.role) return go(homeFor(p.role));
  return response;
}

// Semua halaman (bukan hanya area tim): token yang kedaluwarsa harus di-refresh DI SINI, karena hanya proxy yang bisa
// menulis cookie. Bila halaman lain (mis. /booking) yang me-refresh dari Server Component, token baru hilang, token
// lama terdeteksi dipakai ulang (refresh token rotation) → seluruh sesi dicabut = "logout sendiri".
export const config = {
  matcher: ["/((?!_next/static|_next/image|api/|icons/|sw\\.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest|txt|xml)$).*)"],
};
