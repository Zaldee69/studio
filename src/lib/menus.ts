import type { IconName } from "@/components/icons";

import type { Feature } from "@/lib/features";

/** also = halaman lain yang termasuk menu ini (menu tetap tersorot); feature = disembunyikan bila ada di settings.hidden_features. */
export type MenuItem = { href: string; label: string; short?: string; icon: IconName; badge?: "follow" | "ready" | "online" | "stock";
  also?: string[]; feature?: Feature };

// Audit menu 10 Nov: 14 → 10 menu. 4 pertama = tab bawah di HP (Kasir jarang dipakai manajer: 6 vs 928 perubahan oleh kasir).
export const MANAGER_MENU: MenuItem[] = [
  { href: "/manajer", label: "Beranda", icon: "home" },
  { href: "/manajer/rencana", label: "Rencana & Target", short: "Rencana", icon: "target", also: ["/manajer/analitik"] },
  { href: "/manajer/jadwal", label: "Jadwal", icon: "calendar", badge: "online", also: ["/manajer/izin", "/manajer/libur"] },
  { href: "/manajer/pelanggan", label: "Pelanggan", icon: "users", badge: "follow", also: ["/manajer/promosi"] },
  { href: "/manajer/kasir", label: "Kasir", icon: "cash", badge: "ready" },
  { href: "/manajer/sdm", label: "SDM & Komisi", short: "SDM", icon: "badge" },
  { href: "/manajer/pengeluaran", label: "Pengeluaran", short: "Biaya", icon: "receipt" },
  { href: "/manajer/inventaris", label: "Inventaris", short: "Stok", icon: "box", badge: "stock" },
  { href: "/manajer/audit", label: "Audit & kecurigaan", short: "Audit", icon: "pulse" },
  { href: "/manajer/sop", label: "SOP & Kepatuhan", short: "SOP", icon: "shield", feature: "sop" },
  { href: "/manajer/pengaturan", label: "Pengaturan", short: "Atur", icon: "gear" },
];

export const CASHIER_MENU: MenuItem[] = [
  { href: "/kasir/jadwal", label: "Jadwal", icon: "calendar", badge: "online" },
  { href: "/kasir/kasir", label: "Kasir", icon: "cash", badge: "ready" },
  { href: "/kasir/pelanggan", label: "Pelanggan", icon: "users", badge: "follow" },
  { href: "/kasir/pengeluaran", label: "Pengeluaran", short: "Biaya", icon: "receipt" },
  { href: "/kasir/opname", label: "Stok opname", short: "Opname", icon: "box" },
  { href: "/kasir/libur", label: "Jadwal libur", short: "Libur", icon: "calendar" },
];
