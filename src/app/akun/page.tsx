import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PublicFooter, PublicHeader } from "@/components/public-header";
import { getProfile } from "@/lib/auth";
import { signOut } from "@/lib/auth-actions";
import { formatJam, formatRupiah, formatTanggal, jktDate } from "@/lib/domain/format";
import { canCancel } from "@/lib/domain/hours";
import { homeFor } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { CancelButton, DeleteAccount, ProfileForms } from "./account-forms";
import { LoginPanel } from "./login-panel";

export const metadata: Metadata = { title: "Akun saya", robots: { index: false } };

const STATUS_L: Record<string, string> = {
  pending_review: "Menunggu konfirmasi toko", booked: "Terjadwal", arrived: "Sudah datang", in_service: "Sedang dilayani", completed: "Selesai",
};

// Akun pelanggan — isi mengikuti desain (Booking.dc.html, view "akun"), tampilan gaya Landing.
export default async function AkunPage({ searchParams }: PageProps<"/akun">) {
  const { konfirmasi } = await searchParams;
  const profile = await getProfile();
  if (profile && profile.role !== "customer") redirect(homeFor(profile.role));

  if (!profile) {
    return (
      <div className="min-h-screen bg-lux font-jost text-cream">
        <PublicHeader right={<Link href="/booking" className="btn-line">Reservasi</Link>} />
        <main className="mx-auto flex max-w-[1180px] flex-col items-center gap-6 px-[22px] py-14 min-[900px]:py-24">
          {konfirmasi && <p role="status" className="w-full max-w-[460px] border border-gold/50 bg-lux-3 px-3.5 py-3 text-sm text-sand">Jika tautan masih berlaku, email Anda sudah terkonfirmasi. Silakan masuk.</p>}
          <LoginPanel />
        </main>
        <PublicFooter />
      </div>
    );
  }

  const supabase = await createClient();
  const [{ data: stats }, { data: cust }, { data: upcoming }, { data: history }, { data: rules }] = await Promise.all([
    supabase.from("customer_stats").select("*").maybeSingle(),
    supabase.from("my_customer").select("whatsapp, email").maybeSingle(),
    supabase.from("appointments")
      .select("id, start_at, status, booking_group_id, group:booking_groups(code), staff:public_staff(name), appointment_services(service:public_services(name))")
      .gte("start_at", `${jktDate()}T00:00:00+07:00`).not("status", "in", "(paid,cancelled)")
      .order("start_at"),
    supabase.from("transactions").select("id, created_at, total, transaction_items(name)")
      .is("voided_at", null).order("created_at", { ascending: false }).limit(10),
    supabase.from("public_settings").select("cancel_cutoff_hours").single(),
  ]);
  const cutoff = rules?.cancel_cutoff_hours ?? 2;
  const now = Date.now(); // eslint-disable-line react-hooks/purity -- Server Component, dirender per permintaan
  const name = profile.full_name;

  return (
    <div className="min-h-screen bg-lux font-jost text-cream">
      <PublicHeader right={<Link href="/booking" className="btn-line">Reservasi</Link>} />
      <main className="mx-auto flex max-w-[860px] flex-col gap-12 px-[22px] py-12 min-[900px]:py-20">
        <div className="flex flex-wrap items-center gap-5">
          <span className="flex h-[72px] w-14 items-center justify-center rounded-t-full border border-gold font-serif text-3xl italic text-gold">
            {name.charAt(0).toUpperCase()}
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="eyebrow">Akun pelanggan</span>
            <h1 className="font-serif text-[44px] font-normal leading-none">Halo, <i className="text-gold">{name.split(" ")[0]}.</i></h1>
            {cust?.whatsapp && <span className="text-sm tabular-nums text-stone">{cust.whatsapp}</span>}
          </div>
          <form action={signOut}><button className="btn-line border-rule-2 text-dust hover:text-cream">Keluar</button></form>
        </div>

        <div className="grid gap-4 min-[520px]:grid-cols-2">
          <div className="flex flex-col gap-2 border border-gold bg-lux-3 px-6 py-7">
            <span className="lux-label">Saldo deposit</span>
            <span className="font-serif text-[40px] font-medium leading-none tabular-nums text-gold">{formatRupiah(stats?.deposit_balance ?? 0)}</span>
            <span className="text-[13px] font-light text-stone">Top-up di kasir toko</span>
          </div>
          <div className="flex flex-col gap-2 border border-rule-2 px-6 py-7">
            <span className="lux-label">Kunjungan</span>
            <span className="font-serif text-[40px] font-medium leading-none tabular-nums">{stats?.visit_count ?? 0}</span>
            <span className="text-[13px] font-light text-stone">Terakhir {stats?.last_visit_at ? formatTanggal(stats.last_visit_at) : "—"}</span>
          </div>
        </div>

        <section className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-serif text-[32px] font-normal leading-none">Booking <i className="text-gold">mendatang</i></h2>
            <Link href="/booking" className="btn-gold h-11 px-5 text-xs">Booking baru</Link>
          </div>
          {upcoming?.length ? upcoming.map((a) => {
            const editable = (a.status === "booked" || a.status === "pending_review") && canCancel(a.start_at, cutoff, now);
            return (
              <div key={a.id} className="flex flex-wrap items-center gap-4 border border-rule-2 bg-lux-2 px-5 py-4">
                <div className="flex flex-[1_1_220px] flex-col gap-1">
                  <span className="font-serif text-xl tabular-nums text-gold">{formatTanggal(a.start_at)} · {formatJam(a.start_at)}</span>
                  <span className="text-sm font-light text-sand">{a.appointment_services.map((s) => s.service?.name).join(", ")}</span>
                  <span className="text-[11px] uppercase tracking-[0.18em] text-stone">
                    {a.staff?.name} · {STATUS_L[a.status] ?? a.status}{a.group?.code && <> · Kode <b className="text-cream">{a.group.code}</b></>}
                  </span>
                  {(a.status === "booked" || a.status === "pending_review") && !editable && (
                    <span className="text-xs font-light text-dust">Perubahan hanya sampai {cutoff} jam sebelum mulai — hubungi toko via WhatsApp.</span>
                  )}
                </div>
                {editable && (
                  <div className="flex flex-wrap items-start gap-2">
                    {a.booking_group_id && <Link href={`/booking?ulang=${a.booking_group_id}`} className="btn-line">Jadwal ulang</Link>}
                    <CancelButton id={a.id} />
                  </div>
                )}
              </div>
            );
          }) : <p className="text-sm font-light italic text-dust">Belum ada booking mendatang.</p>}
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="mb-2 font-serif text-[32px] font-normal leading-none">Riwayat <i className="text-gold">kunjungan</i></h2>
          {history?.length ? history.map((t) => (
            <div key={t.id} className="flex justify-between gap-3 border-b border-rule py-3 tabular-nums">
              <span className="flex flex-col gap-0.5">
                <span className="font-serif text-lg font-medium">{formatTanggal(t.created_at)}</span>
                <span className="text-[13px] font-light text-sand">{t.transaction_items.map((i) => i.name).join(", ")}</span>
              </span>
              <span className="font-serif text-lg">{formatRupiah(t.total)}</span>
            </div>
          )) : <p className="text-sm font-light italic text-dust">Belum ada riwayat.</p>}
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="font-serif text-[32px] font-normal leading-none">Profil</h2>
          <ProfileForms name={name} email={cust?.email ?? profile.email ?? ""} />
          <div className="h-px bg-rule" />
          <DeleteAccount />
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
