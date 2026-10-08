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
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  for (const q of [0.82, 0.7, 0.55, 0.4]) {
    const b = await new Promise<Blob | null>((r) => c.toBlob(r, type, q));
    if (b && b.size <= maxBytes) return b;
  }
  throw new Error("Foto terlalu besar meski sudah dikompres.");
}

/** Siapkan file untuk Storage (bucket hanya menerima JPG/PNG/WebP): foto → WebP terkompres (HEIC ikut terkonversi); PDF apa adanya. */
export async function toUploadable(file: File): Promise<{ blob: Blob; ext: string; type: string }> {
  if (file.type === "application/pdf") return { blob: file, ext: "pdf", type: file.type };
  return { blob: await compressImage(file), ext: "webp", type: "image/webp" };
}
