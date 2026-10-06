import Link from "next/link";
import { BRAND, BRAND_INITIALS } from "@/lib/brand";

/** Logo gaya Landing (lingkaran inisial + wordmark serif). */
export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-3 text-cream">
      <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full border border-gold font-serif text-[17px] italic text-gold">{BRAND_INITIALS}</span>
      <span className={`whitespace-nowrap font-serif text-xl font-medium tracking-[0.02em] min-[420px]:text-2xl ${compact ? "hidden min-[900px]:inline" : ""}`}>
        {BRAND}
      </span>
    </span>
  );
}

const NAV = [["#dunia", "Layanan"], ["#menu", "Menu"], ["#ritual", "Ritual"], ["#kunjungi", "Kunjungi"]] as const;

/** Header publik (landing, booking, akun). `left` untuk tombol kembali, `right` untuk aksi. */
export function PublicHeader({ left, right, nav = false }: { left?: React.ReactNode; right?: React.ReactNode; nav?: boolean }) {
  return (
    <header className="sticky top-0 z-20 border-b border-rule bg-lux/90 backdrop-blur-md">
      <div className="mx-auto flex h-[76px] max-w-[1280px] items-center gap-4 px-[22px] min-[900px]:gap-7 min-[900px]:px-11 min-[1200px]:px-[72px]">
        {left}
        <Link href="/" className="no-underline"><Wordmark compact={!!left} /><span className="sr-only">{left ? `${BRAND} — ` : " — "}beranda</span></Link>
        <div className="flex-1" />
        {nav && (
          <>
            <nav aria-label="Navigasi" className="hidden gap-8 min-[900px]:flex">
              {NAV.map(([h, l]) => <a key={h} href={h} className="text-xs font-medium uppercase tracking-[0.22em] text-dust hover:text-cream">{l}</a>)}
            </nav>
            <details className="group relative min-[900px]:hidden">
              <summary aria-label="Buka menu" className="flex size-11 cursor-pointer list-none items-center justify-center border border-rule-2 text-cream [&::-webkit-details-marker]:hidden">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
              </summary>
              <nav aria-label="Navigasi" className="absolute right-0 top-14 flex w-56 flex-col border border-rule-2 bg-lux-2 py-2 shadow-[0_16px_40px_rgba(0,0,0,0.5)]">
                {NAV.map(([h, l]) => <a key={h} href={h} className="flex min-h-11 items-center px-4 text-xs font-medium uppercase tracking-[0.22em] text-sand hover:text-gold">{l}</a>)}
              </nav>
            </details>
          </>
        )}
        {right}
      </div>
    </header>
  );
}

export function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} aria-label="Kembali" className="flex size-11 shrink-0 items-center justify-center border border-rule-2 text-cream hover:border-gold hover:text-gold">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
    </button>
  );
}

export function PublicFooter() {
  return (
    <footer className="border-t border-rule">
      <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-4 px-[22px] py-8 text-xs uppercase tracking-[0.14em] text-stone min-[900px]:px-11 min-[1200px]:px-[72px]">
        <span><span className="font-serif text-lg normal-case tracking-normal text-cream">{BRAND}</span> · © {new Date().getFullYear()}</span>
        <span className="flex flex-wrap gap-x-6">
          <Link href="/kebijakan-privasi" className="flex min-h-11 items-center text-dust hover:text-cream">Kebijakan privasi</Link>
          <Link href="/login" className="flex min-h-11 items-center text-dust hover:text-cream">Login tim →</Link>
        </span>
      </div>
    </footer>
  );
}
