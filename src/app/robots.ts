import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/supabase/public";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/manajer", "/kasir", "/kapster", "/akun", "/stasiun", "/login", "/api"] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
