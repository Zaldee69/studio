// Segmen penerima campaign promosi. Cermin campaign_audience() di SQL — ubah keduanya bersamaan.
import { CAT_NAME, type Cat } from "./category";
import { formatRupiah } from "./format";

export type Segment = { inactive_weeks?: number; categories?: string[]; min_visits?: number; min_spend?: number; online?: boolean; waitlist?: "nail" | "lashes" };

/** Segmen dalam kalimat biasa, mis. "Pelanggan yang terakhir datang ≥ 8 minggu lalu dan pernah memakai Pijat". */
export function describeSegment(s: Segment): string {
  const parts: string[] = [];
  if (s.inactive_weeks) parts.push(`terakhir datang ≥ ${s.inactive_weeks} minggu lalu`);
  if (s.categories?.length) parts.push(`pernah memakai ${s.categories.map((c) => CAT_NAME[c as Cat] ?? c).join(" atau ")}`);
  if (s.min_visits) parts.push(`sudah datang ≥ ${s.min_visits}×`);
  if (s.min_spend) parts.push(`total belanja ≥ ${formatRupiah(s.min_spend)}`);
  if (s.online === true) parts.push("pernah booking online");
  if (s.online === false) parts.push("belum pernah booking online");
  if (s.waitlist) parts.push(`masuk daftar tunggu ${s.waitlist === "nail" ? "Nail Art" : "Lashes"}`);
  return parts.length ? `Pelanggan yang ${parts.join(" dan ")}` : "Semua pelanggan yang punya WhatsApp";
}

/** Pilihan cepat di editor campaign. */
export const PRESETS: { label: string; segment: Segment }[] = [
  { label: "Semua pelanggan", segment: {} },
  { label: "Lama tidak datang", segment: { inactive_weeks: 8 } },
  { label: "Pelanggan setia", segment: { min_visits: 5 } },
  { label: "Belum pernah booking online", segment: { online: false } },
  { label: "Daftar tunggu Nail Art", segment: { waitlist: "nail" } },
  { label: "Daftar tunggu Lashes", segment: { waitlist: "lashes" } },
];

/** Hapus nilai kosong agar segmen tersimpan rapi (dan sama persis dengan preset). */
export function cleanSegment(s: Segment): Segment {
  return Object.fromEntries(Object.entries(s).filter(([, v]) => v !== undefined && v !== null && v !== 0 && !(Array.isArray(v) && !v.length))) as Segment;
}

const DAYS = /\b(hari ini|besok|lusa|senin|selasa|rabu|kamis|jumat|jum'at|sabtu|minggu ini)\b|\b\d{1,2} (jan|feb|mar|apr|mei|jun|jul|agu|sep|okt|nov|des)/i;

/**
 * Peringatan sebelum blast (insiden 2–3 Nov): link situs tanpa ?src= tidak terlacak, dan blast yang melebihi batas harian
 * sampai di hari berbeda-beda → "hari ini"/nama hari/tanggal di teks bisa salah bagi sebagian penerima.
 */
export function blastWarnings(message: string, recipients: number, dailyLimit: number): string[] {
  const w: string[] = [];
  if (/dprasstudio\.com/i.test(message) && !/dprasstudio\.com\S*\?src=\w+/i.test(message))
    w.push("Link dprasstudio.com belum memakai ?src=… (mis. dprasstudio.com/booking?src=wa) — kunjungan dari blast tidak akan terlacak.");
  const days = Math.ceil(recipients / Math.max(dailyLimit, 1));
  if (days > 1 && DAYS.test(message))
    w.push(`Pesan akan sampai dalam ${days} hari (batas ${dailyLimit}/hari), tapi teksnya menyebut hari/tanggal ("hari ini", nama hari, atau tanggal) — bisa salah bagi penerima di hari berikutnya.`);
  return w;
}
