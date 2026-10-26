import type { MetadataRoute } from "next";
import { BRAND } from "@/lib/brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND,
    short_name: BRAND,
    start_url: "/login",
    display: "standalone",
    background_color: "#FFFFFF",
    theme_color: "#0D0D0D",
    // logo "Pintu Studio" (sumber: src/app/icon.svg)
    icons: [
      { src: "/icons/dpras-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/dpras-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
