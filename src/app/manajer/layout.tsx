import { AdminShell } from "@/components/shells";
import { followCount } from "@/features/counter/load";
import { requireRole } from "@/lib/auth";
import { MANAGER_MENU } from "@/lib/menus";

export default async function ManagerLayout({ children }: LayoutProps<"/manajer">) {
  const [p, follow] = await Promise.all([requireRole("manager"), followCount()]);
  return <AdminShell menu={MANAGER_MENU} area="Manajer" user={p.full_name} followCount={follow}>{children}</AdminShell>;
}
