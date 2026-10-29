"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { log } from "@/lib/log";
import { passwordError, PASSWORD_HINT } from "@/lib/password";
import { getProfile } from "@/lib/auth";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { parseFields, SETTINGS_GROUPS, SOP_GROUPS, TABLES, type TableName } from "./tables";

export type SaveState = { error?: string; ok?: string } | undefined;

// RLS sudah membatasi tulis ke manajer; pesan ramah untuk error constraint.
function friendly(e: { code?: string; message: string }): string {
  if (e.message.includes("staff_needs_link")) return "Akun kapster aktif wajib ditautkan ke staf.";
  if (e.code === "23505") return "Data dengan nilai yang sama sudah ada.";
  if (e.code === "23503") return "Masih dipakai data lain — nonaktifkan saja.";
  if (e.message.includes("vouchers_code_check")) return "Kode voucher: 3–20 huruf/angka/tanda minus, tanpa spasi.";
  if (e.message.includes("vouchers_check1")) return "Tanggal sampai harus setelah tanggal mulai.";
  if (e.message.includes("vouchers_check")) return "Voucher persen maksimal 100.";
  if (e.code === "23505" && e.message.includes("vouchers")) return "Kode voucher sudah dipakai.";
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

/** Simpan isian `settings` dari satu sub-tab: hanya kelompok yang tampil (`_g`) yang divalidasi & ditulis,
 *  agar centang di kelompok lain tidak ikut terhapus. */
export async function saveSettings(_: SaveState, fd: FormData): Promise<SaveState> {
  const titles = fd.getAll("_g");
  const groups = SETTINGS_GROUPS.filter((g) => titles.includes(g.title));
  if (!groups.length) return { error: "Tidak ada yang disimpan." };
  const r = parseFields(groups.flatMap((g) => g.fields), fd);
  if (!r.success) return { error: r.error.issues[0].message };
  const v = r.data as Record<string, unknown>;
  if ((v.online_promo_pct as number) > 0 && (!v.online_promo_start || !v.online_promo_end || (v.online_promo_end as string) < (v.online_promo_start as string))) {
    return { error: "Promo booking online: isi tanggal mulai & selesai (selesai tidak boleh sebelum mulai)." };
  }
  const row: Record<string, unknown> = Object.fromEntries(Object.entries(v).filter(([k]) => !k.startsWith("std_")));
  if ("std_1_title" in v) row.standards = [1, 2, 3, 4].map((i) => ({ title: v[`std_${i}_title`], text: v[`std_${i}_text`] }));
  const supabase = await createClient();
  const { data, error } = await supabase.from("settings")
    .update({ ...row, updated_at: new Date().toISOString() } as never).eq("id", true).select("id");
  if (error) return { error: "maps_url" in v ? friendly(error).replace("cek durasi/jam/angka", "tautan Google Maps harus diawali https://, URL embed harus https://www.google.com/maps/embed…") : friendly(error) };
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

/** Hapus akun tim. Tanpa riwayat → dihapus permanen; punya riwayat (transaksi, tutup kasir, dll.) → dikunci permanen
 *  (tidak bisa masuk; proxy menolak akun nonaktif seketika) agar riwayat & laporan tetap utuh. */
export async function removeTeamAccount(userId: string): Promise<SaveState> {
  try { return await removeTeamAccountImpl(userId); } catch (e) {
    log("error", "team_account_remove_failed", { target: userId, error: e instanceof Error ? e.message : String(e) });
    return { error: "Gagal menghapus akun. Coba lagi." };
  }
}
async function removeTeamAccountImpl(userId: string): Promise<SaveState> {
  const me = await getProfile();
  if (me?.role !== "manager" || !me.active) return { error: "Akses ditolak." };
  if (!z.guid().safeParse(userId).success) return { error: "Akun tidak valid." };
  if (userId === me.id) return { error: "Tidak bisa menghapus akun sendiri." };
  const admin = createAdminClient();
  const { data: p } = await admin.from("profiles").select("role, full_name").eq("id", userId).single();
  if (!p || p.role === "customer") return { error: "Akun tim tidak ditemukan." };
  const del = await admin.auth.admin.deleteUser(userId);
  if (!del.error) {
    log("info", "team_account_deleted", { by: me.id, target: userId });
    revalidatePath("/manajer/pengaturan");
    return { ok: `Akun ${p.full_name} dihapus.` };
  }
  // masih dirujuk riwayat → kunci permanen
  const ban = await admin.auth.admin.updateUserById(userId, { ban_duration: "876000h" });
  if (ban.error) return { error: ban.error.message };
  await admin.from("profiles").update({ active: false, staff_id: null }).eq("id", userId);
  log("info", "team_account_locked", { by: me.id, target: userId, reason: del.error.message });
  revalidatePath("/manajer/pengaturan");
  return { ok: `Akun ${p.full_name} punya riwayat transaksi, jadi dikunci permanen (tidak bisa masuk). Riwayatnya tetap utuh.` };
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
