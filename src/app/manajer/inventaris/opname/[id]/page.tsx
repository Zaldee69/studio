import { notFound } from "next/navigation";
import { OpnameCount } from "@/features/inventaris/opname";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Stok opname" };
export default async function Page({ params }: PageProps<"/manajer/inventaris/opname/[id]">) {
  const { id } = await params;
  const { data } = await (await createClient()).from("stock_opnames").select("id, scope, status, started_at").eq("id", id).maybeSingle();
  if (!data) notFound();
  return <OpnameCount opname={data} manager back="/manajer/inventaris?tab=opname" />;
}
