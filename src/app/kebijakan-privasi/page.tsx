import type { Metadata } from "next";
import { PublicFooter, PublicHeader } from "@/components/public-header";
import { loadSite } from "@/lib/public-site";

export const revalidate = 3600;
export const metadata: Metadata = { title: "Kebijakan privasi", alternates: { canonical: "/kebijakan-privasi" } };

/** Template dari Pengaturan → Halaman publik. Baris pendek tanpa titik = judul bagian; {nama_toko}, {alamat}, {whatsapp} diisi otomatis. */
export default async function Privasi() {
  const { s } = await loadSite();
  const text = (s.privacy_policy ?? "")
    .replaceAll("{nama_toko}", s.shop_name ?? "").replaceAll("{alamat}", s.shop_address || "-").replaceAll("{whatsapp}", s.shop_whatsapp || "-");
  const [title, ...blocks] = text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  return (
    <div className="min-h-screen bg-lux font-jost text-cream">
      <PublicHeader />
      <main className="mx-auto flex max-w-[720px] flex-col gap-6 px-[22px] py-14 min-[900px]:py-20">
        <span className="eyebrow">Privasi</span>
        <h1 className="-mt-3 font-serif text-[44px] font-normal leading-none">{title}</h1>
        {blocks.map((b, i) => {
          const [head, ...rest] = b.split("\n");
          const isHead = rest.length > 0 && head.length < 60 && !/[.!?]$/.test(head);
          return (
            <section key={i} className="flex flex-col gap-2">
              {isHead && <h2 className="font-serif text-2xl text-gold">{head}</h2>}
              <p className="whitespace-pre-line text-base font-light leading-[1.75] text-sand">{isHead ? rest.join("\n") : b}</p>
            </section>
          );
        })}
      </main>
      <PublicFooter />
    </div>
  );
}
