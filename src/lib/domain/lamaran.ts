// Pertanyaan formulir lamaran (/karir) per posisi. Dipakai formulir publik, validasi server, dan daftar Pelamar manajer.
export type Position = "capster" | "kasir";
export const POSITION_NAME: Record<Position, string> = { capster: "Capster", kasir: "Kasir" };

export const SECTIONS = ["Data diri", "Pengalaman", "Kemampuan", "Kesiapan kerja"] as const;
export type Question = {
  key: string; label: string; type: "text" | "textarea" | "number" | "select" | "checks"; section: (typeof SECTIONS)[number];
  options?: string[]; optional?: boolean; for?: Position; hint?: string;
};

const D = "Data diri", P = "Pengalaman", K = "Kemampuan", S = "Kesiapan kerja";
// Urutan di sini = urutan di formulir (dikelompokkan per bagian).
export const QUESTIONS: Question[] = [
  // Data diri
  { key: "usia", label: "Usia (tahun)", type: "number", section: D },
  { key: "status", label: "Status", type: "select", section: D, options: ["Belum menikah", "Menikah"] },
  { key: "pendidikan", label: "Pendidikan terakhir", type: "select", section: D, options: ["SD / SMP", "SMA / SMK", "D3", "S1", "Lainnya"] },
  { key: "domisili", label: "Sekarang tinggal di mana? (kecamatan / kota)", type: "text", section: D },
  { key: "siap_depok", label: "Kalau diterima, bagaimana ke studio di Cimanggis, Depok?", type: "select", section: D,
    options: ["Sudah tinggal di sekitar Depok", "Siap pindah ke Depok", "Pulang-pergi", "Belum bisa"] },
  { key: "tempat_tinggal", label: "Bila pindah ke Depok, perlu tempat tinggal dari studio?", type: "select", section: D,
    options: ["Tidak perlu", "Perlu untuk sementara", "Perlu"] },

  // Pengalaman
  { key: "pengalaman_tahun", label: "Pengalaman jadi capster (tahun)", type: "number", for: "capster", section: P },
  { key: "pengalaman_tahun", label: "Pengalaman kerja kasir / admin (tahun)", type: "number", for: "kasir", section: P },
  { key: "tempat_kerja", label: "Pernah kerja di barbershop mana saja, dan berapa lama?", type: "textarea", for: "capster", section: P },
  { key: "tempat_kerja", label: "Pernah kerja di mana saja sebagai kasir/admin, dan berapa lama?", type: "textarea", for: "kasir", section: P },
  { key: "jenis_usaha", label: "Jenis tempat kerja sebelumnya", type: "checks", for: "kasir", section: P,
    options: ["Barbershop / salon", "Toko / ritel", "Kafe / restoran", "Kantor / admin", "Lainnya"] },
  { key: "kerja_sekarang", label: "Sekarang masih bekerja? Di mana?", type: "text", section: P, hint: "mis. Mahkota Barber, atau tidak sedang bekerja" },
  { key: "alasan_keluar", label: "Kenapa ingin pindah dari tempat sekarang / sebelumnya?", type: "textarea", section: P },
  { key: "bayaran_sebelumnya", label: "Sistem bayaran di tempat sebelumnya (gaji, komisi, bagi hasil)", type: "text", section: P },
  { key: "kepala_per_hari", label: "Biasanya sehari memotong berapa kepala?", type: "number", for: "capster", section: P },
  { key: "menit_per_kepala", label: "Rata-rata waktu potong satu kepala (menit)", type: "number", for: "capster", section: P },
  { key: "sertifikat", label: "Pernah ikut kursus atau sertifikasi barber? Di mana?", type: "text", for: "capster", section: P, hint: "tulis belum pernah bila tidak ada" },
  { key: "referensi", label: "Nama dan No. WA atasan / owner sebelumnya yang bisa kami hubungi", type: "text", section: P, hint: "tulis tidak ada bila tidak ada" },

  // Kemampuan
  { key: "keahlian", label: "Yang sudah biasa dikerjakan", type: "checks", for: "capster", section: K,
    options: ["Fade", "Potong gunting", "Crop / textured", "Pompadour / slick back", "Potong anak", "Cukur pisau / shaving",
      "Rapikan jenggot", "Keramas & pijat kepala", "Perming", "Coloring / bleaching", "Hair tattoo / desain"] },
  { key: "andalan", label: "Model potongan yang paling Anda kuasai", type: "text", for: "capster", section: K },
  { key: "ingin_belajar", label: "Model atau layanan yang ingin Anda pelajari", type: "text", optional: true, for: "capster", section: K },
  { key: "portofolio", label: "Link Instagram / portofolio hasil potongan", type: "text", for: "capster", section: K, hint: "mis. instagram.com/namakamu" },
  { key: "alat_sendiri", label: "Punya alat sendiri (clipper, gunting)?", type: "select", for: "capster", section: K,
    options: ["Punya lengkap", "Punya sebagian", "Tidak punya"] },
  { key: "alergi", label: "Ada alergi terhadap bahan kimia rambut (pewarna, obat keriting)?", type: "select", for: "capster", section: K,
    options: ["Tidak ada", "Ada", "Belum tahu"] },
  { key: "pos", label: "Pernah memakai aplikasi kasir (POS)?", type: "select", options: ["Sering", "Pernah", "Belum"], for: "kasir", section: K },
  { key: "tutup_kas", label: "Pernah menghitung uang dan tutup kas sendiri?", type: "select", options: ["Pernah", "Belum"], for: "kasir", section: K },
  { key: "selisih_kas", label: "Pernah ada selisih kas? Bagaimana Anda menanganinya?", type: "textarea", for: "kasir", section: K },
  { key: "keahlian", label: "Yang sudah biasa dikerjakan", type: "checks", for: "kasir", section: K,
    options: ["Membalas chat WhatsApp pelanggan", "Mengatur jadwal booking", "Mengelola Instagram", "Foto / video untuk konten",
      "Excel / Google Sheets", "Menjelaskan menu dan menawarkan layanan", "Belum pernah semuanya"] },
  { key: "komplain", label: "Ceritakan singkat cara Anda menghadapi pelanggan yang tidak puas dengan hasil potongan", type: "textarea", for: "capster", section: K },
  { key: "komplain", label: "Ceritakan singkat cara Anda menghadapi pelanggan yang kecewa", type: "textarea", for: "kasir", section: K },
  { key: "menawarkan", label: "Bagaimana Anda menawarkan paket atau produk ke pelanggan tanpa terkesan memaksa?", type: "textarea", section: K },

  // Kesiapan kerja
  { key: "jam_kerja", label: "Bisa bekerja 09.00–21.00, termasuk Sabtu dan Minggu?", type: "select", options: ["Bisa", "Bisa dengan catatan", "Tidak bisa"], section: S },
  { key: "libur", label: "Hari libur yang diharapkan per bulan", type: "select", options: ["2 hari", "4 hari", "Lainnya"], section: S },
  { key: "kontrak", label: "Bersedia kontrak 3 bulan pertama lalu dievaluasi?", type: "select", options: ["Bersedia", "Ingin dibicarakan dulu"], section: S },
  { key: "konten", label: "Bersedia difoto / divideo untuk konten Instagram studio?", type: "select", options: ["Bersedia", "Lebih suka tidak"], section: S },
  { key: "mulai", label: "Kalau diterima, bisa mulai kapan?", type: "text", section: S, hint: "mis. 1 minggu lagi" },
  { key: "ekspektasi_gaji", label: "Ekspektasi penghasilan per bulan", type: "text", section: S, hint: "mis. Rp3.500.000" },
  { key: "alasan", label: "Kenapa ingin bekerja di D'Pras Studio?", type: "textarea", section: S },
  { key: "sumber", label: "Tahu lowongan ini dari mana?", type: "select", optional: true, section: S, options: ["Instagram", "WhatsApp", "Teman / kenalan", "Lewat depan studio", "Lainnya"] },
];

/** Jawaban cerita minimal satu kalimat pendek. */
export const MIN_TEXT = 10;

export const questionsFor = (p: Position) => QUESTIONS.filter((q) => !q.for || q.for === p);

/** Ambil jawaban dari FormData hanya untuk pertanyaan posisi itu; kembalikan pesan error pertama bila ada yang wajib kosong. */
export function readAnswers(p: Position, get: (k: string) => string[]): { answers: Record<string, string | string[]> } | { error: string } {
  const answers: Record<string, string | string[]> = {};
  for (const q of questionsFor(p)) {
    const raw = get(q.key).map((v) => v.trim().slice(0, 1000)).filter(Boolean);
    const v = q.type === "checks" ? raw.filter((x) => q.options!.includes(x))
      : q.type === "select" ? raw.filter((x) => q.options!.includes(x)).slice(0, 1)
      : q.type === "number" ? raw.filter((x) => /^\d{1,3}$/.test(x)).slice(0, 1) : raw.slice(0, 1);
    if (!q.optional && !v.length) return { error: `${q.label}: wajib diisi` };
    if (q.type === "textarea" && v[0] && v[0].length < MIN_TEXT) return { error: `${q.label}: tulis minimal satu kalimat` };
    if (v.length) answers[q.key] = q.type === "checks" ? v : v[0];
  }
  return { answers };
}
