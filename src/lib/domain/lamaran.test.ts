import { describe, expect, it } from "vitest";
import { questionsFor, readAnswers, type Position } from "./lamaran";

const form = (o: Record<string, string | string[]>) => (k: string) => [o[k] ?? []].flat();
/** Jawaban lengkap & sah untuk semua pertanyaan wajib posisi itu. */
const full = (p: Position) => Object.fromEntries(questionsFor(p).filter((q) => !q.optional).map((q) => [q.key,
  q.type === "number" ? "7" : q.type === "select" || q.type === "checks" ? q.options![0] : q.type === "textarea" ? "Satu kalimat jawaban." : "Isian"]));

describe("lamaran", () => {
  it("pertanyaan per posisi tidak tercampur", () => {
    expect(questionsFor("capster").some((q) => q.key === "portofolio")).toBe(true);
    expect(questionsFor("kasir").some((q) => q.key === "portofolio")).toBe(false);
  });
  it("jawaban lengkap diterima; hanya kunci & pilihan yang dikenal yang disimpan", () => {
    const r = readAnswers("capster", form({ ...full("capster"), keahlian: ["Fade", "Hack"], rahasia: "x" }));
    expect(r).toEqual({ answers: { ...full("capster"), keahlian: ["Fade"] } });
  });
  it("semua kecuali 2 pertanyaan wajib", () => {
    expect(questionsFor("capster").filter((q) => q.optional).map((q) => q.key)).toEqual(["ingin_belajar", "sumber"]);
    expect(readAnswers("capster", form({ ...full("capster"), portofolio: "" }))).toEqual({ error: "Link Instagram / portofolio hasil potongan: wajib diisi" });
  });
  it("cerita minimal satu kalimat, angka harus angka", () => {
    expect(readAnswers("kasir", form({ ...full("kasir"), alasan_keluar: "gaji" })))
      .toEqual({ error: "Kenapa ingin pindah dari tempat sekarang / sebelumnya?: tulis minimal satu kalimat" });
    expect(readAnswers("kasir", form({ ...full("kasir"), pengalaman_tahun: "banyak" })))
      .toEqual({ error: "Pengalaman kerja kasir / admin (tahun): wajib diisi" });
  });
});
