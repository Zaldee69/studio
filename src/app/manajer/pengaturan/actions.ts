"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { log } from "@/lib/log";
import { passwordError, PASSWORD_HINT } from "@/lib/password";
import { getProfile } from "@/lib/auth";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { parseFields, PUBLIC_GROUPS, SETTINGS_GROUPS, SOP_GROUPS, TABLES, type TableName } from "./tables";

export type SaveState = { error?: string; ok?: string } | undefined;

// RLS sudah membatasi tulis ke manajer; pesan ramah untuk error constraint.
function friendly(e: { code?: string; message: string }): string {
  if (e.message.includes("staff_needs_link")) return "Akun kapster aktif wajib ditautkan ke staf.";
  if (e.code === "23505") return "Data dengan nilai yang sama sudah ada.";
  if (e.code === "23503") return "Masih dipakai data lain — nonaktifkan saja.";
  if (e.code === "23514") return "Nilai tidak valid (cek durasi/jam/angka).";
  if (e.code === "42501") return "Akses ditolak.";
  return e.message;
}

export async function saveRow(table: TableName, _: SaveState, fd: FormData): Promise<SaveState> {
  const def = TABLES[table];
  if (!def) return { error: "Tabel tidak dikenal" };
  const r = parseFields(def.fields, fd);
  if (!r.success) return { error: r.error.issues[0].message };
  const id = fd.get("id");
  const supabase = await createClient();
  // ponytail: bentuk baris dijamin parseFields(); cast karena tabel dipilih dinamis
  const q = supabase.from(table as "staff");
  const { error } = id
    ? await q.update(r.data as never).eq("id", String(id))
    : def.create ? await q.insert(r.data as never) : { error: { message: "Tidak bisa menambah" } };
  if (error) return { error: friendly(error) };
  revalidatePath("/manajer/pengaturan");
  if (table === "suppliers") revalidatePath("/manajer/inventaris");
  if (table === "sop_tool_groups") revalidatePath("/manajer/sop");
  // resources: kategori tanpa kursi/meja aktif disembunyikan dari reservasi online (landing & booking di-cache)
  if (table === "services" || table === "reviews" || table === "staff" || table === "resources" || table === "deposit_packages") revalidatePublic();
  return { ok: "Tersimpan" };
}

/** Landing, booking & privasi di-cache (ISR) → segarkan setiap konten publik berubah. */
function revalidatePublic() {
  for (const p of ["/", "/kebijakan-privasi", "/booking", "/opengraph-image", "/sitemap.xml"]) revalidatePath(p);
}

export async function refreshPublicPages(): Promise<void> {
  const me = await getProfile();
  if (me?.role === "manager") revalidatePublic();
}

export async function savePublicSettings(_: SaveState, fd: FormData): Promise<SaveState> {
  const r = parseFields(PUBLIC_GROUPS.flatMap((g) => g.fields), fd);
  if (!r.success) return { error: r.error.issues[0].message };
  const v = r.data as Record<string, unknown>;
  const standards = [1, 2, 3, 4].map((i) => ({ title: v[`std_${i}_title`], text: v[`std_${i}_text`] }));
  const row = Object.fromEntries(Object.entries(v).filter(([k]) => !k.startsWith("std_")));
  const supabase = await createClient();
  const { data, error } = await supabase.from("settings")
    .update({ ...row, standards, updated_at: new Date().toISOString() } as never).eq("id", true).select("id");
  if (error) return { error: friendly(error).replace("cek durasi/jam/angka", "cek URL Google Maps harus https://www.google.com/maps/embed…") };
  if (!data?.length) return { error: "Akses ditolak." };
  revalidatePublic();
  return { ok: "Halaman publik diperbarui" };
}

const Hours = z.array(z.object({ weekday: z.number().int().min(0).max(6), open_time: z.string().regex(/^\d{2}:\d{2}/), close_time: z.string().regex(/^\d{2}:\d{2}/), closed: z.boolean() })).length(7);

export async function saveHours(_: SaveState, fd: FormData): Promise<SaveState> {
  const rows = Hours.safeParse([0, 1, 2, 3, 4, 5, 6].map((d) => ({
    weekday: d, open_time: String(fd.get(`open_${d}`) ?? ""), close_time: String(fd.get(`close_${d}`) ?? ""), closed: fd.get(`closed_${d}`) === "on",
  })));
  if (!rows.success) return { error: "Format jam tidak valid." };
  if (rows.data.some((h) => !h.closed && h.close_time <= h.open_time)) return { error: "Jam tutup harus setelah jam buka." };
  const { error } = await (await createClient()).from("opening_hours").upsert(rows.data);
  if (error) return { error: friendly(error) };
  revalidatePublic();
  revalidatePath("/manajer/pengaturan");
  return { ok: "Jam buka disimpan" };
}

export async function addClosure(_: SaveState, fd: FormData): Promise<SaveState> {
  const date = String(fd.get("date") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Pilih tanggal." };
  const { error } = await (await createClient()).from("special_closures").upsert({ date, reason: String(fd.get("reason") ?? "").trim() });
  if (error) return { error: friendly(error) };
  revalidatePublic();
  revalidatePath("/manajer/pengaturan");
  return { ok: "Libur khusus ditambahkan" };
}

export async function removeClosure(date: string): Promise<SaveState> {
  const { error } = await (await createClient()).from("special_closures").delete().eq("date", date);
  if (error) return { error: friendly(error) };
  revalidatePublic();
  revalidatePath("/manajer/pengaturan");
  return { ok: "Dihapus" };
}

export async function deleteRow(table: TableName, id: string): Promise<SaveState> {
  if (!TABLES[table]?.remove) return { error: "Tidak bisa dihapus" };
  const supabase = await createClient();
  const { error } = await supabase.from(table as "staff").delete().eq("id", id);
  if (error) return { error: friendly(error) };
  revalidatePath("/manajer/pengaturan");
  if (table === "suppliers") revalidatePath("/manajer/inventaris");
  if (table === "services" || table === "reviews") revalidatePublic();
  return { ok: "Dihapus" };
}

export async function saveSettings(_: SaveState, fd: FormData): Promise<SaveState> {
  const r = parseFields(SETTINGS_GROUPS.flatMap((g) => g.fields), fd);
  if (!r.success) return { error: r.error.issues[0].message };
  const supabase = await createClient();
  const { data, error } = await supabase.from("settings")
    .update({ ...(r.data as object), updated_at: new Date().toISOString() }).eq("id", true).select("id");
  if (error) return { error: friendly(error) };
  if (!data?.length) return { error: "Akses ditolak." };
  revalidatePath("/", "layout");
  revalidatePublic();
  return { ok: "Pengaturan tersimpan" };
}

/** Reset sandi akun lain: butuh secret key (admin API), jadi verifikasi manajer di sini dulu. */
export async function resetPassword(_: SaveState, fd: FormData): Promise<SaveState> {
  const me = await getProfile();
  if (me?.role !== "manager" || !me.active) return { error: "Akses ditolak." };
  const r = z.object({ user_id: z.guid("Pilih akun"), password: z.string().refine((pw) => !passwordError(pw), PASSWORD_HINT) })
    .safeParse(Object.fromEntries(fd));
  if (!r.success) return { error: r.error.issues[0].message };
  const { error } = await createAdminClient().auth.admin.updateUserById(r.data.user_id, { password: r.data.password });
  if (error) {
    log("error", "password_reset_failed", { by: me.id, target: r.data.user_id, error: error.message });
    return { error: error.message };
  }
  log("info", "password_reset_by_manager", { by: me.id, target: r.data.user_id }); // jejak audit
  return { ok: "Sandi diganti. Sampaikan ke pemilik akun." };
}

export async function saveSopSettings(_: SaveState, fd: FormData): Promise<SaveState> {
  const r = parseFields(SOP_GROUPS.flatMap((g) => g.fields), fd);
  if (!r.success) return { error: r.error.issues[0].message };
  const v = r.data as Record<string, unknown>;
  const supabase = await createClient();
  const { data, error } = await supabase.from("settings").update({
    sop_shifts: Number(v.sop_shifts), sop_shift_names: [String(v.sop_shift_1), String(v.sop_shift_2)],
    sop_reminder_time: v.sop_reminder_time as string, sop_require_photo_autoclave: !!v.sop_require_photo_autoclave,
  }).eq("id", true).select("id");
  if (error) return { error: friendly(error) };
  if (!data?.length) return { error: "Akses ditolak." };
  revalidatePath("/manajer/pengaturan"); revalidatePath("/manajer/sop");
  return { ok: "Pengaturan SOP disimpan" };
}
