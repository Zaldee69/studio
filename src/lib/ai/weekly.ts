import Anthropic from "@anthropic-ai/sdk";

// Rapat tim AI mingguan untuk owner: 4 jabatan membaca angka ringkasan (ai_weekly_facts, tanpa data pribadi
// pelanggan) secara paralel, saling menanggapi (putaran 2), lalu GM menulis notulen untuk Telegram.
// Sekali seminggu → biaya kecil; prompt caching tidak berguna di sini.
export const MODEL = process.env.AI_WEEKLY_MODEL || "claude-opus-5-5";

const STUDIO = `D'Pras Studio: barbershop dengan layanan pijat di Ruko Emerald, Cimanggis Golf Estate, Depok. Setiap Senin tim membahas angka minggu lalu (JSON). Owner SUDAH menerima ringkasan angka pukul 08.05, jadi jangan mengulang angka; jawab apa yang terpenting, kenapa, dan apa yang harus dikerjakan siapa.

Cara kerja studio (agar saran tidak salah alamat):
- Sumber kunjungan web (minggu_ini.web) tercatat otomatis dari link (mis. link bio Instagram); kasir tidak bisa memperbaikinya. Kunjungan banyak tapi booking sedikit → benahi isi/ajakan di Instagram, link bio, atau halaman booking (tugas owner).
- Kasir hanya mengisi sumber untuk pelanggan baru yang didaftarkan di konter.
- Voucher SENKAMWA/SENKAMIG (Rp5.000 Senin–Kamis) jangan diberikan ke pelanggan yang memang sudah datang di hari kerja (itu hanya mengurangi omzet). Pakai untuk memindahkan pelanggan akhir pekan ke hari kerja, atau untuk mengajak kembali pelanggan di filter "Perlu follow-up".
- Upsell tambahan (pijat/retail) ditawarkan capster di kursi; Relax/Signature Groom sudah termasuk pijat yang dikerjakan capster.
- Fitur aplikasi: menu Pelanggan → filter "Perlu follow-up" (kirim WA dari profil), voucher, menu Inventaris.

Aturan:
- Pakai hanya angka dari JSON. Jangan mengarang angka, nama, atau sebab. Sebab yang tidak terbukti tulis sebagai dugaan ("kemungkinan…"). Bila data kosong atau nol, katakan apa adanya dan sarankan cek pencatatan.
- Hitung dampak dalam rupiah atau potong bila bisa, dengan hitungan singkat. Abaikan yang normal atau sesuai target; tanpa saran umum.
- Jangan menyarankan memotong komisi capster, mempromosikan pijat di Instagram, atau mengubah harga potong; bila angka menunjukkan masalah di situ, sebut sebagai bahan diskusi.
- Menegur capster disampaikan sebagai coaching, bukan hukuman.
- Bila ada notulen_rapat_sebelumnya: periksa tindakan dan targetnya dengan angka minggu ini. Tindakan yang gagal jangan diulang begitu saja; cari sebabnya atau ganti caranya.
- Bahasa Indonesia lugas dan sopan, kalimat pendek. Teks biasa Telegram: tanpa tabel, tanpa tebal/miring, tanpa #. Uang ditulis seperti Rp1.250.000; persen dibulatkan.`;

export const ROLES = [
  { name: "Keuangan", focus: "laba, omzet per lini dan HPP, rata-rata transaksi, biaya voucher, selisih kas" },
  { name: "Operasional", focus: "kapasitas dan hari yang lemah (potong_per_hari), beban dan kinerja tiap capster, stok bahan" },
  { name: "Marketing", focus: "kanal web dan Instagram, pelanggan baru per sumber, pelanggan yang perlu di-follow-up, pemakaian voucher" },
  { name: "SDM", focus: "kinerja dan coaching tiap capster (paket Groom, tambahan), pembagian kerja, motivasi staf" },
] as const;

const roleSystem = (r: (typeof ROLES)[number]) => `${STUDIO}

Anda bagian ${r.name} dalam rapat mingguan. Fokus Anda: ${r.focus}. Tulis pendapat maksimal 700 karakter: 2 temuan terpenting dari sudut Anda (angka → dugaan sebab → dampak) dan 1 usulan tindakan (siapa, apa, target angka Senin depan).`;

const GM = `${STUDIO}

Anda General Manager yang memimpin rapat mingguan. Anda menerima angka minggu lalu dan pendapat 4 jabatan (putaran 1 pendapat awal, putaran 2 tanggapan & posisi akhir). Timbang berdasarkan angka, bukan suara terbanyak; bila jabatan memakai angka berbeda untuk hal yang sama, cek ke JSON dan pakai yang benar. Tulis notulen untuk owner, maksimal 1.800 karakter:
0. Bila ada notulen_rapat_sebelumnya: "Rapor minggu lalu:" satu baris per tindakan: ✅ tercapai / ❌ belum / ➖ belum bisa diukur, dengan angka sekarang vs target.
1. "Rekomendasi GM:" 1–2 kalimat: kabar utama dan satu masalah/peluang terbesar minggu ini.
2. "Pendapat tim:" satu baris per jabatan diawali "• Keuangan:", "• Operasional:", "• Marketing:", "• SDM:" berisi posisi akhirnya.
3. "Beda pendapat:" satu kalimat bila ada benturan dan bagaimana Anda menimbangnya; lewati bila tidak ada.
4. "Tindakan minggu ini:" 2–3 baris bernomor: siapa (owner/kasir/nama capster), apa persisnya, target angka yang dicek Senin depan.
5. Bila ada stok_menipis: satu baris "Belanja: …" berisi nama barangnya saja.
Keputusan akhir milik owner — tulis sebagai rekomendasi.`;

type Turn = { role: "user" | "assistant"; content: string };

async function ask(client: Anthropic, system: string, content: string | Turn[]): Promise<string> {
  const res = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort: "medium" },
    // bila model menolak (pengaman), server otomatis mencoba model cadangan dalam panggilan yang sama.
    // Haiku 5.5 dkk. tidak punya fallback (400), jadi hanya untuk model bawaan.
    ...(MODEL === "claude-opus-5-5" && { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }),
    system,
    messages: typeof content === "string" ? [{ role: "user", content }] : content,
  });
  if (res.stop_reason === "refusal") throw new Error("Analisis ditolak model");
  const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n").trim();
  if (!text) throw new Error(`Analisis kosong (stop_reason: ${res.stop_reason})`);
  return text;
}

const ROUND2 = "Putaran 2. Ini pendapat jabatan lain. Tanggapi yang paling penting (setuju/tidak, dengan angka dari JSON), terutama bila usulan mereka berbenturan dengan sudut Anda. Lalu tulis posisi akhir Anda: 1 usulan tindakan (siapa, apa, target). Maksimal 600 karakter.";

export async function writeWeeklyMeeting(client: Anthropic, facts: unknown): Promise<string> {
  const data = `Angka minggu lalu (JSON):\n${JSON.stringify(facts)}`;
  const said = (xs: string[], skip = -1) => ROLES.flatMap((r, i) => (i === skip ? [] : [`[${r.name}]\n${xs[i]}`])).join("\n\n");
  // putaran 1: pendapat awal; putaran 2: tiap jabatan menanggapi tiga lainnya (percakapan yang sama, paralel)
  const r1 = await Promise.all(ROLES.map((r) => ask(client, roleSystem(r), data)));
  const r2 = await Promise.all(ROLES.map((r, i) => ask(client, roleSystem(r), [
    { role: "user", content: data }, { role: "assistant", content: r1[i] }, { role: "user", content: `${ROUND2}\n\n${said(r1, i)}` },
  ])));
  return ask(client, GM, `${data}\n\nPutaran 1 (pendapat awal):\n${said(r1)}\n\nPutaran 2 (tanggapan & posisi akhir):\n${said(r2)}`);
}

/** Pesan Telegram dibatasi 4.096 karakter — sisakan ruang untuk judul. */
export function telegramBody(minggu: string, notes: string): string {
  const head = `🤖 Rapat mingguan AI · minggu ${minggu}\n\n`;
  const max = 3900 - head.length;
  return head + (notes.length > max ? `${notes.slice(0, max - 1)}…` : notes);
}
