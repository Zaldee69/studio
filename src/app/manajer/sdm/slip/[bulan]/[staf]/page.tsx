import Link from "next/link";
import { notFound } from "next/navigation";
import type { PayRow } from "@/features/sdm/monthly";
import { CAT, monthLabel } from "@/features/sdm/shared";
import { SlipActions } from "@/features/sdm/slip-actions";
import { formatRupiah, formatTanggal } from "@/lib/domain/format";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Slip gaji" };

// Slip gaji A5: ringkasan dari snapshot (periode tertutup), rincian per layanan TANPA HPP.
export default async function Slip({ params }: PageProps<"/manajer/sdm/slip/[bulan]/[staf]">) {
  const { bulan, staf } = await params;
  if (!/^\d{4}-\d{2}$/.test(bulan)) notFound();
  const supabase = await createClient();
  const [{ data: rows }, { data: items }, { data: adj }, { data: shop }] = await Promise.all([
    supabase.rpc("commission_for_period", { p_month: `${bulan}-01`, p_staff_id: staf }),
    supabase.rpc("commission_items", { p_month: `${bulan}-01`, p_staff_id: staf }),
    supabase.from("payroll_adjustments").select("id, kind, amount, reason").eq("staff_id", staf).eq("month", `${bulan}-01`).order("created_at"),
    supabase.from("settings").select("shop_name, shop_address, shop_whatsapp").single(),
  ]);
  const r = (rows ?? [])[0] as PayRow | undefined;
  if (!r) notFound();
  const signed = (v: number) => (v < 0 ? "−" : "+") + formatRupiah(Math.abs(v));
  const lines: [string, string][] = [
    ["Layanan", String(r.service_count)], ["Pendapatan jasa bersih", formatRupiah(r.revenue_net)], ["Komisi jasa", formatRupiah(r.commission_service)],
    ...(r.commission_retail ? [["Komisi ritel", formatRupiah(r.commission_retail)] as [string, string]] : []),
    ...(r.subsidy ? [["Subsidi jaring pengaman", formatRupiah(r.subsidy)] as [string, string]] : []),
    ...(adj ?? []).map((a) => [`${a.kind === "deduction" ? "Potongan" : a.kind === "bonus" ? "Bonus" : "Koreksi"}: ${a.reason}`, signed(a.amount)] as [string, string]),
  ];
  const wa = `Slip gaji ${monthLabel(bulan)} — ${r.staff_name}\n${lines.map(([k, v]) => `${k}: ${v}`).join("\n")}\nTotal dibayar: ${formatRupiah(r.total_pay)}${r.paid_at ? `\nDibayar ${formatTanggal(r.paid_at)} (${r.paid_method})` : ""}`;
  return (
    <div className="flex flex-col gap-4">
      <style>{"@page { size: A5; margin: 10mm } @media print { body { background: #fff } }"}</style>
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Link href={`/manajer/sdm?bulan=${bulan}`} className="btn-ghost h-11">← SDM</Link>
        <SlipActions month={bulan} staffId={staf} closed={r.closed} paid={!!r.paid_at} wa={wa} />
      </div>
      {!r.closed && <p role="alert" className="rounded-[12px] bg-[#FBF3DE] px-4 py-3 text-sm text-[#5A4300] print:hidden">Periode belum ditutup — angka masih bisa berubah. Tutup periode untuk slip final.</p>}
      <article className="mx-auto flex w-full max-w-[148mm] flex-col gap-3 rounded-[14px] border border-line bg-card p-6 text-sm tabular print:border-0 print:p-0">
        <header className="flex flex-col border-b border-ink pb-2">
          <b className="font-display text-xl">{shop?.shop_name}</b>
          <span className="text-xs text-muted">{shop?.shop_address}{shop?.shop_whatsapp ? ` · WA +${shop.shop_whatsapp}` : ""}</span>
        </header>
        <div className="flex justify-between"><span><b className="text-base">{r.staff_name}</b><span className="block text-xs text-muted">{CAT[r.category].label}</span></span>
          <span className="text-right">Slip gaji<b className="block">{monthLabel(bulan)}</b></span></div>
        <table className="w-full">
          <tbody>{lines.map(([k, v]) => <tr key={k} className="border-t border-[#EEEEEA]"><td className="py-1">{k}</td><td className="text-right">{v}</td></tr>)}</tbody>
        </table>
        <div className="flex items-baseline justify-between border-y-2 border-ink py-2"><b>Total dibayar</b><b className="font-display text-2xl">{formatRupiah(r.total_pay)}</b></div>
        <p className="text-xs">{r.paid_at ? `Status: dibayar ${formatTanggal(r.paid_at)} (${r.paid_method})` : r.closed ? "Status: belum dibayar" : "Status: estimasi (periode belum ditutup)"}</p>
        <section>
          <b className="text-xs uppercase tracking-wide text-muted">Rincian</b>
          <table className="w-full text-xs">
            <tbody>{(items ?? []).slice().reverse().map((i) => (
              <tr key={i.transaction_item_id} className="border-t border-[#EEEEEA]"><td className="py-0.5">{formatTanggal(i.created_at)}</td><td>{i.name}</td><td className="text-right">{formatRupiah(i.commission)}</td></tr>
            ))}</tbody>
          </table>
        </section>
      </article>
    </div>
  );
}
