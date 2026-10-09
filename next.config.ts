import type { NextConfig } from "next";

const supabase = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321");
const local = ["127.0.0.1", "localhost"].includes(supabase.hostname);

const nextConfig: NextConfig = {
  // dev/build terhadap Supabase produksi (npm run dev:prod) memakai folder sendiri — cache lokal & produksi tidak tercampur
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Browser selalu meminta /favicon.ico; arahkan ke ikon SVG di app/icon.svg.
  async redirects() {
    return [{ source: "/favicon.ico", destination: "/icon.svg", permanent: true }];
  },
  images: {
    formats: ["image/avif", "image/webp"],
    qualities: [75, 90], // 90: foto besar halaman publik (hero, kartu layanan)
    remotePatterns: [{
      protocol: supabase.protocol.replace(":", "") as "http" | "https", hostname: supabase.hostname,
      port: supabase.port, pathname: "/storage/v1/object/public/**",
    }],
    // Supabase lokal ada di 127.0.0.1 — Next 16 memblokir optimasi IP lokal kecuali diizinkan (hanya dev).
    dangerouslyAllowLocalIP: local,
  },
};

export default nextConfig;
