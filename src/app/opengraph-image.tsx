import { ImageResponse } from "next/og";
import { loadSite } from "@/lib/public-site";
import { BRAND, BRAND_LINES } from "@/lib/brand";

export const alt = `${BRAND} — Barbershop, Nail Art & Lashes`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 3600;

/** Gambar share (OpenGraph) bergaya landing: warm minimalism — beige, charcoal, aksen sage & dusty rose. */
export default async function OG() {
  const { s } = await loadSite();
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 90, background: "#FFFFFF", color: "#0D0D0D", fontFamily: "Georgia, serif" }}>
        <div style={{ display: "flex", fontSize: 26, letterSpacing: 8, color: "#0D0D0D", textTransform: "uppercase" }}>{BRAND_LINES}</div>
        <div style={{ display: "flex", fontSize: 110, marginTop: 24 }}>{s.shop_name}</div>
        <div style={{ display: "flex", fontSize: 44, marginTop: 18, color: "#0D0D0D", fontStyle: "italic" }}>{`${s.hero_title} ${s.hero_title_accent}`}</div>
        <div style={{ display: "flex", fontSize: 28, marginTop: 36, color: "#404040" }}>{s.shop_address || s.tagline}</div>
        <div style={{ position: "absolute", right: 70, top: 70, width: 150, height: 150, borderRadius: 999, background: "#DEE3E7", display: "flex" }} />
        <div style={{ position: "absolute", right: 90, top: 90, width: 180, height: 240, borderRadius: "999px 999px 0 0", border: "2px solid #0D0D0D", background: "#F2F2F2", display: "flex" }} />
        <div style={{ position: "absolute", right: 230, top: 280, width: 70, height: 70, borderRadius: 999, background: "#A4ADBA", display: "flex" }} />
      </div>
    ),
    size,
  );
}
