// Dipakai komponen server (slip) & klien — jangan taruh di modul "use client".
export const CAT = { barbershop: { label: "Barbershop", color: "#1F2937" }, nail: { label: "Nail Art", color: "#6F8F7A" }, massage: { label: "Pijat", color: "#C58A2B" } } as const;
/** Staf non-layanan (mis. kasir) tak ada di CAT → tampilan netral, jangan crash. */
export const catInfo = (c: string): { label: string; color: string } => (CAT as Record<string, { label: string; color: string }>)[c] ?? { label: c === "kasir" ? "Kasir" : c, color: "#9AA3B0" };
export const monthLabel = (m: string) => new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${m}-01T00:00:00Z`));
export const shiftMonth = (m: string, d: number) => new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7) - 1 + d, 1)).toISOString().slice(0, 7);

// Minggu komisi Senin–Minggu (tanggal "YYYY-MM-DD", tanpa jam — aman dari zona waktu).
const day = (d: string) => new Date(`${d}T00:00:00Z`);
export const plusDays = (d: string, n: number) => { const t = day(d); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
/** Senin di minggu tanggal itu. */
export const mondayOf = (d: string) => plusDays(d, -((day(d).getUTCDay() + 6) % 7));
export const shiftWeek = (monday: string, n: number) => plusDays(monday, 7 * n);
/** "28 Sep – 4 Okt 2026" */
export const weekLabel = (monday: string) => {
  const f = (d: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("id-ID", { ...o, timeZone: "UTC" }).format(day(d));
  return `${f(monday, { day: "numeric", month: "short" })} – ${f(plusDays(monday, 6), { day: "numeric", month: "short", year: "numeric" })}`;
};

// ---- Kasbon di gaji bulanan (T-01900551, Opsi A) ----
// Staf non-bulanan: kasbon dipotong HANYA lewat komisi mingguan (dibawa lintas bulan); commission_live tak lagi memuat adjustment kasbon mereka.
// pay_monthly: kasbon tetap lewat adjustments. Snapshot lama (sebelum perbaikan) masih memuat adjustment kasbon.
export type KasbonInfo = {
  /** Σ kasbon non-void s/d akhir bulan */ expenses: number;
  /** Σ commission_week_pays.kasbon s/d bulan ini (terpotong dari komisi) */ cut: number;
  /** Σ kasbon bulan ini yang ditautkan payroll_adjustments (non-void), positif */ adjKasbon: number;
  /** Σ SEMUA payroll_adjustments bulan ini */ adjAll: number;
  /** Σ kasbon yang dipotong di minggu-minggu bulan ini */ cutMonth: number;
};
export const NO_KASBON: KasbonInfo = { expenses: 0, cut: 0, adjKasbon: 0, adjAll: 0, cutMonth: 0 };

/** Sisa utang kasbon yang belum terpotong komisi (info; ditunggu dari komisi minggu berikut). Tak pernah negatif. */
export const kasbonDebt = (k: KasbonInfo) => Math.max(0, k.expenses - k.cut);

/**
 * Sisa dibayar akhir bulan. total_pay − bayaran mingguan (net) − kasbon yang sudah dipotong mingguan.
 * Bila total_pay sudah memuat adjustment kasbon (pay_monthly, atau snapshot lama), potongan mingguan sudah tertutup oleh adjustment → jangan kurangi dua kali.
 * Deteksi: adjustments (di total_pay) == semua adjustment bulan itu & ada adjustment kasbon.
 * ponytail: void transaksi dari minggu terbayar (commission_deductions) ikut di kolom kasbon mingguan → bisa menggeser sisa sebesar potongan itu; kasus langka, tak dikoreksi.
 */
export const restPay = (totalPay: number, adjustments: number, weeklyNet: number, k: KasbonInfo) => {
  const kasbonInTotal = k.adjKasbon !== 0 && adjustments === k.adjAll;
  return totalPay - weeklyNet - (kasbonInTotal ? 0 : k.cutMonth);
};
