"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { useState } from "react";
import { Empty, Field, Sheet, useOnline, useToast } from "@/components/ui";
import { formatRupiah, formatTanggal } from "@/lib/domain/format";
import { useRealtimeTable } from "@/lib/hooks/useRealtimeTable";
import { IMAGE_ACCEPT, toUploadable } from "@/lib/image";
import { createClient } from "@/lib/supabase/client";

type Req = {
  id: string; amount: number; reason: string; status: "diajukan" | "disetujui" | "dibayar" | "ditolak" | "dibatalkan"; over_limit: boolean; limit_override: boolean;
  requested_at: string; decision_note: string | null; cancel_reason: string | null; proof_path: string | null;
  staff: { name: string } | null; expenses: { voided_at: string | null } | null;
};
const LABEL = { diajukan: "Menunggu owner", disetujui: "Disetujui, belum ditransfer", dibayar: "Sudah ditransfer", ditolak: "Ditolak", dibatalkan: "Dibatalkan" } as const;
type Act = { kind: "approve" | "reject" | "cancel" | "pay"; row: Req };

/** Kasbon lewat pengajuan. Semua peran manajer/kasir mengajukan; hanya owner (approver) menyetujui, mentransfer, mengunggah bukti. */
export function KasbonPanel({ staff }: { staff: { id: string; name: string }[] }) {
  const toast = useToast(); const online = useOnline();
  const [form, setForm] = useState(false);
  const [act, setAct] = useState<Act | null>(null);
  const { data, refresh } = useRealtimeTable(["kasbon_requests"], async () => {
    const supabase = createClient();
    const [info, rows] = await Promise.all([
      supabase.rpc("kasbon_info"),
      supabase.from("kasbon_requests").select("id, amount, reason, status, over_limit, limit_override, requested_at, decision_note, cancel_reason, proof_path, staff(name), expenses(voided_at)")
        .order("requested_at", { ascending: false }).limit(30),
    ]);
    if (rows.error) throw rows.error;
    return { info: info.data?.[0] ?? { flow_on: false, weekly_limit: 0, is_approver: false }, rows: rows.data as unknown as Req[] };
  }, "kasbon");

  if (!data?.info.flow_on) return null;
  const { info, rows } = data;
  async function openProof(path: string) {
    const { data: u, error } = await createClient().storage.from("receipts").createSignedUrl(path, 300);
    if (error) return toast(error.message, "error");
    window.open(u.signedUrl, "_blank", "noopener");
  }
  return (
    <section aria-label="Pengajuan kasbon" className="flex flex-col gap-1 rounded-3xl border border-line bg-card p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <h2 className="flex-1 text-base font-semibold">Kasbon staf</h2>
        <Button onClick={() => setForm(true)} disabled={!online} variant="outline" className="h-10 px-3 text-xs">+ Ajukan kasbon</Button>
      </div>
      <p className="text-xs text-muted">Kasbon diajukan dulu, disetujui dan ditransfer owner. Limit {formatRupiah(info.weekly_limit)} per staf per minggu. Baru tercatat sebagai pengeluaran setelah ditransfer.</p>
      {!rows.length ? <Empty>Belum ada pengajuan.</Empty> : rows.map((r) => {
        const voided = r.status === "dibayar" && !!r.expenses?.voided_at;
        return (
          <div key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line py-3 text-sm first:mt-2">
            <span className="flex min-w-0 flex-1 flex-col">
              <b className="font-medium">{r.staff?.name} · {r.reason}</b>
              <span className="text-[13px] text-muted">
                {LABEL[r.status]}{voided && " (dibatalkan)"} · {formatTanggal(r.requested_at)}
                {r.over_limit && r.status === "diajukan" && " · melebihi limit minggu ini"}{r.limit_override && " · override limit"}
              </span>
              {(r.decision_note || r.cancel_reason) && <span className="text-xs text-muted">Catatan: {r.decision_note ?? r.cancel_reason}</span>}
            </span>
            <b className="font-semibold tabular">{formatRupiah(r.amount)}</b>
            {r.proof_path && <button onClick={() => openProof(r.proof_path!)} className="h-10 px-2 text-xs font-medium text-muted underline">Bukti</button>}
            {info.is_approver && r.status === "diajukan" && <>
              <Button onClick={() => setAct({ kind: "approve", row: r })} disabled={!online} className="h-10 px-3 text-xs">Setujui</Button>
              <Button onClick={() => setAct({ kind: "reject", row: r })} disabled={!online} variant="outline" className="h-10 px-3 text-xs">Tolak</Button>
            </>}
            {info.is_approver && r.status === "disetujui" && <Button onClick={() => setAct({ kind: "pay", row: r })} disabled={!online} className="h-10 px-3 text-xs">Transfer & unggah bukti</Button>}
            {(r.status === "diajukan" || (r.status === "disetujui" && info.is_approver)) &&
              <Button onClick={() => setAct({ kind: "cancel", row: r })} disabled={!online} variant="ghost" className="h-10 px-3 text-xs text-muted">Batalkan</Button>}
          </div>
        );
      })}
      <Sheet open={form} onClose={() => setForm(false)} label="Ajukan kasbon" width={440}>
        {form && <RequestForm staff={staff} onDone={() => { setForm(false); refresh(); }} />}
      </Sheet>
      <Sheet open={!!act} onClose={() => setAct(null)} label="Proses kasbon" width={440}>
        {act && <ActForm act={act} onDone={() => { setAct(null); refresh(); }} />}
      </Sheet>
    </section>
  );
}

function RequestForm({ staff, onDone }: { staff: { id: string; name: string }[]; onDone: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ staff: "", amount: "", reason: "" });
  const [busy, setBusy] = useState(false);
  return (
    <form className="flex flex-col gap-3 p-5" onSubmit={async (e) => {
      e.preventDefault(); setBusy(true);
      const { error } = await createClient().rpc("kasbon_request", { p_staff: f.staff, p_amount: Number(f.amount), p_reason: f.reason });
      setBusy(false);
      if (error) return toast(error.message, "error");
      toast("Pengajuan terkirim ke owner"); onDone();
    }}>
      <h2 className="text-lg font-semibold">Ajukan kasbon</h2>
      <Field label="Staf" htmlFor="kb-staff" hint="Dipotong otomatis dari komisi mingguan.">
        <NativeSelect id="kb-staff" required value={f.staff} onChange={(e) => setF({ ...f, staff: e.target.value })}>
          <option value="">Pilih staf…</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </NativeSelect>
      </Field>
      <Field label="Jumlah (Rp)" htmlFor="kb-amount">
        <Input id="kb-amount" className="text-right tabular" inputMode="numeric" required value={f.amount ? Number(f.amount).toLocaleString("id-ID") : ""}
          onChange={(e) => setF({ ...f, amount: e.target.value.replace(/\D/g, "") })} />
      </Field>
      <Field label="Alasan" htmlFor="kb-reason"><Input id="kb-reason" required minLength={2} maxLength={200} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
      <div className="flex gap-2"><Button type="button" onClick={onDone} variant="outline" className="flex-1">Batal</Button>
        <Button disabled={busy || !f.staff || !Number(f.amount) || f.reason.trim().length < 2} className="flex-1">{busy ? "Mengirim…" : "Ajukan"}</Button></div>
    </form>
  );
}

function ActForm({ act, onDone }: { act: Act; onDone: () => void }) {
  const toast = useToast();
  const [note, setNote] = useState("");
  const [override, setOverride] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const { kind, row } = act;
  const noteRequired = kind !== "pay" && !(kind === "approve" && !override);

  async function run() {
    setBusy(true);
    const supabase = createClient();
    let error: { message: string } | null = null;
    if (kind === "approve") ({ error } = await supabase.rpc("kasbon_decide", { p_id: row.id, p_approve: true, p_note: note || undefined, p_override: override }));
    else if (kind === "reject") ({ error } = await supabase.rpc("kasbon_decide", { p_id: row.id, p_approve: false, p_note: note }));
    else if (kind === "cancel") ({ error } = await supabase.rpc("kasbon_cancel", { p_id: row.id, p_reason: note }));
    else {
      let ready;
      try { ready = await toUploadable(file!); } catch (e) { setBusy(false); return toast(e instanceof Error ? e.message : String(e), "error"); }
      const path = `kasbon/${row.id}/${crypto.randomUUID()}.${ready.ext}`;
      const up = await supabase.storage.from("receipts").upload(path, ready.blob, { contentType: ready.type });
      if (up.error) { setBusy(false); return toast(`Bukti gagal diunggah: ${up.error.message}`, "error"); }
      ({ error } = await supabase.rpc("kasbon_pay", { p_id: row.id, p_proof_path: path }));
    }
    setBusy(false);
    if (error) return toast(error.message, "error");
    toast({ approve: "Kasbon disetujui — transfer lalu unggah bukti", reject: "Kasbon ditolak", cancel: "Pengajuan dibatalkan", pay: "Kasbon tercatat sebagai pengeluaran" }[kind]);
    onDone();
  }
  const title = { approve: "Setujui", reject: "Tolak", cancel: "Batalkan", pay: "Catat transfer" }[kind];
  return (
    <form className="flex flex-col gap-3 p-5" onSubmit={(e) => { e.preventDefault(); run(); }}>
      <h2 className="text-lg font-semibold">{title} kasbon {row.staff?.name}</h2>
      <p className="text-sm text-muted">{formatRupiah(row.amount)} · {row.reason}</p>
      {kind === "approve" && row.over_limit && (
        <label className="flex items-start gap-2 rounded-2xl bg-[#FBF2E4] px-3 py-2 text-sm text-[#6B4A10]">
          <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} className="mt-1" />
          Melebihi limit minggu ini. Centang untuk override limit (catatan wajib).
        </label>
      )}
      {kind === "pay" ? (
        <Field label="Bukti transfer (wajib)" htmlFor="kb-proof" hint="Transfer dulu ke staf, lalu unggah foto/PDF bukti.">
          <Input id="kb-proof" type="file" required accept={`${IMAGE_ACCEPT},application/pdf`} className="py-2" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </Field>
      ) : (
        <Field label={noteRequired ? "Catatan (wajib)" : "Catatan (opsional)"} htmlFor="kb-note"><Input id="kb-note" required={noteRequired} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      )}
      <div className="flex gap-2"><Button type="button" onClick={onDone} variant="outline" className="flex-1">Kembali</Button>
        <Button disabled={busy || (kind === "pay" && !file) || (noteRequired && !note.trim())} className="flex-1">{busy ? "Memproses…" : title}</Button></div>
    </form>
  );
}
