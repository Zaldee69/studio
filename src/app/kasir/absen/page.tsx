import { AbsenCard } from "@/features/absen/absen-card";

export const metadata = { title: "Absen" };
export default function Page() {
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <h1 className="font-display text-[28px] font-medium tracking-tight">Absen</h1>
      <AbsenCard />
    </div>
  );
}
