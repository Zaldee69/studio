import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/supabase/public";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE_URL}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/booking`, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/karir`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${SITE_URL}/daftar-tunggu`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/kebijakan-privasi`, changeFrequency: "yearly", priority: 0.2 },
  ];
}
