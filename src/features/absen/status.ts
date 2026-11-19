export type KRow = {
  profile_id: string; nama: string; kelompok: string; tanggal: string; in_at: string | null; out_at: string | null; auto_out: boolean;
  late_min: number; manual: boolean; note: string; libur: string | null; tutup: boolean;
};
export type KStatus = "hadir" | "telat" | "bolos" | "libur" | "izin" | "tutup" | "belum" | "nanti";

/** Status satu orang di satu hari. Hari ini tanpa absen = "belum" (belum tentu bolos); bolos hanya untuk hari yang sudah lewat. */
export function statusOf(r: Pick<KRow, "tanggal" | "in_at" | "late_min" | "libur" | "tutup">, today: string): KStatus {
  if (r.in_at) return r.late_min > 0 ? "telat" : "hadir";
  if (r.libur) return r.libur === "libur" ? "libur" : "izin";
  if (r.tutup) return "tutup";
  if (r.tanggal > today) return "nanti";
  return r.tanggal === today ? "belum" : "bolos";
}

export function rekap(rows: KRow[], today: string) {
  const o = { hadir: 0, telat: 0, bolos: 0, menitTelat: 0 };
  for (const r of rows) {
    const s = statusOf(r, today);
    if (s === "hadir") o.hadir++;
    else if (s === "telat") { o.hadir++; o.telat++; o.menitTelat += r.late_min; }
    else if (s === "bolos") o.bolos++;
  }
  return o;
}
