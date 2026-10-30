import type Anthropic from "@anthropic-ai/sdk";
import { ask, MODEL, STUDIO_RULES } from "./weekly";

// Asisten AI di halaman Analitik: menjelaskan periode yang sedang dilihat, atau menjawab pertanyaan manajer.
// AI hanya membaca laporan jadi (kpi_dashboard + campaign_report) — tidak menyusun query sendiri, tanpa data pribadi pelanggan.
export const ANALITIK_MODEL = process.env.AI_ANALITIK_MODEL || MODEL;
const MAX_DATA = 40_000; // karakter JSON; heatmap & harian periode panjang dipangkas

const BASE = `D'Pras Studio: barbershop dengan layanan pijat di Ruko Emerald, Cimanggis Golf Estate, Depok. Data (JSON) adalah laporan dari aplikasi untuk periode yang sedang dilihat manajer di halaman Analitik: analitik.summary (periode ini dan pembanding), daily (per hari), drivers, util (utilisasi kursi), heat (jam × hari), duration, retail, mix (layanan), customers, online (langkah booking online), insights, settings (target); campaign (sumber pengunjung web, voucher, pelanggan tercatat, pelanggan baru per sumber).

${STUDIO_RULES}`;

const EXPLAIN = `${BASE}

Jelaskan periode ini kepada owner dalam 5–8 kalimat (maksimal 900 karakter): apa yang paling berubah dibanding pembanding (dengan angka), penyebab yang paling mungkin (tulis sebagai dugaan), dan satu tindakan paling berdampak (siapa, apa, target angka).`;

const ANSWER = `${BASE}

Jawab pertanyaan manajer HANYA dari JSON, maksimal 700 karakter. Bila jawabannya tidak ada di data, katakan "Data ini belum ada di laporan" lalu sebut pencatatan atau laporan apa yang dibutuhkan. Jangan menebak angka.`;

/** question null = jelaskan periode; selain itu jawab pertanyaan. */
export function analitikAnswer(client: Anthropic, data: unknown, question: string | null): Promise<string> {
  const json = JSON.stringify(data);
  const body = `Data (JSON):\n${json.length > MAX_DATA ? `${json.slice(0, MAX_DATA)}… (dipangkas)` : json}`;
  return question === null
    ? ask(client, EXPLAIN, body, ANALITIK_MODEL)
    : ask(client, ANSWER, `${body}\n\nPertanyaan manajer: ${question}`, ANALITIK_MODEL);
}
