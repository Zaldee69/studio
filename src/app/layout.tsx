import type { Metadata, Viewport } from "next";
import { ConfirmProvider } from "@/components/alert-dialog";
import { Bricolage_Grotesque, Cormorant_Garamond, Manrope, Plus_Jakarta_Sans } from "next/font/google";
import { SITE_URL } from "@/lib/supabase/public";
import "./globals.css";
import { BRAND } from "@/lib/brand";

// ponytail: font aplikasi tim tidak di-preload — halaman publik (Cormorant + Manrope) tidak ikut mengunduhnya lebih dulu
const bricolage = Bricolage_Grotesque({ variable: "--font-bricolage", subsets: ["latin"], preload: false });
const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"], preload: false });
const cormorant = Cormorant_Garamond({ variable: "--font-cormorant", subsets: ["latin"], weight: ["400", "500", "600"] });
// teks publik: Manrope (dokumen brand). Kelas `font-jost` dipertahankan agar halaman publik tidak perlu diubah.
const manrope = Manrope({ variable: "--font-jost-v", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: BRAND, template: `%s · ${BRAND}` },
  description: "For Every You. Barbershop, nail art, dan lashes dalam satu studio — harga jelas, proses nyaman, reservasi online.",
  openGraph: { siteName: BRAND, locale: "id_ID", type: "website" },
  appleWebApp: { capable: true, title: BRAND },
};

export const viewport: Viewport = { themeColor: "#242923" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id" className={`${bricolage.variable} ${jakarta.variable} ${cormorant.variable} ${manrope.variable} h-full antialiased`}>
      {/* ekstensi browser (mis. ColorZilla: cz-shortcut-listen) menambah atribut di <body> → bukan mismatch dari kode kita */}
      <body className="min-h-full" suppressHydrationWarning><ConfirmProvider>{children}</ConfirmProvider></body>
    </html>
  );
}
