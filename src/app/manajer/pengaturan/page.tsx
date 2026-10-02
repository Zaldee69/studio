import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { savePublicSettings, saveSopSettings } from "./actions";
import { CrudTable, ResetPasswordForm, SettingsForm } from "./crud-table";
import { ClosuresForm, HoursForm, OutboundLog, PhotoManager } from "./public-page";
import { PUBLIC_GROUPS, SOP_GROUPS } from "./tables";
import { MfaSettings } from "./mfa-settings";
import { StationSettings } from "./station-settings";

export const metadata = { title: "Pengaturan" };

const TABS = [
  ["umum", "Umum"], ["layanan", "Layanan"], ["kursi", "Kursi & meja"],
  ["publik", "Halaman publik"], ["staf", "Staf"], ["akun", "Akun & peran"], ["deposit", "Paket deposit"], ["stasiun", "Stasiun & PIN"], ["sop", "SOP"], ["keamanan", "Keamanan"],
] as const;

export default async function Pengaturan({ searchParams }: PageProps<"/manajer/pengaturan">) {
  const tab = String((await searchParams).tab ?? "umum");
  const supabase = await createClient();
  const opt = (rows: { id: string; name: string }[] | null) => (rows ?? []).map((r) => [r.id, r.name] as [string, string]);

  let body: React.ReactNode;
  if (tab === "layanan") {
    const [{ data: services }, { data: items }] = await Promise.all([
      supabase.from("services").select("*").order("sort"),
      supabase.from("inventory_items").select("id, name").eq("kind", "retail").order("name"),
    ]);
    body = <CrudTable table="services" rows={services ?? []} options={{ services: opt(services), retailItems: opt(items) }} />;
  } else if (tab === "kursi" || tab === "staf") {
    const [{ data }, { data: open }, { data: res }] = await Promise.all([
      tab === "kursi" ? supabase.from("resources").select("*").order("sort") : supabase.from("staff").select("*").order("sort"),
      supabase.rpc("bookable_categories"),
      supabase.from("resources").select("id, name, type").eq("active", true).order("sort"),
    ]);
    // kursi utama: diutamakan saat booking, harus sekategori (dijaga trigger DB)
    const resources = (res ?? []).map((r) => [r.id, `${r.name} (${r.type === "nail" ? "nail" : "barber"})`] as [string, string]);
    const hidden = (["barbershop", "nail"] as const).filter((c) => !(open ?? []).includes(c));
    body = (
      <div className="space-y-4">
        {hidden.length > 0 && (
          <p role="status" className="rounded-lg bg-st-booked p-4 text-sm">
            Reservasi online <b>{hidden.map((c) => (c === "nail" ? "nail" : "barbershop")).join(" & ")}</b> sedang disembunyikan dari
            halaman publik — butuh minimal satu kursi/meja <b>dan</b> satu staf aktif di kategori itu.
          </p>
        )}
        <CrudTable table={tab === "kursi" ? "resources" : "staff"} rows={data ?? []} options={{ resources }} />
      </div>
    );
  } else if (tab === "publik") {
    const [{ data: st }, { data: hours }, { data: closures }, { data: photos }, { data: staff }, { data: reviews }, { data: msgs }] = await Promise.all([
      supabase.from("settings").select("*").single(),
      supabase.from("opening_hours").select("*").order("weekday"),
      supabase.from("special_closures").select("*").order("date"),
      supabase.from("site_photos").select("*").order("sort"),
      supabase.from("staff").select("id, name, photo_path").eq("active", true).order("sort"),
      supabase.from("reviews").select("*").order("sort"),
      supabase.from("outbound_messages").select("*").order("created_at", { ascending: false }).limit(20),
    ]);
    const std = (st?.standards as { title: string; text: string }[] | null) ?? [];
    const values = { ...st, ...Object.fromEntries(std.flatMap((x, i) => [[`std_${i + 1}_title`, x.title], [`std_${i + 1}_text`, x.text]])) };
    body = (
      <div className="flex flex-col gap-6">
        <p className="rounded-lg bg-paper px-4 py-3 text-sm text-muted">Konten landing page, booking online, dan kebijakan privasi. Perubahan langsung tampil di situs publik.
          {" "}<a href="/" target="_blank" className="font-semibold text-accent underline">Buka landing →</a></p>
        <SettingsForm values={values} groups={PUBLIC_GROUPS} save={savePublicSettings} submit="Simpan halaman publik" />
        <div className="grid gap-6 xl:grid-cols-2">
          <HoursForm hours={hours ?? []} />
          <ClosuresForm closures={closures ?? []} />
        </div>
        <PhotoManager photos={photos ?? []} staff={staff ?? []} />
        <div className="flex flex-col gap-2">
          <h2 className="font-display text-lg font-semibold">Ulasan asli</h2>
          <p className="text-xs text-muted">Hanya ulasan nyata (nama/inisial + sumber). Bagian ulasan di landing hanya tampil bila ada ulasan aktif.</p>
          <CrudTable table="reviews" rows={reviews ?? []} />
        </div>
        <OutboundLog rows={msgs ?? []} />
      </div>
    );
  } else if (tab === "sop") {
    const [{ data: st }, { data: groups }] = await Promise.all([
      supabase.from("settings").select("sop_shifts, sop_shift_names, sop_reminder_time, sop_require_photo_autoclave").single(),
      supabase.from("sop_tool_groups").select("*").order("sort"),
    ]);
    const values = { ...st, sop_shifts: String(st?.sop_shifts ?? 1), sop_shift_1: st?.sop_shift_names?.[0] ?? "Pagi", sop_shift_2: st?.sop_shift_names?.[1] ?? "Sore",
      sop_reminder_time: String(st?.sop_reminder_time ?? "12:00").slice(0, 5) };
    body = (
      <div className="flex flex-col gap-6">
        <SettingsForm values={values} groups={SOP_GROUPS} save={saveSopSettings} submit="Simpan pengaturan SOP" />
        <div className="flex flex-col gap-2">
          <h2 className="font-display text-lg font-semibold">Kelompok alat</h2>
          <p className="text-xs text-muted">Setiap kelompok aktif × 3 tahap (Cuci → Rendam → Autoclave) = checklist harian. Nonaktifkan, jangan hapus — riwayat audit tetap utuh.</p>
          <CrudTable table="sop_tool_groups" rows={groups ?? []} />
        </div>
      </div>
    );
  } else if (tab === "stasiun") {
    const { data } = await supabase.from("staff").select("id, name").eq("active", true).order("sort");
    body = <StationSettings staff={data ?? []} />;
  } else if (tab === "keamanan") {
    body = <MfaSettings />;
  } else if (tab === "deposit") {
    const { data } = await supabase.from("deposit_packages").select("*").order("amount_paid");
    body = <CrudTable table="deposit_packages" rows={data ?? []} />;
  } else if (tab === "akun") {
    const [{ data: profiles }, { data: staff }] = await Promise.all([
      supabase.from("profiles").select("*").neq("role", "customer").order("active").order("created_at"),
      supabase.from("staff").select("id, name").order("sort"),
    ]);
    const pending = (profiles ?? []).filter((p) => !p.active).length;
    body = (
      <div className="space-y-6">
        {pending > 0 && (
          <p role="status" className="rounded-lg bg-st-booked p-4 text-sm">
            {pending} akun baru menunggu aktivasi. Centang <b>Aktif</b> (kapster: pilih <b>Tautan staf</b> dulu) lalu Simpan.
          </p>
        )}
        <CrudTable table="profiles" rows={profiles ?? []} options={{ staff: opt(staff) }} />
        <ResetPasswordForm users={(profiles ?? []).map((p) => [p.id, `${p.full_name} · ${p.email}`])} />
        <p className="text-sm text-muted">Akun pelanggan dikelola di modul Pelanggan (tahap berikutnya).</p>
      </div>
    );
  } else {
    const { data } = await supabase.from("settings").select("*").single();
    body = <SettingsForm values={data ?? {}} />;
  }

  return (
    <div>
      <h1 className="font-display text-3xl font-bold">Pengaturan</h1>
      <nav aria-label="Bagian pengaturan" className="mt-4 flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map(([k, label]) => (
          <Link key={k} href={`?tab=${k}`} aria-current={tab === k ? "page" : undefined}
            className="inline-flex min-h-11 shrink-0 items-center border-b-2 border-transparent px-4 text-sm text-muted aria-[current=page]:border-accent aria-[current=page]:font-semibold aria-[current=page]:text-accent">
            {label}
          </Link>
        ))}
      </nav>
      <div className="mt-6">{body}</div>
    </div>
  );
}
