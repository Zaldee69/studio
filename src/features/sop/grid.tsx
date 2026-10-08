"use client";

import { useState } from "react";
import { useConfirm } from "@/components/alert-dialog";
import { CloseButton, Field, Sheet, useOnline, useToast } from "@/components/ui";
import { formatJam, formatTanggal } from "@/lib/domain/format";
import { canRecord, canUndo, SOP_STATUS, STAGE_LABEL, STAGES, type SopStatus, type Stage } from "@/lib/domain/kpi";
import { useRealtimeTable } from "@/lib/hooks/useRealtimeTable";
import { createClient } from "@/lib/supabase/client";
import { toUploadable } from "@/lib/image";

type Log = { log_id: string; by: string | null; by_id: string; on_behalf: string | null; at: string; note: string; photo: string | null };
type Group = { id: string; name: string; description: string; stages: Partial<Record<Stage, Log>> };
export type SopDay = { date: string; shift: number; done: number; total: number; status: SopStatus; closed: boolean; is_today: boolean;
  approval: { by: string; at: string } | null; groups: Group[] };

/** Unggah foto ke bucket privat "sop": <tanggal>/<uid>/<acak>.<ext> (kapster hanya boleh folder dirinya & hari ini). */
export async function uploadSopPhoto(file: File, date: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const up = await toUploadable(file); // HEIC & foto besar → WebP terkompres
  const path = `${date}/${user!.id}/${crypto.randomUUID()}.${up.ext}`;
  const { error } = await supabase.storage.from("sop").upload(path, up.blob, { contentType: up.type });
  if (error) throw new Error(`Foto gagal diunggah: ${error.message}`);
  return path;
}
export async function openSopPhoto(path: string) {
  const { data } = await createClient().storage.from("sop").createSignedUrl(path, 300);
  if (data) window.open(data.signedUrl, "_blank", "noopener");
}

export function useSopDay(date: string, shift: number) {
  return useRealtimeTable(["sop_logs", "sop_approvals"], async () => {
    const { data, error } = await createClient().rpc("sop_day", { p_date: date, p_shift: shift });
    if (error) throw new Error(error.message);
    return data as unknown as SopDay;
  }, `${date}:${shift}`);
}

export function SopGrid({ date, shift, me, manager, staff = [], requirePhoto, big = false }: {
  date: string; shift: number; me: string; manager: boolean; staff?: { id: string; name: string }[]; requirePhoto: boolean; big?: boolean;
}) {
  const toast = useToast(); const online = useOnline(); const confirm = useConfirm();
  const { data, refresh } = useSopDay(date, shift);
  const [pick, setPick] = useState<{ group: Group; stage: Stage } | null>(null);
  const [view, setView] = useState<{ group: Group; stage: Stage; log: Log } | null>(null);
  const [f, setF] = useState({ note: "", onBehalf: "" });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const locked = !!data?.approval || !data?.is_today;

  async function record() {
    if (!pick) return;
    if (pick.stage === "autoclave" && requirePhoto && !file) return toast("Foto indikator autoclave wajib", "error");
    setBusy(true);
    try {
      const photo = file ? await uploadSopPhoto(file, date) : undefined;
      const { error } = await createClient().rpc("record_sop_stage", { p_group_id: pick.group.id, p_stage: pick.stage, p_shift: shift,
        p_note: f.note || undefined, p_photo_path: photo, p_on_behalf_staff: f.onBehalf || undefined });
      if (error) throw new Error(error.message);
      toast(`${STAGE_LABEL[pick.stage]} · ${pick.group.name} tercatat`);
      setPick(null); setF({ note: "", onBehalf: f.onBehalf }); setFile(null); refresh();
    } catch (e) { toast((e as Error).message, "error"); }
    setBusy(false);
  }
  async function undo() {
    if (!view) return;
    const { error } = await createClient().rpc("undo_sop_stage", { p_log_id: view.log.log_id });
    if (error) return toast(error.message, "error");
    toast("Tahap dibatalkan (tercatat)"); setView(null); refresh();
  }
  async function approve() {
    if (!(await confirm({ title: `Otorisasi checklist ${formatTanggal(`${date}T12:00:00+07:00`)}?`, description: "Setelah diotorisasi, checklist terkunci dan tidak bisa diubah.", confirmLabel: "Otorisasi" }))) return;
    const { error } = await createClient().rpc("approve_sop_day", { p_date: date, p_shift: shift });
    if (error) return toast(error.message, "error");
    toast("Checklist diotorisasi"); refresh();
  }

  if (!data) return <p className="text-muted">Memuat checklist…</p>;
  const st = SOP_STATUS[data.status];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3 rounded-[14px] border border-line bg-card p-4">
        <div className="flex min-w-56 flex-1 flex-col gap-1.5">
          <b className="text-sm tabular" aria-live="polite">{data.done} dari {data.total} tahap selesai</b>
          <div className="h-2.5 rounded-full bg-paper" role="progressbar" aria-label="Progres checklist" aria-valuemin={0} aria-valuemax={data.total} aria-valuenow={data.done}>
            <div className="h-full rounded-full bg-[#1F7A45] transition-all" style={{ width: `${data.total ? (data.done * 100) / data.total : 0}%` }} />
          </div>
        </div>
        <span className="rounded-full px-3 py-1 text-xs font-bold" style={{ background: st.bg, color: st.fg }}><span aria-hidden="true">{st.icon} </span>{st.label}</span>
        {data.approval ? (
          <span className="rounded-full bg-[#D9F2E1] px-3 py-1 text-xs font-bold text-[#144D2A]">Sudah diotorisasi {data.approval.by} · {formatJam(data.approval.at)}</span>
        ) : manager && (
          <button onClick={approve} disabled={!online || data.done < data.total || data.total === 0} className="btn-ink h-11">Otorisasi shift</button>
        )}
      </div>

      <div className="flex flex-col gap-2.5">
        {data.groups.map((g) => (
          <section key={g.id} aria-label={g.name} className="grid gap-2 rounded-[14px] border border-line bg-card p-3 min-[820px]:grid-cols-[180px_repeat(3,1fr)] min-[820px]:items-stretch">
            <div className="flex flex-col justify-center px-1"><b className="text-[15px]">{g.name}</b>{g.description && <span className="text-xs text-muted">{g.description}</span>}</div>
            <div className="grid grid-cols-1 gap-2 min-[640px]:grid-cols-3 min-[820px]:contents">
              {STAGES.map((stage, i) => {
                const log = g.stages[stage];
                const can = !locked && canRecord(g.stages, stage);
                const reason = log ? null : locked ? (data.approval ? "Terkunci" : "Hanya baca") : !can ? "Selesaikan tahap sebelumnya" : "Belum";
                return (
                  <button key={stage} type="button" disabled={!log && !can}
                    onClick={() => (log ? setView({ group: g, stage, log }) : setPick({ group: g, stage }))}
                    aria-label={`${i + 1}. ${STAGE_LABEL[stage]} ${g.name}: ${log ? `selesai oleh ${log.by ?? "—"} ${formatJam(log.at)}` : reason}`}
                    className={`flex ${big ? "min-h-[72px]" : "min-h-16"} items-center gap-2.5 rounded-xl border-2 px-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50
                      ${log ? "border-[#9ED7B2] bg-[#EFF9F2]" : can ? "border-ink bg-card hover:bg-paper" : "border-dashed border-line bg-paper"}`}>
                    <span aria-hidden="true" className={`flex size-7 shrink-0 items-center justify-center rounded-md border-2 text-sm font-bold ${log ? "border-[#1F7A45] bg-[#1F7A45] text-white" : "border-[#B9B3A7]"}`}>{log ? "✓" : ""}</span>
                    <span className="flex min-w-0 flex-col">
                      <b className="text-sm">{i + 1}. {STAGE_LABEL[stage]}</b>
                      <span className="truncate text-xs text-muted tabular">
                        {log ? `${log.by ?? "—"}${log.on_behalf ? ` a.n. ${log.on_behalf}` : ""} · ${formatJam(log.at)}${log.note || log.photo ? " · 📎" : ""}` : reason}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <Sheet open={!!pick} onClose={() => setPick(null)} label="Catat tahap" width={480}>
        {pick && (
          <form onSubmit={(e) => { e.preventDefault(); record(); }}>
            <div className="flex items-center gap-3 border-b border-line px-5 py-3.5">
              <h2 className="flex-1 font-display text-xl font-bold">{STAGE_LABEL[pick.stage]} · {pick.group.name}</h2><CloseButton onClick={() => setPick(null)} />
            </div>
            <div className="flex flex-col gap-3 p-5">
              {manager && staff.length > 0 && (
                <Field label="Diisi atas nama (opsional)" htmlFor="sop-behalf">
                  <select id="sop-behalf" className="input" value={f.onBehalf} onChange={(e) => setF({ ...f, onBehalf: e.target.value })}>
                    <option value="">— saya sendiri —</option>
                    {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </Field>
              )}
              <Field label="Catatan (opsional)" htmlFor="sop-note"><input id="sop-note" className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
              <Field label={pick.stage === "autoclave" && requirePhoto ? "Foto indikator (wajib)" : "Foto (opsional)"} htmlFor="sop-photo">
                <input id="sop-photo" type="file" accept="image/*" capture="environment" className="input py-2" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              </Field>
              <button disabled={!online || busy} className="btn h-14 rounded-[12px] bg-[#1F7A45] text-base text-white">{busy ? "Menyimpan…" : `Tandai ${STAGE_LABEL[pick.stage]} selesai`}</button>
            </div>
          </form>
        )}
      </Sheet>

      <Sheet open={!!view} onClose={() => setView(null)} label="Detail tahap" width={440}>
        {view && (
          <div>
            <div className="flex items-center gap-3 border-b border-line px-5 py-3.5">
              <h2 className="flex-1 font-display text-xl font-bold">{STAGE_LABEL[view.stage]} · {view.group.name}</h2><CloseButton onClick={() => setView(null)} />
            </div>
            <div className="flex flex-col gap-2 p-5 text-sm">
              <p><b>{view.log.by ?? "—"}</b>{view.log.on_behalf && <> atas nama <b>{view.log.on_behalf}</b></>} · {formatTanggal(view.log.at)} {formatJam(view.log.at)}</p>
              <p className="text-muted">{view.log.note || "Tanpa catatan"}</p>
              {view.log.photo && <button onClick={() => openSopPhoto(view.log.photo!)} className="btn-ghost h-11 self-start">Lihat foto</button>}
              {!locked && canUndo(view.group.stages, view.stage) && (manager || view.log.by_id === me) ? (
                <button onClick={undo} disabled={!online} className="btn-ghost h-11 self-start text-[#A12A2A]">Batalkan</button>
              ) : !locked && <p className="text-xs text-muted">{canUndo(view.group.stages, view.stage) ? "Hanya pengisi atau manajer yang bisa membatalkan." : "Batalkan tahap berikutnya dulu."}</p>}
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
}
