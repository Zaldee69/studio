"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { homeFor } from "./roles";
import { createClient } from "./supabase/server";

export type FormState = { error?: string; values?: Record<string, string>; at?: number } | undefined;

// React 19 me-reset form setelah action; kembalikan isian (tanpa sandi) agar tidak perlu diketik ulang.
// `at` dipakai sebagai key form di AuthForm (remount → <select> ikut terisi lagi).
function fail(error: string, fd: FormData): FormState {
  const values = Object.fromEntries([...fd.entries()].filter(([k]) => k !== "password" && !k.startsWith("$")).map(([k, v]) => [k, String(v)]));
  return { error, values, at: Date.now() };
}

const email = z.string().trim().toLowerCase().email("Email tidak valid");
const password = z.string().min(8, "Kata sandi minimal 8 karakter");
const name = z.string().trim().min(1, "Nama wajib diisi");

function parse<T extends z.ZodType>(schema: T, fd: FormData): z.infer<T> | string {
  const r = schema.safeParse(Object.fromEntries(fd));
  return r.success ? r.data : r.error.issues[0].message;
}

export async function signIn(_: FormState, fd: FormData): Promise<FormState> {
  const v = parse(z.object({ email, password: z.string().min(1, "Isi kata sandi") }), fd);
  if (typeof v === "string") return fail(v, fd);
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(v);
  if (error) return fail("Email atau kata sandi salah", fd);
  const { data: p } = await supabase.from("profiles").select("role, active").eq("id", data.user.id).single();
  if (!p?.active) redirect("/login?status=pending");
  redirect(homeFor(p.role));
}

export async function signUpTeam(_: FormState, fd: FormData): Promise<FormState> {
  const v = parse(z.object({
    full_name: name, email, password,
    invite_code: z.string().trim().min(1, "Isi kode undangan"),
    role: z.enum(["cashier", "staff"], { message: "Pilih peran" }),
  }), fd);
  if (typeof v === "string") return fail(v, fd);
  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: v.email, password: v.password,
    options: { data: { signup: "team", invite_code: v.invite_code, role: v.role, full_name: v.full_name } },
  });
  // Trigger DB menolak kode salah; GoTrue menyamarkan pesannya.
  if (error) return fail(error.code === "user_already_exists" ? "Email sudah terdaftar" : "Pendaftaran gagal — periksa kode undangan", fd);
  redirect("/login?status=pending");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
