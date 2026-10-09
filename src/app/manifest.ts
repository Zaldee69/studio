import type { MetadataRoute } from "next";
import { BRAND } from "@/lib/brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND,
    short_name: BRAND,
    start_url: "/login",
    display: "standalone",
    background_color: "#F7F2EA",
    theme_color: "#242923",
    // ponytail: ikon placeholder SVG; ganti dengan PNG 192/512 dari desainer
    icons: [{ src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
