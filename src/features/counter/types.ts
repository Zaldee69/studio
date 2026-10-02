import type { DayHours } from "@/lib/domain/hours";
import type { ApptStatus } from "@/lib/domain/status";
import type { PayMethod } from "@/lib/domain/cart";

export type Cat = "barbershop" | "nail";
export type SvcCat = Cat | "retail";
export type Svc = { id: string; name: string; category: SvcCat; price: number; duration_min: number; upsell_service_id: string | null; stock_item_id: string | null; needs_pedicure: boolean; active: boolean; sort: number };
export type Staff = { id: string; name: string; category: Cat; active: boolean; sort: number; home_resource_id: string | null };
export type Resource = { id: string; name: string; type: Cat; is_pedicure: boolean; active: boolean; sort: number };
export type Pack = { id: string; name: string; amount_paid: number; amount_credited: number };
export type Shop = { name: string; open: string; close: string; bundlePct: number; churnWeeks: number; waTemplate: string;
  address: string; whatsapp: string; instagram: string;
  bufferMin: number; hours: DayHours[]; closures: string[] };

export type Master = {
  role: "manager" | "cashier"; userId: string; userName: string; base: "/manajer" | "/kasir";
  services: Svc[]; staff: Staff[]; resources: Resource[]; packs: Pack[]; shop: Shop;
};

export type Customer = { id: string; name: string; whatsapp: string | null; notes: string };

export type DayAppt = {
  id: string; start_at: string; end_at: string; duration_min: number; status: ApptStatus;
  source: "admin" | "walk_in" | "whatsapp" | "online"; notes: string; cancel_reason: string | null;
  resource_id: string; staff_id: string | null; customer_id: string | null;
  arrived_at: string | null; service_started_at: string | null; service_ended_at: string | null;
  change_request: string | null; change_requested_at: string | null;
  booking_group_id: string | null; group: { code: string } | null;
  customer: Customer | null;
  appointment_services: { service_id: string }[];
};

export type TxRow = {
  id: string; created_at: string; customer_id: string | null; subtotal: number; discount_amount: number; discount_label: string;
  total: number; deposit_used: number; paid_amount: number; payment_method: PayMethod; cash_received: number | null;
  cashier_id: string | null; voided_at: string | null; void_reason: string | null;
  customer: { name: string; whatsapp: string | null } | null;
  transaction_items: { id: string; name: string; category: SvcCat; price: number; discount_share: number; net_amount: number; staff_id: string | null; appointment_id: string | null }[];
};

export const APPT_SELECT = "id, start_at, end_at, duration_min, status, source, notes, cancel_reason, resource_id, staff_id, customer_id, arrived_at, service_started_at, service_ended_at, change_request, change_requested_at, booking_group_id, group:booking_groups(code), customer:customers(id, name, whatsapp, notes), appointment_services(service_id)";
export const TX_SELECT = "id, created_at, customer_id, subtotal, discount_amount, discount_label, total, deposit_used, paid_amount, payment_method, cash_received, cashier_id, voided_at, void_reason, customer:customers(name, whatsapp), transaction_items(id, name, category, price, discount_share, net_amount, staff_id, appointment_id)";

export type TimeOffRow = { id: string; staff_id: string; start_at: string; end_at: string; all_day: boolean; reason: string; status: "pending" | "approved" | "rejected" | "cancelled" };
