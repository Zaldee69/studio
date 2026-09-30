import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import { homeFor, type Role } from "./roles";

export async function getProfile() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  return data;
}

/** Guard di layout area. Proxy hanya redirect optimistis; data tetap dijaga RLS. */
export async function requireRole(role: Role) {
  const p = await getProfile();
  if (!p) redirect(role === "customer" ? "/akun" : "/login");
  if (!p.active) redirect("/login?status=pending");
  if (p.role !== role) redirect(homeFor(p.role));
  return p;
}
