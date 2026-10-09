import { z } from "zod";

// Definisi field master data: dipakai form (klien) DAN validasi server action — satu sumber.
export type Field = {
  name: string;
  label: string;
  type: "text" | "textarea" | "money" | "int" | "bool" | "select" | "time" | "date";
  /** opsi statis, atau nama kunci opsi dinamis yang dikirim halaman (mis. "services") */
  options?: [string, string][] | string;
  nullable?: boolean;
  readonly?: boolean;
  min?: number;
  max?: number;
  w?: string; // lebar kolom grid
};

const CATEGORY: [string, string][] = [["barbershop", "Barbershop"], ["nail", "Nail Art"], ["massage", "Pijat"]];

export const TABLES = {
  services: {
    label: "Layanan", order: "sort", create: true, remove: true,
    fields: [
      { name: "name", label: "Nama", type: "text", w: "14rem" },
      { name: "category", label: "Kategori", type: "select", options: [...CATEGORY, ["retail", "Ritel"]], w: "9rem" },
      { name: "price", label: "Harga (Rp)", type: "money", w: "8rem" },
      { name: "duration_min", label: "Durasi (mnt)", type: "int", min: 0, max: 600, w: "6rem" },
      { name: "upsell_service_id", label: "Saran upsell", type: "select", options: "services", nullable: true, w: "12rem" },
      { name: "stock_item_id", label: "Item stok (ritel)", type: "select", options: "retailItems", nullable: true, w: "11rem" },
      { name: "needs_pedicure", label: "Kursi pedicure", type: "bool", w: "5rem" },
      { name: "online_bookable", label: "Booking online", type: "bool", w: "5.5rem" },
      { name: "public_description", label: "Deskripsi publik", type: "text", nullable: true, w: "16rem" },
      { name: "sort", label: "Urut", type: "int", w: "4.5rem" },
      { name: "active", label: "Aktif", type: "bool", w: "4rem" },
    ],
  },
  resources: {
    label: "Kursi & meja", order: "sort", create: true, remove: true,
    fields: [
      { name: "name", label: "Nama", type: "text", w: "14rem" },
      { name: "type", label: "Jenis", type: "select", options: CATEGORY, w: "10rem" },
      { name: "is_pedicure", label: "Pedicure", type: "bool", w: "5rem" },
      { name: "sort", label: "Urut", type: "int", w: "4.5rem" },
      { name: "active", label: "Aktif", type: "bool", w: "4rem" },
    ],
  },
  staff: {
    label: "Staf", order: "sort", create: true, remove: true,
    fields: [
      { name: "name", label: "Nama", type: "text", w: "12rem" },
      { name: "category", label: "Kategori", type: "select", options: CATEGORY, w: "10rem" },
      { name: "home_resource_id", label: "Kursi/meja utama", type: "select", options: "resources", nullable: true, w: "11rem" },
      { name: "commission_pct_override", label: "Komisi khusus (%)", type: "int", nullable: true, min: 0, max: 100, w: "8rem" },
      { name: "sort", label: "Urut", type: "int", w: "4.5rem" },
      { name: "active", label: "Aktif", type: "bool", w: "4rem" },
    ],
  },
  deposit_packages: {
    label: "Paket deposit", order: "amount_paid", create: true, remove: true,
    fields: [
      { name: "name", label: "Nama paket", type: "text", w: "12rem" },
      { name: "amount_paid", label: "Dibayar (Rp)", type: "money", w: "9rem" },
      { name: "amount_credited", label: "Saldo masuk (Rp)", type: "money", w: "9rem" },
      { name: "active", label: "Aktif", type: "bool", w: "4rem" },
    ],
  },
  reviews: {
    label: "Ulasan asli", order: "sort", create: true, remove: true,
    fields: [
      { name: "author", label: "Nama / inisial", type: "text", w: "10rem" },
      { name: "source", label: "Sumber (mis. Google)", type: "text", nullable: true, w: "10rem" },
      { name: "body", label: "Isi ulasan", type: "text", w: "24rem" },
      { name: "sort", label: "Urut", type: "int", w: "4.5rem" },
      { name: "active", label: "Tampil", type: "bool", w: "4rem" },
    ],
  },
  suppliers: {
    label: "Pemasok", order: "name", create: true, remove: true,
    fields: [
      { name: "name", label: "Nama pemasok", type: "text", w: "14rem" },
      { name: "whatsapp", label: "WhatsApp (08… / 62…)", type: "text", nullable: true, w: "12rem" },
      { name: "notes", label: "Catatan", type: "text", nullable: true, w: "18rem" },
      { name: "active", label: "Aktif", type: "bool", w: "4rem" },
    ],
  },
  sop_tool_groups: {
    label: "Kelompok alat SOP", order: "sort", create: true, remove: false,
    fields: [
      { name: "name", label: "Kelompok alat", type: "text", w: "14rem" },
      { name: "description", label: "Keterangan", type: "text", nullable: true, w: "20rem" },
      { name: "sort", label: "Urut", type: "int", w: "4.5rem" },
      { name: "active", label: "Aktif", type: "bool", w: "4rem" },
    ],
  },
  profiles: {
    label: "Akun & peran", order: "created_at", create: false, remove: false,
    fields: [
      { name: "full_name", label: "Nama", type: "text", w: "11rem" },
      { name: "email", label: "Email", type: "text", readonly: true, w: "14rem" },
      { name: "role", label: "Peran", type: "select", w: "9rem",
        options: [["manager", "Manajer"], ["cashier", "Kasir"], ["staff", "Kapster"], ["customer", "Pelanggan"]] },
      { name: "staff_id", label: "Tautan staf", type: "select", options: "staff", nullable: true, w: "10rem" },
      { name: "active", label: "Aktif", type: "bool", w: "4rem" },
    ],
  },
} satisfies Record<string, { label: string; order: string; create: boolean; remove: boolean; fields: Field[] }>;

export type TableName = keyof typeof TABLES;

// Tab "Halaman publik": konten landing + aturan booking online.
export const PUBLIC_GROUPS: { title: string; fields: Field[] }[] = [
  { title: "Hero & teks", fields: [
    { name: "tagline", label: "Tagline (deskripsi SEO)", type: "text" },
    { name: "hero_title", label: "Judul hero", type: "text" },
    { name: "hero_title_accent", label: "Aksen miring emas", type: "text" },
    { name: "hero_text", label: "Paragraf hero (satu kalimat)", type: "textarea" },
    { name: "groom_text", label: "Deskripsi Barbershop", type: "textarea" },
    { name: "bloom_text", label: "Deskripsi Nail Art", type: "textarea" },
    { name: "founded_year", label: "Tahun berdiri (est.)", type: "int", nullable: true, min: 1900, max: 2100 },
    { name: "maps_embed_url", label: "URL embed Google Maps (https://www.google.com/maps/embed?…)", type: "text", nullable: true },
  ] },
  { title: "Standar kami (4 poin)", fields: [1, 2, 3, 4].flatMap((i) => [
    { name: `std_${i}_title`, label: `Poin ${i} — judul`, type: "text" as const },
    { name: `std_${i}_text`, label: `Poin ${i} — isi`, type: "textarea" as const },
  ]) },
  { title: "Tampilan", fields: [
    { name: "show_staff", label: "Tampilkan staf di landing", type: "bool" },
    { name: "show_prices", label: "Tampilkan harga", type: "bool" },
    { name: "online_booking_open", label: "Booking online dibuka", type: "bool" },
  ] },
  { title: "Promo booking online", fields: [
    { name: "online_promo_pct", label: "Diskon booking online (%) — 0 = promo mati", type: "int", min: 0, max: 50 },
    { name: "online_promo_start", label: "Berlaku untuk booking yang dibuat mulai", type: "date", nullable: true },
    { name: "online_promo_end", label: "sampai dengan", type: "date", nullable: true },
  ] },
  { title: "Aturan booking online", fields: [
    { name: "booking_lead_minutes", label: "Paling cepat (menit dari sekarang)", type: "int", min: 0, max: 2880 },
    { name: "booking_buffer_minutes", label: "Jeda antar booking (menit)", type: "int", min: 0, max: 120 },
    { name: "booking_max_days_ahead", label: "Bisa booking sampai (hari ke depan)", type: "int", min: 1, max: 90 },
    { name: "cancel_cutoff_hours", label: "Batas batal / jadwal ulang (jam sebelum mulai)", type: "int", min: 0, max: 72 },
    { name: "online_booking_mode", label: "Konfirmasi booking online", type: "select", options: [["auto", "Otomatis"], ["review", "Ditinjau kasir dulu"]] },
  ] },
  { title: "Kebijakan privasi", fields: [
    { name: "privacy_policy", label: "Teks kebijakan privasi ({nama_toko}, {alamat}, {whatsapp} diisi otomatis; baris kosong = paragraf baru)", type: "textarea" },
  ] },
];

// Tab "SOP": shift, pengingat, foto wajib. Nama shift disimpan ke settings.sop_shift_names (array).
export const SOP_GROUPS: { title: string; fields: Field[] }[] = [
  { title: "Checklist sterilisasi", fields: [
    { name: "sop_shifts", label: "Jumlah shift per hari", type: "select", options: [["1", "1 shift"], ["2", "2 shift"]] },
    { name: "sop_shift_1", label: "Nama shift 1", type: "text" },
    { name: "sop_shift_2", label: "Nama shift 2", type: "text" },
    { name: "sop_reminder_time", label: "Jam pengingat bila checklist belum dimulai", type: "time" },
    { name: "sop_require_photo_autoclave", label: "Wajib foto indikator pada tahap autoclave", type: "bool" },
  ] },
];

export const SETTINGS_GROUPS: { title: string; fields: Field[] }[] = [
  { title: "Toko", fields: [
    { name: "shop_name", label: "Nama toko", type: "text" },
    { name: "shop_address", label: "Alamat", type: "text", nullable: true },
    { name: "shop_whatsapp", label: "WhatsApp toko (62…)", type: "text", nullable: true },
    { name: "shop_instagram", label: "Instagram", type: "text", nullable: true },
    { name: "open_time", label: "Jam buka", type: "time" },
    { name: "close_time", label: "Jam tutup", type: "time" },
  ] },
  { title: "Kasir & pelanggan", fields: [
    { name: "bundle_pct", label: "Diskon paket barbershop + nail (%)", type: "int", min: 10, max: 15 },
    { name: "churn_weeks", label: "Churn setelah (minggu)", type: "int", min: 1, max: 52 },
    { name: "wa_followup_template", label: "Template follow-up WA ({nama} = nama depan)", type: "textarea" },
  ] },
  { title: "SDM & komisi", fields: [
    { name: "commission_pct", label: "Komisi default (%)", type: "int", min: 0, max: 100 },
    { name: "min_monthly_pay", label: "Jaring pengaman / bulan (Rp)", type: "money" },
  ] },
  { title: "Inventaris", fields: [
    { name: "inventory_cost_method", label: "Harga pokok saat stok masuk", type: "select",
      options: [["weighted_avg", "Rata-rata tertimbang"], ["last", "Harga beli terakhir"]] },
    { name: "margin_warning_pct", label: "Tandai margin layanan di bawah (%)", type: "int", min: 0, max: 100 },
    { name: "usage_variance_threshold_pct", label: "Tandai selisih pemakaian di atas (%)", type: "int", min: 1, max: 100 },
    { name: "reorder_suggest_multiplier", label: "Saran beli sampai … × ambang reorder", type: "int", min: 1, max: 10 },
  ] },
  { title: "Target KPI", fields: [
    { name: "aov_target_barbershop", label: "Target AOV barbershop (Rp)", type: "money" },
    { name: "aov_target_nail", label: "Target AOV nail (Rp)", type: "money" },
    { name: "retail_ratio_min", label: "Rasio ritel min (%)", type: "int", min: 0, max: 100 },
    { name: "retail_ratio_max", label: "Rasio ritel maks (%)", type: "int", min: 0, max: 100 },
    { name: "utilization_target", label: "Target utilisasi (%)", type: "int", min: 0, max: 100 },
  ] },
  { title: "Lainnya", fields: [
    { name: "maint_default_interval_days", label: "Interval perawatan default (hari)", type: "int", min: 1, max: 365 },
    { name: "invite_code", label: "Kode undangan tim (min. 6)", type: "text", min: 6 },
  ] },
];

function fieldSchema(f: Field): z.ZodType {
  const empty = (v: unknown) => v === undefined || v === "";
  switch (f.type) {
    case "bool":
      return z.boolean();
    case "money":
    case "int": {
      let n = z.coerce.number({ message: `${f.label}: harus angka` }).int(`${f.label}: harus bilangan bulat`);
      if (f.type === "money") n = n.min(0, `${f.label}: tidak boleh negatif`);
      if (f.min !== undefined) n = n.min(f.min, `${f.label}: minimal ${f.min}`);
      if (f.max !== undefined) n = n.max(f.max, `${f.label}: maksimal ${f.max}`);
      return f.nullable ? z.preprocess((v) => (empty(v) ? null : v), n.nullable()) : n;
    }
    case "time":
      return z.string().regex(/^\d{2}:\d{2}/, `${f.label}: format JJ:MM`);
    case "date": {
      const d = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, `${f.label}: pilih tanggal`);
      return f.nullable ? z.preprocess((v) => (empty(v) ? null : v), d.nullable()) : d;
    }
    case "select": {
      const s = Array.isArray(f.options)
        ? z.enum(f.options.map(([v]) => v) as [string, ...string[]], { message: `Pilih ${f.label}` })
        : z.guid(`Pilih ${f.label}`); // guid: id seed (0000…-0001-…) bukan RFC v4 tapi sah di Postgres
      return f.nullable ? z.preprocess((v) => (empty(v) ? null : v), s.nullable()) : s;
    }
    default: {
      let s = z.string().trim();
      if (f.min) s = s.min(f.min, `${f.label}: minimal ${f.min} karakter`);
      return f.nullable ? s.default("") : s.min(1, `${f.label} wajib diisi`);
    }
  }
}

/** Validasi FormData terhadap daftar field (checkbox yang tidak dicentang tidak ikut terkirim → false). */
export function parseFields(fields: Field[], fd: FormData) {
  const editable = fields.filter((f) => !f.readonly);
  const input = Object.fromEntries(editable.map((f) => [f.name, f.type === "bool" ? fd.get(f.name) === "on" : (fd.get(f.name) ?? "")]));
  return z.object(Object.fromEntries(editable.map((f) => [f.name, fieldSchema(f)]))).safeParse(input);
}
