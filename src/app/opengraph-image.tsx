import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { loadSite } from "@/lib/public-site";
import { BRAND, BRAND_LINES } from "@/lib/brand";

export const alt = `${BRAND} — Barbershop, Nail Art & Lashes`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 3600;

// font logo (OFL); Satori hanya membawa sans bawaan, jadi serif logo dimuat dari file
const cormorant = readFile(join(process.cwd(), "assets/CormorantGaramond-Bold.ttf"));

/** Gambar share (OpenGraph): nama studio + ikon logo "Pintu Studio", palet monokrom halaman publik. */
export default async function OG() {
  const { s } = await loadSite();
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: "90px 420px 90px 90px", background: "#FFFFFF", color: "#0D0D0D" }}>
        <div style={{ display: "flex", fontSize: 26, letterSpacing: 8, color: "#0D0D0D", textTransform: "uppercase" }}>{BRAND_LINES}</div>
        <div style={{ display: "flex", fontSize: 112, marginTop: 20, fontFamily: "Cormorant" }}>{s.shop_name}</div>
        <div style={{ display: "flex", fontSize: 44, marginTop: 18, color: "#0D0D0D", fontStyle: "italic" }}>{`${s.hero_title} ${s.hero_title_accent}`}</div>
        <div style={{ display: "flex", fontSize: 28, marginTop: 36, color: "#404040" }}>{s.shop_address || s.tagline}</div>
        {/* ikon logo "Pintu Studio" (geometri = LogoMark); DP sebagai teks HTML karena Satori tidak merender <text> di SVG */}
        <svg width="260" height="312" viewBox="0 0 200 240" style={{ position: "absolute", right: 90, top: 159 }}>
          <path d="M24 214 V100 A76 76 0 0 1 176 100 V214" fill="none" stroke="#0D0D0D" strokeWidth="5" />
          <path d="M34 214 V100 A66 66 0 0 1 166 100 V214" fill="none" stroke="#0D0D0D" strokeWidth="2" />
          <path d="M10 216.5 H190" fill="none" stroke="#0D0D0D" strokeWidth="5" />
          <path d="M100 89 l6 8 l-6 8 l-6 -8 z" fill="#0D0D0D" />
        </svg>
        <div style={{ position: "absolute", right: 90, top: 307, width: 260, display: "flex", justifyContent: "center", fontSize: 90, fontFamily: "Cormorant", letterSpacing: 1 }}>DP</div>
      </div>
    ),
    { ...size, fonts: [{ name: "Cormorant", data: await cormorant, weight: 700, style: "normal" }] },
  );
}
