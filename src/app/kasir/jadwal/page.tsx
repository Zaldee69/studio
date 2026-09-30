import { JadwalPage } from "@/features/counter/pages";

export const metadata = { title: "Jadwal" };
export default function Page({ searchParams }: PageProps<"/kasir/jadwal">) {
  return <JadwalPage role="cashier" searchParams={searchParams} />;
}
