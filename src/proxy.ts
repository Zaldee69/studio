import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
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

  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
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

  const { data: p } = await supabase.from("profiles").select("role, active").eq("id", user.id).single();
  if (!p) return response;
  if (!p.active) return path === "/login" ? response : go("/login?status=pending");
  if (path === "/login") return p.role === "customer" ? go("/akun") : go(homeFor(p.role));
  if (area !== p.role) return go(homeFor(p.role));
  return response;
}

export const config = {
  matcher: ["/login", "/manajer/:path*", "/kasir/:path*", "/kapster/:path*", "/akun/:path*"],
};
