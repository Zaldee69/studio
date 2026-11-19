// Dipakai komponen server (laporan PDF) & klien — jangan taruh di modul "use client".
// Warna per entitas (P5): tervalidasi kontras ≥3:1 terhadap kartu putih; teks tetap ink (Ritel 3,6:1 tidak dipakai untuk teks).
export const COLOR = { barbershop: "#1F2937", nail: "#6F8F7A", massage: "#C58A2B", retail: "#527A9A" } as const;
export const CAT_LABEL = { barbershop: "Barbershop", nail: "Nail Art", massage: "Pijat", retail: "Ritel" } as const;
export const rb = (n: number) => (Math.abs(n) >= 1e6 ? `${(n / 1e6).toLocaleString("id-ID", { maximumFractionDigits: 1 })}jt` : `${Math.round(n / 1000)}rb`);
