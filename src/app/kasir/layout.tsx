import { AdminShell } from "@/components/shells";
import { followCount } from "@/features/counter/load";
import { requireRole } from "@/lib/auth";
import { CASHIER_MENU } from "@/lib/menus";

export default async function CashierLayout({ children }: LayoutProps<"/kasir">) {
  const [p, follow] = await Promise.all([requireRole("cashier"), followCount()]);
  return <AdminShell menu={CASHIER_MENU} area="Kasir" user={p.full_name} followCount={follow}>{children}</AdminShell>;
}
