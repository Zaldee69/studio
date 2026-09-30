import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Groom & Bloom",
    short_name: "Groom & Bloom",
    start_url: "/login",
    display: "standalone",
    background_color: "#0E0D0C",
    theme_color: "#0E0D0C",
    // ponytail: ikon placeholder SVG; ganti dengan PNG 192/512 dari desainer
    icons: [{ src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
