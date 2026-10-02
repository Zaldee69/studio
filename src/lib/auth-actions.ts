"use server";

import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";

// Masuk & daftar dilakukan di browser (login/team-auth.tsx, components/customer-auth.tsx) agar captcha & batas
// percobaan Supabase Auth berlaku per pengguna.
export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
