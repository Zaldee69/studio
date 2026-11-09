import "server-only";
import { formatRupiah, jktDate } from "@/lib/domain/format";
import { createClient } from "@/lib/supabase/server";
import { JadwalScreen } from "../jadwal/jadwal-screen";
import { KasirScreen } from "../kasir/kasir-screen";
import { PelangganScreen } from "../pelanggan/pelanggan-screen";
import { loadMaster } from "./load";
import { APPT_SELECT, type Customer, type DayAppt } from "./types";

type SP = Promise<Record<string, string | string[] | undefined>>;

/** Halaman konter dipakai bersama manajer & kasir; peran menentukan base URL & hak aksi. */
export async function JadwalPage({ role, searchParams }: { role: "manager" | "cashier"; searchParams: SP }) {
  const [master, sp] = await Promise.all([loadMaster(role), searchParams]);
  let customer: Customer | null = null;
  if (typeof sp.customer === "string") {
    const { data } = await (await createClient()).from("customers").select("id, name, whatsapp, notes").eq("id", sp.customer).maybeSingle();
    customer = data;
  }
  return <JadwalScreen master={master} initialCustomer={customer} />;
}

export async function KasirPage({ role, searchParams }: { role: "manager" | "cashier"; searchParams: SP }) {
  const [master, sp] = await Promise.all([loadMaster(role), searchParams]);
  let appt: DayAppt | null = null;
  if (typeof sp.booking === "string") {
    const { data } = await (await createClient()).from("appointments").select(APPT_SELECT).eq("id", sp.booking)
      .not("status", "in", "(paid,cancelled)").maybeSingle();
    appt = data as unknown as DayAppt | null;
  }
  return <KasirScreen master={master} initialAppt={appt} bonusLine={role === "cashier" ? await cashierBonusLine() : undefined} />;
}

/** Progres bonus kasir bulan ini (1% omzet bersih bila ≥ batas) — hanya di layar kasir. */
async function cashierBonusLine() {
  const { data } = await (await createClient()).rpc("cashier_bonus", { p_month: `${jktDate().slice(0, 7)}-01` });
  const b = data as { revenue: number; min: number; pct: number; bonus: number } | null;
  if (!b || !b.min) return undefined;
  return b.bonus
    ? `Omzet bulan ini ${formatRupiah(b.revenue)} · bonus ${b.pct}% tercapai: ${formatRupiah(b.bonus)}`
    : `Omzet bulan ini ${formatRupiah(b.revenue)} dari ${formatRupiah(b.min)} untuk bonus ${b.pct}%`;
}

export async function PelangganPage({ role }: { role: "manager" | "cashier" }) {
  return <PelangganScreen master={await loadMaster(role)} />;
}
