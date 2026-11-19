// Pengelompokan daftar pijat di halaman publik (daftar panjang → mudah dibaca). Urutan = urutan tampil.
export const MASSAGE_GROUPS = ["Pijat", "Terapi", "Tambah waktu"] as const;
export const massageGroup = (name: string) =>
  /^tambah waktu/i.test(name) ? MASSAGE_GROUPS[2] : /^(pijat|paket)/i.test(name) ? MASSAGE_GROUPS[0] : MASSAGE_GROUPS[1];
/** Urut per kelompok (stabil: urutan asli dipertahankan di dalam kelompok). */
export const byMassageGroup = <T extends { name: string | null }>(l: T[]) =>
  [...l].sort((a, b) => MASSAGE_GROUPS.indexOf(massageGroup(a.name ?? "")) - MASSAGE_GROUPS.indexOf(massageGroup(b.name ?? "")));
