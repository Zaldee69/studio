"use client";

import { useActionState, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { cancelBooking, deleteAccount, updateName, type AkunState } from "./actions";

const err = "border border-[#7A2E26] bg-[#2A1512] px-3 py-2 text-[13px] text-[#F2B8B0]";
const ok = "text-[13px] text-[#8FD6A8]";
const Msg = ({ s }: { s: AkunState }) => s?.error ? <p role="alert" className={err}>{s.error}</p> : s?.ok ? <p role="status" className={ok}>{s.ok}</p> : null;

export function CancelButton({ id }: { id: string }) {
  const [s, action, pending] = useActionState(cancelBooking, undefined);
  return (
    <form action={action} className="flex flex-col items-end gap-1"
      onSubmit={(e) => { if (!confirm("Batalkan booking ini?")) e.preventDefault(); }}>
      <input type="hidden" name="id" value={id} />
      <button disabled={pending} className="btn-line border-[#7A2E26] text-[#F2B8B0] hover:bg-[#2A1512]">{pending ? "Membatalkan…" : "Batalkan"}</button>
      <Msg s={s} />
    </form>
  );
}

/** Profil: nama (RPC), email & kata sandi (Supabase Auth; ganti email perlu konfirmasi via email baru). */
export function ProfileForms({ name, email }: { name: string; email: string }) {
  const [ns, nameAction, np] = useActionState(updateName, undefined);
  const [em, setEm] = useState(email);
  const [pw, setPw] = useState("");
  const [authMsg, setAuthMsg] = useState<AkunState>(undefined);
  async function saveAuth(kind: "email" | "password") {
    setAuthMsg(undefined);
    if (kind === "password" && pw.length < 8) return setAuthMsg({ error: "Kata sandi minimal 8 karakter." });
    const { error } = await createClient().auth.updateUser(kind === "email" ? { email: em.trim() } : { password: pw });
    if (error) return setAuthMsg({ error: error.message });
    setPw("");
    setAuthMsg({ ok: kind === "email" ? "Cek email baru Anda untuk konfirmasi perubahan." : "Kata sandi diganti." });
  }
  const row = "flex flex-wrap items-end gap-2";
  return (
    <div className="flex flex-col gap-4">
      <form action={nameAction} className={row}>
        <label className="flex min-w-48 flex-1 flex-col gap-2"><span className="lux-label">Nama</span>
          <input name="name" defaultValue={name} required className="lux-input" autoComplete="name" /></label>
        <button disabled={np} className="btn-line h-12">Simpan</button>
      </form>
      <Msg s={ns} />
      <div className={row}>
        <label className="flex min-w-48 flex-1 flex-col gap-2"><span className="lux-label">Email</span>
          <input type="email" value={em} onChange={(e) => setEm(e.target.value)} className="lux-input" autoComplete="email" /></label>
        <button onClick={() => saveAuth("email")} disabled={em.trim() === email} className="btn-line h-12">Ganti email</button>
      </div>
      <div className={row}>
        <label className="flex min-w-48 flex-1 flex-col gap-2"><span className="lux-label">Kata sandi baru</span>
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} className="lux-input" autoComplete="new-password" placeholder="Min. 8 karakter" /></label>
        <button onClick={() => saveAuth("password")} disabled={!pw} className="btn-line h-12">Ganti sandi</button>
      </div>
      <Msg s={authMsg} />
    </div>
  );
}

export function DeleteAccount() {
  const [open, setOpen] = useState(false);
  const [s, action, pending] = useActionState(deleteAccount, undefined);
  if (!open) return <button onClick={() => setOpen(true)} className="self-start py-2 text-[13px] font-light text-[#F2B8B0] underline">Hapus akun saya</button>;
  return (
    <form action={action} className="flex flex-col gap-3 border border-[#7A2E26] p-4">
      <p className="text-sm font-light leading-relaxed text-sand">
        Login akan dinonaktifkan dan data pribadi Anda (nama, WhatsApp, email, catatan) dianonimkan. Booking mendatang dibatalkan.
        Catatan transaksi tetap disimpan tanpa identitas untuk pembukuan toko. Saldo deposit yang tersisa tidak bisa dipakai lagi — hubungi toko sebelum menghapus.
      </p>
      <label className="flex flex-col gap-2"><span className="lux-label">Ketik HAPUS untuk konfirmasi</span>
        <input name="confirm" className="lux-input" autoComplete="off" /></label>
      <Msg s={s} />
      <div className="flex gap-2">
        <button type="button" onClick={() => setOpen(false)} className="btn-line h-12 border-rule-2 text-dust">Batal</button>
        <button disabled={pending} className="btn-line h-12 border-[#7A2E26] text-[#F2B8B0]">{pending ? "Menghapus…" : "Hapus akun"}</button>
      </div>
    </form>
  );
}
