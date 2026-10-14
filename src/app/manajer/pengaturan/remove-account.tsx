"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useConfirm } from "@/components/alert-dialog";
import { useOnline, useToast } from "@/components/ui";
import { removeTeamAccount } from "./actions";

/** Hapus akun tim (manajer): tanpa riwayat → dihapus; punya riwayat → dikunci permanen. */
export function RemoveAccountForm({ users }: { users: [string, string][] }) {
  const toast = useToast(); const router = useRouter(); const online = useOnline(); const confirm = useConfirm();
  const [id, setId] = useState("");
  const [busy, setBusy] = useState(false);
  async function remove() {
    const label = users.find(([v]) => v === id)?.[1];
    if (!id || !(await confirm({ title: `Hapus akun ${label}?`, tone: "danger", confirmLabel: "Hapus akun",
      description: "Orang ini tidak bisa masuk lagi. Bila akun punya riwayat transaksi/tutup kasir, akun dikunci permanen dan riwayatnya tetap tersimpan." }))) return;
    setBusy(true);
    const r = await removeTeamAccount(id);
    setBusy(false);
    if (r?.error) return toast(r.error, "error");
    toast(r?.ok ?? "Akun dihapus"); setId(""); router.refresh();
  }
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-line bg-card p-5">
      <div className="min-w-56 flex-1">
        <label htmlFor="ra-user" className="label">Hapus akun tim</label>
        <select id="ra-user" className="input" value={id} onChange={(e) => setId(e.target.value)}>
          <option value="">Pilih akun…</option>
          {users.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      <button onClick={remove} disabled={!online || !id || busy} className="btn-ghost h-11 text-danger">{busy ? "Menghapus…" : "Hapus akun"}</button>
    </div>
  );
}
