/** Untuk atribut accept input file: termasuk HEIC/HEIF (foto iPhone & sebagian Android). */
export const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif";

const isHeic = (f: Blob) => /^image\/hei[cf]/i.test(f.type) || (f instanceof File && /\.hei[cf]$/i.test(f.name));

/** HEIC/HEIF → JPEG bila browser tak bisa membacanya langsung (Chrome, Android). Safari membaca HEIC sendiri. */
async function decodable(f: Blob): Promise<Blob> {
  if (!isHeic(f)) return f;
  try { (await createImageBitmap(f)).close(); return f; } catch { /* lanjut konversi */ }
  const { heicTo } = await import("heic-to"); // dekoder libheif (besar) — hanya dimuat saat ada foto HEIC
  return heicTo({ blob: f, type: "image/jpeg", quality: 0.92 });
}

/** Kompres di browser: sisi terpanjang ≤ maxSide, turunkan kualitas sampai ≤ maxBytes. createImageBitmap juga merapikan orientasi EXIF. */
export async function compressImage(file: Blob, { maxSide = 1600, type = "image/webp", maxBytes = 2 * 1024 * 1024 } = {}): Promise<Blob> {
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(await decodable(file), { imageOrientation: "from-image" });
  } catch {
    throw new Error("Format foto tidak didukung. Gunakan JPG, PNG, WebP, atau HEIC.");
  }
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  // Kecilkan bertahap (½ tiap langkah) + smoothing "high": sekali loncat 4000→1600 px membuat tepi bergerigi/pecah.
  let src: CanvasImageSource = bmp, sw = bmp.width, sh = bmp.height;
  while (sw / 2 >= w) {
    const half = draw(src, Math.round(sw / 2), Math.round(sh / 2));
    src = half; sw = half.width; sh = half.height;
  }
  const c = draw(src, w, h);
  for (const q of [0.9, 0.82, 0.7, 0.55]) {
    const b = await new Promise<Blob | null>((r) => c.toBlob(r, type, q));
    if (b && b.size <= maxBytes) return b;
  }
  throw new Error("Foto terlalu besar meski sudah dikompres.");
}

function draw(src: CanvasImageSource, w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d")!;
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
  g.drawImage(src, 0, 0, w, h);
  return c;
}

/** Siapkan file untuk Storage (bucket hanya menerima JPG/PNG/WebP): foto → WebP terkompres (HEIC ikut terkonversi); PDF apa adanya. */
export async function toUploadable(file: File): Promise<{ blob: Blob; ext: string; type: string }> {
  if (file.type === "application/pdf") return { blob: file, ext: "pdf", type: file.type };
  return { blob: await compressImage(file), ext: "webp", type: "image/webp" };
}
