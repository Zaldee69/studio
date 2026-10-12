import { KomisiKapster } from "@/features/kapster/komisi";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Komisi" };
export default async function Page() {
  const { data } = await (await createClient()).rpc("staff_commission_terms");
  const t = (data ?? { ratio: 40, min_pay: 0, retail_pct: 0 }) as { ratio: number; min_pay: number; retail_pct: number; basis?: string };
  return <KomisiKapster ratio={t.ratio} minPay={t.min_pay} retailPct={Number(t.retail_pct)} gross={t.basis === "gross"} />;
}
