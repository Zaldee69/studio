import { CONSULT_TTL_MS, HttpError, bookingFor, fail, json, requireTeam } from "@/lib/hair/server";
import { createAdminClient } from "@/lib/supabase/server";

const PREVIEW_DAYS = 180;
const MAX_PREVIEW_BYTES = 5 * 1024 * 1024;
type Body = { appointment_id?: string; consult_id?: string | null; style_code?: string | null; style_name?: string;
  notes?: string; reaction?: string; preview?: string | null };

/**
 * Catat potongan yang benar-benar dilakukan untuk pelanggan dari booking: gaya, detail teknis, reaksi,
 * dan (opsional, dengan persetujuan) pratinjau terpilih — disimpan privat, terhapus otomatis setelah 6 bulan.
 */
export async function POST(req: Request) {
  try {
    const me = await requireTeam();
    const b = (await req.json().catch(() => ({}))) as Body;
    const booking = await bookingFor(me, String(b.appointment_id ?? ""));
    if (!booking.customer_id) throw new HttpError(400, "Booking ini walk-in tanpa data pelanggan — buat/pilih pelanggan dulu agar riwayat tersimpan.");
    if (!["puas", "biasa", "kurang"].includes(b.reaction ?? "")) throw new HttpError(400, "Pilih reaksi pelanggan.");

    const admin = createAdminClient();
    let hairstyleId: string | null = null, styleName = String(b.style_name ?? "").trim().slice(0, 80);
    if (b.style_code) {
      const { data: hs } = await admin.from("hairstyles").select("id, name").eq("code", b.style_code).maybeSingle();
      if (!hs) throw new HttpError(404, "Gaya tidak ada di katalog.");
      hairstyleId = hs.id; styleName = hs.name;
    }
    if (!styleName) throw new HttpError(400, "Isi nama gaya.");

    let previewPath: string | null = null;
    if (b.preview) {
      // pratinjau hanya dari konsultasi foto milik pengguna ini yang masih baru
      const { data: c } = await admin.from("hair_consults").select("actor, created_at").eq("id", String(b.consult_id ?? "")).maybeSingle();
      if (!c || c.actor !== me.id || Date.now() - Date.parse(c.created_at) > CONSULT_TTL_MS * 2) throw new HttpError(400, "Pratinjau sudah kedaluwarsa — tidak disimpan.");
      const m = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(b.preview);
      if (!m) throw new HttpError(400, "Pratinjau tidak valid.");
      const bytes = Buffer.from(m[2], "base64");
      if (bytes.length > MAX_PREVIEW_BYTES) throw new HttpError(413, "Pratinjau terlalu besar.");
      previewPath = `${booking.customer_id}/${crypto.randomUUID()}.${m[1].split("/")[1]}`;
      const up = await admin.storage.from("hair-previews").upload(previewPath, bytes, { contentType: m[1] });
      if (up.error) throw up.error;
    }

    const { data: row, error } = await admin.from("hair_cut_records").insert({
      customer_id: booking.customer_id, appointment_id: booking.id, consult_id: b.consult_id || null,
      staff_id: booking.staff_id ?? me.staff_id, hairstyle_id: hairstyleId, style_name: styleName,
      notes: String(b.notes ?? "").trim().slice(0, 500), reaction: b.reaction!, created_by: me.id,
      preview_path: previewPath, preview_expires_at: previewPath ? new Date(Date.now() + PREVIEW_DAYS * 864e5).toISOString() : null,
    }).select("id").single();
    if (error) throw error;

    // ponytail: pratinjau kedaluwarsa dibersihkan sambil lalu tiap ada catatan baru; tambah cron bila toko jarang mencatat
    const { data: old } = await admin.from("hair_cut_records").select("id, preview_path").lt("preview_expires_at", new Date().toISOString())
      .not("preview_path", "is", null).limit(50);
    if (old?.length) {
      await admin.storage.from("hair-previews").remove(old.map((o) => o.preview_path!));
      await admin.from("hair_cut_records").update({ preview_path: null, preview_expires_at: null }).in("id", old.map((o) => o.id));
    }
    return json({ id: row.id });
  } catch (e) {
    return fail(e);
  }
}
