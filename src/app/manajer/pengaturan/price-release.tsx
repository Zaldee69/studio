"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useConfirm } from "@/components/alert-dialog";
import { useOnline, useToast } from "@/components/ui";
import { formatRupiah } from "@/lib/domain/format";
import { createClient } from "@/lib/supabase/client";

type Svc = { id: string; name: string; price: number; active: boolean; next_price: number | null; release_action: string | null; sort: number };

/** Rilis harga: perubahan yang disiapkan (harga berikutnya, layanan baru, layanan pensiun) berlaku serentak saat tombol ditekan. */
export function PriceRelease({ services }: { services: Svc[] }) {
  const toast = useToast(); const router = useRouter(); const online = useOnline(); const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const pending = services.filter((s) => s.next_price != null || s.release_action);
  if (!pending.length) return (
    <p className="text-sm text-muted">
      Menyiapkan harga baru tanpa langsung berlaku: isi <b>Harga berikutnya</b>, atau buat layanan baru (tidak aktif) dengan <b>Saat rilis: Muncul</b>.
      Layanan yang akan dihentikan diberi <b>Saat rilis: Pensiun</b>. Semuanya berlaku bersamaan saat Anda menekan <b>Rilis harga baru</b>.
    </p>
  );
  async function release() {
    if (!(await confirm({ title: "Rilis harga baru sekarang?", confirmLabel: "Rilis sekarang",
      description: `${pending.length} perubahan langsung berlaku di kasir, booking online & halaman publik. Transaksi yang sudah ada tidak berubah.` }))) return;
    setBusy(true);
    const { error } = await createClient().rpc("release_prices");
    setBusy(false);
    if (error) return toast(error.message, "error");
    toast("Harga baru berlaku"); router.refresh();
  }
  return (
    <section aria-label="Harga baru menunggu rilis" className="flex flex-col gap-3 rounded-[14px] border-2 border-[#E2C46B] bg-[#FBF3DE] p-4 text-[#3D2E00]">
      <div className="flex flex-wrap items-center gap-2">
        <b className="flex-1">Harga baru menunggu rilis · {pending.length} perubahan</b>
        <button onClick={release} disabled={!online || busy} className="btn-ink h-11">{busy ? "Merilis…" : "Rilis harga baru"}</button>
      </div>
      <div className="overflow-x-auto rounded-[10px] bg-card px-3 text-ink">
        <table className="w-full min-w-[520px] text-sm tabular">
          <thead><tr className="text-left text-xs text-muted"><th className="py-2 font-semibold">Layanan</th><th className="font-semibold">Perubahan</th>
            <th className="text-right font-semibold">Sekarang</th><th className="text-right font-semibold">Setelah rilis</th></tr></thead>
          <tbody>{pending.sort((a, b) => a.sort - b.sort).map((s) => (
            <tr key={s.id} className="border-t border-[#EEEEEA]">
              <td className="py-2 font-semibold">{s.name}</td>
              <td>{s.release_action === "launch" ? <span className="rounded-full bg-[#E6F1E4] px-2 py-0.5 text-xs font-bold text-[#144D2A]">Baru</span>
                : s.release_action === "retire" ? <span className="rounded-full bg-[#F9E6E6] px-2 py-0.5 text-xs font-bold text-[#6E1616]">Dihentikan</span>
                : <span className="text-xs text-muted">Ganti harga</span>}</td>
              <td className="text-right">{s.release_action === "launch" ? "—" : formatRupiah(s.price)}</td>
              <td className="text-right font-bold">{s.release_action === "retire" ? "—" : formatRupiah(s.next_price ?? s.price)}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <p className="text-xs">Booking yang dibuat sebelum rilis tetap bisa dibayar dengan layanan yang dipesan. Riwayat setiap rilis tersimpan.</p>
    </section>
  );
}
