import { normalizeConsult, storedConsult } from "@/lib/domain/hair";
import { DAILY_LIMIT, HttpError, analyzePhoto, bookingFor, fail, json, loadCatalog, photoFrom, requireConsultUser } from "@/lib/hair/server";
import { createAdminClient } from "@/lib/supabase/server";

export const maxDuration = 60;

/** Kapster/kasir/manajer mengunggah foto pelanggan → rekomendasi dari katalog. Foto tidak disimpan. */
export async function POST(req: Request) {
  try {
    const me = await requireConsultUser();
    const form = await req.formData();
    if (form.get("consent") !== "1") throw new HttpError(400, "Pastikan pelanggan setuju fotonya dipakai untuk rekomendasi.");
    const photo = photoFrom(form);
    // booking yang sedang dilayani → hasil tersimpan di riwayat pelanggan; tanpa booking = walk-in (tidak tertaut)
    const appointmentId = String(form.get("appointment_id") ?? "");
    const booking = appointmentId ? await bookingFor(me, appointmentId) : null;

    const admin = createAdminClient();
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { count } = await admin.from("hair_consults").select("id", { count: "exact", head: true }).eq("actor", me.id).gte("created_at", since);
    if ((count ?? 0) >= DAILY_LIMIT()) throw new HttpError(429, `Batas ${DAILY_LIMIT()} konsultasi per hari tercapai. Coba lagi besok.`);

    const catalog = await loadCatalog();
    if (!catalog.some((s) => s.reference_images.length)) {
      throw new HttpError(409, "Katalog gaya belum punya foto referensi. Minta manajer mengisi Pengaturan → Katalog gaya.");
    }
    const dataUrl = `data:${photo.type};base64,${Buffer.from(await photo.arrayBuffer()).toString("base64")}`;
    const result = normalizeConsult(await analyzePhoto(dataUrl, catalog), catalog);

    const { data: row, error } = await admin.from("hair_consults").insert({
      actor: me.id, status: result.status, appointment_id: booking?.id ?? null, customer_id: booking?.customer_id ?? null,
      result: result.status === "success" ? storedConsult(result) : { reason: result.reason },
    }).select("id").single();
    if (error) throw error;
    return json({ consult_id: row.id, ...result });
  } catch (e) {
    return fail(e);
  }
}
