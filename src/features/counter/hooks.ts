"use client";

import { dayRange } from "@/lib/domain/schedule";
import { useRealtimeTable } from "@/lib/hooks/useRealtimeTable";
import { createClient } from "@/lib/supabase/client";
import { APPT_SELECT, TX_SELECT, type DayAppt, type TimeOffRow, type TxRow } from "./types";

export { APPT_SELECT, TX_SELECT };


/** Booking satu tanggal (Asia/Jakarta), realtime. Termasuk yang dibatalkan (disaring di UI). */
export function useDayAppointments(date: string) {
  return useRealtimeTable(["appointments", "appointment_services", "customers"], async () => {
    const [a, b] = dayRange(date);
    const { data, error } = await createClient().from("appointments").select(APPT_SELECT)
      .gte("start_at", a).lt("start_at", b).order("start_at");
    if (error) throw error;
    return (data ?? []) as unknown as DayAppt[];
  }, date);
}

/** Transaksi satu tanggal, realtime. */
export function useDayTransactions(date: string) {
  return useRealtimeTable(["transactions"], async () => {
    const [a, b] = dayRange(date);
    const { data, error } = await createClient().from("transactions").select(TX_SELECT)
      .gte("created_at", a).lt("created_at", b).order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as unknown as TxRow[];
  }, date);
}

/** Izin/cuti staf yang disetujui & menyentuh tanggal itu, realtime. */
export function useDayTimeOff(date: string) {
  return useRealtimeTable(["staff_time_off"], async () => {
    const [a, b] = dayRange(date);
    const { data } = await createClient().from("staff_time_off").select("id, staff_id, start_at, end_at, all_day, reason, status")
      .eq("status", "approved").lt("start_at", b).gt("end_at", a);
    return (data ?? []) as TimeOffRow[];
  }, date);
}
