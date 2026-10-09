import { PromosiScreen } from "@/features/promosi/promosi-screen";
import { BRAND } from "@/lib/brand";
import { SITE_URL } from "@/lib/supabase/public";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Promosi" };
export default async function Page() {
  const { data: s } = await (await createClient()).from("settings").select("shop_name").single();
  return <PromosiScreen shop={s?.shop_name ?? BRAND} bookingUrl={`${SITE_URL}/booking`}
    waReady={!!process.env.WABLAS_TOKEN && !!process.env.WABLAS_SECRET_KEY} />;
}
