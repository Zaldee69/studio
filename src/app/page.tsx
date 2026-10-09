import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { OpenNow } from "@/components/open-now";
import { PublicFooter, PublicHeader } from "@/components/public-header";
import { TrackView } from "@/components/track-view";
import { bundleDiscount, promoActive } from "@/lib/domain/cart";
import { formatRupiah, formatTanggal } from "@/lib/domain/format";
import { COMING_SOON, STAFF_TITLE, type Cat } from "@/lib/domain/category";
import { HARI } from "@/lib/domain/hours";
import { BRAND_LINES } from "@/lib/brand";
import { igUrl, loadSite } from "@/lib/public-site";
import { photoUrl } from "@/lib/storage";
import { SITE_URL } from "@/lib/supabase/public";

// Landing D'Pras Studio — warm minimalism, tiga lini setara (dokumen strategi brand). Konten dari Pengaturan → Halaman publik.
// ISR: di-cache 1 jam, dan di-revalidasi seketika saat manajer menyimpan Halaman publik.
export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const { s, photos } = await loadSite();
  const hero = photos.find((p) => p.kind === "hero");
  const title = `${s.shop_name} — Barbershop, Nail Art & Lashes`;
  return {
    title: { absolute: title }, description: s.tagline + (s.shop_address ? ` · ${s.shop_address}` : ""),
    alternates: { canonical: "/" },
    openGraph: { title, description: s.hero_text ?? undefined, type: "website", locale: "id_ID", ...(hero ? { images: [photoUrl(hero.path)!] } : {}) },
  };
}

const rk = (n: number) => (n >= 1_000_000 ? `${(Math.round(n / 100_000) / 10).toLocaleString("id-ID")} jt` : `${Math.round(n / 1000)}rb`);
const jam = (t?: string | null) => (t ?? "").slice(0, 5).replace(":", ".");
/** 6281234567890 → +62 812-3456-7890 */
const waPretty = (n: string) => { const r = n.replace(/^62/, ""); return `+62 ${r.slice(0, 3)}-${r.slice(3, 7)}-${r.slice(7)}`; };
const ROMAN = ["i.", "ii.", "iii.", "iv."];
// `sizes` = lebar gambar SETELAH object-cover, bukan lebar bingkai: bingkai lengkung tegak & galeri persegi memotong foto
// landscape (3:2) mengikuti tingginya → lebar tampil ≈ tinggi bingkai × 1,5. Pakai lebar bingkai = foto diperbesar & pecah.
const HERO_SIZES = "(min-width: 1200px) 860px, (min-width: 900px) 740px, 590px";   // tinggi ±572 / 492 / 392 px
const CARD_SIZES = "(min-width: 1200px) 510px, 450px";                             // tinggi 340 / 300 px
const GALLERY_SIZES = "(min-width: 900px) 540px, 75vw";                             // persegi 360 px / ½ layar
// ponytail: Lashes belum punya kategori di aplikasi — tambah kategori lashes saat layanannya siap.
const LASHES_TEXT = "Eyelash extension dan lash lift yang disesuaikan dengan bentuk mata, lengkap dengan konsultasi dan panduan aftercare.";

const Scissors = () => (
  <svg viewBox="0 0 120 120" width="96" height="96" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
    <path d="M34 22 L74 84" /><path d="M86 22 L46 84" /><circle cx="78" cy="96" r="11" /><circle cx="42" cy="96" r="11" /><circle cx="60" cy="52" r="2" fill="currentColor" />
  </svg>
);
const Polish = () => (
  <svg viewBox="0 0 120 120" width="96" height="96" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="40" y="58" width="40" height="46" rx="9" /><rect x="52" y="44" width="16" height="14" rx="2" /><rect x="49" y="14" width="22" height="30" rx="5" />
    <path d="M40 74 H80" strokeOpacity="0.5" /><path d="M94 30 l2 6 l6 2 l-6 2 l-2 6 l-2 -6 l-6 -2 l6 -2 z" />
  </svg>
);
const Lash = () => (
  <svg viewBox="0 0 120 120" width="96" height="96" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 62 Q60 30 102 62" /><path d="M18 62 Q60 88 102 62" /><circle cx="60" cy="62" r="11" /><circle cx="60" cy="62" r="3" fill="currentColor" />
    <path d="M30 52 l-5 -9 M42 45 l-3 -10 M54 41 l-1 -10 M66 41 l1 -10 M78 45 l3 -10 M90 52 l5 -9" />
  </svg>
);
const HeroArt = () => (
  <svg viewBox="0 0 240 320" width="78%" aria-label="Ilustrasi gunting, sisir, dan botol kuteks" role="img" className="text-gold" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="120" cy="120" r="84" strokeOpacity="0.35" /><circle cx="120" cy="120" r="96" strokeOpacity="0.18" />
    <path d="M82 62 L140 170" /><path d="M150 62 L96 170" /><path d="M82 62 L88 58 L143 164" strokeOpacity="0.6" />
    <circle cx="146" cy="190" r="18" /><circle cx="92" cy="190" r="18" /><circle cx="119" cy="114" r="3.2" fill="currentColor" />
    <rect x="160" y="206" width="44" height="66" rx="10" /><rect x="172" y="186" width="20" height="20" rx="2" /><rect x="168" y="148" width="28" height="38" rx="6" />
    <path d="M168 226 H204" strokeOpacity="0.5" /><path d="M36 236 H116" />
    <path d="M40 236 V272 M50 236 V262 M60 236 V272 M70 236 V262 M80 236 V272 M90 236 V262 M100 236 V272 M110 236 V262" />
    <path d="M40 40 l4 10 l10 4 l-10 4 l-4 10 l-4 -10 l-10 -4 l10 -4 z" strokeOpacity="0.8" />
    <path d="M206 86 l3 7 l7 3 l-7 3 l-3 7 l-3 -7 l-7 -3 l7 -3 z" strokeOpacity="0.8" />
  </svg>
);

export default async function Landing() {
  const { s, services, staff, packs, hours, closures, photos, reviews, bookable } = await loadSite();
  const pct = s.bundle_pct ?? 10;
  const list = (c: string) => services.filter((x) => x.category === c);
  const soon = (c: string) => COMING_SOON.includes(c);
  const photo = (k: string) => photos.find((p) => p.kind === k);
  const gallery = photos.filter((p) => p.kind === "gallery");
  const b = list("barbershop")[0], n = [...list("nail")].sort((x, y) => (y.price ?? 0) - (x.price ?? 0))[0];
  const before = (b?.price ?? 0) + (n?.price ?? 0);
  const after = b && n ? before - bundleDiscount([
    { serviceId: b.id!, name: b.name!, category: "barbershop", price: b.price! },
    { serviceId: n.id!, name: n.name!, category: "nail", price: n.price! },
  ], pct) : before;
  const ticker = services.filter((x) => x.category !== "massage" && !soon(x.category!)).map((x) => x.name).join("   ·   ") + "   ·   ";
  const extra = list("massage"); // pijat: layanan tambahan lewat WhatsApp, bukan lini utama
  const standards = (s.standards as { title: string; text: string }[] | null) ?? [];
  const closureDates = closures.map((c) => c.date!);
  // jam per hari Senin–Minggu; semua sama → satu baris "Setiap hari"
  const weekly = [1, 2, 3, 4, 5, 6, 0].map((d) => {
    const h = hours.find((x) => x.weekday === d);
    return [HARI[d], !h || h.closed ? "Libur" : `${jam(h.open_time)} – ${jam(h.close_time)}`] as const;
  });
  const ig = igUrl(s.shop_instagram ?? "");
  const wa = s.shop_whatsapp ? `https://wa.me/${s.shop_whatsapp}` : "";
  // Booking online hanya bila dibuka DAN ada kategori yang punya kursi/meja & staf aktif.
  const online = !!s.online_booking_open && bookable.some((c) => !soon(c));
  const bookHref = (cat?: string) => (online ? `/booking${cat ? `?kategori=${cat}` : ""}` : wa || "#kunjungi");
  const bookLabel = online ? "Reservasi" : "Reservasi via WhatsApp";
  // ponytail: halaman di-cache ≤1 jam — banner bisa terlambat ≤1 jam saat periode promo mulai/berakhir (simpan Pengaturan = segar)
  const promo = { pct: s.online_promo_pct ?? 0, start: s.online_promo_start, end: s.online_promo_end };
  const promoOn = online && promoActive(promo);
  const prices = services.map((x) => x.price ?? 0).filter(Boolean);
  const px = "px-[22px] min-[900px]:px-11 min-[1200px]:px-[72px]";
  const sec = "py-[72px] min-[900px]:py-[120px]";
  const h2 = "font-serif text-[42px] font-normal leading-none min-[900px]:text-[54px] min-[1200px]:text-[68px]";
  const hero = photo("hero");

  const DAY_URL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const jsonLd = {
    "@context": "https://schema.org", "@type": ["HairSalon", "NailSalon", "BeautySalon"], name: s.shop_name, description: s.tagline, url: SITE_URL,
    ...(hero ? { image: photoUrl(hero.path) } : {}),
    ...(s.shop_whatsapp ? { telephone: `+${s.shop_whatsapp}` } : {}),
    ...(s.shop_address ? { address: { "@type": "PostalAddress", streetAddress: s.shop_address, addressCountry: "ID" } } : {}),
    ...(prices.length ? { priceRange: `${formatRupiah(Math.min(...prices))}–${formatRupiah(Math.max(...prices))}` } : {}),
    openingHoursSpecification: hours.filter((h) => !h.closed).map((h) => ({
      "@type": "OpeningHoursSpecification", dayOfWeek: `https://schema.org/${DAY_URL[h.weekday]}`, opens: h.open_time.slice(0, 5), closes: h.close_time.slice(0, 5),
    })),
    ...(ig ? { sameAs: [ig] } : {}),
    ...(online ? { potentialAction: { "@type": "ReserveAction", target: { "@type": "EntryPoint", urlTemplate: `${SITE_URL}/booking`, inLanguage: "id-ID" } } } : {}),
  };

  return (
    <div className="min-h-screen scroll-smooth bg-lux font-jost text-cream">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <TrackView step="landing" />
      <PublicHeader nav right={<Link href={bookHref()} className="btn-line max-[459px]:hidden">{online ? "Reservasi" : "WhatsApp"}</Link>} />

      <main>
        {promoOn && (
          <Link href={bookHref()} className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-cream px-4 py-3 text-center text-[13px] text-lux">
            <b className="font-semibold uppercase tracking-[0.14em]">Diskon {promo.pct}% untuk booking online</b>
            <span>Booking lewat website sampai {formatTanggal(`${promo.end}T12:00:00+07:00`)}, potongan langsung saat bayar di studio. Booking sekarang →</span>
          </Link>
        )}
        {/* HERO */}
        <section id="top" className="relative overflow-hidden">
          <div className={`relative mx-auto grid max-w-[1280px] items-center gap-14 py-14 min-[900px]:grid-cols-[1.1fr_0.9fr] min-[900px]:gap-16 min-[900px]:py-[110px] ${px}`}>
            <div className="flex flex-col gap-8">
              <span className="eyebrow flex items-center gap-3.5"><span className="h-px w-10 bg-gold" />{BRAND_LINES}</span>
              <h1 className="font-serif text-[56px] font-normal leading-[0.95] tracking-[-0.01em] min-[900px]:text-[80px] min-[1200px]:text-[108px]">
                {s.hero_title}<br /><i className="text-gold">{s.hero_title_accent}</i>
              </h1>
              <p className="max-w-[460px] text-base leading-[1.7] text-sand min-[900px]:text-lg">{s.hero_text}</p>
              <div className="flex flex-wrap items-center gap-5">
                <Link href={bookHref()} className="btn-gold">{online ? "Reservasi sekarang" : bookLabel}</Link>
                <a href="#menu" className="flex min-h-11 items-center gap-2.5 text-[13px] font-medium uppercase tracking-[0.22em] text-cream">
                  Lihat menu <span className="h-px w-7 bg-cream" />
                </a>
              </div>
            </div>
            <div className="relative flex h-[420px] justify-center min-[900px]:h-[520px] min-[1200px]:h-[600px]">
              <div aria-hidden="true" className="absolute -right-2 top-10 size-28 rounded-full bg-rose/60 min-[900px]:size-36" />
              <div aria-hidden="true" className="absolute -left-2 bottom-16 size-20 rounded-full bg-sage/60 min-[900px]:size-24" />
              <div className="relative h-full w-[300px] rounded-t-full border border-rule-2 p-3.5 min-[900px]:w-[360px] min-[1200px]:w-[420px]">
                <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-t-full bg-lux-3">
                  {hero ? <Image src={photoUrl(hero.path)!} alt={hero.caption || `Suasana ${s.shop_name}`} fill preload quality={90} sizes={HERO_SIZES} className="object-cover" />
                    : <HeroArt />}
                </div>
              </div>
              {s.founded_year && (
                <span className="absolute -bottom-3.5 left-1/2 -translate-x-1/2 whitespace-nowrap bg-lux px-3.5 font-serif text-lg italic text-gold">est. {s.founded_year}</span>
              )}
            </div>
          </div>
        </section>

        {/* TICKER */}
        <div aria-hidden="true" className="flex h-16 items-center overflow-hidden border-y border-rule">
          <div className="gb-tick flex whitespace-nowrap font-serif text-[26px] italic text-gold">
            <span className="pr-3">{ticker}</span><span className="pr-3">{ticker}</span>
          </div>
        </div>

        {/* TIGA LINI — setara di bawah satu studio */}
        <section id="dunia" aria-label="Barbershop, Nail Art, dan Lashes" className="grid border-b border-rule min-[900px]:grid-cols-3">
          {[
            { numeral: "I", title: "Barbershop", sub: "Potong & grooming", cat: "barbershop", tone: "bg-lux", icon: <Scissors />, text: s.groom_text, p: photo("groom") },
            { numeral: "II", title: "Nail Art", sub: "Manicure, pedicure & desain", cat: "nail", tone: "bg-lux-2", icon: <Polish />, text: s.bloom_text, p: photo("bloom"), soon: soon("nail") },
            { numeral: "III", title: "Lashes", sub: "Eyelash extension & lift", cat: "lashes", tone: "bg-lux", icon: <Lash />, text: LASHES_TEXT, p: photo("lashes"), soon: soon("lashes") },
          ].map((w) => (
            <article key={w.title} className={`flex flex-col items-center gap-[22px] border-rule text-center min-[900px]:border-r min-[900px]:last:border-r-0 ${sec} ${px} ${w.tone}`}>
              <span className="font-serif text-lg tracking-[0.2em] text-gold">{w.numeral}</span>
              <div className="relative flex h-[280px] w-[220px] items-center justify-center overflow-hidden rounded-t-full border border-rule-2 bg-lux-3 text-gold min-[900px]:h-[300px] min-[900px]:w-[220px] min-[1200px]:h-[340px] min-[1200px]:w-[260px]">
                {w.p ? <Image src={photoUrl(w.p.path)!} alt={w.p.caption || `${w.title} — ${w.sub}`} fill loading="eager" quality={90} sizes={CARD_SIZES} className="object-cover" /> : w.icon}
              </div>
              <h2 className={h2}>{w.title}</h2>
              <span className="text-xs font-semibold uppercase tracking-[0.28em] text-dust">{w.sub}</span>
              <p className="max-w-[360px] text-base leading-[1.7] text-sand">{w.text}</p>
              {w.soon ? <span className="rounded-full bg-rose/50 px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.18em] text-cream">Segera hadir</span>
                // kategori tanpa kursi/meja atau staf aktif: tanpa tombol reservasi
                : (!online || bookable.includes(w.cat)) && (
                  <Link href={bookHref(w.cat)} className="btn-line h-12 px-[26px]">{online ? `Reservasi ${w.title}` : bookLabel}</Link>
                )}
            </article>
          ))}
        </section>

        {/* MENU */}
        <section id="menu" className={`mx-auto flex max-w-[1180px] flex-col gap-12 ${sec} ${px}`}>
          <div className="flex flex-col items-center gap-3.5 text-center">
            <span className="eyebrow">Menu layanan</span>
            <h2 className={h2}>Pilih layananmu</h2>
            <p className="max-w-[520px] text-base leading-[1.7] text-sand">Harga dan perkiraan durasi tertulis di sini — add-on disampaikan sebelum layanan dimulai.</p>
          </div>
          <div className={`grid gap-10 min-[900px]:gap-20 ${soon("nail") ? "mx-auto w-full max-w-[560px]" : "min-[900px]:grid-cols-2"}`}>
            {[["Barbershop", "barbershop"], ["Nail Art", "nail"]].filter(([, c]) => !soon(c)).map(([title, c]) => (
              <div key={c} className="flex flex-col gap-1.5">
                <h3 className="mb-3 font-serif text-[34px] font-normal italic text-gold">{title}</h3>
                {list(c).map((x) => (
                  <div key={x.id} className="flex flex-col gap-0.5 py-3">
                    <div className="flex items-baseline gap-2.5 tabular-nums">
                      <span className="font-serif text-[22px] font-medium">{x.name}</span>
                      <span className="flex-1 -translate-y-[5px] border-b border-dotted border-rule-2" />
                      {s.show_prices && <span className="text-base">{rk(x.price ?? 0)}</span>}
                    </div>
                    {x.public_description && <span className="text-sm text-sand">{x.public_description}</span>}
                    <span className="text-xs uppercase tracking-[0.14em] text-stone">{x.duration_min} menit</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <p className="text-center text-sm text-stone"><b className="font-semibold text-cream">{soon("nail") ? "Nail Art & Lashes" : "Lashes"}</b> · menu & harga menyusul — segera hadir.</p>
          <div className="flex justify-center"><Link href={bookHref()} className="btn-gold">{online ? "Reservasi online" : bookLabel}</Link></div>
          {!!extra.length && (
            <div id="tambahan" className="flex flex-col gap-4 rounded-3xl border border-rule bg-lux-2 p-6 min-[900px]:p-8">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h3 className="font-serif text-[28px] font-normal italic text-gold">Layanan tambahan · Pijat & refleksi</h3>
                <span className="text-xs uppercase tracking-[0.18em] text-stone">Reservasi lewat WhatsApp</span>
              </div>
              <div className="grid gap-x-12 min-[900px]:grid-cols-2">
                {extra.map((x) => (
                  <div key={x.id} className="flex items-baseline gap-2.5 py-2 tabular-nums">
                    <span className="font-serif text-lg font-medium">{x.name}</span>
                    <span className="text-xs text-stone">{x.duration_min} mnt</span>
                    <span className="flex-1 -translate-y-[4px] border-b border-dotted border-rule-2" />
                    {s.show_prices && <span className="text-[15px]">{rk(x.price ?? 0)}</span>}
                  </div>
                ))}
              </div>
              {wa && <a href={wa} target="_blank" rel="noopener" className="btn-line self-start">Tanya jadwal pijat</a>}
            </div>
          )}
        </section>

        {/* RITUAL & DEPOSIT */}
        {(!soon("nail") || !!packs.length) && <section id="ritual" className="border-y border-rule bg-lux-2">
          <div className={`mx-auto flex max-w-[1180px] flex-col items-center gap-7 text-center ${sec} ${px}`}>
            {!soon("nail") && <>
            <span className="eyebrow">Paket lintas layanan</span>
            <h2 className={`max-w-[820px] ${h2} leading-[1.05]`}>
              Barbershop <i className="text-gold">+</i> Nail Art — hemat <span className="tabular-nums text-gold">{pct}%</span>
            </h2>
            <p className="max-w-[520px] text-base leading-[1.7] text-sand">
              Pilihan, bukan kewajiban: satu layanan barbershop dan satu layanan nail art dalam satu kunjungan, dikerjakan bersamaan.
            </p>
            {b && n && s.show_prices && (
              <span className="font-serif text-[22px] tabular-nums text-sand">
                {b.name} + {n.name} · <s className="text-stone">{formatRupiah(before)}</s> <span className="text-gold">{formatRupiah(after)}</span>
              </span>
            )}
            </>}
            {!!packs.length && (
              <>
                {!soon("nail") && <div className="my-3 h-px w-full bg-rule" />}
                <span className="text-xs font-medium uppercase tracking-[0.32em] text-dust">Kartu deposit</span>
                <div className="grid w-full gap-4 min-[900px]:grid-cols-3">
                  {packs.map((p, i, all) => {
                    const top = i === all.length - 1;
                    return (
                      <div key={p.id} className={`flex flex-col items-center gap-2.5 rounded-3xl border px-6 py-8 ${top ? "border-cream bg-lux-3" : "border-rule-2 bg-lux"}`}>
                        <span className="font-serif text-[26px] italic text-gold">{p.name}</span>
                        <span className="text-[13px] uppercase tracking-[0.14em] text-stone tabular-nums">Bayar {formatRupiah(p.amount_paid ?? 0)}</span>
                        <span className="font-serif text-[34px] font-medium tabular-nums">{formatRupiah(p.amount_credited ?? 0)}</span>
                        <span className="text-[13px] text-gold tabular-nums">bonus saldo {formatRupiah((p.amount_credited ?? 0) - (p.amount_paid ?? 0))}</span>
                      </div>
                    );
                  })}
                </div>
                <span className="text-[13px] text-stone">Top-up di kasir · saldo terpotong otomatis setiap kunjungan</span>
              </>
            )}
          </div>
        </section>}

        {/* STANDAR KAMI */}
        <section aria-label="Standar kami" className={`mx-auto grid max-w-[1180px] gap-10 min-[900px]:grid-cols-2 min-[1200px]:grid-cols-4 ${sec} ${px}`}>
          {standards.slice(0, 4).map((x, i) => (
            <div key={i} className="flex flex-col gap-3.5 border-t border-rule-2 pt-[22px]">
              <span className="font-serif text-[38px] italic leading-none text-gold">{ROMAN[i]}</span>
              <h3 className="font-serif text-2xl font-medium">{x.title}</h3>
              <p className="text-[15px] leading-[1.65] text-sand">{x.text}</p>
            </div>
          ))}
        </section>

        {/* PARA AHLI */}
        {s.show_staff && staff.some((t) => !soon(t.category!)) && (
          <section className="border-t border-rule bg-lux-2">
            <div className={`mx-auto flex max-w-[1180px] flex-col items-center gap-10 ${sec} ${px}`}>
              <div className="flex flex-col items-center gap-3.5 text-center">
                <span className="eyebrow">Para ahli kami</span>
                <h2 className={h2}>Tim di balik hasilnya</h2>
              </div>
              <div className="grid w-full grid-cols-2 gap-6 min-[900px]:grid-cols-3 min-[1200px]:grid-cols-6">
                {staff.filter((t) => !soon(t.category!)).map((t) => (
                  <div key={t.id} className="flex flex-col items-center gap-3 text-center">
                    <div className="relative flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-t-full border border-rule-2 bg-lux">
                      {t.photo_path ? <Image src={photoUrl(t.photo_path)!} alt={t.name ?? ""} fill sizes="(min-width: 1200px) 170px, (min-width: 900px) 30vw, 45vw" className="object-cover" />
                        : <span aria-hidden="true" className="font-serif text-[54px] italic text-gold">{t.name?.charAt(0)}</span>}
                    </div>
                    <span className="font-serif text-[22px] font-medium">{t.name}</span>
                    <span className="text-[11px] uppercase tracking-[0.24em] text-stone">{STAFF_TITLE[t.category as Cat]}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* GALERI */}
        {!!gallery.length && (
          <section aria-label="Galeri hasil kerja" className={`mx-auto flex max-w-[1180px] flex-col gap-10 ${sec} ${px}`}>
            <div className="flex flex-col items-center gap-3.5 text-center">
              <span className="eyebrow">Galeri</span>
              <h2 className={h2}>Hasil kerja <i className="text-gold">kami</i></h2>
            </div>
            <div className="grid grid-cols-2 gap-3 min-[900px]:grid-cols-3">
              {gallery.map((g) => (
                <figure key={g.id} className="flex flex-col gap-2">
                  <div className="relative aspect-square overflow-hidden border border-rule-2">
                    <Image src={photoUrl(g.path)!} alt={g.caption || "Hasil kerja"} fill quality={90} sizes={GALLERY_SIZES} className="object-cover" />
                  </div>
                  {g.caption && <figcaption className="text-[13px] font-light text-sand">{g.caption}</figcaption>}
                </figure>
              ))}
            </div>
            {ig && <a href={ig} target="_blank" rel="noopener" className="btn-line self-center">Lihat lebih banyak di Instagram</a>}
          </section>
        )}

        {/* ULASAN (hanya ulasan asli yang ditambahkan manajer) */}
        {!!reviews.length && (
          <section aria-label="Ulasan pelanggan" className="border-t border-rule bg-lux-2">
            <div className={`mx-auto flex max-w-[1180px] flex-col gap-10 ${sec} ${px}`}>
              <div className="flex flex-col items-center gap-3.5 text-center"><span className="eyebrow">Kata mereka</span><h2 className={h2}>Ulasan pelanggan</h2></div>
              <div className="grid gap-6 min-[900px]:grid-cols-3">
                {reviews.map((r) => (
                  <blockquote key={r.id} className="flex flex-col gap-4 border-t border-rule-2 pt-6">
                    <p className="font-serif text-xl italic leading-snug">“{r.body}”</p>
                    <footer className="text-xs uppercase tracking-[0.22em] text-stone">{r.author}{r.source && ` · ${r.source}`}</footer>
                  </blockquote>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* KUNJUNGI */}
        <section id="kunjungi" className={`mx-auto grid max-w-[1180px] items-center gap-14 min-[900px]:grid-cols-2 ${sec} ${px}`}>
          <div className="flex flex-col gap-7">
            <span className="eyebrow">Kunjungi kami</span>
            <h2 className={h2}>Sampai jumpa<br /><i className="text-gold">di studio.</i></h2>
            <div className="flex flex-col gap-[18px] text-base leading-relaxed text-sand">
              {s.shop_address && <div className="flex flex-col gap-1"><span className="lux-label">Alamat</span><address className="not-italic">{s.shop_address}</address></div>}
              <div className="flex flex-col gap-1.5">
                <span className="lux-label">Jam buka</span>
                <span className="text-[13px] uppercase tracking-[0.18em] text-cream"><OpenNow hours={hours} closures={closureDates} /></span>
                <dl className="grid max-w-[320px] grid-cols-[1fr_auto] gap-x-6 gap-y-0.5 text-[15px] tabular-nums">
                  {(weekly.every((r) => r[1] === weekly[0][1]) ? [["Setiap hari", weekly[0][1]]] : weekly).map(([d, t]) => (
                    [<dt key={`d${d}`}>{d}</dt>, <dd key={`h${d}`} className="text-right">{t}</dd>]
                  ))}
                </dl>
                {!!closures.length && <span className="text-[13px] text-stone">Tutup khusus: {closures.slice(0, 3).map((c) => `${c.date!.slice(8)}/${c.date!.slice(5, 7)}${c.reason ? ` (${c.reason})` : ""}`).join(", ")}</span>}
              </div>
              {(s.shop_whatsapp || ig) && (
                <div className="flex flex-col gap-1"><span className="lux-label">Kontak</span>
                  <span className="flex flex-wrap gap-x-4">
                    {s.shop_whatsapp && <a href={wa} target="_blank" rel="noopener" className="hover:text-cream">WhatsApp {waPretty(s.shop_whatsapp)}</a>}
                    {ig && <a href={ig} target="_blank" rel="noopener" className="text-gold hover:text-gold-hi">Instagram {s.shop_instagram}</a>}
                  </span>
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-3">
              {online && <Link href="/booking" className="btn-gold">Reservasi sekarang</Link>}
              {wa && <a href={wa} target="_blank" rel="noopener" className="btn-line h-14 px-8">Chat WhatsApp</a>}
            </div>
          </div>
          <div className="h-[360px] overflow-hidden rounded-t-full border border-rule-2 bg-lux-2 min-[900px]:h-[480px]">
            {s.maps_embed_url ? (
              <iframe src={s.maps_embed_url} title={`Peta lokasi ${s.shop_name}`} loading="lazy" referrerPolicy="no-referrer-when-downgrade"
                className="h-full w-full border-0 grayscale-[0.2]" allowFullScreen />
            ) : (
              <div className="flex h-full items-center justify-center p-6 text-center"><HeroArt /></div>
            )}
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
