import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { formatJam, formatTanggal } from "@/lib/domain/format";
import { BRAND } from "@/lib/brand";
import { BookingActions } from "./booking-actions";

export const metadata: Metadata = { title: "Booking Anda", robots: { index: false } };
type Info = { code: string; start_at: string; confirmed: boolean; active: boolean; cancellable: boolean; cutoff_hours: number; name: string; services: string[] };

export default async function Page({ params }: PageProps<"/b/[token]">) {
  const { token } = await params;
  const admin = createAdminClient();
  const [{ data }, { data: shop }] = await Promise.all([
    /^[0-9a-f]{24}$/.test(token) ? admin.rpc("booking_token_info", { p_token: token }) : Promise.resolve({ data: null }),
    admin.from("settings").select("shop_name, shop_whatsapp").single(),
  ]);
  const info = data as unknown as Info | null;
  const name = shop?.shop_name ?? BRAND;
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-5 py-10">
      <h1 className="font-display text-2xl font-medium">{name}</h1>
      {!info ? (
        <p className="rounded-2xl bg-paper p-5 text-[15px]">Tautan ini tidak dikenali. Silakan hubungi kami lewat WhatsApp.</p>
      ) : (
        <>
          {info.active && <section className="flex flex-col gap-1 rounded-3xl border border-line bg-card p-5">
            <span className="text-sm text-muted">Halo Kak{info.name ? ` ${info.name}` : ""}, booking {info.code}</span>
            <b className="font-display text-xl font-semibold">{formatTanggal(info.start_at)} · {formatJam(info.start_at)}</b>
            <span className="text-[15px]">{info.services.join(", ")}</span>
          </section>}
          {info.active
            ? <BookingActions token={token} confirmed={info.confirmed} cancellable={info.cancellable} cutoff={info.cutoff_hours} wa={shop?.shop_whatsapp ?? ""} />
            : <p className="rounded-2xl bg-paper p-5 text-[15px]">Booking ini sudah selesai atau dibatalkan.</p>}
        </>
      )}
    </main>
  );
}
