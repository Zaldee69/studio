import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { newSession, sql } from "./helpers";

// Foto halaman publik: foto HD dikecilkan bertahap ke 2400 px (bukan 1600 px sekali loncat yang membuat foto pecah),
// slot Lashes tersedia dan tampil di kartu Lashes.
test("unggah foto HD ke kartu Lashes → tersimpan 2400 px → tampil di landing", async ({ page, browser }, info) => {
  const buffer = await sharp({ create: { width: 4000, height: 3000, channels: 3, background: "#d7b0ad" } })
    .composite([{ input: Buffer.from('<svg width="4000" height="3000"><circle cx="2000" cy="1500" r="900" fill="#242923"/></svg>') }])
    .jpeg({ quality: 92 }).toBuffer();
  const m = await newSession(browser, info, "manager");
  try {
    await m.goto("/manajer/pengaturan?tab=publik");
    const slot = m.locator("div.flex.items-center.gap-3", { has: m.getByText("Kartu Lashes", { exact: true }) });
    await slot.locator("input[type=file]").setInputFiles({ name: "lashes.jpg", mimeType: "image/jpeg", buffer });
    await expect(m.getByText("Foto disimpan")).toBeVisible({ timeout: 30_000 });
    const [row] = sql<{ path: string }>("select path from site_photos where kind = 'lashes'");
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/site/${row.path}`);
    const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["webp", 2400, 1800]);

    await page.goto("/");
    await expect(page.getByRole("region", { name: "Barbershop, Nail Art, dan Lashes" }).getByRole("img", { name: /Lashes/ })).toBeVisible();
  } finally {
    sql("delete from site_photos where kind = 'lashes'"); // ponytail: file di storage lokal dibiarkan
    await m.context().close();
  }
});
