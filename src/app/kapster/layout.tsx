import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { ToastProvider } from "@/components/ui";
import { KapsterProvider } from "@/features/kapster/provider";
import { KapsterShell } from "@/features/kapster/shell";
import { STATION_ACTIVE, STATION_COOKIE } from "@/features/stasiun/constants";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { BRAND_INITIALS } from "@/lib/brand";

export const metadata: Metadata = {
  title: { default: `${BRAND_INITIALS} Kapster`, template: `%s · ${BRAND_INITIALS} Kapster` },
  manifest: "/kapster.webmanifest",
  appleWebApp: { capable: true, title: `${BRAND_INITIALS} Kapster`, statusBarStyle: "black-translucent" },
  icons: { apple: "/icons/kapster-192.png" },
};
export const viewport: Viewport = { themeColor: "#1C1B19" };

export default async function KapsterLayout({ children }: LayoutProps<"/kapster">) {
  const p = await requireRole("staff");
  const supabase = await createClient();
  const store = await cookies();
  const [{ data: staff }, { data: services }] = await Promise.all([
    supabase.from("staff").select("id, name, category").eq("id", p.staff_id!).single(),
    supabase.from("services").select("id, name, duration_min").order("sort"),
  ]);
  const me = {
    name: p.full_name || staff?.name || "Kapster", staffId: p.staff_id!, category: staff?.category ?? "barbershop",
    station: !!store.get(STATION_COOKIE) && !!store.get(STATION_ACTIVE),
  };
  return (
    <ToastProvider>
      <KapsterProvider me={me} services={services ?? []}>
        <KapsterShell>{children}</KapsterShell>
      </KapsterProvider>
    </ToastProvider>
  );
}
