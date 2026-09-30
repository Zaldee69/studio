import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/** Klien anon tanpa cookie — untuk halaman publik yang di-cache (ISR). Hanya membaca view/tabel publik. */
export function createPublicClient() {
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
