import "server-only";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Master } from "./types";

/** Data master untuk layar konter (jadwal, kasir, pelanggan). Hak akses tetap dijaga RLS. */
export async function loadMaster(role: "manager" | "cashier"): Promise<Master> {
  const profile = await requireRole(role);
  const supabase = await createClient();
  const [{ data: services }, { data: staff }, { data: resources }, { data: shop }, { data: packs }] = await Promise.all([
    supabase.from("services").select("id, name, category, price, duration_min, upsell_service_id, stock_item_id, needs_pedicure, active, sort").order("sort"),
    supabase.from("staff").select("id, name, category, active, sort").order("sort"),
    supabase.from("resources").select("id, name, type, is_pedicure, active, sort").eq("active", true).order("sort"),
    supabase.from("public_settings").select("*").single(),
    supabase.from("deposit_packages").select("id, name, amount_paid, amount_credited").eq("active", true).order("amount_paid"),
  ]);
  return {
    role, userId: profile.id, userName: profile.full_name,
    base: role === "manager" ? "/manajer" : "/kasir",
    services: services ?? [], staff: staff ?? [], resources: resources ?? [], packs: packs ?? [],
    shop: {
      name: shop?.shop_name ?? "Groom & Bloom",
      open: (shop?.open_time ?? "09:00").slice(0, 5), close: (shop?.close_time ?? "21:00").slice(0, 5),
      bundlePct: shop?.bundle_pct ?? 10, churnWeeks: shop?.churn_weeks ?? 4,
      waTemplate: shop?.wa_followup_template ?? "",
    },
  };
}

export async function followCount() {
  const supabase = await createClient();
  const { count } = await supabase.from("customer_stats").select("customer_id", { count: "exact", head: true }).eq("is_churn", true);
  return count ?? 0;
}
