import type { Metadata, Viewport } from "next";
import { ConfirmProvider } from "@/components/alert-dialog";
import { Bricolage_Grotesque, Cormorant_Garamond, Jost, Plus_Jakarta_Sans } from "next/font/google";
import { SITE_URL } from "@/lib/supabase/public";
import "./globals.css";
import { BRAND } from "@/lib/brand";

// ponytail: font aplikasi tim tidak di-preload — halaman publik (Cormorant + Jost) tidak ikut mengunduhnya lebih dulu
const bricolage = Bricolage_Grotesque({ variable: "--font-bricolage", subsets: ["latin"], preload: false });
const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"], preload: false });
const cormorant = Cormorant_Garamond({ variable: "--font-cormorant", subsets: ["latin"], weight: ["400", "500", "600"] });
const jost = Jost({ variable: "--font-jost-v", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: BRAND, template: `%s · ${BRAND}` },
  description: "Barbershop & nail spa dalam satu atap — reservasi online, datang berdua dilayani bersamaan.",
  openGraph: { siteName: BRAND, locale: "id_ID", type: "website" },
  appleWebApp: { capable: true, title: BRAND },
};

export const viewport: Viewport = { themeColor: "#0E0D0C" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id" className={`${bricolage.variable} ${jakarta.variable} ${cormorant.variable} ${jost.variable} h-full antialiased`}>
      <body className="min-h-full"><ConfirmProvider>{children}</ConfirmProvider></body>
    </html>
  );
}
