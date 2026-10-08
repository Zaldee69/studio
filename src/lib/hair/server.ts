import "server-only";
import OpenAI, { toFile } from "openai";
import sharp from "sharp";
import { getProfile } from "@/lib/auth";
import { CATALOG_SELECT, CONSULT_SCHEMA, catalogForModel, hairstyleImageUrl, toCatalogStyle, type CatalogRow, type CatalogStyle } from "@/lib/domain/hair";
import { createAdminClient } from "@/lib/supabase/server";
import { ANALYSIS_PROMPT, sheetPrompt } from "./prompts";

// OpenAI SDK (baseURL ikut OPENAI_BASE_URL bila diisi — dipakai E2E). Model bisa diganti lewat env tanpa ubah kode.
const KEY = () => process.env.OPENAI_API_KEY;
let client: OpenAI | null = null;
// pratinjau kualitas high ± 85 dtk → batas 170 dtk (route 180 dtk), tanpa ulang otomatis agar tak berlipat
const ai = () => (client ??= new OpenAI({ apiKey: KEY(), timeout: 170_000, maxRetries: 0 }));
const VISION_MODEL = () => process.env.OPENAI_VISION_MODEL ?? "gpt-4.1";
// gpt-image-2: paling menjaga wajah pelanggan (uji banding 6 Okt 2026 vs gpt-image-1 & 1.5)
const IMAGE_MODEL = () => process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2";

export const DAILY_LIMIT = () => Number(process.env.HAIR_CONSULT_DAILY_LIMIT ?? 30); // konsultasi per pengguna per hari
export const PREVIEWS_PER_CONSULT = 3;                                               // katalog otomatis + 2× coba lagi
export const CONSULT_TTL_MS = 30 * 60 * 1000;                                        // katalog hanya untuk konsultasi ≤ 30 mnt
export const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

export class HttpError extends Error { constructor(readonly status: number, message: string) { super(message); } }
export const json = (body: unknown, status = 200) => Response.json(body, { status });
export const fail = (e: unknown) => {
  if (e instanceof HttpError) return json({ error: e.message }, e.status);
  console.error(JSON.stringify({ level: "error", event: "hair_consult_failed", error: String(e) }));
  return json({ error: "Layanan rekomendasi sedang bermasalah. Coba lagi sebentar." }, 502);
};

/** Tim (kapster, kasir, manajer) yang aktif; fitur harus diaktifkan dengan OPENAI_API_KEY. */
export async function requireConsultUser() {
  if (!KEY()) throw new HttpError(503, "Fitur konsultasi gaya belum diaktifkan (OPENAI_API_KEY belum diisi).");
  return requireTeam();
}

/** Katalog aktif + foto referensinya (gaya tanpa foto tetap dimuat; validasi membuangnya dari rekomendasi). */
export async function loadCatalog(): Promise<CatalogStyle[]> {
  const { data, error } = await createAdminClient().from("hairstyles").select(CATALOG_SELECT).eq("active", true).order("sort");
  if (error) throw error;
  return (data ?? []).map((s) => toCatalogStyle(s as CatalogRow, hairstyleImageUrl));
}

/** Tim aktif (kapster/kasir/manajer) — untuk aksi tanpa AI (mis. mencatat potongan). */
export async function requireTeam() {
  const p = await getProfile();
  if (!p || !p.active || !["staff", "cashier", "manager"].includes(p.role)) throw new HttpError(401, "Masuk sebagai tim dulu.");
  return p;
}

/** Booking yang boleh dipakai pengguna ini: kapster hanya booking miliknya. */
export async function bookingFor(me: { role: string; staff_id: string | null }, appointmentId: string) {
  const { data: a } = await createAdminClient().from("appointments").select("id, customer_id, staff_id").eq("id", appointmentId).maybeSingle();
  if (!a || (me.role === "staff" && a.staff_id !== me.staff_id)) throw new HttpError(404, "Booking tidak ditemukan.");
  return a;
}

/** Analisis foto → JSON mentah sesuai CONSULT_SCHEMA (divalidasi normalizeConsult). */
export async function analyzePhoto(photoDataUrl: string, catalog: CatalogStyle[]) {
  const res = await ai().chat.completions.create({
    model: VISION_MODEL(),
    messages: [
      { role: "system", content: ANALYSIS_PROMPT },
      { role: "user", content: [
        { type: "text", text: `HAIRSTYLE CATALOG (JSON):\n${catalogForModel(catalog.filter((s) => s.reference_images.length))}` },
        { type: "image_url", image_url: { url: photoDataUrl, detail: "high" } },
      ] },
    ],
    response_format: { type: "json_schema", json_schema: { name: "hair_consult", strict: true, schema: CONSULT_SCHEMA as unknown as Record<string, unknown> } },
  });
  const msg = res.choices[0]?.message;
  if (msg?.refusal) throw new HttpError(422, "Foto tidak bisa dianalisis. Ambil foto dari depan dengan wajah dan rambut terlihat jelas.");
  return JSON.parse(msg?.content ?? "{}");
}

/** Katalog lengkap: satu grid n kolom × 2 baris (depan/samping) pelanggan dengan n gaya. Tidak disimpan. */
export async function renderSheet(photo: Blob, styles: CatalogStyle[]) {
  const base = await sharp(Buffer.from(await photo.arrayBuffer())).resize(1024, 1536, { fit: "cover", position: "top" }).png().toBuffer();
  const refs = await Promise.all(styles.map(async (s, i) => {
    const r = s.reference_images.find((x) => x.view === "front") ?? s.reference_images[0];
    if (!r) return null;
    const res = await fetch(r.image_url);
    if (!res.ok) return null; // tanpa referensi: kolom itu mengikuti deskripsi saja
    const blob = await res.blob();
    return toFile(blob, `ref-${i + 1}.${blob.type.split("/")[1] ?? "png"}`, { type: blob.type });
  }));
  const out = await ai().images.edit({
    model: IMAGE_MODEL(),
    prompt: sheetPrompt(styles.map((s, i) => ({ ...s, hasRef: !!refs[i] }))),
    image: [await toFile(base, "customer.png", { type: "image/png" }), ...refs.filter((r) => r !== null)],
    size: "1536x1024",
    quality: (process.env.OPENAI_IMAGE_QUALITY ?? "high") as "low" | "medium" | "high",
    ...(IMAGE_MODEL().startsWith("gpt-image-1") ? { input_fidelity: "high" as const } : {}),
  });
  const b64 = out.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI images/edits tanpa gambar");
  const jpg = await sharp(Buffer.from(b64, "base64")).resize(1536, 1024, { fit: "fill" }).jpeg({ quality: 88 }).toBuffer();
  await debugDump(`katalog-${styles.length}`, { "1-dikirim.png": base, "2-grid.jpg": jpg });
  return `data:image/jpeg;base64,${jpg.toString("base64")}`;
}

/** Hanya lokal: HAIR_DEBUG_DIR=/path → simpan gambar antara pratinjau untuk diperiksa. Tidak pernah aktif di produksi. */
async function debugDump(styleId: string, files: Record<string, Buffer>, info?: unknown) {
  const dir = process.env.HAIR_DEBUG_DIR;
  if (!dir || process.env.NODE_ENV === "production") return;
  const { mkdir, writeFile } = await import("node:fs/promises");
  const d = `${dir}/${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}-${styleId}`;
  await mkdir(d, { recursive: true });
  await Promise.all(Object.entries(files).map(([n, b]) => writeFile(`${d}/${n}`, b)));
  if (info) await writeFile(`${d}/info.json`, JSON.stringify(info, null, 2));
}

/** Foto dari form: tipe & ukuran wajar. */
export function photoFrom(form: FormData) {
  const f = form.get("photo");
  if (!(f instanceof Blob) || !f.size) throw new HttpError(400, "Foto belum dipilih.");
  if (!PHOTO_TYPES.includes(f.type)) throw new HttpError(400, "Format foto harus JPG, PNG, atau WebP.");
  if (f.size > MAX_PHOTO_BYTES) throw new HttpError(413, "Foto terlalu besar (maks. 4 MB).");
  return f;
}
