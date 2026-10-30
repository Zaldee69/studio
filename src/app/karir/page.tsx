import type { Metadata } from "next";
import Link from "next/link";
import { PublicFooter, PublicHeader } from "@/components/public-header";
import { POSITION_NAME, type Position } from "@/lib/domain/lamaran";
import { ApplyForm } from "./form";

export const metadata: Metadata = {
  title: "Karir · Capster & Kasir",
  description: "Lowongan capster dan kasir di D'Pras Studio, Cimanggis, Depok. Isi formulir lamaran, kami hubungi lewat WhatsApp.",
  alternates: { canonical: "/karir" },
};

export default async function Karir({ searchParams }: PageProps<"/karir">) {
  const sp = await searchParams;
  const position: Position = sp.posisi === "kasir" ? "kasir" : "capster";
  return (
    <div className="min-h-screen bg-lux font-jost text-cream">
      <PublicHeader />
      <main className="mx-auto flex max-w-[560px] flex-col gap-6 px-[22px] py-14 min-[900px]:py-20">
        <span className="eyebrow">Karir</span>
        <h1 className="-mt-3 font-serif text-[44px] font-normal leading-none">Bergabung dengan D&apos;Pras</h1>
        <p className="text-base font-light leading-[1.75] text-sand">
          Kami mencari {position === "capster" ? "capster" : "kasir"} untuk studio kami di Ruko Emerald, Cimanggis Golf Estate, Depok.
          Isi formulir ini sekitar 10 menit; bila cocok, kami hubungi lewat WhatsApp untuk {position === "capster" ? "tes potong" : "wawancara"} di studio.
        </p>
        <nav aria-label="Posisi" className="flex gap-2">
          {(["capster", "kasir"] as const).map((p) => (
            <Link key={p} href={`?posisi=${p}`} aria-current={p === position ? "page" : undefined}
              className="inline-flex h-11 items-center rounded-full border border-rule-2 px-5 text-xs font-semibold uppercase tracking-[0.18em] text-stone aria-[current=page]:border-cream aria-[current=page]:bg-cream aria-[current=page]:text-lux">
              {POSITION_NAME[p]}
            </Link>
          ))}
        </nav>
        <ApplyForm key={position} position={position} />
      </main>
      <PublicFooter />
    </div>
  );
}
