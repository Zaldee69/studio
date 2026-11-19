"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/date-input";
import { Input } from "@/components/ui/input";
import { CloseButton, Field, Sheet, useOnline, useToast } from "@/components/ui";
import { formatJam } from "@/lib/domain/format";
import { createClient } from "@/lib/supabase/client";
import { PeriodNav } from "@/features/sdm/period-nav";
import { shiftWeek, weekLabel, plusDays, catInfo } from "@/features/sdm/shared";
import { daftarkanWifi } from "./actions";
import { rekap, statusOf, type KRow, type KStatus } from "./status";

export type Wifi = { ip: string; label: string };
export type AbsenCfg = { masuk: string; pulang: string; toleransi: number; mulai: string };

const CHIP: Record<KStatus, string> = {
  hadir: "bg-[#E3F4EA] text-[#1D5A3A]", telat: "bg-[#FBF2E4] text-[#6B4A10]", bolos: "bg-[#FBEEEC] text-[#6E1616]",
  libur: "bg-side text-muted", izin: "bg-[#EEF3F7] text-[#34576F]", tutup: "bg-side text-faint", belum: "border border-dashed border-line text-muted", nanti: "text-faint",
};
const HARI = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

/** Kehadiran mingguan semua kasir & staf layanan. Ketuk sel untuk mengisi/koreksi manual. */
export function Kehadiran({ week, today, rows, wifi, cfg }: { week: string; today: string; rows: KRow[]; wifi: Wifi[]; cfg: AbsenCfg }) {
  const [edit, setEdit] = useState<{ row: KRow } | null>(null);
  const days = Array.from({ length: 7 }, (_, i) => plusDays(week, i));
  const people = [...new Map(rows.map((r) => [r.profile_id, r])).values()];
  const hariIni = rows.filter((r) => r.tanggal === today);
  const sudah = hariIni.filter((r) => r.in_at).length, belum = hariIni.filter((r) => statusOf(r, today) === "belum");

  return (
    <div className="flex flex-col gap-4">
      <PeriodNav prev={`?tab=kehadiran&minggu=${shiftWeek(week, -1)}`} next={`?tab=kehadiran&minggu=${shiftWeek(week, 1)}`} label={weekLabel(week)}
        prevLabel="Minggu sebelumnya" nextLabel="Minggu berikutnya" tone="idle" status={`Jam masuk ${cfg.masuk} · toleransi ${cfg.toleransi} mnt`} />

      {week <= today && today < plusDays(week, 7) && (
        <p className="rounded-[14px] bg-card px-4 py-3 text-sm">
          <b className="font-semibold">Hari ini:</b> {sudah} dari {hariIni.filter((r) => !r.libur && !r.tutup).length} sudah absen
          {belum.length > 0 && <span className="text-muted"> · belum: {belum.map((r) => r.nama).join(", ")}</span>}
        </p>
      )}

      <div className="overflow-x-auto rounded-3xl border border-line bg-card">
        <table className="w-full min-w-[720px] border-collapse text-sm tabular">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="sticky left-0 bg-card px-4 py-3 font-medium">Nama</th>
              {days.map((d, i) => <th key={d} className={`px-1 py-3 text-center font-medium ${d === today ? "text-ink" : ""}`}>{HARI[i]} {d.slice(8)}</th>)}
              <th className="px-4 py-3 text-right font-medium">Rekap</th>
            </tr>
          </thead>
          <tbody>
            {people.map((p) => {
              const mine = rows.filter((r) => r.profile_id === p.profile_id);
              const k = rekap(mine, today);
              return (
                <tr key={p.profile_id} className="border-t border-line">
                  <th className="sticky left-0 bg-card px-4 py-2 text-left font-medium">
                    {p.nama}<span className="block text-xs font-normal text-muted">{catInfo(p.kelompok).label}</span>
                  </th>
                  {days.map((d) => {
                    const r = mine.find((x) => x.tanggal === d);
                    if (!r) return <td key={d} />;
                    const s = statusOf(r, today);
                    const text = s === "hadir" || s === "telat" ? formatJam(r.in_at!) : s === "bolos" ? "Bolos" : s === "libur" ? "Libur" : s === "izin" ? "Izin" : s === "belum" ? "Belum" : "·";
                    const tip = r.in_at ? `Masuk ${formatJam(r.in_at)}${r.out_at ? `, pulang ${formatJam(r.out_at)}${r.auto_out ? " (otomatis)" : ""}` : ""}${r.late_min ? `, terlambat ${r.late_min} menit` : ""}${r.manual ? ` — manual: ${r.note}` : ""}` : "Isi manual";
                    return (
                      <td key={d} className="px-1 py-2 text-center">
                        <button onClick={() => d <= today && setEdit({ row: r })} disabled={d > today} title={tip} aria-label={`${p.nama} ${d}: ${tip}`}
                          className={`inline-flex h-11 min-w-[68px] flex-col items-center justify-center rounded-xl px-1.5 text-xs font-semibold leading-tight ${CHIP[s]}`}>
                          <span>{text}{r.manual && " ✎"}</span>
                          {s === "telat" && <span className="font-normal">+{r.late_min} mnt</span>}
                        </button>
                      </td>
                    );
                  })}
                  <td className="whitespace-nowrap px-4 py-2 text-right text-xs text-muted">
                    <b className="text-ink">{k.hadir}</b> hadir
                    {k.telat > 0 && <> · <span className="text-[#6B4A10]">{k.telat}× telat ({k.menitTelat} mnt)</span></>}
                    {k.bolos > 0 && <> · <span className="text-[#6E1616]">{k.bolos} bolos</span></>}
                  </td>
                </tr>
              );
            })}
            {!people.length && <tr><td colSpan={9} className="px-4 py-8 text-center text-muted">Belum ada staf atau kasir dengan akun aktif.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">Terlambat hanya dicatat, belum memotong bayaran. Lupa absen pulang otomatis dianggap pulang jam {cfg.pulang}.</p>

      <AbsenSetup wifi={wifi} cfg={cfg} />

      <Sheet open={!!edit} onClose={() => setEdit(null)} label="Isi absen manual" width={440}>
        {edit && <ManualForm key={edit.row.profile_id + edit.row.tanggal} row={edit.row} onDone={() => setEdit(null)} />}
      </Sheet>
    </div>
  );
}

function ManualForm({ row, onDone }: { row: KRow; onDone: () => void }) {
  const toast = useToast(); const router = useRouter();
  const hm = (iso: string | null) => (iso ? formatJam(iso).replace(".", ":") : "");
  const [f, setF] = useState({ in: hm(row.in_at), out: hm(row.out_at), note: "" });
  const [busy, setBusy] = useState(false);
  async function save(hapus: boolean) {
    setBusy(true);
    const { error } = await createClient().rpc("absen_manual", { p_profile: row.profile_id, p_date: row.tanggal, p_in: (hapus ? null : f.in) as string, p_out: (hapus || !f.out ? null : f.out) as string, p_note: f.note });
    setBusy(false);
    if (error) return toast(error.message, "error");
    toast(hapus ? "Absen dihapus" : "Absen tersimpan"); onDone(); router.refresh();
  }
  return (
    <form className="flex flex-col gap-3 p-5" onSubmit={(e) => { e.preventDefault(); save(false); }}>
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-lg font-semibold">{row.nama} · {row.tanggal.split("-").reverse().join("/")}</h2><CloseButton onClick={onDone} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Jam masuk" htmlFor="ab-in"><Input id="ab-in" type="time" required value={f.in} onChange={(e) => setF({ ...f, in: e.target.value })} /></Field>
        <Field label="Jam pulang" htmlFor="ab-out" hint="Kosong = belum pulang"><Input id="ab-out" type="time" value={f.out} onChange={(e) => setF({ ...f, out: e.target.value })} /></Field>
      </div>
      <Field label="Alasan (wajib)" htmlFor="ab-note" hint="mis. HP mati, WiFi bermasalah. Tercatat di Audit."><Input id="ab-note" required value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
      <div className="flex gap-2">
        {row.in_at && <Button type="button" onClick={() => save(true)} disabled={busy || !f.note.trim()} variant="outline" className="flex-1">Hapus absen</Button>}
        <Button disabled={busy || !f.in || !f.note.trim()} className="flex-1">{busy ? "Menyimpan…" : "Simpan"}</Button>
      </div>
    </form>
  );
}

function AbsenSetup({ wifi, cfg }: { wifi: Wifi[]; cfg: AbsenCfg }) {
  const toast = useToast(); const online = useOnline(); const router = useRouter();
  const [label, setLabel] = useState("");
  const [c, setC] = useState({ masuk: cfg.masuk, pulang: cfg.pulang, toleransi: String(cfg.toleransi), mulai: cfg.mulai });
  async function add() {
    const r = await daftarkanWifi(label || "WiFi toko");
    if (!r.ok) return toast(r.error ?? "Gagal", "error");
    toast("WiFi toko terdaftar"); setLabel(""); router.refresh();
  }
  async function del(ip: string) {
    const { error } = await createClient().from("absen_wifi").delete().eq("ip", ip);
    if (error) return toast(error.message, "error"); router.refresh();
  }
  async function saveCfg() {
    const { error } = await createClient().from("settings").update({ absen_masuk: c.masuk, absen_pulang: c.pulang, absen_toleransi: Number(c.toleransi), absen_mulai: c.mulai }).eq("id", true);
    if (error) return toast(error.message, "error"); toast("Aturan absen tersimpan"); router.refresh();
  }
  return (
    <details className="group rounded-2xl border border-line bg-card px-4 py-2 text-sm" open={!wifi.length}>
      <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between font-medium">
        Pengaturan absen {!wifi.length && <span className="ml-2 rounded-full bg-[#FBEEEC] px-2 py-0.5 text-xs text-[#6E1616]">WiFi toko belum terdaftar</span>}
        <span aria-hidden="true" className="text-muted group-open:rotate-180">⌄</span>
      </summary>
      <div className="flex flex-col gap-5 pb-3 pt-2">
        <section className="flex flex-col gap-2">
          <h3 className="font-semibold">WiFi toko</h3>
          <p className="text-muted">Staf hanya bisa absen dari HP yang tersambung ke WiFi toko. Buka halaman ini dari HP/laptop yang tersambung ke WiFi toko (bukan data seluler), lalu daftarkan. Jika provider mengganti IP dan staf gagal absen, daftarkan lagi.</p>
          {wifi.map((w) => (
            <div key={w.ip} className="flex items-center gap-2 border-t border-line py-2">
              <span className="min-w-0 flex-1"><b className="font-medium">{w.label || "WiFi toko"}</b><span className="block truncate text-xs text-muted tabular">{w.ip}</span></span>
              <Button onClick={() => del(w.ip)} disabled={!online} variant="ghost" className="h-10 px-3 text-xs text-muted">Hapus</Button>
            </div>
          ))}
          <div className="flex gap-2">
            <Input aria-label="Nama WiFi" placeholder="Nama (mis. WiFi toko)" value={label} onChange={(e) => setLabel(e.target.value)} className="h-11 min-w-0 flex-1" />
            <Button onClick={add} disabled={!online} className="h-11 shrink-0">Daftarkan WiFi ini</Button>
          </div>
        </section>
        <section className="flex flex-col gap-2">
          <h3 className="font-semibold">Jam & toleransi</h3>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Masuk" htmlFor="cf-in"><Input id="cf-in" type="time" value={c.masuk} onChange={(e) => setC({ ...c, masuk: e.target.value })} /></Field>
            <Field label="Pulang" htmlFor="cf-out"><Input id="cf-out" type="time" value={c.pulang} onChange={(e) => setC({ ...c, pulang: e.target.value })} /></Field>
            <Field label="Toleransi (mnt)" htmlFor="cf-tol"><Input id="cf-tol" type="number" min={0} max={60} value={c.toleransi} onChange={(e) => setC({ ...c, toleransi: e.target.value })} /></Field>
          </div>
          <Field label="Mulai berlaku" htmlFor="cf-mulai" hint="Sebelum tanggal ini tidak ada Bolos dan tidak ada pengingat Telegram."><DateInput id="cf-mulai" value={c.mulai} onChange={(e) => setC({ ...c, mulai: e.target.value })} /></Field>
          <p className="text-xs text-muted">Terlambat lewat toleransi dihitung sejak jam masuk. Pengingat Telegram &quot;belum absen&quot; terkirim 10.15 setiap hari kerja.</p>
          <Button onClick={saveCfg} disabled={!online} variant="outline" className="h-11 self-start">Simpan aturan</Button>
        </section>
      </div>
    </details>
  );
}
