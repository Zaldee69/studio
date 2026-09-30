import type { Database } from "./supabase/database.types";

export type Role = Database["public"]["Enums"]["app_role"];

export const HOME: Record<Role, string> = {
  manager: "/manajer",
  cashier: "/kasir/kasir",
  staff: "/kapster",
  customer: "/akun",
};
export const homeFor = (r: Role) => HOME[r];

const AREA: Record<Role, string> = { manager: "/manajer", cashier: "/kasir", staff: "/kapster", customer: "/akun" };

/** Area URL → peran yang boleh masuk. */
export function areaRole(path: string): Role | null {
  for (const [role, prefix] of Object.entries(AREA) as [Role, string][]) {
    if (path === prefix || path.startsWith(prefix + "/")) return role;
  }
  return null;
}
