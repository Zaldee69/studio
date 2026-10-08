import { SHEET_MAX } from "@/lib/domain/hair";
import { CONSULT_TTL_MS, HttpError, PREVIEWS_PER_CONSULT, fail, json, loadCatalog, photoFrom, renderSheet, requireConsultUser } from "@/lib/hair/server";
import { createAdminClient } from "@/lib/supabase/server";

export const maxDuration = 180; // satu gambar grid kualitas high ± 80 dtk

/** Katalog lengkap (grid depan/samping) untuk ≤5 gaya teratas hasil konsultasi milik pengguna ini. Dihitung 1 pratinjau. */
export async function POST(req: Request) {
  try {
    const me = await requireConsultUser();
    const form = await req.formData();
    const photo = photoFrom(form);
    const admin = createAdminClient();
    const { data: c } = await admin.from("hair_consults").select("id, actor, created_at, result").eq("id", String(form.get("consult_id") ?? "")).maybeSingle();
    const ids = ((c?.result ?? {}) as { styles?: string[] }).styles ?? [];
    if (!c || c.actor !== me.id || !ids.length) throw new HttpError(404, "Konsultasi tidak ditemukan. Ambil foto lagi.");
    if (Date.now() - Date.parse(c.created_at) > CONSULT_TTL_MS) throw new HttpError(410, "Sesi konsultasi sudah lewat 30 menit. Ambil foto lagi.");
    const { data: claimed } = await admin.rpc("claim_hair_preview", { p_id: c.id, p_max: PREVIEWS_PER_CONSULT });
    if (!claimed) throw new HttpError(429, "Batas pratinjau untuk foto ini tercapai.");

    const catalog = await loadCatalog();
    const styles = ids.slice(0, SHEET_MAX).map((id) => catalog.find((s) => s.hair_style_id === id)).filter((s) => s !== undefined);
    if (!styles.length) throw new HttpError(409, "Tidak ada gaya untuk dibuatkan pratinjau.");
    return json({ styles: styles.map((s) => s.hair_style_id), image: await renderSheet(photo, styles) });
  } catch (e) {
    return fail(e);
  }
}
