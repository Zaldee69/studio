/** Modul yang bisa disembunyikan dari menu/tab (settings.hidden_features; datanya tetap). Audit menu 10 Nov. */
export const FEATURES = [
  ["sop", "SOP & kepatuhan (menu manajer, SOP di HP capster)"],
  ["gaya", "Katalog & konsultasi gaya (HP capster)"],
  ["stasiun", "Stasiun & PIN (tablet bersama)"],
  ["deposit", "Paket deposit"],
  ["pemasok", "Pemasok (Inventaris)"],
  ["evaluasi", "Evaluasi tahunan (SDM)"],
] as const;
export type Feature = (typeof FEATURES)[number][0];
