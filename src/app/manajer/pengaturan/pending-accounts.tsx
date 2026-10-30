"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useConfirm } from "@/components/alert-dialog";
import { useOnline, useToast } from "@/components/ui";
import { formatJam, formatTanggal } from "@/lib/domain/format";
import { createClient } from "@/lib/supabase/client";
import { removeTeamAccount } from "./actions";

type Signup = { id: string; full_name: string; email: string | null; role: "cashier" | "staff" | "manager" | "customer"; signed_up_at: string; email_confirmed_at: string | null };
const ROLE = { cashier: "Kasir", staff: "Capster", manager: "Manajer", customer: "Pelanggan" } as const;

/** Akun tim menunggu persetujuan: hanya email terverifikasi yang bisa disetujui; setiap persetujuan mengganti kode undangan. */
export function PendingAccounts({ rows, staff }: { rows: Signup[]; staff: [string, string][] }) {
  const toast = useToast(); const router = useRouter(); const online = useOnline(); const confirm = useConfirm();
  const [link, setLink] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  if (!rows.length) return null;
  async function approve(r: Signup) {
    setBusy(r.id);
    const { error } = await createClient().from("profiles").update({ active: true, ...(r.role === "staff" ? { staff_id: link[r.id] } : {}) }).eq("id", r.id);
    setBusy(null);
    if (error) return toast(error.message, "error");
    toast(`${r.full_name} aktif. Kode undangan sudah diganti — bagikan kode baru untuk pendaftar berikutnya.`);
    router.refresh();
  }
  async function reject(r: Signup) {
    if (!(await confirm({ title: `Tolak pendaftaran ${r.full_name}?`, tone: "danger", confirmLabel: "Tolak & hapus",
      description: "Akun pendaftar ini dihapus. Bila orangnya benar, ia bisa mendaftar ulang dengan kode undangan terbaru." }))) return;
    setBusy(r.id);
    const res = await removeTeamAccount(r.id);
    setBusy(null);
    if (res?.error) return toast(res.error, "error");
    toast(`Pendaftaran ${r.full_name} ditolak`); router.refresh();
  }
  return (
    <section aria-label="Menunggu persetujuan" className="flex flex-col gap-3 rounded-[14px] border-2 border-[#E2C46B] bg-[#FBF3DE] p-4 text-[#3D2E00]">
      <b>Menunggu persetujuan · {rows.length}</b>
      <p className="text-sm">Pastikan orangnya benar (tanya langsung) sebelum menyetujui. Setelah disetujui, kode undangan otomatis diganti.</p>
      <div className="overflow-x-auto rounded-[10px] bg-card px-3 text-ink">
        <table className="w-full min-w-[640px] text-sm">
          <thead><tr className="text-left text-xs text-muted"><th className="py-2 font-semibold">Nama & email</th><th className="font-semibold">Peran</th>
            <th className="font-semibold">Mendaftar</th><th className="font-semibold">Email</th><th /></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id} className="border-t border-[#EEEEEA] align-middle">
              <td className="py-2"><b>{r.full_name}</b><span className="block text-xs text-muted">{r.email}</span></td>
              <td>{ROLE[r.role]}</td>
              <td className="text-xs">{formatTanggal(r.signed_up_at)} {formatJam(r.signed_up_at)}</td>
              <td>{r.email_confirmed_at
                ? <span className="rounded-full bg-[#E6F1E4] px-2 py-0.5 text-xs font-bold text-[#144D2A]">Terverifikasi</span>
                : <span className="rounded-full bg-[#F9E6E6] px-2 py-0.5 text-xs font-bold text-[#6E1616]">Belum diverifikasi</span>}</td>
              <td className="py-2">
                <div className="flex items-center justify-end gap-2">
                  {r.role === "staff" && (
                    <select aria-label={`Tautan staf untuk ${r.full_name}`} className="input h-10 w-40" value={link[r.id] ?? ""} onChange={(e) => setLink({ ...link, [r.id]: e.target.value })}>
                      <option value="">Tautkan ke staf…</option>
                      {staff.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                    </select>
                  )}
                  <button onClick={() => approve(r)} disabled={!online || busy === r.id || !r.email_confirmed_at || (r.role === "staff" && !link[r.id])}
                    title={!r.email_confirmed_at ? "Email belum diverifikasi" : undefined} className="btn-ink h-10">Setujui</button>
                  <button onClick={() => reject(r)} disabled={!online || busy === r.id} className="btn-ghost h-10 text-danger">Tolak</button>
                </div>
              </td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </section>
  );
}
