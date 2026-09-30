"use client";

import { useState } from "react";
import { CloseButton, Field, Sheet, useOnline, useToast } from "@/components/ui";
import { formatRupiah, formatTanggal, jktDate } from "@/lib/domain/format";
import { MAINT_STATUS, maintenanceLabel, type MaintState } from "@/lib/domain/kpi";
import { useRealtimeTable } from "@/lib/hooks/useRealtimeTable";
import { createClient } from "@/lib/supabase/client";
import { openSopPhoto, uploadSopPhoto } from "./grid";

type Hist = { id: string; at: string; by: string | null; note: string; vendor: string | null; photo: string | null; cost: number | null };
export type Task = { task_id: string; name: string; interval_days: number; procedure: string; assignee_staff_id: string | null; assignee: string | null;
  active: boolean; last_done_at: string | null; next_due: string; days_left: number; status: MaintState; history: Hist[] };

export function useMaintenance() {
  return useRealtimeTable(["maintenance_logs"], async () => {
    const { data } = await createClient().rpc("maintenance_status", {});
    return (data ?? []) as unknown as Task[];
  });
}

export function MaintenanceChip({ t }: { t: Pick<Task, "status" | "days_left"> }) {
  const s = MAINT_STATUS[t.status];
  return <span className="whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold" style={{ background: s.bg, color: s.fg }}><span aria-hidden="true">{s.icon} </span>{maintenanceLabel(t.days_left)}</span>;
}

/** Kartu tugas perawatan. Manajer: ubah tugas, isi biaya/vendor, tambah & nonaktifkan. Kapster: tandai selesai saja. */
export function Maintenance({ manager, staff = [] }: { manager: boolean; staff?: { id: string; name: string }[] }) {
  const toast = useToast(); const online = useOnline();
  const { data, refresh } = useMaintenance();
  const [done, setDone] = useState<Task | null>(null);
  const [edit, setEdit] = useState<Task | "new" | null>(null);
  const [f, setF] = useState({ note: "", cost: "", vendor: "" });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [costFor, setCostFor] = useState<{ id: string; value: string } | null>(null);
  async function saveCost() {
    if (!costFor) return;
    const cost = Number(costFor.value.replace(/\D/g, ""));
    const { error } = await createClient().from("maintenance_logs").update({ cost }).eq("id", costFor.id);
    if (error) return toast(error.message, "error");
    toast("Biaya servis dicatat"); setCostFor(null); refresh();
  }

  async function markDone() {
    if (!done) return;
    setBusy(true);
    try {
      const photo = file ? await uploadSopPhoto(file, jktDate()) : undefined;
      const cost = manager && f.cost.trim() ? Number(f.cost.replace(/\D/g, "")) : undefined;
      const { error } = await createClient().rpc("maintenance_mark_done", { p_task_id: done.task_id, p_note: f.note || undefined, p_photo_path: photo,
        p_cost: cost, p_vendor: f.vendor || undefined });
      if (error) throw new Error(error.message);
      toast(`${done.name} ditandai selesai`); setDone(null); setF({ note: "", cost: "", vendor: "" }); setFile(null); refresh();
    } catch (e) { toast((e as Error).message, "error"); }
    setBusy(false);
  }
  async function saveTask(fd: FormData) {
    const row = { name: String(fd.get("name")).trim(), interval_days: Number(fd.get("interval_days")), procedure: String(fd.get("procedure") ?? ""),
      assignee_staff_id: String(fd.get("assignee") || "") || null };
    if (!row.name || !(row.interval_days > 0)) return toast("Isi nama & interval (hari)", "error");
    const supabase = createClient();
    const { error } = edit === "new" ? await supabase.from("maintenance_tasks").insert(row) : await supabase.from("maintenance_tasks").update(row).eq("id", (edit as Task).task_id);
    if (error) return toast(error.message, "error");
    toast("Tugas disimpan"); setEdit(null); refresh();
  }
  async function toggle(t: Task) {
    const { error } = await createClient().from("maintenance_tasks").update({ active: !t.active }).eq("id", t.task_id);
    if (error) return toast(error.message, "error");
    toast(t.active ? "Tugas dinonaktifkan" : "Tugas diaktifkan"); refresh();
  }

  const tasks = (data ?? []).filter((t) => manager || t.active);
  return (
    <section id="perawatan" aria-label="Perawatan fasilitas" className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <h2 className="flex-1 font-display text-xl font-bold">Perawatan fasilitas</h2>
        {manager && <button onClick={() => setEdit("new")} className="btn-ghost h-11">+ Tambah tugas</button>}
      </div>
      {!data ? <p className="text-muted">Memuat…</p> : !tasks.length ? <p className="text-sm text-muted">Belum ada tugas perawatan.</p> : (
        <div className="grid gap-2.5 min-[820px]:grid-cols-2">
          {tasks.map((t) => {
            const last = t.history[0];
            return (
              <article key={t.task_id} aria-label={t.name} className={`flex flex-col gap-2 rounded-[14px] border border-line bg-card p-4 ${t.active ? "" : "opacity-55"}`}>
                <div className="flex items-start gap-2">
                  <span className="flex flex-1 flex-col"><b className="text-[15px]">{t.name}</b>
                    <span className="text-xs text-muted">Tiap {t.interval_days} hari{t.assignee ? ` · PJ ${t.assignee}` : ""}</span></span>
                  <MaintenanceChip t={t} />
                </div>
                <p className="text-sm text-muted tabular">
                  {last ? <>Terakhir: {formatTanggal(last.at)} oleh {last.vendor || last.by || "—"}{last.note ? ` (${last.note})` : ""}</> : "Belum pernah dikerjakan"} · jatuh tempo {formatTanggal(`${t.next_due}T12:00:00+07:00`)}
                </p>
                {t.procedure && <p className="text-xs text-muted">Prosedur: {t.procedure}</p>}
                {(manager ? t.history.length > 0 : t.history.length > 1) && (
                  <details className="text-xs text-muted"><summary className="flex min-h-11 cursor-pointer items-center font-semibold">Riwayat 3 terakhir</summary>
                    {t.history.map((h) => (
                      <div key={h.id} className="flex flex-wrap items-center gap-x-2 tabular">
                        <span>{formatTanggal(h.at)} · {h.vendor || h.by}{h.note ? ` · ${h.note}` : ""}{manager && h.cost != null ? ` · ${formatRupiah(h.cost)}` : ""}</span>
                        {h.photo && <button className="min-h-11 underline" onClick={() => openSopPhoto(h.photo!)}>foto</button>}
                        {manager && h.cost == null && (costFor?.id === h.id ? (
                          <span className="flex items-center gap-1">
                            <label className="sr-only" htmlFor={`cost-${h.id}`}>Biaya servis</label>
                            <input id={`cost-${h.id}`} inputMode="numeric" className="input h-10 w-32" value={costFor.value} onChange={(e) => setCostFor({ id: h.id, value: e.target.value })} />
                            <button onClick={saveCost} disabled={!Number(costFor.value.replace(/\D/g, ""))} className="btn-ink h-10 px-3">Simpan</button>
                          </span>
                        ) : <button onClick={() => setCostFor({ id: h.id, value: "" })} className="min-h-11 font-semibold text-accent underline">Tambah biaya</button>)}
                      </div>
                    ))}
                  </details>
                )}
                <div className="flex flex-wrap gap-2">
                  {t.active && <button onClick={() => setDone(t)} disabled={!online} className="btn-ink h-11 flex-1">Tandai selesai</button>}
                  {manager && <button onClick={() => setEdit(t)} className="btn-ghost h-11">Ubah</button>}
                  {manager && <button onClick={() => toggle(t)} className="btn-ghost h-11">{t.active ? "Nonaktifkan" : "Aktifkan"}</button>}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <Sheet open={!!done} onClose={() => setDone(null)} label="Tandai perawatan selesai" width={480}>
        {done && (
          <form onSubmit={(e) => { e.preventDefault(); markDone(); }}>
            <div className="flex items-center gap-3 border-b border-line px-5 py-3.5"><h2 className="flex-1 font-display text-xl font-bold">{done.name}</h2><CloseButton onClick={() => setDone(null)} /></div>
            <div className="flex flex-col gap-3 p-5">
              <Field label="Catatan" htmlFor="mt-note"><input id="mt-note" className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
              <Field label="Foto (opsional)" htmlFor="mt-photo"><input id="mt-photo" type="file" accept="image/*" capture="environment" className="input py-2" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></Field>
              <Field label="Vendor / teknisi (opsional)" htmlFor="mt-vendor"><input id="mt-vendor" className="input" value={f.vendor} onChange={(e) => setF({ ...f, vendor: e.target.value })} /></Field>
              {manager && <Field label="Biaya (Rp, opsional)" htmlFor="mt-cost"><input id="mt-cost" inputMode="numeric" className="input" value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value })} /></Field>}
              <button disabled={!online || busy} className="btn-ink h-12">{busy ? "Menyimpan…" : "Simpan"}</button>
            </div>
          </form>
        )}
      </Sheet>

      <Sheet open={!!edit} onClose={() => setEdit(null)} label="Tugas perawatan" width={480}>
        {edit && (
          <form action={saveTask}>
            <div className="flex items-center gap-3 border-b border-line px-5 py-3.5"><h2 className="flex-1 font-display text-xl font-bold">{edit === "new" ? "Tambah tugas" : "Ubah tugas"}</h2><CloseButton onClick={() => setEdit(null)} /></div>
            <div className="flex flex-col gap-3 p-5">
              <Field label="Nama tugas" htmlFor="mt-name"><input id="mt-name" name="name" className="input" defaultValue={edit === "new" ? "" : edit.name} /></Field>
              <Field label="Interval (hari)" htmlFor="mt-int"><input id="mt-int" name="interval_days" inputMode="numeric" className="input" defaultValue={edit === "new" ? 14 : edit.interval_days} /></Field>
              <Field label="Penanggung jawab" htmlFor="mt-pj">
                <select id="mt-pj" name="assignee" className="input" defaultValue={edit === "new" ? "" : edit.assignee_staff_id ?? ""}>
                  <option value="">—</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Field>
              <Field label="Prosedur singkat" htmlFor="mt-proc"><textarea id="mt-proc" name="procedure" rows={3} className="input py-2" defaultValue={edit === "new" ? "" : edit.procedure} /></Field>
              <button className="btn-ink h-12">Simpan tugas</button>
            </div>
          </form>
        )}
      </Sheet>
    </section>
  );
}
