import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { PNG_1PX, startFakeOpenAI, type Call } from "./fake-openai";
import { admin, login, sql, uniq } from "./helpers";

// Konsultasi gaya ujung ke ujung dengan OpenAI tiruan: pilih pelanggan → rekomendasi dari katalog → pratinjau saat
// diketuk → catat potongan → kunjungan berikutnya riwayat tampil tanpa memanggil AI.
let fake: { calls: Call[]; close: () => Promise<void> };
const rec = (id: string, score: number) => ({ hair_style_id: id, compatibility_score: score,
  insight: `Insight ${id}: atas bertekstur menyeimbangkan wajah.`, barber_note: `Catatan ${id}: jaga volume atas.` });
const aiCalls = () => fake.calls.filter((c) => c.path === "/v1/chat/completions").length;
const editCalls = () => fake.calls.filter((c) => c.path === "/v1/images/edits");

test.beforeAll(async () => {
  fake = await startFakeOpenAI(() => ({
    status: "success", reason: "", suggestion: "", overall_insight: "Cocok dengan volume di atas dan sisi yang clean.",
    analysis: { face_shape: "oval", hair_type: "straight", hair_density: "thick", current_length: "short", forehead: "medium",
      hairline: "uncertain", hair_direction: "forward", hair_texture: "Lurus, tebal", current_style: "Pendek tak beraturan", maintenance_level: "low" },
    primary_recommendations: [rec("HS001", 92), rec("HS999", 99)], // HS999 tidak ada di katalog → dibuang
    alternatives: [rec("HS003", 81), rec("HS002", 70)],           // HS002 tanpa foto → dibuang
    customer_summary: "Textured Crop pilihan utama.",
  }));
  // foto referensi: HS001, HS003 (direkomendasikan), HS007 Buzz Cut (muncul di "lihat semua yang cocok"); HS002 tanpa foto
  const { data: styles } = await admin.from("hairstyles").select("id, code").in("code", ["HS001", "HS002", "HS003", "HS007"]);
  for (const s of styles ?? []) {
    await admin.from("hairstyle_images").delete().eq("hairstyle_id", s.id);
    if (s.code === "HS002") continue;
    const path = `${s.id}/e2e.png`;
    const key = process.env.SUPABASE_SECRET_KEY!;
    const up = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/hairstyles/${path}`, {
      method: "POST", body: PNG_1PX, headers: { apikey: key, Authorization: `Bearer ${key}`, "content-type": "image/png", "x-upsert": "true" } });
    expect(up.ok).toBe(true);
    await admin.from("hairstyle_images").insert({ hairstyle_id: s.id, view: "front", path });
  }
});
test.afterAll(() => fake?.close());

/** Booking Andi hari ini (sedang dilayani) untuk pelanggan baru. */
function bookingForAndi(name: string) {
  const [r] = sql<{ id: string }>(`with c as (insert into customers (name) values ('${name}') returning id)
    insert into appointments (customer_id, resource_id, staff_id, start_at, duration_min, source, status)
    select c.id, (select id from resources where name = 'Kursi Barber 3'), '00000000-0000-0000-0001-000000000001',
           date_trunc('minute', now()) - interval '5 minutes', 45, 'admin', 'in_service' from c returning id`);
  return r.id;
}
async function photo(page: Page, file: Parameters<Page["setInputFiles"]>[1] = { name: "pelanggan.png", mimeType: "image/png", buffer: PNG_1PX }) {
  await page.getByText(/Pelanggan setuju fotonya dipakai/).click();
  await page.getByLabel("Pilih foto dari galeri").setInputFiles(file);
}

test("pelanggan dari booking: analisis → katalog langsung (satu grid) → pilih gaya → kunjungan berikutnya tanpa AI", async ({ page }) => {
  const name = `Gaya ${uniq()}`;
  const booking = bookingForAndi(name);
  await login(page, "andi");
  await page.goto("/kapster");
  await expect(page.getByRole("link", { name: "Konsultasi gaya & riwayat potongan" })).toBeVisible(); // pintasan di kartu pelanggan saat ini
  await page.goto(`/kapster/gaya?booking=${booking}`);
  await expect(page.getByText(name, { exact: true })).toBeVisible();
  await expect(page.getByText("Belum ada potongan tercatat.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Ambil foto", exact: true })).toBeDisabled(); // wajib persetujuan

  const ai = aiCalls(), edits = editCalls().length;
  await photo(page);
  // hasil = katalog langsung (tanpa kartu "paling direkomendasikan"); hanya gaya katalog ber-foto
  const sheet = page.getByRole("region", { name: "Katalog lengkap" });
  await expect(sheet.getByRole("heading", { name: /2 model rambut/i })).toBeVisible();
  await expect(page.getByText("Paling direkomendasikan")).toHaveCount(0);
  await expect(sheet.getByRole("article")).toHaveCount(2); // HS999 (karangan) & HS002 (tanpa foto) tidak tampil
  await expect(sheet.getByRole("article", { name: "Katalog Textured Crop" })).toContainText("Atas bertekstur"); // poin singkat
  await expect(sheet.getByText("Rekomendasi pribadi")).toBeVisible();
  await expect(sheet.getByRole("img", { name: "Textured Crop tampak depan" })).toBeVisible();   // foto menyusul otomatis
  await expect(sheet.getByRole("img", { name: "Low Taper Fade tampak samping" })).toBeVisible();
  expect(aiCalls()).toBe(ai + 1);
  const grid = editCalls().slice(edits);
  expect(grid).toHaveLength(1);                                          // satu gambar untuk semua kolom
  expect(grid[0].body).toMatch(/name="size"\r\n\r\n1536x1024/);
  expect(grid[0].body).toContain("grid of 2 columns");
  expect(grid[0].body.match(/name="image\[\]"/g)).toHaveLength(3);     // pelanggan + 2 foto referensi

  const dl = page.waitForEvent("download");                               // HP sungguhan: menu bagikan → WhatsApp
  await sheet.getByRole("button", { name: /Bagikan \/ simpan gambar katalog/ }).click();
  expect((await dl).suggestedFilename()).toBe(`katalog-gaya-${name.split(" ")[0].toLowerCase()}.jpg`);

  // pilih gaya → catat potongan + potongan kolom grid sebagai pratinjau (dengan persetujuan)
  await sheet.getByRole("article", { name: "Katalog Textured Crop" }).getByRole("button", { name: "Pilih gaya ini" }).click();
  const rec = page.getByRole("dialog", { name: "Catat potongan" });
  await rec.getByLabel("Detail potongan").fill("Sisi guard 1, fade rendah, atas 5 cm");
  await rec.getByRole("radio", { name: "Puas", exact: true }).click();
  await rec.getByText(/Simpan pratinjau di profil pelanggan/).click();
  await rec.getByRole("button", { name: "Simpan ke riwayat" }).click();
  await expect(page.getByText(/Potongan "Textured Crop" tercatat/)).toBeVisible();
  const [cut] = sql<{ preview_path: string | null; notes: string }>(`select preview_path, notes from hair_cut_records where appointment_id = '${booking}'`);
  expect(cut.notes).toBe("Sisi guard 1, fade rendah, atas 5 cm");
  expect(cut.preview_path).toMatch(/\.jpeg$/);

  // kunjungan berikutnya: riwayat & rekomendasi tersimpan langsung tampil, tanpa memanggil AI
  const calls = fake.calls.length;
  await page.goto(`/kapster/gaya?booking=${booking}`);
  await expect(page.getByText(/Terakhir · hari ini · Andi/)).toBeVisible();
  await expect(page.getByText("Sisi guard 1, fade rendah, atas 5 cm")).toBeVisible();
  await expect(page.getByRole("img", { name: "Pratinjau Textured Crop" })).toBeVisible(); // kolom grid tersimpan (signed URL)
  await expect(page.getByText(/Rekomendasi tersimpan · dianalisis hari ini/)).toBeVisible();
  await expect(page.getByRole("article", { name: "Low Taper Fade" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Analisis ulang dari foto" })).toBeVisible();
  expect(fake.calls.length).toBe(calls);

  // "ulangi potongan ini" → catatan baru tanpa foto/AI
  await page.getByRole("button", { name: "Ulangi potongan ini" }).click();
  await expect(page.getByRole("dialog", { name: "Catat potongan" }).getByLabel("Detail potongan")).toHaveValue("Sisi guard 1, fade rendah, atas 5 cm");
  await page.getByRole("dialog", { name: "Catat potongan" }).getByRole("button", { name: "Simpan ke riwayat" }).click();
  await expect(page.getByText(/Potongan "Textured Crop" tercatat/)).toBeVisible();
  expect(sql(`select 1 from hair_cut_records where appointment_id = '${booking}'`)).toHaveLength(2);
  expect(fake.calls.length).toBe(calls);
});

test("API: tanpa persetujuan / konsultasi orang lain / booking kapster lain ditolak", async ({ page }) => {
  await login(page, "andi");
  const photoPart = { photo: { name: "x.png", mimeType: "image/png", buffer: PNG_1PX } };
  expect((await page.request.post("/api/gaya/analisis", { multipart: photoPart })).status()).toBe(400);
  const [other] = sql<{ id: string }>(`select id from hair_consults where actor <> '00000000-0000-0000-0002-000000000003' limit 1`);
  const cid = other?.id ?? "00000000-0000-0000-0000-000000000000";
  expect((await page.request.post("/api/gaya/katalog", { multipart: { ...photoPart, consult_id: cid } })).status()).toBe(404);
  const [appt] = sql<{ id: string }>(`select id from appointments where staff_id <> '00000000-0000-0000-0001-000000000001' and customer_id is not null limit 1`);
  expect((await page.request.post("/api/gaya/catat", { data: { appointment_id: appt.id, style_name: "X", reaction: "puas" } })).status()).toBe(404);
});

test("foto HEIC (iPhone) diterima: dikonversi di browser → dianalisis sebagai JPEG", async ({ page }) => {
  await login(page, "andi");
  await page.goto("/kapster/gaya");
  await page.getByRole("button", { name: /Walk-in tanpa booking/ }).click();
  await expect(page.getByText(/hasil & catatan potongan tidak disimpan/)).toBeVisible();
  const before = fake.calls.length;
  await photo(page, join(__dirname, "fixtures", "foto.heic"));
  await expect(page.getByRole("region", { name: "Katalog lengkap" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Pilih gaya ini" })).toHaveCount(0); // walk-in: tidak bisa dicatat
  const chat = fake.calls.slice(before).find((c) => c.path === "/v1/chat/completions");
  expect(chat?.body).toContain("data:image/jpeg;base64,");
});

test("nail artist tidak punya menu Gaya", async ({ page }) => {
  await login(page, "sari");
  await expect(page.getByRole("navigation", { name: "Menu kapster" }).filter({ visible: true }).getByRole("link", { name: "Gaya" })).toHaveCount(0);
});
