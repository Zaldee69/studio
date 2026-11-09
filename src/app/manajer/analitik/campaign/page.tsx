import { DateInput } from "@/components/date-input";
import { Button } from "@/components/ui/button";
import { RouteTabs, RENCANA_TABS } from "@/components/route-tabs";
import Link from "next/link";
import { CUSTOMER_SOURCES } from "@/lib/domain/customer";
import { formatRupiah, formatTanggal, jktDate } from "@/lib/domain/format";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Laporan campaign" };

type Report = {
  from: string; to: string;
  cuts: { senkam_days: number; senkam_cuts: number; weekend_days: number; weekend_cuts: number; total: number; upgrade: number };
  weekly: { week: string; tx: number; with_customer: number }[];
  vouchers: { code: string; quota: number | null; used_total: number; tx: number; discount: number; net?: number; commission?: number; studio?: number }[];
  new_customers: { source: string; n: number }[];
  web: { source: string; visits: number; booked: number }[];
};

const SRC: Record<string, string> = {
  ...Object.fromEntries(CUSTOMER_SOURCES), tidak_tercatat: "Belum dicatat", tidak_diketahui: "Tidak diketahui",
  google: "Google (pencarian / Maps)", langsung: "Langsung", facebook: "Facebook", tiktok: "TikTok",
};
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const one = (v: string | string[] | undefined) => (typeof v === "string" && ISO.test(v) ? v : undefined);
const avg = (n: number, d: number) => (d ? (n / d).toLocaleString("id-ID", { maximumFractionDigits: 1 }) : "—");
const pct = (n: number, d: number) => (d ? `${Math.round((n * 100) / d)}%` : "—");

function Card({ label, value, note, ok }: { label: string; value: string; note: string; ok?: boolean | null }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-line bg-card p-4">
      <span className="text-xs text-muted">{label}</span>
      <b className={`font-display text-3xl tabular ${ok == null ? "" : ok ? "text-[#1F7A45]" : "text-[#A12A2A]"}`}>{value}</b>
      <span className="text-xs text-muted">{note}</span>
    </div>
  );
}

function Table({ title, head, rows, empty }: { title: string; head: string[]; rows: React.ReactNode[][]; empty: string }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      {rows.length ? (
        <div className="overflow-x-auto rounded-2xl border border-line bg-card px-4">
          <table className="w-full min-w-[420px] text-sm tabular">
            <thead><tr className="text-left text-xs text-muted">{head.map((h, i) => <th key={h} className={`py-2 font-semibold ${i ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
            <tbody>{rows.map((r, i) => <tr key={i} className="border-t border-line">{r.map((c, j) => <td key={j} className={`py-2 ${j ? "text-right" : ""}`}>{c}</td>)}</tr>)}</tbody>
          </table>
        </div>
      ) : <p className="text-sm text-muted">{empty}</p>}
    </section>
  );
}

// Angka rapat campaign dalam satu halaman: potong Sen–Kam vs akhir pekan, upgrade paket, pelanggan tercatat, voucher, sumber.
export default async function CampaignReport({ searchParams }: PageProps<"/manajer/analitik/campaign">) {
  const sp = await searchParams;
  const today = jktDate();
  const from = one(sp.dari) ?? `${today.slice(0, 8)}01`, to = one(sp.sampai) ?? today;
  const supabase = await createClient();
  const [{ data, error }, { data: g }] = await Promise.all([
    supabase.rpc("campaign_report", { p_from: from, p_to: to }),
    supabase.from("settings").select("target_cuts_senkam, target_cuts_weekend_max, target_upgrade_pct, target_customer_pct").single(),
  ]);
  // target dari Analitik → Target KPI (satu rumah)
  const t = { senkam: Number(g?.target_cuts_senkam ?? 5.5), weekend: Number(g?.target_cuts_weekend_max ?? 14), upgrade: g?.target_upgrade_pct ?? 30, customer: g?.target_customer_pct ?? 40 };
  const num = (v: number) => v.toLocaleString("id-ID");
  const r = data as unknown as Report | null;
  const c = r?.cuts;
  const tx = (r?.weekly ?? []).reduce((a, w) => ({ n: a.n + w.tx, wc: a.wc + w.with_customer }), { n: 0, wc: 0 });

  return (
    <div className="flex flex-col gap-6">
      <RouteTabs tabs={RENCANA_TABS} label="Bagian rencana & target" />
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-1 flex-col gap-1">
          <h1 className="font-display text-3xl font-bold">Laporan campaign</h1>
        </div>
        <form className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col text-xs text-muted">Dari<DateInput name="dari" defaultValue={from} max={today} className="h-11 w-40" /></label>
          <label className="flex flex-col text-xs text-muted">Sampai<DateInput name="sampai" defaultValue={to} max={today} className="h-11 w-40" /></label>
          <Button className="h-11 px-5">Tampilkan</Button>
        </form>
      </div>
      {error || !r || !c ? <p role="alert" className="text-sm text-[#A12A2A]">{error?.message ?? "Laporan tidak tersedia."}</p> : (
        <>
          <p className="text-sm text-muted">{formatTanggal(from)} – {formatTanggal(to)} · target (ubah di <Link href="/manajer/analitik#target" className="underline">Target KPI</Link>): Sen–Kam ≥{num(t.senkam)} potong/hari, Jum–Min ≤{num(t.weekend)}, naik paket ≥{t.upgrade}%, transaksi dengan pelanggan ≥{t.customer}%.</p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Card label="Potong per hari, Senin–Kamis" value={avg(c.senkam_cuts, c.senkam_days)} note={`${c.senkam_cuts} potong dalam ${c.senkam_days} hari`}
              ok={c.senkam_days ? c.senkam_cuts / c.senkam_days >= t.senkam : null} />
            <Card label="Potong per hari, Jumat–Minggu" value={avg(c.weekend_cuts, c.weekend_days)} note={`${c.weekend_cuts} potong dalam ${c.weekend_days} hari · batas nyaman ${num(t.weekend)}`}
              ok={c.weekend_days ? c.weekend_cuts / c.weekend_days <= t.weekend : null} />
            <Card label="Naik paket" value={pct(c.upgrade, c.total)} note={`${c.upgrade} dari ${c.total} potong`} ok={c.total ? c.upgrade / c.total >= t.upgrade / 100 : null} />
            <Card label="Transaksi dengan pelanggan" value={pct(tx.wc, tx.n)} note={`${tx.wc} dari ${tx.n} transaksi`} ok={tx.n ? tx.wc / tx.n >= t.customer / 100 : null} />
          </div>
          <Table title="Pelanggan tercatat per minggu" head={["Minggu mulai", "Transaksi", "Dengan pelanggan", "Persen"]}
            rows={r.weekly.map((w) => [formatTanggal(w.week), w.tx, w.with_customer, pct(w.with_customer, w.tx)])} empty="Belum ada transaksi." />
          <Table title="Voucher dipakai di periode ini (komisi dari harga normal → potongan ditanggung studio)" head={["Kode", "Transaksi", "Total potongan", "Omzet bersih", "Komisi", "Bagian studio", "Terpakai / kuota (semua waktu)"]}
            rows={r.vouchers.map((v) => [v.code, v.tx, formatRupiah(v.discount), formatRupiah(v.net ?? 0), formatRupiah(v.commission ?? 0), formatRupiah(v.studio ?? 0), `${v.used_total}${v.quota ? ` / ${v.quota}` : ""}`])} empty="Belum ada voucher terpakai." />
          <Table title="Pelanggan baru: tahu dari mana" head={["Sumber", "Pelanggan baru"]}
            rows={r.new_customers.map((x) => [SRC[x.source] ?? x.source, x.n])} empty="Belum ada pelanggan baru." />
          <Table title="Pengunjung website per sumber" head={["Sumber", "Kunjungan", "Booking", "Konversi"]}
            rows={r.web.map((x) => [SRC[x.source] ?? x.source, x.visits, x.booked, pct(x.booked, x.visits)])} empty="Belum ada kunjungan tercatat." />
          <p className="text-xs text-muted">
            Supaya sumber website terbaca jelas, pakai tautan bertanda: bio Instagram <b>dprasstudio.com/?src=ig</b>, Google Business <b>dprasstudio.com/?src=maps</b>,
            blast WhatsApp <b>dprasstudio.com/?src=wa</b> (tautan langsung ke /booking?src=… juga tercatat). Kunjungan sebelum fitur ini aktif tercatat &quot;Tidak diketahui&quot;.
          </p>
        </>
      )}
    </div>
  );
}
