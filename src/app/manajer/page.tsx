import { Beranda } from "@/features/beranda/beranda";
import { loadMaster } from "@/features/counter/load";

export const metadata = { title: "Beranda" };
export default async function Page() {
  return <Beranda master={await loadMaster("manager")} />;
}
