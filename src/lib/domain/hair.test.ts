import { describe, expect, it } from "vitest";
import { normalizeConsult, pickImages, storedConsult, type CatalogStyle } from "./hair";

const img = (id: string, view: "front" | "side" | "back" | "other") => ({ image_id: id, view, image_url: `https://x/${id}.webp` });
const style = (id: string, name: string, images = [img(`${id}-f`, "front")]): CatalogStyle => ({
  hair_style_id: id, hair_style_name: name, category: "Short", description: "", face_shapes: ["oval"], hair_types: ["straight"],
  hair_density: ["medium"], suitable_lengths: ["short"], maintenance_level: "low", style_character: [], cut_notes: "", highlights: [], reference_images: images,
});
const catalog = [style("HS001", "Textured Crop", [img("b", "back"), img("s", "side"), img("o", "other"), img("f", "front")]),
  style("HS002", "French Crop"), style("HS003", "Low Taper"), style("HS004", "Tanpa Foto", [])];
const r = (id: string, score = 80) => ({ hair_style_id: id, compatibility_score: score, insight: "Cocok.", barber_note: "Jaga volume." });

describe("normalizeConsult", () => {
  it("hanya gaya di katalog yang punya foto; tanpa duplikat; nama & gambar dari katalog", () => {
    const out = normalizeConsult({ status: "success", primary_recommendations: [r("HS001"), r("HS999")],
      alternatives: [r("HS001"), r("HS004"), r("HS002", 150)], analysis: { face_shape: "oval" } }, catalog);
    expect(out.status).toBe("success");
    if (out.status !== "success") return;
    // HS999 (karangan) & HS004 (tanpa foto) dibuang; HS001 tidak dobel; kekurangan utama diisi dari alternatif
    expect(out.primary_recommendations.map((x) => x.hair_style_id)).toEqual(["HS001", "HS002"]);
    expect(out.alternatives).toEqual([]);
    expect(out.primary_recommendations[1].compatibility_score).toBe(100);
    expect(out.primary_recommendations[0].hair_style_name).toBe("Textured Crop");
    expect(out.primary_recommendations[0].reference_images.map((i) => i.view)).toEqual(["front", "side", "back"]);
    expect(out.analysis.hair_type).toBe("uncertain");
  });

  it("maks. 2 utama + 4 alternatif, rank berurutan", () => {
    const many = Array.from({ length: 8 }, (_, i) => style(`S${i}`, `Gaya ${i}`));
    const out = normalizeConsult({ status: "success", primary_recommendations: many.slice(0, 3).map((s) => r(s.hair_style_id)),
      alternatives: many.slice(3).map((s) => r(s.hair_style_id)) }, many);
    if (out.status !== "success") throw new Error(out.status);
    expect(out.primary_recommendations).toHaveLength(2);
    expect(out.alternatives).toHaveLength(4);
    expect([...out.primary_recommendations, ...out.alternatives].map((x) => x.rank)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("foto tak layak & tidak ada yang cocok", () => {
    expect(normalizeConsult({ status: "insufficient_photo", reason: "Gelap" }, catalog)).toMatchObject({ status: "insufficient_photo", reason: "Gelap" });
    expect(normalizeConsult({ status: "success", primary_recommendations: [r("HS999")], alternatives: [] }, catalog).status).toBe("no_match");
    expect(normalizeConsult(null, catalog).status).toBe("no_match");
  });

  it("pickImages: depan dulu, maks. 3", () => {
    expect(pickImages([img("a", "back"), img("b", "front")]).map((i) => i.image_id)).toEqual(["b", "a"]);
  });
});

describe("storedConsult", () => {
  const a = { face_shape: "oval", hair_type: "straight", hair_density: "medium", current_length: "short", forehead: "medium",
    hairline: "uncertain", hair_direction: "forward", hair_texture: "", current_style: "", maintenance_level: "low" };
  it("storedConsult → normalizeConsult menghasilkan tampilan yang sama dengan katalog terbaru", () => {
    const res = normalizeConsult({ status: "success", primary_recommendations: [r("HS001"), r("HS002")], alternatives: [r("HS003")], analysis: a }, catalog);
    if (res.status !== "success") throw new Error();
    const stored = storedConsult(res);
    expect(stored.styles).toEqual(["HS001", "HS002", "HS003"]);
    expect(JSON.stringify(stored)).not.toContain("image_url");
    expect(normalizeConsult(stored, catalog)).toEqual(res);
  });
});
