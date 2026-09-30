"use client";

import { useActionState, useState } from "react";
import { useToast } from "@/components/ui";
import { formatJam, formatTanggal } from "@/lib/domain/format";
import { useRealtimeTable } from "@/lib/hooks/useRealtimeTable";
import { createClient } from "@/lib/supabase/client";
import { registerStation } from "@/features/stasiun/actions";

/** Pengaturan mode stasiun: PIN per kapster (hash di server) & daftar perangkat stasiun. */
export function StationSettings({ staff }: { staff: { id: string; name: string }[] }) {
  const toast = useToast();
  const [pins, setPins] = useState<Record<string, string>>({});
  const [reg, regAction, registering] = useActionState(registerStation, undefined);
  const { data, refresh } = useRealtimeTable(["staff"], async () => {
    const supabase = createClient();
    const [st, dev] = await Promise.all([
      supabase.rpc("staff_pin_status"),
      supabase.from("station_devices").select("id, name, active, created_at, last_seen_at").order("created_at", { ascending: false }),
    ]);
    const now = Date.now();
    return { status: new Map((st.data ?? []).map((r) => [r.staff_id, { ...r, locked: !!r.locked_until && Date.parse(r.locked_until) > now }])), devices: dev.data ?? [] };
  });

  async function savePin(id: string) {
    const { error } = await createClient().rpc("set_staff_pin", { p_staff_id: id, p_pin: pins[id] ?? "" });
    if (error) return toast(error.message, "error");
    toast("PIN disimpan"); setPins({ ...pins, [id]: "" }); refresh();
  }
  async function clearPin(id: string) {
    const { error } = await createClient().rpc("clear_staff_pin", { p_staff_id: id });
    if (error) return toast(error.message, "error");
    toast("PIN dihapus"); refresh();
  }
  async function setActive(id: string, active: boolean) {
    const { error } = await createClient().from("station_devices").update({ active }).eq("id", id);
    if (error) return toast(error.message, "error");
    toast(active ? "Perangkat diaktifkan" : "Perangkat dicabut"); refresh();
  }

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <section className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-5">
        <h2 className="font-display text-lg font-semibold">PIN kapster</h2>
        <p className="text-sm text-muted">Dipakai untuk masuk di tablet stasiun (4–6 digit). Disimpan terenkripsi; 5× salah → terkunci 5 menit. Kapster harus punya akun aktif yang tertaut.</p>
        {staff.map((s) => {
          const st = data?.status.get(s.id);
          const locked = st?.locked;
          return (
            <form key={s.id} onSubmit={(e) => { e.preventDefault(); savePin(s.id); }} className="flex flex-wrap items-center gap-2 border-t border-[#F0EDE6] pt-3">
              <span className="flex min-w-32 flex-1 flex-col"><b className="text-sm">{s.name}</b>
                <span className="text-xs text-muted">{locked ? "Terkunci sementara" : st?.has_pin ? `PIN diatur ${st.updated_at ? formatTanggal(st.updated_at) : ""}` : "Belum ada PIN"}</span></span>
              <label htmlFor={`pin-${s.id}`} className="sr-only">PIN baru {s.name}</label>
              <input id={`pin-${s.id}`} inputMode="numeric" autoComplete="off" pattern="\d{4,6}" maxLength={6} placeholder="PIN baru" className="input w-32 tabular"
                value={pins[s.id] ?? ""} onChange={(e) => setPins({ ...pins, [s.id]: e.target.value.replace(/\D/g, "") })} />
              <button disabled={(pins[s.id] ?? "").length < 4} className="btn-ink h-11 px-4">Simpan</button>
              {st?.has_pin && <button type="button" onClick={() => clearPin(s.id)} className="btn-danger h-11 px-3">Hapus</button>}
            </form>
          );
        })}
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-5">
        <h2 className="font-display text-lg font-semibold">Perangkat stasiun</h2>
        <form action={regAction} className="flex flex-wrap items-end gap-2 rounded-xl bg-paper p-3">
          <label className="flex min-w-40 flex-1 flex-col gap-1 text-xs font-bold text-muted">Nama perangkat ini
            <input name="name" className="input" placeholder="Mis. Tablet meja kuku" /></label>
          <button disabled={registering} className="btn-ink h-11">Daftarkan perangkat ini</button>
          {reg?.error && <p role="alert" className="w-full text-[13px] font-semibold text-danger">{reg.error}</p>}
          {reg?.ok && <p role="status" className="w-full text-[13px] font-semibold text-[#1F7A45]">{reg.ok}</p>}
        </form>
        <p className="text-xs text-muted">Buka halaman ini di tablet yang akan dipakai bersama, daftarkan, lalu keluar dan buka <b>/stasiun</b>. Sesi kapster di stasiun keluar otomatis setelah 5 menit tanpa aktivitas.</p>
        {data?.devices.map((d) => (
          <div key={d.id} className="flex flex-wrap items-center gap-2 border-t border-[#F0EDE6] pt-3">
            <span className="flex flex-1 flex-col"><b className="text-sm">{d.name}</b>
              <span className="text-xs text-muted tabular">Terakhir dipakai {d.last_seen_at ? `${formatTanggal(d.last_seen_at)} ${formatJam(d.last_seen_at)}` : "—"}</span></span>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${d.active ? "bg-[#D9F2E1] text-[#144D2A]" : "bg-[#EEEBE4] text-[#4A463F]"}`}>{d.active ? "Aktif" : "Dicabut"}</span>
            <button onClick={() => setActive(d.id, !d.active)} className="btn-ghost h-11 rounded-[10px]">{d.active ? "Cabut" : "Aktifkan"}</button>
          </div>
        ))}
        {data && !data.devices.length && <p className="text-sm text-muted">Belum ada perangkat.</p>}
      </section>
    </div>
  );
}
