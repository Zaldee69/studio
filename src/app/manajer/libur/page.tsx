import { JadwalLibur } from "@/features/libur/libur";

export const metadata = { title: "Jadwal libur" };
export default function Page() {
  return <JadwalLibur manager />;
}
