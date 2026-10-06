import { ImageResponse } from "next/og";
import { loadSite } from "@/lib/public-site";
import { BRAND } from "@/lib/brand";

export const alt = `${BRAND} — Barbershop & Nail Spa`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 3600;

/** Gambar share (OpenGraph) bergaya landing: gelap, emas, serif. */
export default async function OG() {
  const { s } = await loadSite();
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 90, background: "#0E0D0C", color: "#F2EDE4", fontFamily: "Georgia, serif" }}>
        <div style={{ display: "flex", fontSize: 26, letterSpacing: 8, color: "#C9A45C", textTransform: "uppercase" }}>Barbershop · Nail Spa</div>
        <div style={{ display: "flex", fontSize: 110, marginTop: 24 }}>{s.shop_name}</div>
        <div style={{ display: "flex", fontSize: 44, marginTop: 18, color: "#C9A45C", fontStyle: "italic" }}>{`${s.hero_title} ${s.hero_title_accent}`}</div>
        <div style={{ display: "flex", fontSize: 28, marginTop: 36, color: "#CFC7BA" }}>{s.shop_address || s.tagline}</div>
        <div style={{ position: "absolute", right: 90, top: 90, width: 180, height: 240, borderRadius: "999px 999px 0 0", border: "2px solid #C9A45C", display: "flex" }} />
      </div>
    ),
    size,
  );
}
