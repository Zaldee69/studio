import { loadOpnames } from "@/features/inventaris/load";
import { OpnameList } from "@/features/inventaris/opname";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Stok opname" };
// Kasir membantu menghitung rak: mulai / lanjutkan sesi. Tanpa harga pokok; persetujuan oleh manajer.
export default async function Page() {
  const rows = (await loadOpnames(await createClient(), false)).filter((r) => r.status === "draft");
  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-[28px] font-bold tracking-tight">Stok opname</h1>
      <p className="text-sm text-muted">Hitung stok fisik di rak. Simpan sebagian kapan saja — manajer bisa melanjutkan & menyetujui dari perangkatnya.</p>
      <OpnameList rows={rows} base="/kasir/opname" showValue={false} />
    </div>
  );
}
