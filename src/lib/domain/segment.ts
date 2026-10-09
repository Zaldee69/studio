// Segmen penerima campaign promosi. Cermin campaign_audience() di SQL — ubah keduanya bersamaan.
import { CAT_NAME, type Cat } from "./category";
import { formatRupiah } from "./format";

export type Segment = { inactive_weeks?: number; categories?: string[]; min_visits?: number; min_spend?: number; online?: boolean };

/** Segmen dalam kalimat biasa, mis. "Pelanggan yang terakhir datang ≥ 8 minggu lalu dan pernah memakai Pijat". */
export function describeSegment(s: Segment): string {
  const parts: string[] = [];
  if (s.inactive_weeks) parts.push(`terakhir datang ≥ ${s.inactive_weeks} minggu lalu`);
  if (s.categories?.length) parts.push(`pernah memakai ${s.categories.map((c) => CAT_NAME[c as Cat] ?? c).join(" atau ")}`);
  if (s.min_visits) parts.push(`sudah datang ≥ ${s.min_visits}×`);
  if (s.min_spend) parts.push(`total belanja ≥ ${formatRupiah(s.min_spend)}`);
  if (s.online === true) parts.push("pernah booking online");
  if (s.online === false) parts.push("belum pernah booking online");
  return parts.length ? `Pelanggan yang ${parts.join(" dan ")}` : "Semua pelanggan yang punya WhatsApp";
}

/** Pilihan cepat di editor campaign. */
export const PRESETS: { label: string; segment: Segment }[] = [
  { label: "Semua pelanggan", segment: {} },
  { label: "Lama tidak datang", segment: { inactive_weeks: 8 } },
  { label: "Pelanggan setia", segment: { min_visits: 5 } },
  { label: "Belum pernah booking online", segment: { online: false } },
];

/** Hapus nilai kosong agar segmen tersimpan rapi (dan sama persis dengan preset). */
export function cleanSegment(s: Segment): Segment {
  return Object.fromEntries(Object.entries(s).filter(([, v]) => v !== undefined && v !== null && v !== 0 && !(Array.isArray(v) && !v.length))) as Segment;
}
