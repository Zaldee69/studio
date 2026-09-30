import "server-only";
import { cache } from "react";
import { jktDate } from "./domain/format";
import { addDays } from "./domain/schedule";
import { createPublicClient } from "./supabase/public";

/** Semua konten landing dari database (Pengaturan → Halaman publik). */
export const loadSite = cache(async () => {
  const db = createPublicClient();
  const [s, services, staff, packs, hours, closures, photos, reviews] = await Promise.all([
    db.from("public_settings").select("*").single(),
    db.from("public_services").select("id, name, category, price, duration_min, public_description").neq("category", "retail").order("sort"),
    db.from("public_staff").select("id, name, category, photo_path").order("sort"),
    db.from("public_deposit_packages").select("*").order("amount_paid"),
    db.from("opening_hours").select("weekday, open_time, close_time, closed").order("weekday"),
    db.from("special_closures").select("date, reason").gte("date", jktDate()).lte("date", addDays(jktDate(), 60)).order("date"),
    db.from("site_photos").select("id, kind, path, caption, sort").order("sort"),
    db.from("reviews").select("id, author, source, body").order("sort"),
  ]);
  return {
    s: s.data!, services: services.data ?? [], staff: staff.data ?? [], packs: packs.data ?? [], hours: hours.data ?? [],
    closures: closures.data ?? [], photos: photos.data ?? [], reviews: reviews.data ?? [],
  };
});

export const igUrl = (h: string) => (h ? `https://instagram.com/${h.replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//, "")}` : "");
