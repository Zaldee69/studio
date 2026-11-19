import type { Metadata } from "next";
import { stationStaff } from "@/features/stasiun/actions";
import { StationLogin } from "@/features/stasiun/station-login";
import { BRAND_INITIALS } from "@/lib/brand";

export const metadata: Metadata = { title: "Stasiun capster", manifest: "/kapster.webmanifest" };

export default async function StasiunPage() {
  const staff = await stationStaff();
  return (
    <main className="flex min-h-dvh flex-col bg-accent px-4 py-8 text-paper">
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-6">
        <div className="flex items-center gap-3">
          <span className="flex size-12 items-center justify-center rounded-[14px] bg-paper font-display text-base font-semibold text-ink">{BRAND_INITIALS}</span>
          <div className="flex flex-col"><h1 className="font-display text-2xl font-medium">Stasiun capster</h1>
            <span className="text-sm text-[#9C98A3]">Ketuk nama Anda, lalu masukkan PIN</span></div>
        </div>
        {staff === null ? (
          <div role="alert" className="rounded-[14px] bg-[#FBF2E4] p-5 text-[15px] leading-relaxed text-[#6B4A10]">
            <b>Perangkat ini belum terdaftar sebagai stasiun.</b> Minta manajer masuk di perangkat ini, buka
            Pengaturan → Stasiun &amp; PIN, lalu ketuk <b>Daftarkan perangkat ini</b>.
          </div>
        ) : <StationLogin staff={staff} />}
      </div>
    </main>
  );
}
