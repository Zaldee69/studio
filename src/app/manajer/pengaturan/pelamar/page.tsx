import Link from "next/link";
import { notFound } from "next/navigation";
import { formatTanggal } from "@/lib/domain/format";
import { POSITION_NAME, questionsFor, SECTIONS, type Position } from "@/lib/domain/lamaran";
import { createClient } from "@/lib/supabase/server";
import { PrintButton } from "./print-button";

export const metadata = { title: "Data pelamar" };
const STATUS: Record<string, string> = { baru: "Baru", dihubungi: "Sudah dihubungi", tes: "Tes / wawancara", diterima: "Diterima", ditolak: "Tidak lanjut" };

// Lembar data pelamar A4 untuk disimpan sebagai PDF: ?id=… (satu pelamar) atau ?posisi=capster|kasir (semua, satu per halaman).
export default async function Pelamar({ searchParams }: PageProps<"/manajer/pengaturan/pelamar">) {
  const sp = await searchParams;
  const supabase = await createClient();
  let q = supabase.from("job_applications").select("*").order("created_at", { ascending: false }).limit(100);
  if (typeof sp.id === "string") q = q.eq("id", sp.id);
  else if (sp.posisi === "capster" || sp.posisi === "kasir") q = q.eq("position", sp.posisi);
  else notFound();
  const [{ data: rows }, { data: shop }] = await Promise.all([q, supabase.from("settings").select("shop_name").single()]);
  if (!rows?.length) notFound();
  const filename = rows.length === 1 ? `Pelamar ${POSITION_NAME[rows[0].position as Position]} - ${rows[0].name}` : `Pelamar ${sp.posisi} - ${new Date().toISOString().slice(0, 10)}`;

  return (
    <div className="flex flex-col gap-4">
      <style>{"@page { size: A4; margin: 14mm } @media print { body { background: #fff } }"}</style>
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Link href="/manajer/pengaturan?tab=pelamar" className="btn-ghost h-11">← Pelamar</Link>
        <PrintButton filename={filename} />
        <span className="text-sm text-muted">Pilih &quot;Simpan sebagai PDF&quot; di dialog cetak.</span>
      </div>
      {rows.map((a) => {
        const pos = a.position as Position;
        const ans = (a.answers ?? {}) as Record<string, string | string[]>;
        const qs = questionsFor(pos);
        return (
          <article key={a.id} className="mx-auto flex w-full max-w-[182mm] break-after-page flex-col last:break-after-auto gap-4 rounded-[14px] border border-line bg-card p-6 text-sm print:border-0 print:p-0">
            <header className="flex items-end justify-between gap-4 border-b border-ink pb-2">
              <div><b className="font-display text-2xl">{a.name}</b>
                <span className="block text-muted">Pelamar {POSITION_NAME[pos]} · WA +{a.whatsapp}</span></div>
              <div className="text-right text-xs text-muted">{shop?.shop_name}<br />Dikirim {formatTanggal(a.created_at)}<br />Status: {STATUS[a.status] ?? a.status}</div>
            </header>
            {SECTIONS.map((sec) => {
              const items = qs.filter((x) => x.section === sec && ans[x.key] !== undefined);
              return items.length > 0 && (
                <section key={sec} className="break-inside-avoid">
                  <h2 className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">{sec}</h2>
                  <table className="w-full"><tbody>{items.map((x) => (
                    <tr key={x.key} className="border-t border-[#EEEEEA] align-top">
                      <td className="w-[45%] py-1 pr-3 text-muted">{x.label}</td>
                      <td className="whitespace-pre-line py-1">{[ans[x.key]].flat().join(", ")}</td>
                    </tr>
                  ))}</tbody></table>
                </section>
              );
            })}
            <section className="break-inside-avoid">
              <h2 className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">Catatan pewawancara</h2>
              <p className="min-h-24 whitespace-pre-line border border-[#DDDDD8] p-2">{a.note}</p>
            </section>
          </article>
        );
      })}
    </div>
  );
}
