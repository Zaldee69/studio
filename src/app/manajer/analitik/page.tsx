import { AiPanel } from "@/features/analitik/ai-panel";
import { AnalyticsDashboard } from "@/features/analitik/dashboard";
import { loadAnalytics } from "@/features/analitik/load";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Analitik KPI" };
export const maxDuration = 60; // asisten AI (server action) menunggu jawaban model
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

export default async function Analitik({ searchParams }: PageProps<"/manajer/analitik">) {
  const sp = await searchParams;
  const [d, { data: meetings }] = await Promise.all([
    loadAnalytics({ periode: one(sp.periode), dari: one(sp.dari), sampai: one(sp.sampai), kategori: one(sp.kategori), staf: one(sp.staf) }),
    (await createClient()).from("ai_meetings").select("week, notes").order("week", { ascending: false }).limit(8),
  ]);
  const ai = <AiPanel meetings={meetings ?? []} label={d.label}
    period={{ periode: "kustom", dari: d.from, sampai: d.to, kategori: d.category, staf: d.staff }} />;
  return <AnalyticsDashboard key={`${d.from}:${d.to}:${d.category}:${d.staff}`} d={d} ai={ai} />;
}
