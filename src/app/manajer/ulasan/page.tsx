import { UlasanScreen } from "@/features/ulasan/ulasan-screen";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Ulasan" };
export default async function Page() {
  const db = await createClient();
  const [{ data: s }, { data: sent }] = await Promise.all([
    db.from("settings").select("google_review_url").single(),
    db.from("campaigns").select("id").eq("auto_kind", "review").maybeSingle().then(async ({ data: c }) =>
      c ? db.from("campaign_sends").select("recipient_count").eq("campaign_id", c.id) : { data: [] as { recipient_count: number }[] }),
  ]);
  return <UlasanScreen reviewUrl={s?.google_review_url ?? null} asked={(sent ?? []).reduce((a, x) => a + x.recipient_count, 0)} />;
}
