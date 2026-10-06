import type { Metadata } from "next";
import { stationStaff } from "@/features/stasiun/actions";
import { StationLogin } from "@/features/stasiun/station-login";
import { BRAND_INITIALS } from "@/lib/brand";

export const metadata: Metadata = { title: "Stasiun kapster", manifest: "/kapster.webmanifest" };

export default async function StasiunPage() {
  const staff = await stationStaff();
  return (
    <main className="flex min-h-dvh flex-col bg-ink px-4 py-8 text-paper">
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-6">
        <div className="flex items-center gap-3">
          <span className="flex size-12 items-center justify-center rounded-xl bg-paper font-display text-base font-bold text-ink">{BRAND_INITIALS}</span>
          <div className="flex flex-col"><h1 className="font-display text-2xl font-bold">Stasiun kapster</h1>
            <span className="text-sm text-[#B9B3A7]">Ketuk nama Anda, lalu masukkan PIN</span></div>
        </div>
        {staff === null ? (
          <div role="alert" className="rounded-2xl bg-[#FFF1C2] p-5 text-[15px] leading-relaxed text-[#5A4300]">
            <b>Perangkat ini belum terdaftar sebagai stasiun.</b> Minta manajer masuk di perangkat ini, buka
            Pengaturan → Stasiun &amp; PIN, lalu ketuk <b>Daftarkan perangkat ini</b>.
          </div>
        ) : <StationLogin staff={staff} />}
      </div>
    </main>
  );
}
