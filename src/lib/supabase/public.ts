import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/** Klien anon tanpa cookie — untuk halaman publik yang di-cache (ISR). Hanya membaca view/tabel publik. */
export function createPublicClient() {
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Tanpa NEXT_PUBLIC_SITE_URL di Vercel → domain produksi proyek (bukan localhost: canonical/sitemap salah = SEO rusak).
const vercelProd = process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL;
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || (vercelProd ? `https://${vercelProd}` : "http://localhost:3000")).replace(/\/$/, "");
