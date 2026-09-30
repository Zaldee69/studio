import { loadMaster } from "@/features/counter/load";
import { IzinStaf } from "@/features/izin/izin-staf";

export const metadata = { title: "Izin staf" };
export default async function Page() {
  return <IzinStaf master={await loadMaster("manager")} />;
}
