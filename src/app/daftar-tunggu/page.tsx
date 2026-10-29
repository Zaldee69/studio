import type { Metadata } from "next";
import { PublicFooter, PublicHeader } from "@/components/public-header";
import { WaitlistForm } from "./form";

export const metadata: Metadata = {
  title: "Daftar tunggu Nail Art & Lashes",
  description: "Nail Art & Lashes D'Pras Studio segera dibuka. Tinggalkan nomor WhatsApp, kami kabari lebih dulu.",
  alternates: { canonical: "/daftar-tunggu" },
};

export default async function DaftarTunggu({ searchParams }: PageProps<"/daftar-tunggu">) {
  const sp = await searchParams;
  const minat = sp.minat === "nail" || sp.minat === "lashes" ? sp.minat : null;
  const src = typeof sp.src === "string" && /^[a-z_]{1,20}$/.test(sp.src) ? sp.src : "";
  return (
    <div className="min-h-screen bg-lux font-jost text-cream">
      <PublicHeader />
      <main className="mx-auto flex max-w-[560px] flex-col gap-6 px-[22px] py-14 min-[900px]:py-20">
        <span className="eyebrow">Segera hadir</span>
        <h1 className="-mt-3 font-serif text-[44px] font-normal leading-none">
          {minat === "lashes" ? "Lashes" : minat === "nail" ? "Nail Art" : "Nail Art & Lashes"}
        </h1>
        <p className="text-base font-light leading-[1.75] text-sand">
          Kami sedang menyiapkan meja dan tim untuk nail art dan lashes di D&apos;Pras Studio. Tinggalkan nama dan nomor WhatsApp Kakak,
          kami kabari lebih dulu begitu jadwalnya dibuka.
        </p>
        <WaitlistForm interest={minat} src={src} />
      </main>
      <PublicFooter />
    </div>
  );
}
