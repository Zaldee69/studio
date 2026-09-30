import { AnalyticsDashboard } from "@/features/analitik/dashboard";
import { loadAnalytics } from "@/features/analitik/load";

export const metadata = { title: "Analitik KPI" };
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

export default async function Analitik({ searchParams }: PageProps<"/manajer/analitik">) {
  const sp = await searchParams;
  const d = await loadAnalytics({ periode: one(sp.periode), dari: one(sp.dari), sampai: one(sp.sampai), kategori: one(sp.kategori), staf: one(sp.staf) });
  return <AnalyticsDashboard key={`${d.from}:${d.to}:${d.category}:${d.staff}`} d={d} />;
}
