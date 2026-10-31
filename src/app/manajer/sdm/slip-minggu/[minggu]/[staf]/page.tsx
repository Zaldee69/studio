import Link from "next/link";
import { notFound } from "next/navigation";
import type { WeekRow } from "@/features/sdm/weekly";
import { CAT, plusDays, shiftWeek, weekLabel } from "@/features/sdm/shared";
import { SlipActions } from "@/features/sdm/slip-actions";
import { formatRupiah, formatTanggal } from "@/lib/domain/format";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Slip gaji mingguan" };

// Slip gaji mingguan A5 (Senin–Minggu): komisi + subsidi jaring harian − kasbon, rincian per layanan TANPA HPP.
export default async function SlipMinggu({ params }: PageProps<"/manajer/sdm/slip-minggu/[minggu]/[staf]">) {
  const { minggu, staf } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(minggu)) notFound();
  const end = shiftWeek(minggu, 1);
  const months = [...new Set([minggu.slice(0, 7), plusDays(minggu, 6).slice(0, 7)])]; // Senin & Minggu bisa beda bulan
  const supabase = await createClient();
  const [{ data: rows }, { data: shop }, ...items] = await Promise.all([
    supabase.rpc("commission_week", { p_week: minggu }),
    supabase.from("settings").select("shop_name, shop_address, shop_whatsapp").single(),
    ...months.map((m) => supabase.rpc("commission_items", { p_month: `${m}-01`, p_staff_id: staf })),
  ]);
  const r = ((rows ?? []) as WeekRow[]).find((x) => x.staff_id === staf);
  if (!r) notFound();
  const t0 = new Date(`${minggu}T00:00:00+07:00`), t1 = new Date(`${end}T00:00:00+07:00`);
  const list = items.flatMap((x) => x.data ?? []).filter((i) => new Date(i.created_at) >= t0 && new Date(i.created_at) < t1)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const lines: [string, string][] = [
    ["Layanan", String(r.service_count)], ["Pendapatan jasa", formatRupiah(r.revenue_net)], ["Komisi jasa", formatRupiah(r.commission_service)],
    ...(r.commission_retail ? [["Komisi ritel", formatRupiah(r.commission_retail)] as [string, string]] : []),
    ...(r.subsidy ? [["Subsidi jaring harian", formatRupiah(r.subsidy)] as [string, string]] : []),
    ...(r.kasbon ? [["Potongan kasbon & koreksi", `−${formatRupiah(r.kasbon)}`] as [string, string]] : []),
  ];
  const label = weekLabel(minggu);
  const wa = `Slip gaji mingguan ${label} — ${r.staff_name}\n${lines.map(([k, v]) => `${k}: ${v}`).join("\n")}\nDibayar: ${formatRupiah(r.amount)}${r.paid_at ? `\nDibayar ${formatTanggal(r.paid_at)} (${r.paid_method})` : ""}`;
  return (
    <div className="flex flex-col gap-4">
      <style>{"@page { size: A5; margin: 10mm } @media print { body { background: #fff } }"}</style>
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Link href={`/manajer/sdm?tab=mingguan&minggu=${minggu}`} className="btn-ghost h-11">← Komisi mingguan</Link>
        <SlipActions month={minggu.slice(0, 7)} staffId={staf} closed={false} paid={false} wa={wa} />
      </div>
      {!r.closed && <p role="alert" className="rounded-[12px] bg-[#FBF3DE] px-4 py-3 text-sm text-[#5A4300] print:hidden">Minggu belum ditutup — angka masih bisa berubah. Tutup minggu untuk slip final.</p>}
      <article className="mx-auto flex w-full max-w-[148mm] flex-col gap-3 rounded-[14px] border border-line bg-card p-6 text-sm tabular print:border-0 print:p-0">
        <header className="flex flex-col border-b border-ink pb-2">
          <b className="font-display text-xl">{shop?.shop_name}</b>
          <span className="text-xs text-muted">{shop?.shop_address}{shop?.shop_whatsapp ? ` · WA +${shop.shop_whatsapp}` : ""}</span>
        </header>
        <div className="flex justify-between"><span><b className="text-base">{r.staff_name}</b><span className="block text-xs text-muted">{CAT[r.category].label}</span></span>
          <span className="text-right">Slip gaji mingguan<b className="block">{label}</b></span></div>
        <table className="w-full">
          <tbody>{lines.map(([k, v]) => <tr key={k} className="border-t border-[#EEEEEA]"><td className="py-1">{k}</td><td className="text-right">{v}</td></tr>)}</tbody>
        </table>
        <div className="flex items-baseline justify-between border-y-2 border-ink py-2"><b>Dibayar</b><b className="font-display text-2xl">{formatRupiah(r.amount)}</b></div>
        <p className="text-xs">{r.paid_at ? `Status: dibayar ${formatTanggal(r.paid_at)} (${r.paid_method})` : r.closed ? "Status: belum dibayar" : "Status: estimasi (minggu belum ditutup)"}</p>
        <section>
          <b className="text-xs uppercase tracking-wide text-muted">Rincian</b>
          <table className="w-full text-xs">
            <tbody>{list.map((i) => (
              <tr key={i.transaction_item_id} className="border-t border-[#EEEEEA]"><td className="py-0.5">{formatTanggal(i.created_at)}</td><td>{i.name}</td><td className="text-right">{formatRupiah(i.commission)}</td></tr>
            ))}</tbody>
          </table>
        </section>
      </article>
    </div>
  );
}
