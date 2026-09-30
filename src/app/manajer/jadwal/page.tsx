import { JadwalPage } from "@/features/counter/pages";

export const metadata = { title: "Jadwal" };
export default function Page({ searchParams }: PageProps<"/manajer/jadwal">) {
  return <JadwalPage role="manager" searchParams={searchParams} />;
}
