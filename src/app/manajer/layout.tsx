import { AdminShell } from "@/components/shells";
import { followCount } from "@/features/counter/load";
import { requireRole } from "@/lib/auth";
import { MANAGER_MENU } from "@/lib/menus";
import { createClient } from "@/lib/supabase/server";

export default async function ManagerLayout({ children }: LayoutProps<"/manajer">) {
  const [p, follow, { data: hidden }] = await Promise.all([requireRole("manager"), followCount(), (await createClient()).rpc("hidden_features")]);
  const menu = MANAGER_MENU.filter((m) => !m.feature || !(hidden ?? []).includes(m.feature));
  return <AdminShell menu={menu} area="Manajer" user={p.full_name} followCount={follow}>{children}</AdminShell>;
}
