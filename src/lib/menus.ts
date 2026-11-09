import type { IconName } from "@/components/icons";

export type MenuItem = { href: string; label: string; short?: string; icon: IconName; badge?: "follow" | "ready" | "online" | "stock" };

export const MANAGER_MENU: MenuItem[] = [
  { href: "/manajer", label: "Beranda", icon: "home" },
  { href: "/manajer/jadwal", label: "Jadwal", icon: "calendar", badge: "online" },
  { href: "/manajer/kasir", label: "Kasir", icon: "cash", badge: "ready" },
  { href: "/manajer/pelanggan", label: "Pelanggan", icon: "users", badge: "follow" },
  { href: "/manajer/izin", label: "Izin staf", short: "Izin", icon: "clock" },
  { href: "/manajer/sdm", label: "SDM & Komisi", short: "SDM", icon: "badge" },
  { href: "/manajer/pengeluaran", label: "Pengeluaran", short: "Biaya", icon: "receipt" },
  { href: "/manajer/inventaris", label: "Inventaris", short: "Stok", icon: "box", badge: "stock" },
  { href: "/manajer/rencana", label: "Rencana & Target", short: "Rencana", icon: "target" },
  { href: "/manajer/analitik", label: "Analitik KPI", short: "KPI", icon: "chart" },
  { href: "/manajer/promosi", label: "Promosi (CRM)", short: "Promo", icon: "megaphone" },
  { href: "/manajer/audit", label: "Audit & kecurigaan", short: "Audit", icon: "pulse" },
  { href: "/manajer/sop", label: "SOP & Kepatuhan", short: "SOP", icon: "shield" },
  { href: "/manajer/pengaturan", label: "Pengaturan", short: "Atur", icon: "gear" },
];

export const CASHIER_MENU: MenuItem[] = [
  { href: "/kasir/jadwal", label: "Jadwal", icon: "calendar", badge: "online" },
  { href: "/kasir/kasir", label: "Kasir", icon: "cash", badge: "ready" },
  { href: "/kasir/pelanggan", label: "Pelanggan", icon: "users", badge: "follow" },
  { href: "/kasir/pengeluaran", label: "Pengeluaran", short: "Biaya", icon: "receipt" },
  { href: "/kasir/opname", label: "Stok opname", short: "Opname", icon: "box" },
];
