import type { IconName } from "@/components/icons";

export type MenuItem = { href: string; label: string; short?: string; icon: IconName; ready?: boolean; badge?: "follow" | "ready" | "online" | "stock" };

export const MANAGER_MENU: MenuItem[] = [
  { href: "/manajer", label: "Beranda", icon: "home" },
  { href: "/manajer/jadwal", label: "Jadwal", icon: "calendar", ready: true, badge: "online" },
  { href: "/manajer/kasir", label: "Kasir", icon: "cash", ready: true, badge: "ready" },
  { href: "/manajer/pelanggan", label: "Pelanggan", icon: "users", ready: true, badge: "follow" },
  { href: "/manajer/izin", label: "Izin staf", short: "Izin", icon: "clock", ready: true },
  { href: "/manajer/sdm", label: "SDM & Komisi", short: "SDM", icon: "badge", ready: true },
  { href: "/manajer/inventaris", label: "Inventaris", short: "Stok", icon: "box", ready: true, badge: "stock" },
  { href: "/manajer/analitik", label: "Analitik KPI", short: "KPI", icon: "chart", ready: true },
  { href: "/manajer/sop", label: "SOP & Kepatuhan", short: "SOP", icon: "shield", ready: true },
  { href: "/manajer/pengaturan", label: "Pengaturan", short: "Atur", icon: "gear", ready: true },
];

export const CASHIER_MENU: MenuItem[] = [
  { href: "/kasir/jadwal", label: "Jadwal", icon: "calendar", ready: true, badge: "online" },
  { href: "/kasir/kasir", label: "Kasir", icon: "cash", ready: true, badge: "ready" },
  { href: "/kasir/pelanggan", label: "Pelanggan", icon: "users", ready: true, badge: "follow" },
  { href: "/kasir/opname", label: "Stok opname", short: "Opname", icon: "box", ready: true },
];

/** Modul placeholder per area: slug → judul. */
export const placeholders = (menu: MenuItem[], base: string) =>
  Object.fromEntries(menu.filter((m) => !m.ready && m.href !== base).map((m) => [m.href.slice(base.length + 1), m.label]));
