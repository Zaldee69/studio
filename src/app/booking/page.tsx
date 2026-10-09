import type { Metadata } from "next";
import { COMING_SOON, ONLINE_CATS, isOnlineCat } from "@/lib/domain/category";
import { getProfile } from "@/lib/auth";
import { jktDate } from "@/lib/domain/format";
import { photoUrl } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";
import BookingFlow, { type Cust, type Init, type Reschedule } from "./booking-flow";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Reservasi online",
  description: "Pilih layanan barbershop & nail, kapster, dan jam yang benar-benar kosong. Bayar di toko.",
  alternates: { canonical: "/booking" },
};

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

// Booking online — alur & layout desain Booking.dc.html, gaya Landing. State langkah tersimpan di URL.
export default async function BookingPage({ searchParams }: PageProps<"/booking">) {
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: services }, { data: staff }, { data: shop }, { data: hours }, { data: closures }, { data: bookable }, profile] = await Promise.all([
    supabase.from("public_services").select("id, name, category, price, duration_min, public_description, online_bookable").neq("category", "retail").order("sort"),
    supabase.from("public_staff").select("id, name, category, photo_path").order("sort"),
    supabase.from("public_settings").select("*").single(),
    supabase.from("opening_hours").select("weekday, open_time, close_time, closed"),
    supabase.from("special_closures").select("date").gte("date", jktDate()),
    supabase.rpc("bookable_categories"), // kategori yang punya kursi/meja & staf aktif
    getProfile(),
  ]);

  let customer: Cust = null;
  let reschedule: Reschedule = null;
  if (profile?.role === "customer" && profile.customer_id) {
    const { data } = await supabase.from("my_customer").select("name, whatsapp").single();
    customer = { name: data?.name ?? profile.full_name, wa: data?.whatsapp ?? null };
    const ulang = one(sp.ulang);
    if (ulang) {
      const [{ data: g }, { data: appts }] = await Promise.all([
        supabase.from("booking_groups").select("id, code").eq("id", ulang).maybeSingle(),
        supabase.from("appointments").select("start_at, staff_id, resource:resources(type), appointment_services(service_id)")
          .eq("booking_group_id", ulang).in("status", ["booked", "pending_review"]),
      ]);
      if (g && appts?.length) {
        reschedule = {
          groupId: g.id, code: g.code,
          serviceIds: appts.flatMap((a) => a.appointment_services.map((s) => s.service_id)),
          pick: Object.fromEntries(appts.filter((a) => a.staff_id && a.resource).map((a) => [a.resource!.type, a.staff_id!])),
          together: new Set(appts.map((a) => a.start_at)).size === 1,
          startAt: appts.map((a) => a.start_at).sort()[0],
        };
      }
    }
  }

  const init: Init = {
    step: one(sp.langkah), services: one(sp.layanan)?.split(",").filter(Boolean) ?? [],
    pick: Object.fromEntries((one(sp.staf) ?? "").split(",").filter(Boolean).map((x) => x.split(":")).filter((x) => x.length === 2)),
    together: one(sp.mode) !== "berurutan", date: one(sp.tgl), time: one(sp.jam),
    cat: one(sp.kategori) === "nail" ? "nail" : "barbershop",
  };
  const cats = ONLINE_CATS.filter((c) => (bookable ?? []).includes(c) && !COMING_SOON.includes(c));
  if (cats.length && !cats.includes(init.cat)) init.cat = cats[0];

  return (
    <BookingFlow
      customer={customer} init={init} reschedule={reschedule}
      team={profile && profile.role !== "customer"
        ? { manager: "/manajer/jadwal", cashier: "/kasir/jadwal", staff: "/kapster/jadwal" }[profile.role as "manager" | "cashier" | "staff"] ?? "/login"
        : null}
      cats={cats}
      services={(services ?? []).filter((s) => s.online_bookable && (cats as readonly string[]).includes(s.category!)).map((s) => ({
        id: s.id!, name: s.name!, category: s.category as "barbershop" | "nail", price: s.price!, duration: s.duration_min!, description: s.public_description ?? "",
      }))}
      staff={(staff ?? []).flatMap((s) => isOnlineCat(s.category!) ? [{ id: s.id!, name: s.name!, category: s.category, photo: photoUrl(s.photo_path) }] : [])}
      hours={hours ?? []} closures={(closures ?? []).map((c) => c.date)}
      shop={{
        name: shop?.shop_name ?? BRAND, address: shop?.shop_address ?? "", whatsapp: shop?.shop_whatsapp ?? "",
        bundlePct: shop?.bundle_pct ?? 10, maxDays: shop?.booking_max_days_ahead ?? 14, cutoffHours: shop?.cancel_cutoff_hours ?? 2,
        promo: { pct: shop?.online_promo_pct ?? 0, start: shop?.online_promo_start ?? null, end: shop?.online_promo_end ?? null },
        open: (shop?.online_booking_open ?? true) && cats.length > 0, review: shop?.online_booking_mode === "review",
      }}
    />
  );
}
