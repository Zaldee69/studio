import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/supabase/public";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE_URL}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/booking`, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/kebijakan-privasi`, changeFrequency: "yearly", priority: 0.2 },
  ];
}
