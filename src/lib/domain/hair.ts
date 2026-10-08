// Konsultasi gaya rambut: tipe, skema keluaran model, dan validasi hasil terhadap katalog (sumber kebenaran).
// Model hanya mengembalikan id gaya + teks; foto referensi selalu ditempel server dari katalog.

export type RefImage = { image_id: string; view: "front" | "side" | "back" | "other"; image_url: string };
export type CatalogStyle = {
  hair_style_id: string; hair_style_name: string; category: string; description: string;
  face_shapes: string[]; hair_types: string[]; hair_density: string[]; suitable_lengths: string[];
  maintenance_level: "low" | "medium" | "high"; style_character: string[]; cut_notes: string; highlights: string[];
  reference_images: RefImage[];
};
export type Analysis = {
  face_shape: string; hair_type: string; hair_density: string; current_length: string; forehead: string;
  hairline: string; hair_direction: string; hair_texture: string; current_style: string; maintenance_level: string;
};
export type Recommendation = {
  rank: number; hair_style_id: string; hair_style_name: string; compatibility_score: number;
  reference_images: RefImage[]; insight: string; barber_note: string;
};
export type ConsultResult =
  | { status: "success"; overall_insight: string; analysis: Analysis; primary_recommendations: Recommendation[];
      alternatives: Recommendation[]; customer_summary: string }
  | { status: "insufficient_photo"; reason: string; suggestion: string }
  | { status: "no_match"; reason: string; suggestion: string };

const str = { type: "string" } as const;
const rec = {
  type: "object", additionalProperties: false,
  required: ["hair_style_id", "compatibility_score", "insight", "barber_note"],
  properties: { hair_style_id: str, compatibility_score: { type: "integer" }, insight: str, barber_note: str },
} as const;
/** JSON schema (strict) untuk structured output. Satu bentuk untuk sukses & foto tak layak (field tak relevan = ""). */
export const CONSULT_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["status", "reason", "suggestion", "overall_insight", "analysis", "primary_recommendations", "alternatives", "customer_summary"],
  properties: {
    status: { type: "string", enum: ["success", "insufficient_photo"] },
    reason: str, suggestion: str, overall_insight: str, customer_summary: str,
    analysis: {
      type: "object", additionalProperties: false,
      required: ["face_shape", "hair_type", "hair_density", "current_length", "forehead", "hairline", "hair_direction", "hair_texture", "current_style", "maintenance_level"],
      properties: Object.fromEntries(["face_shape", "hair_type", "hair_density", "current_length", "forehead", "hairline", "hair_direction", "hair_texture", "current_style", "maintenance_level"].map((k) => [k, str])),
    },
    primary_recommendations: { type: "array", items: rec },
    alternatives: { type: "array", items: rec },
  },
} as const;


/** Katalog ringkas untuk model (tanpa URL gambar — hemat token & model tak bisa "mengarang" gambar). */
export const catalogForModel = (c: CatalogStyle[]) =>
  JSON.stringify(c.map(({ reference_images, ...s }) => ({ ...s, reference_views: reference_images.map((i) => i.view) })));

const VIEW_ORDER = { front: 0, side: 1, back: 2, other: 3 } as const;
/** Maks. 3 gambar, utamakan depan lalu samping. */
export const pickImages = (imgs: RefImage[]) => [...imgs].sort((a, b) => VIEW_ORDER[a.view] - VIEW_ORDER[b.view]).slice(0, 3);

type RawRec = { hair_style_id?: unknown; compatibility_score?: unknown; insight?: unknown; barber_note?: unknown };
/**
 * Validasi keluaran model: hanya gaya yang ada di katalog & punya foto referensi, tanpa duplikat,
 * maks. 2 utama + 4 alternatif (kekurangan utama diisi dari alternatif), skor 0–100, gambar dari katalog.
 */
export function normalizeConsult(raw: unknown, catalog: CatalogStyle[]): ConsultResult {
  const r = (raw ?? {}) as Record<string, unknown>;
  const text = (v: unknown, max = 600) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  if (r.status === "insufficient_photo") {
    return { status: "insufficient_photo", reason: text(r.reason) || "Wajah dan rambut tidak terlihat jelas.",
      suggestion: text(r.suggestion) || "Ambil foto dari depan dengan wajah dan rambut terlihat jelas." };
  }
  const byId = new Map(catalog.filter((s) => s.reference_images.length).map((s) => [s.hair_style_id, s]));
  const seen = new Set<string>();
  const clean = (list: unknown): Recommendation[] => (Array.isArray(list) ? list as RawRec[] : []).flatMap((x) => {
    const id = text(x?.hair_style_id, 40);
    const s = byId.get(id);
    if (!s || seen.has(id)) return [];
    seen.add(id);
    const score = Math.round(Math.min(100, Math.max(0, Number(x.compatibility_score) || 0)));
    return [{ rank: 0, hair_style_id: id, hair_style_name: s.hair_style_name, compatibility_score: score,
      reference_images: pickImages(s.reference_images), insight: text(x.insight, 400), barber_note: text(x.barber_note, 300) }];
  });
  const primary = clean(r.primary_recommendations), alt = clean(r.alternatives);
  const all = [...primary, ...alt];
  if (!all.length) {
    return { status: "no_match", reason: "Belum ada model di katalog yang cocok untuk karakter rambut ini.",
      suggestion: "Tambahkan lebih banyak model (beserta foto referensi) di katalog gaya." };
  }
  const top = all.slice(0, 2), rest = all.slice(2, 6);
  [...top, ...rest].forEach((x, i) => { x.rank = i + 1; });
  const a = (r.analysis ?? {}) as Record<string, unknown>;
  const keys = ["face_shape", "hair_type", "hair_density", "current_length", "forehead", "hairline", "hair_direction", "hair_texture", "current_style", "maintenance_level"] as const;
  return {
    status: "success", overall_insight: text(r.overall_insight), customer_summary: text(r.customer_summary),
    analysis: Object.fromEntries(keys.map((k) => [k, text(a[k], 120) || "uncertain"])) as Analysis,
    primary_recommendations: top, alternatives: rest,
  };
}

/** Label Indonesia untuk nilai analisis (detail sekunder di layar). */
export const HAIR_LABEL: Record<string, string> = {
  oval: "Oval", round: "Bulat", square: "Kotak", oblong: "Lonjong", heart: "Hati", diamond: "Berlian",
  straight: "Lurus", slightly_wavy: "Sedikit bergelombang", wavy: "Bergelombang", curly: "Ikal",
  thin: "Tipis", medium: "Sedang", thick: "Tebal", very_short: "Sangat pendek", short: "Pendek", long: "Panjang",
  narrow: "Sempit", wide: "Lebar", rounded: "Membulat", slightly_receding: "Sedikit mundur", receding: "Mundur",
  forward: "Ke depan", backward: "Ke belakang", left: "Ke kiri", right: "Ke kanan", mixed: "Campuran",
  low: "Rendah", high: "Tinggi", uncertain: "Tidak pasti",
};

/** Bentuk yang disimpan di hair_consults.result (tanpa gambar; gambar ditempel ulang dari katalog saat ditampilkan). */
export const storedConsult = (r: Extract<ConsultResult, { status: "success" }>) => ({
  status: r.status, overall_insight: r.overall_insight, customer_summary: r.customer_summary, analysis: r.analysis,
  primary_recommendations: r.primary_recommendations.map(({ reference_images: _i, hair_style_name: _n, rank: _r, ...x }) => x),
  alternatives: r.alternatives.map(({ reference_images: _i, hair_style_name: _n, rank: _r, ...x }) => x),
  styles: [...r.primary_recommendations, ...r.alternatives].map((x) => x.hair_style_id),
});

/** Baris tabel hairstyles (+ hairstyle_images) → CatalogStyle. Dipakai server & browser. */
export type CatalogRow = {
  code: string; name: string; category: string; description: string; face_shapes: string[]; hair_types: string[]; hair_density: string[];
  suitable_lengths: string[]; maintenance_level: string; style_character: string[]; cut_notes: string; highlights: string[];
  hairstyle_images: { id: string; view: string; path: string; sort: number }[] | null;
};
export const CATALOG_SELECT = "code, name, category, description, face_shapes, hair_types, hair_density, suitable_lengths, maintenance_level, style_character, cut_notes, highlights, hairstyle_images(id, view, path, sort)";
export const toCatalogStyle = (s: CatalogRow, url: (path: string) => string): CatalogStyle => ({
  hair_style_id: s.code, hair_style_name: s.name, category: s.category, description: s.description,
  face_shapes: s.face_shapes, hair_types: s.hair_types, hair_density: s.hair_density, suitable_lengths: s.suitable_lengths,
  maintenance_level: s.maintenance_level as CatalogStyle["maintenance_level"], style_character: s.style_character, cut_notes: s.cut_notes,
  highlights: s.highlights ?? [],
  reference_images: [...(s.hairstyle_images ?? [])].sort((a, b) => a.sort - b.sort)
    .map((i) => ({ image_id: i.id, view: i.view as RefImage["view"], image_url: url(i.path) })),
});
export const hairstyleImageUrl = (path: string) =>
  `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/hairstyles/${path}`;
export const REACTION = { puas: "Puas", biasa: "Biasa", kurang: "Kurang puas" } as const;

/** Maks. kolom katalog lengkap (grid depan/samping dalam satu gambar). */
export const SHEET_MAX = 5;
/** Gaya untuk katalog lengkap: urutan rekomendasi (utama dulu), maks. SHEET_MAX. */
export const sheetStyles = (r: Extract<ConsultResult, { status: "success" }>) =>
  [...r.primary_recommendations, ...r.alternatives].slice(0, SHEET_MAX);
