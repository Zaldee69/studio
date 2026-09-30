"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient, createClient } from "@/lib/supabase/server";

export type AkunState = { error?: string; ok?: string } | undefined;

export async function cancelBooking(_: AkunState, fd: FormData): Promise<AkunState> {
  const { error } = await (await createClient()).rpc("cancel_my_booking", { p_id: String(fd.get("id")) });
  if (error) return { error: error.message };
  revalidatePath("/akun");
  return { ok: "Booking dibatalkan" };
}

export async function updateName(_: AkunState, fd: FormData): Promise<AkunState> {
  const { error } = await (await createClient()).rpc("update_my_profile", { p_name: String(fd.get("name") ?? "") });
  if (error) return { error: error.message };
  revalidatePath("/akun");
  return { ok: "Nama disimpan" };
}

/** Hapus akun (UU PDP): anonimkan data pribadi di DB, lalu hapus user login. Transaksi tetap untuk pembukuan. */
export async function deleteAccount(_: AkunState, fd: FormData): Promise<AkunState> {
  if (String(fd.get("confirm") ?? "").trim().toUpperCase() !== "HAPUS") return { error: "Ketik HAPUS untuk konfirmasi." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesi berakhir. Masuk lagi." };
  const { error } = await supabase.rpc("delete_my_account");
  if (error) return { error: error.message };
  await supabase.auth.signOut();
  await createAdminClient().auth.admin.deleteUser(user.id);
  redirect("/?akun=dihapus");
}
