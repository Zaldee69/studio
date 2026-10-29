import Link from "next/link";
import { CAT_NAME } from "@/lib/domain/category";
import { createClient } from "@/lib/supabase/server";
import { formatRupiah } from "@/lib/domain/format";
import { saveSopSettings } from "./actions";
import { CrudTable, ResetPasswordForm, SettingsForm } from "./crud-table";
import { getProfile } from "@/lib/auth";
import { PendingAccounts } from "./pending-accounts";
import { RemoveAccountForm } from "./remove-account";
import { PriceRelease } from "./price-release";
import { ClosuresForm, HoursForm, OutboundLog, PhotoManager } from "./public-page";
import { SETTINGS_GROUPS, SOP_GROUPS } from "./tables";
import { MfaSettings } from "./mfa-settings";
import { StationSettings } from "./station-settings";
import { HairstyleCatalog } from "./hairstyle-catalog";
import { TelegramTest, WhatsAppTest } from "./telegram-test";

export const metadata = { title: "Pengaturan" };

// Kelompok → sub-tab. Kunci sub-tab = ?tab=… (kunci lama tetap dipakai agar tautan lama tidak putus).
const MENU = [
  ["Studio", [["umum", "Profil studio"], ["jam", "Jam buka & libur"], ["kursi", "Kursi & meja"]]],
  ["Layanan", [["layanan", "Layanan & harga"], ["voucher", "Voucher"], ["deposit", "Paket deposit"], ["gaya", "Katalog gaya"]]],
  ["Tim", [["staf", "Staf"], ["akun", "Akun & peran"], ["stasiun", "Stasiun & PIN"], ["sop", "SOP"]]],
  ["Pelanggan", [["booking", "Booking online"], ["pesan", "Pesan otomatis"], ["notifikasi", "Notifikasi & log"]]],
  ["Situs", [["publik", "Konten halaman"], ["foto", "Foto"], ["ulasan", "Ulasan"], ["privasi", "Kebijakan privasi"]]],
  ["Keuangan", [["keuangan", "Kas, komisi & stok"]]],
  ["Keamanan", [["keamanan", "Keamanan"]]],
] as const;

const navLink = "inline-flex min-h-11 shrink-0 items-center border-b-2 border-transparent px-4 text-sm text-muted aria-[current=page]:border-accent aria-[current=page]:font-semibold aria-[current=page]:text-accent";

export default async function Pengaturan({ searchParams }: PageProps<"/manajer/pengaturan">) {
  const asked = String((await searchParams).tab ?? "umum");
  const group = MENU.find(([, subs]) => subs.some(([k]) => k === asked)) ?? MENU[0];
  const tab = group === MENU[0] && !group[1].some(([k]) => k === asked) ? "umum" : asked;
  const supabase = await createClient();
  const settingsForm = async (sub: string) => {
    const { data: st } = await supabase.from("settings").select("*").single();
    const std = (st?.standards as { title: string; text: string }[] | null) ?? [];
    const values = { ...st, ...Object.fromEntries(std.flatMap((x, i) => [[`std_${i + 1}_title`, x.title], [`std_${i + 1}_text`, x.text]])) };
    return <SettingsForm values={values} groups={SETTINGS_GROUPS.filter((g) => g.tab === sub)} />;
  };
  const opt = (rows: { id: string; name: string }[] | null) => (rows ?? []).map((r) => [r.id, r.name] as [string, string]);

  let body: React.ReactNode;
  if (tab === "layanan") {
    const [{ data: services }, { data: items }] = await Promise.all([
      supabase.from("services").select("*").order("sort"),
      supabase.from("inventory_items").select("id, name").eq("kind", "retail").order("name"),
    ]);
    body = (
      <div className="flex flex-col gap-4">
        <PriceRelease services={services ?? []} />
        <CrudTable table="services" rows={services ?? []} options={{ services: opt(services), retailItems: opt(items) }} />
      </div>
    );
  } else if (tab === "kursi" || tab === "staf") {
    const [{ data }, { data: open }, { data: res }] = await Promise.all([
      tab === "kursi" ? supabase.from("resources").select("*").order("sort") : supabase.from("staff").select("*").order("sort"),
      supabase.rpc("bookable_categories"),
      supabase.from("resources").select("id, name, type").eq("active", true).order("sort"),
    ]);
    // kursi utama: diutamakan saat booking, harus sekategori (dijaga trigger DB)
    const resources = (res ?? []).map((r) => [r.id, `${r.name} (${CAT_NAME[r.type]})`] as [string, string]);
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
  } else if (tab === "jam") {
    const [{ data: hours }, { data: closures }] = await Promise.all([
      supabase.from("opening_hours").select("*").order("weekday"),
      supabase.from("special_closures").select("*").order("date"),
    ]);
    body = (
      <div className="grid gap-6 xl:grid-cols-2">
        <HoursForm hours={hours ?? []} />
        <ClosuresForm closures={closures ?? []} />
      </div>
    );
  } else if (tab === "publik") {
    body = (
      <div className="flex flex-col gap-6">
        <p className="rounded-lg bg-paper px-4 py-3 text-sm text-muted">Teks landing page. Perubahan langsung tampil di situs publik.
          {" "}<a href="/" target="_blank" className="font-semibold text-accent underline">Buka landing →</a></p>
        {await settingsForm("publik")}
      </div>
    );
  } else if (tab === "foto") {
    const [{ data: photos }, { data: staff }] = await Promise.all([
      supabase.from("site_photos").select("*").order("sort"),
      supabase.from("staff").select("id, name, photo_path").eq("active", true).order("sort"),
    ]);
    body = <PhotoManager photos={photos ?? []} staff={staff ?? []} />;
  } else if (tab === "ulasan") {
    const { data: reviews } = await supabase.from("reviews").select("*").order("sort");
    body = (
      <div className="flex flex-col gap-2">
        <p className="text-xs text-muted">Hanya ulasan nyata (nama/inisial + sumber). Bagian ulasan di landing hanya tampil bila ada ulasan aktif.</p>
        <CrudTable table="reviews" rows={reviews ?? []} />
      </div>
    );
  } else if (tab === "notifikasi") {
    const { data: msgs } = await supabase.from("outbound_messages").select("*").order("created_at", { ascending: false }).limit(20);
    body = <div className="flex flex-col gap-6"><TelegramTest /><WhatsAppTest /><OutboundLog rows={msgs ?? []} /></div>;
  } else if (tab === "booking" || tab === "pesan" || tab === "privasi" || tab === "keuangan") {
    body = await settingsForm(tab);
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
    const { data: st } = await supabase.from("settings").select("manager_mfa_required").single();
    body = <div className="flex flex-col gap-6"><MfaSettings required={!!st?.manager_mfa_required} />{await settingsForm("keamanan")}</div>;
  } else if (tab === "gaya") {
    body = <HairstyleCatalog />;
  } else if (tab === "deposit") {
    const { data } = await supabase.from("deposit_packages").select("*").order("amount_paid");
    body = <CrudTable table="deposit_packages" rows={data ?? []} />;
  } else if (tab === "voucher") {
    const [{ data }, { data: usage }] = await Promise.all([
      supabase.from("vouchers").select("*").order("created_at", { ascending: false }),
      supabase.rpc("voucher_usage"),
    ]);
    const u = new Map((usage ?? []).map((x) => [x.voucher_id, x]));
    body = (
      <div className="space-y-4">
        <p className="text-sm text-muted">
          Kode voucher <b>hanya bisa dipakai lewat booking online</b> (dprasstudio.com); kasir tidak bisa memasukkan kode. Potongan dihitung
          saat bayar dan <b>tidak ditumpuk</b> dengan diskon paket/promo — yang terbesar yang dipakai. &quot;Hari berlaku&quot; dicek terhadap
          tanggal jadwal. Kuota terhitung dari booking yang tidak dibatalkan.
        </p>
        {!!data?.length && (
          <div className="overflow-x-auto rounded-2xl border border-line bg-card px-4">
            <table className="w-full min-w-[520px] text-sm tabular">
              <thead><tr className="text-left text-xs text-muted"><th className="py-2 font-semibold">Kode</th><th className="text-right font-semibold">Kuota terpakai</th>
                <th className="text-right font-semibold">Dipakai saat bayar</th><th className="text-right font-semibold">Total potongan</th></tr></thead>
              <tbody>{data.map((v) => (
                <tr key={v.id} className="border-t border-line"><td className="py-2 font-semibold">{v.code}{!v.active && <span className="ml-2 text-xs text-muted">nonaktif</span>}</td>
                  <td className="text-right">{u.get(v.id)?.reserved ?? 0}{v.quota ? ` / ${v.quota}` : ""}</td>
                  <td className="text-right">{u.get(v.id)?.redeemed ?? 0}</td>
                  <td className="text-right">{formatRupiah(u.get(v.id)?.discount_total ?? 0)}</td></tr>
              ))}</tbody>
            </table>
          </div>
        )}
        <CrudTable table="vouchers" rows={data ?? []} />
      </div>
    );
  } else if (tab === "akun") {
    const me = await getProfile();
    const [{ data: profiles }, { data: staff }, { data: signups }] = await Promise.all([
      supabase.from("profiles").select("*").neq("role", "customer").order("active").order("created_at"),
      supabase.from("staff").select("id, name").order("sort"),
      supabase.rpc("team_signups"),
    ]);
    body = (
      <div className="space-y-6">
        <PendingAccounts rows={signups ?? []} staff={opt(staff)} />
        <CrudTable table="profiles" rows={profiles ?? []} options={{ staff: opt(staff) }} />
        <ResetPasswordForm users={(profiles ?? []).map((p) => [p.id, `${p.full_name} · ${p.email}`])} />
        <RemoveAccountForm users={(profiles ?? []).filter((p) => p.id !== me?.id).map((p) => [p.id, `${p.full_name} · ${p.email}`])} />
        <p className="text-sm text-muted">Akun pelanggan dikelola di modul Pelanggan (tahap berikutnya).</p>
      </div>
    );
  } else {
    body = (
      <div className="flex flex-col gap-6">
        {await settingsForm("umum")}
        <p className="text-sm text-muted">Jam buka diatur di <Link href="?tab=jam" className="font-semibold text-accent underline">Jam buka & libur</Link> — dipakai booking online dan jadwal kasir.</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="font-display text-3xl font-bold">Pengaturan</h1>
      <nav aria-label="Kelompok pengaturan" className="mt-4 flex gap-1 overflow-x-auto border-b border-line">
        {MENU.map(([label, subs]) => (
          <Link key={label} href={`?tab=${subs[0][0]}`} aria-current={group[0] === label ? "page" : undefined} className={navLink}>{label}</Link>
        ))}
      </nav>
      {group[1].length > 1 && (
        <nav aria-label={`Bagian ${group[0]}`} className="flex gap-1 overflow-x-auto border-b border-line bg-paper">
          {group[1].map(([k, label]) => (
            <Link key={k} href={`?tab=${k}`} aria-current={tab === k ? "page" : undefined} className={navLink}>{label}</Link>
          ))}
        </nav>
      )}
      <div className="mt-6">{body}</div>
    </div>
  );
}
