"use client";

import { RencanaHeader } from "@/components/rencana-header";
import { DateInput } from "@/components/date-input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import Link from "next/link";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Icon } from "@/components/icons";
import { useState } from "react";
import { Empty, Field, useOnline, useToast } from "@/components/ui";
import { CUSTOMER_SOURCES } from "@/lib/domain/customer";
import { formatJam, jktDate } from "@/lib/domain/format";
import { addDays } from "@/lib/domain/schedule";
import { useRealtimeTable } from "@/lib/hooks/useRealtimeTable";
import { createClient } from "@/lib/supabase/client";

type Task = { id: string; title: string; pic: string; due: string; measure: string; status: string; note: string; grows_customers: boolean; updated_by: string | null; updated_at: string;
  assigned_to: string | null; assigned_role: "cashier" | "staff" | null };
type StaffRow = { id: string; name: string; category: string; target_cuts_weekly: number | null };
type Log = { id: number; task_id: string; at: string; by: string | null; kind: string; from_value: string | null; to_value: string | null };
type Progress = { week: string; cuts: number; cuts_by_day: Record<string, number>; tx: number; tx_with_wa: number; new: number; returning: number;
  new_by_source: Record<string, number>; target: { cuts: number; returning: number; new: number } };

const STATUS: Record<string, [string, string, string]> = {
  belum: ["Belum mulai", "#EDEEF1", "#55554F"], jalan: ["Sedang berjalan", "#FBF2E4", "#6B4A10"],
  selesai: ["Selesai", "#E3F1E8", "#268052"], batal: ["Dibatalkan", "#EDEEF1", "#8A8A84"],
};
const LATE: [string, string, string] = ["Lewat tenggat", "#FBE6E3", "#D94B42"];
const SOURCE_LABEL: Record<string, string> = { ...Object.fromEntries(CUSTOMER_SOURCES), tidak_tercatat: "Belum dicatat" };
const DAYS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
// assign: "" = manajer, "role:cashier"/"role:staff" = semua akun peran itu, selain itu id akun
const BLANK = { title: "", pic: "Manajer", due: jktDate(), measure: "", grows: true, assign: "" };
const ROLE_LABEL = { cashier: "Semua kasir", staff: "Semua capster & terapis" } as const;

const monday = (d: string) => addDays(d, -((new Date(d + "T00:00:00Z").getUTCDay() + 6) % 7));
const shortDate = (d: string) => new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(d + "T00:00:00Z"));
const stamp = (iso: string) => `${new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "Asia/Jakarta" }).format(new Date(iso))} ${formatJam(iso)}`;

/** Manajer: progres target minggu ini (dihitung dari transaksi) + daftar tugas rencana dengan riwayat siapa mengubah apa. */
export function Rencana() {
  const toast = useToast();
  const online = useOnline();
  const today = jktDate();
  const [day, setDay] = useState(today);
  const { data, refresh } = useRealtimeTable(["manager_tasks", "manager_task_log", "transactions"], async () => {
    const supabase = createClient();
    const [tasks, logs, prog] = await Promise.all([
      supabase.from("manager_tasks").select("id, title, pic, due, measure, status, note, grows_customers, updated_by, updated_at, assigned_to, assigned_role").order("due").order("created_at"),
      supabase.from("manager_task_log").select("id, task_id, at, by, kind, from_value, to_value").order("at", { ascending: false }).limit(60),
      supabase.rpc("weekly_progress", { p_day: day }),
    ]);
    const [{ data: team }, { data: staff }] = await Promise.all([
      supabase.from("profiles").select("id, full_name, role").in("role", ["cashier", "staff"]).eq("active", true).order("full_name"),
      supabase.from("staff").select("id, name, category, target_cuts_weekly").eq("active", true).order("sort"),
    ]);
    const ids = [...new Set([...(tasks.data ?? []).map((t) => t.updated_by), ...(logs.data ?? []).map((l) => l.by)].filter((v): v is string => !!v))];
    const people = ids.length ? (await supabase.from("profiles").select("id, full_name").in("id", ids)).data ?? [] : [];
    return { tasks: (tasks.data ?? []) as Task[], logs: (logs.data ?? []) as Log[], progress: prog.data as Progress | null,
      names: Object.fromEntries(people.map((p) => [p.id, p.full_name])) as Record<string, string>,
      team: (team ?? []) as { id: string; full_name: string; role: string }[], staff: (staff ?? []) as StaffRow[] };
  }, day);

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [form, setForm] = useState(BLANK);
  const [editing, setEditing] = useState<string | null>(null);
  const [onlyGrow, setOnlyGrow] = useState(false);
  const [dlg, setDlg] = useState(false);
  const [tgt, setTgt] = useState(false);
  const [filter, setFilter] = useState<"aktif" | "lewat" | "selesai" | "semua">("aktif");

  const who = (id: string | null) => (id ? data?.names[id] || "Manajer" : "Sistem");
  const late = (t: Task) => t.due < today && t.status !== "selesai" && t.status !== "batal";

  async function update(id: string, patch: Partial<Task>, msg: string) {
    const { error } = await createClient().from("manager_tasks").update(patch).eq("id", id);
    if (error) { toast(error.message, "error"); return false; }
    toast(msg); refresh(); return true;
  }
  async function saveNote(t: Task) {
    if (await update(t.id, { note: drafts[t.id] ?? t.note }, "Catatan disimpan")) setDrafts((d) => { const n = { ...d }; delete n[t.id]; return n; });
  }
  async function submit() {
    const role = form.assign.startsWith("role:") ? form.assign.slice(5) as "cashier" | "staff" : null;
    const row = { title: form.title.trim(), pic: form.pic.trim() || "Manajer", due: form.due, measure: form.measure.trim(), grows_customers: form.grows,
      assigned_role: role, assigned_to: form.assign && !role ? form.assign : null };
    if (!row.title) return toast("Isi nama tugas", "error");
    if (editing) { if (await update(editing, row, "Tugas diubah")) { setEditing(null); setForm(BLANK); setDlg(false); } return; }
    const { error } = await createClient().from("manager_tasks").insert(row);
    if (error) return toast(error.message, "error");
    toast("Tugas ditambahkan"); setForm(BLANK); setDlg(false); refresh();
  }
  function edit(t: Task) {
    setEditing(t.id); setForm({ title: t.title, pic: t.pic, due: t.due, measure: t.measure, grows: t.grows_customers,
      assign: t.assigned_role ? `role:${t.assigned_role}` : t.assigned_to ?? "" });
    setDlg(true);
  }

  const all = (data?.tasks ?? []).filter((t) => !onlyGrow || t.grows_customers);
  const isOpen = (t: Task) => t.status === "belum" || t.status === "jalan";
  const counts = { aktif: all.filter(isOpen).length, lewat: all.filter(late).length, selesai: all.filter((t) => !isOpen(t)).length, semua: all.length };
  const tasks = all.filter((t) => filter === "semua" || (filter === "aktif" ? isOpen(t) : filter === "lewat" ? late(t) : !isOpen(t)));
  if (filter === "selesai") tasks.reverse();
  const p = data?.progress;
  const isThisWeek = p && p.week === monday(today);
  const elapsed = isThisWeek ? (new Date(today + "T00:00:00Z").getUTCDay() + 6) % 7 + 1 : 7;
  const pace = p ? Math.round((p.target.cuts * elapsed) / 7) : 0;
  const behind = p ? pace - p.cuts : 0;
  const daysLate = (t: Task) => Math.round((Date.parse(today) - Date.parse(t.due)) / 86400000);
  const maxDay = p ? Math.max(1, ...Object.values(p.cuts_by_day)) : 1;

  return (
    <div className="flex flex-col gap-5">
      <RencanaHeader actions={<Button size="lg" onClick={() => { setEditing(null); setForm(BLANK); setDlg(true); }}>+ Tambah tugas</Button>} />

      {/* Toolbar minggu: navigasi di luar kartu supaya kartu hanya berisi angka */}
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="flex-1 font-display text-lg font-semibold">
          {p ? `${shortDate(p.week)} – ${shortDate(addDays(p.week, 6))}` : "Progres minggu"}
          {isThisWeek && <span className="ml-2 rounded-full bg-accent-soft px-2.5 py-0.5 align-middle text-xs font-medium text-accent">Minggu ini</span>}
        </h2>
        <Button variant="outline" onClick={() => setTgt(true)}>Atur target</Button>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" aria-label="Minggu lalu" onClick={() => setDay(addDays(day, -7))}><Icon name="chevron" className="size-5 rotate-90" /></Button>
          <Button variant="outline" size="icon" aria-label="Minggu berikut" disabled={!!isThisWeek} onClick={() => setDay(addDays(day, 7) > today ? today : addDays(day, 7))}><Icon name="chevron" className="size-5 -rotate-90" /></Button>
        </div>
      </div>

      {!p ? <Empty>Memuat…</Empty> : (
        <section aria-label="Progres minggu" className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-5 rounded-3xl border border-line bg-card p-6">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="text-sm text-muted">Potong minggu ini</span>
              {isThisWeek && (
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${behind <= 0 ? "bg-[#E3F1E8] text-[#268052]" : "bg-[#FBE6E3] text-[#D94B42]"}`}>
                  {behind <= 0 ? "Sesuai jalur" : `Tertinggal ${behind} potong`}
                </span>
              )}
            </div>
            <p className="-mt-3 flex items-baseline gap-2">
              <b className="tabular text-[44px] font-semibold leading-none">{p.cuts}</b>
              <span className="text-lg text-muted">/ {p.target.cuts}</span>
            </p>
            <div className="flex flex-col gap-2">
              <div className="relative">
                <div className="h-3 overflow-hidden rounded-full bg-paper" role="progressbar" aria-valuenow={p.cuts} aria-valuemin={0} aria-valuemax={p.target.cuts} aria-label="Potong terhadap target">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, (p.cuts / Math.max(1, p.target.cuts)) * 100)}%` }} />
                </div>
                {isThisWeek && <span aria-hidden="true" className="absolute -top-1 h-5 w-0.5 rounded bg-ink" style={{ left: `${Math.min(100, (pace / Math.max(1, p.target.cuts)) * 100)}%` }} />}
              </div>
              {isThisWeek && <p className="text-xs text-muted">Garis hitam adalah jalur target: di hari ke-{elapsed} seharusnya {pace} potong.</p>}
            </div>
            <div className="grid grid-cols-7 items-end gap-2 border-t border-line pt-4" aria-label="Potong per hari">
              {DAYS.map((l, i) => {
                const d = addDays(p.week, i), n = d > today ? null : p.cuts_by_day[d] ?? 0;
                return (
                  <div key={d} className="flex flex-col items-center gap-1.5">
                    <div className="flex h-12 w-full items-end rounded-[14px] bg-paper"><div className={`w-full rounded-[14px] ${d === today ? "bg-accent" : "bg-accent/30"}`} style={{ height: n ? `${Math.max(12, (n / maxDay) * 100)}%` : "0" }} /></div>
                    <span className={`text-xs ${d === today ? "font-semibold text-ink" : "text-muted"}`}>{l}</span>
                    <b className="tabular text-sm font-medium">{n ?? "–"}</b>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {[
              ["Pelanggan kembali", `${p.returning}`, `target ${p.target.returning}`, p.returning >= p.target.returning],
              ["Pelanggan baru", `${p.new}`, p.target.new ? `target ${p.target.new}` : Object.keys(p.new_by_source).length ? Object.entries(p.new_by_source).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k, n]) => `${SOURCE_LABEL[k] ?? k} ${n}`).join(", ") : "belum ada sumber", p.target.new ? p.new >= p.target.new : null],
              ["Transaksi ber-WA", p.tx ? `${Math.round((p.tx_with_wa / p.tx) * 100)}%` : "–", `${p.tx_with_wa} dari ${p.tx}`, null],
              ["Transaksi", `${p.tx}`, "minggu ini", null],
            ].map(([l, v, sub, ok]) => (
              <div key={l as string} className="flex flex-col justify-between gap-3 rounded-3xl border border-line bg-card p-5">
                <span className="text-sm text-muted">{l}</span>
                <b className={`tabular text-[28px] font-semibold leading-none ${ok === true ? "text-[#268052]" : ok === false ? "text-[#D94B42]" : ""}`}>{v}</b>
                <span className="text-xs text-muted">{sub}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section aria-label="Daftar tugas" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-auto font-display text-lg font-semibold">Tugas</h2>
          {([["aktif", "Aktif"], ["lewat", "Lewat tenggat"], ["selesai", "Selesai"], ["semua", "Semua"]] as const).map(([k, l]) => (
            <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}
              className={`min-h-10 rounded-full border px-4 text-sm font-medium transition ${filter === k ? "border-accent bg-accent text-white" : "border-input bg-card text-ink hover:bg-paper"}`}>
              {l} <span className={`tabular ${filter === k ? "text-white/80" : k === "lewat" && counts.lewat ? "text-[#D94B42]" : "text-muted"}`}>{counts[k]}</span>
            </button>
          ))}
          <label className="flex min-h-10 items-center gap-2 text-sm text-muted"><Checkbox checked={onlyGrow} onCheckedChange={(v) => setOnlyGrow(v === true)} /> Menambah pelanggan saja</label>
        </div>
        {!data ? <Empty>Memuat…</Empty> : !tasks.length ? <div className="rounded-3xl border border-dashed border-line bg-card px-6 py-10 text-center text-sm text-muted">{filter === "aktif" ? "Tidak ada tugas yang sedang aktif." : "Tidak ada tugas pada kelompok ini."}</div> : (
          <ul className="overflow-hidden rounded-3xl border border-line bg-card">
            {tasks.map((t) => {
              const [l, bg, fg] = late(t) ? LATE : STATUS[t.status];
              const draft = drafts[t.id] ?? t.note;
              return (
                <li key={t.id} className="border-b border-line last:border-0">
                  <details className="group">
                    <summary className="flex min-h-[68px] cursor-pointer list-none items-center gap-4 px-5 py-3 marker:hidden hover:bg-paper [&::-webkit-details-marker]:hidden">
                      <span aria-hidden="true" className="h-10 w-1 shrink-0 rounded-full" style={{ background: late(t) ? "#D94B42" : t.status === "selesai" ? "#268052" : t.status === "jalan" ? "#C58A2B" : "#D9D3DD" }} />
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className={`text-[15px] font-medium leading-snug ${t.status === "batal" ? "text-muted line-through" : ""}`}>{t.title}</span>
                        <span className="text-xs text-muted">{t.pic} · {shortDate(t.due)}{late(t) ? ` · lewat ${daysLate(t)} hari` : ""}{t.grows_customers ? " · menambah pelanggan" : ""}</span>
                      </span>
                      <span className="hidden shrink-0 rounded-full px-3 py-1 text-xs font-medium sm:inline" style={{ background: bg, color: fg }}>{l}</span>
                      <Icon name="chevron" className="size-5 shrink-0 text-muted transition-transform group-open:rotate-180" />
                    </summary>
                    <div className="flex flex-col gap-3 border-t border-line bg-paper px-5 py-4">
                      {t.measure && <p className="text-sm"><span className="text-muted">Berhasil bila: </span>{t.measure}</p>}
                      <div className="grid gap-3 sm:grid-cols-[200px_minmax(0,1fr)]">
                        <Field label="Status" htmlFor={`st-${t.id}`}>
                          <NativeSelect id={`st-${t.id}`} value={t.status} disabled={!online} onChange={(e) => update(t.id, { status: e.target.value }, `Status: ${STATUS[e.target.value][0]}`)}>
                            {Object.entries(STATUS).map(([k, [lab]]) => <option key={k} value={k}>{lab}</option>)}
                          </NativeSelect>
                        </Field>
                        <Field label="Catatan atau bukti pelaksanaan" htmlFor={`nt-${t.id}`}>
                          <Textarea id={`nt-${t.id}`} rows={2} className="text-sm" value={draft} onChange={(e) => setDrafts({ ...drafts, [t.id]: e.target.value })} />
                        </Field>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button disabled={!online || draft === t.note} onClick={() => saveNote(t)}>Simpan catatan</Button>
                        <Button variant="outline" onClick={() => edit(t)}>Ubah tugas</Button>
                        <span className="ml-auto text-xs text-muted">Diubah {stamp(t.updated_at)} oleh {who(t.updated_by)}</span>
                      </div>
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <details className="group rounded-3xl border border-line bg-card">
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between px-6 font-display text-lg font-semibold marker:hidden [&::-webkit-details-marker]:hidden">
          Riwayat perubahan
          <Icon name="chevron" className="size-5 text-muted transition-transform group-open:rotate-180" />
        </summary>
        <div className="flex flex-col gap-1.5 border-t border-line px-6 py-4">
          {!data?.logs.length ? <span className="text-sm text-muted">Belum ada.</span> : data.logs.map((g) => {
            const title = data.tasks.find((t) => t.id === g.task_id)?.title ?? "tugas";
            const what = g.kind === "status" ? `mengubah status "${title}" dari ${STATUS[g.from_value ?? ""]?.[0] ?? g.from_value} ke ${STATUS[g.to_value ?? ""]?.[0] ?? g.to_value}`
              : g.kind === "catatan" ? `menulis catatan pada "${title}": ${g.to_value || "(dikosongkan)"}`
              : g.kind === "dibuat" ? `membuat tugas "${title}"`
              : `mengubah isi tugas: ${g.to_value}`;
            return <p key={g.id} className="border-t border-line pt-1.5 text-[13px] first-of-type:border-t-0"><span className="tabular text-muted">{stamp(g.at)}</span> {who(g.by)} {what}</p>;
          })}
        </div>
      </details>

      <Dialog open={tgt} onOpenChange={setTgt}>
        <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
          <DialogHeader className="gap-1 border-b border-line px-6 py-4 pr-14">
            <DialogTitle className="text-lg">Atur target</DialogTitle>
            <DialogDescription>Target per staf tersimpan otomatis saat kolom ditinggalkan.</DialogDescription>
          </DialogHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-5">
            <StaffTargets staff={data?.staff ?? []} studio={p?.target.cuts ?? 0} onSaved={refresh} />
            <Link href="/manajer/analitik#target" className="w-fit text-sm font-medium text-accent underline">Ubah target mingguan studio</Link>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={dlg} onOpenChange={(o) => { setDlg(o); if (!o) { setEditing(null); setForm(BLANK); } }}>
        <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
          <DialogHeader className="gap-1 border-b border-line px-6 py-4 pr-14">
            <DialogTitle className="text-lg">{editing ? "Ubah tugas" : "Tambah tugas"}</DialogTitle>
            <DialogDescription>Tugas tidak bisa dihapus. Pilih status Dibatalkan bila tidak jadi dikerjakan, supaya riwayatnya tetap ada.</DialogDescription>
          </DialogHeader>
          <form id="tugas-form" onSubmit={(e) => { e.preventDefault(); submit(); }} className="flex min-h-0 flex-1 flex-col">
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-5">
              <Field label="Tugas" htmlFor="tg-title"><Textarea id="tg-title" rows={2} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
              <Field label="Ditugaskan ke" htmlFor="tg-assign" hint="Kasir/capster melihat tugas ini di layarnya dan bisa mengisi status & catatan">
                <NativeSelect id="tg-assign" value={form.assign} onChange={(e) => {
                  const v = e.target.value;
                  const label = !v ? "Manajer" : v.startsWith("role:") ? ROLE_LABEL[v.slice(5) as "cashier" | "staff"] : data?.team.find((p) => p.id === v)?.full_name ?? form.pic;
                  setForm({ ...form, assign: v, pic: label });
                }}>
                  <option value="">Manajer (tidak didelegasikan)</option>
                  <option value="role:cashier">{ROLE_LABEL.cashier}</option>
                  <option value="role:staff">{ROLE_LABEL.staff}</option>
                  {(data?.team ?? []).map((p) => <option key={p.id} value={p.id}>{p.full_name} · {p.role === "cashier" ? "kasir" : "capster/terapis"}</option>)}
                </NativeSelect>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Penanggung jawab" htmlFor="tg-pic"><Input id="tg-pic" value={form.pic} onChange={(e) => setForm({ ...form, pic: e.target.value })} /></Field>
                <Field label="Tenggat" htmlFor="tg-due"><DateInput id="tg-due" value={form.due} onChange={(e) => e.target.value && setForm({ ...form, due: e.target.value })} /></Field>
              </div>
              <Field label="Berhasil bila" htmlFor="tg-measure" hint="Ukuran yang bisa dicek, mis. ≥5 pelanggan kembali minggu ini">
                <Input id="tg-measure" value={form.measure} onChange={(e) => setForm({ ...form, measure: e.target.value })} />
              </Field>
              <label className="flex min-h-11 items-center gap-3 text-sm"><Checkbox checked={form.grows} onCheckedChange={(v) => setForm({ ...form, grows: v === true })} /> Tugas ini langsung menambah pelanggan</label>
            </div>
            <div className="flex items-center gap-2 border-t border-line bg-paper px-6 py-4">
              <Button disabled={!online}>{editing ? "Simpan perubahan" : "Tambah tugas"}</Button>
              <Button type="button" variant="ghost" onClick={() => setDlg(false)}>Batal</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Target layanan per staf per minggu (staff.target_cuts_weekly). Kosong = target studio dibagi capster barbershop aktif; terapis tanpa target. */
function StaffTargets({ staff, studio, onSaved }: { staff: StaffRow[]; studio: number; onSaved: () => void }) {
  const toast = useToast();
  const barbers = staff.filter((s) => s.category === "barbershop").length || 1;
  async function save(s: StaffRow, raw: string) {
    const v = raw.trim() === "" ? null : Number(raw);
    if (v === s.target_cuts_weekly) return;
    if (v !== null && (!Number.isInteger(v) || v < 0 || v > 500)) return toast("Target 0–500 layanan", "error");
    const { error } = await createClient().from("staff").update({ target_cuts_weekly: v }).eq("id", s.id);
    if (error) return toast(error.message, "error");
    toast(`Target ${s.name} disimpan`); onSaved();
  }
  if (!staff.length) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-semibold">Target pribadi per minggu</span>
      <span className="text-xs text-muted">Terlihat oleh staf itu sendiri di HP-nya. Kosongkan untuk memakai pembagian otomatis.</span>
      <div className="grid grid-cols-2 gap-2 min-[700px]:grid-cols-4">
        {staff.map((s) => (
          <Field key={s.id} label={s.name} htmlFor={`st-t-${s.id}`}>
            <Input id={`st-t-${s.id}`} inputMode="numeric" defaultValue={s.target_cuts_weekly ?? ""}
              placeholder={s.category === "barbershop" ? `otomatis ${Math.ceil(studio / barbers)}` : "tanpa target"}
              onBlur={(e) => save(s, e.target.value)} />
          </Field>
        ))}
      </div>
    </div>
  );
}
