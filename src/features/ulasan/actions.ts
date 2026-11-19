"use server";

import OpenAI from "openai";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { BRAND } from "@/lib/brand";

export type Draft = { ok: true; text: string } | { ok: false; message: string };

/** Draf balasan ulasan Google (manajer menempelnya sendiri di Google). AI hanya menulis; tidak mengirim apa pun. */
export async function draftReviewReply(rating: number, review: string): Promise<Draft> {
  const p = await getProfile();
  if (p?.role !== "manager") return { ok: false, message: "Hanya manajer yang bisa memakai fitur ini." };
  const text = review.trim();
  if (text.length < 3 || text.length > 1500) return { ok: false, message: "Tempel isi ulasan (3 sampai 1500 huruf)." };
  if (!process.env.OPENAI_API_KEY) return { ok: false, message: "Fitur ini belum aktif: OPENAI_API_KEY belum diisi di server." };
  const stars = Math.min(5, Math.max(1, Math.round(rating)));
  const { data: s } = await (await createClient()).from("settings").select("shop_name, shop_whatsapp").single();
  const shop = s?.shop_name ?? BRAND;
  try {
    const res = await new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 30_000, maxRetries: 1 }).chat.completions.create({
      model: process.env.OPENAI_TEXT_MODEL ?? "gpt-4.1-mini",
      temperature: 0.6, max_tokens: 300,
      messages: [
        { role: "system", content: `Kamu menulis balasan ulasan Google untuk ${shop} (barbershop dan nail art). Gaya: Indonesia baku yang hangat dan sopan, tanpa slang, tanpa emoji, tanpa tanda bintang. Panjang 2 sampai 4 kalimat. Sebut satu hal spesifik dari ulasan bila ada. Jangan menjanjikan diskon atau kompensasi, jangan membantah pelanggan. Untuk bintang 1 sampai 3: minta maaf dengan tulus, akui masukannya, ajak menghubungi lewat WhatsApp${s?.shop_whatsapp ? ` ${s.shop_whatsapp}` : ""} agar bisa dibantu. Untuk bintang 4 sampai 5: ucapkan terima kasih dan undang kembali. Tutup dengan nama toko. Keluarkan hanya teks balasan.` },
        { role: "user", content: `Bintang: ${stars}\nUlasan: ${text}` },
      ],
    });
    const out = res.choices[0]?.message?.content?.trim();
    return out ? { ok: true, text: out } : { ok: false, message: "Draf kosong. Coba lagi." };
  } catch {
    return { ok: false, message: "Layanan penulis draf sedang bermasalah. Coba lagi sebentar." };
  }
}
