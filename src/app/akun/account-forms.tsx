"use client";

import { useActionState, useState } from "react";
import { useConfirm } from "@/components/alert-dialog";
import { cancelBooking, deleteAccount, updateName, type AkunState } from "./actions";

const err = "border border-[#E3B4AE] bg-[#FBEDEB] px-3 py-2 text-[13px] text-[#9B2C22]";
const ok = "text-[13px] text-[#2F6B45]";
const Msg = ({ s }: { s: AkunState }) => s?.error ? <p role="alert" className={err}>{s.error}</p> : s?.ok ? <p role="status" className={ok}>{s.ok}</p> : null;

export function CancelButton({ id }: { id: string }) {
  const [s, action, pending] = useActionState(cancelBooking, undefined);
  const confirm = useConfirm();
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="id" value={id} />
      <button disabled={pending} onClick={async (e) => {
        e.preventDefault();
        const btn = e.currentTarget; // requestSubmit tidak memicu onClick lagi
        if (await confirm({ title: "Batalkan booking ini?", description: "Jadwal akan dilepas dan tidak bisa dikembalikan.", confirmLabel: "Batalkan booking", cancelLabel: "Tidak", tone: "danger" })) btn.form?.requestSubmit(btn);
      }} className="btn-line border-[#E3B4AE] text-[#9B2C22] hover:bg-[#FBEDEB] hover:text-[#9B2C22]">{pending ? "Membatalkan…" : "Batalkan"}</button>
      <Msg s={s} />
    </form>
  );
}

/** Profil: nama (RPC), email & kata sandi (Supabase Auth; ganti email perlu konfirmasi via email baru). */
/** Pelanggan masuk dengan WhatsApp (tanpa email & kata sandi) — yang bisa diubah hanya nama. */
export function ProfileForms({ name }: { name: string }) {
  const [ns, nameAction, np] = useActionState(updateName, undefined);
  return (
    <div className="flex flex-col gap-4">
      <form action={nameAction} className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-48 flex-1 flex-col gap-2"><span className="lux-label">Nama</span>
          <input name="name" defaultValue={name} required className="lux-input" autoComplete="name" /></label>
        <button disabled={np} className="btn-line h-12">Simpan</button>
      </form>
      <Msg s={ns} />
    </div>
  );
}

export function DeleteAccount() {
  const [open, setOpen] = useState(false);
  const [s, action, pending] = useActionState(deleteAccount, undefined);
  if (!open) return <button onClick={() => setOpen(true)} className="self-start py-2 text-[13px] font-light text-[#9B2C22] underline">Hapus akun saya</button>;
  return (
    <form action={action} className="flex flex-col gap-3 border border-[#E3B4AE] p-4">
      <p className="text-sm font-light leading-relaxed text-sand">
        Login akan dinonaktifkan dan data pribadi Anda (nama, WhatsApp, email, catatan) dianonimkan. Booking mendatang dibatalkan.
        Catatan transaksi tetap disimpan tanpa identitas untuk pembukuan toko. Saldo deposit yang tersisa tidak bisa dipakai lagi — hubungi toko sebelum menghapus.
      </p>
      <label className="flex flex-col gap-2"><span className="lux-label">Ketik HAPUS untuk konfirmasi</span>
        <input name="confirm" className="lux-input" autoComplete="off" /></label>
      <Msg s={s} />
      <div className="flex gap-2">
        <button type="button" onClick={() => setOpen(false)} className="btn-line h-12 border-rule-2 text-dust">Batal</button>
        <button disabled={pending} className="btn-line h-12 border-[#E3B4AE] text-[#9B2C22] hover:bg-[#FBEDEB] hover:text-[#9B2C22]">{pending ? "Menghapus…" : "Hapus akun"}</button>
      </div>
    </form>
  );
}
