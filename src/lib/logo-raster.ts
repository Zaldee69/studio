"use client";

import { rasterCmd, type Paper } from "./domain/escpos";

/** Logo struk: hitam-putih murni (public/logo-struk-v4.png, "Pintu Studio") — cocok untuk kertas thermal tanpa dithering. */
// ganti nama file (v2, v3, …) setiap logo diganti — nama baru = tidak tertahan cache browser
export const RECEIPT_LOGO = "/logo-struk-v4.png";
const WIDTH: Record<Paper, number> = { 58: 256, 80: 320 }; // dot, kelipatan 8
const cache = new Map<Paper, Promise<number[] | null>>();

/** Logo → perintah gambar ESC/POS. Gagal memuat = struk tanpa logo (tidak menggagalkan cetak). */
export function logoRaster(paper: Paper): Promise<number[] | null> {
  if (!cache.has(paper)) cache.set(paper, build(WIDTH[paper]).catch(() => { cache.delete(paper); return null; }));
  return cache.get(paper)!;
}

async function build(w: number) {
  const bmp = await createImageBitmap(await (await fetch(RECEIPT_LOGO)).blob());
  const h = Math.round((bmp.height * w) / bmp.width);
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d")!;
  g.fillStyle = "#fff"; g.fillRect(0, 0, w, h);
  g.imageSmoothingQuality = "high";
  g.drawImage(bmp, 0, 0, w, h);
  const px = g.getImageData(0, 0, w, h).data;
  return rasterCmd(Array.from({ length: w * h }, (_, i) => px[i * 4] < 100), w, h); // ambang < 128: garis putih halus (rambut, janggut) tidak tertutup
}
