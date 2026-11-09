"use client";

import { DateInput } from "@/components/date-input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { RouteTabs, RENCANA_TABS } from "@/components/route-tabs";
import Link from "next/link";
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
  belum: ["Belum mulai", "#EEEEEA", "#55554F"], jalan: ["Sedang berjalan", "#FBF3DE", "#5A4300"],
  selesai: ["Selesai", "#E3F1E8", "#1F7A45"], batal: ["Dibatalkan", "#EEEEEA", "#8A8A84"],
};
const LATE: [string, string, string] = ["Lewat tenggat", "#FBE6E3", "#A12A2A"];
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
    if (editing) { if (await update(editing, row, "Tugas diubah")) { setEditing(null); setForm(BLANK); } return; }
    const { error } = await createClient().from("manager_tasks").insert(row);
    if (error) return toast(error.message, "error");
    toast("Tugas ditambahkan"); setForm(BLANK); refresh();
  }
  function edit(t: Task) {
    setEditing(t.id); setForm({ title: t.title, pic: t.pic, due: t.due, measure: t.measure, grows: t.grows_customers,
      assign: t.assigned_role ? `role:${t.assigned_role}` : t.assigned_to ?? "" });
    document.getElementById("tugas-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const tasks = (data?.tasks ?? []).filter((t) => !onlyGrow || t.grows_customers);
  const live = (data?.tasks ?? []).filter((t) => t.status !== "batal");
  const weeks = [...new Set(tasks.map((t) => monday(t.due)))].sort();
  const p = data?.progress;
  const isThisWeek = p && p.week === monday(today);
  const elapsed = isThisWeek ? (new Date(today + "T00:00:00Z").getUTCDay() + 6) % 7 + 1 : 7;
  const pace = p ? Math.round((p.target.cuts * elapsed) / 7) : 0;

  return (
    <div className="grid gap-4 min-[1100px]:grid-cols-[1fr_360px]">
      <div className="flex min-w-0 flex-col gap-4">
        <h1 className="font-display text-[28px] font-bold tracking-tight">Rencana & Target</h1>
        <RouteTabs tabs={RENCANA_TABS} label="Bagian rencana & target" />

        <section aria-label="Progres minggu" className="flex flex-col gap-3 rounded-[14px] border border-line bg-card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="flex-1 text-base font-bold">{p ? `Minggu ${shortDate(p.week)} – ${shortDate(addDays(p.week, 6))}` : "Progres minggu"}</h2>
            <Button variant="outline" size="sm" onClick={() => setDay(addDays(day, -7))}>← Minggu lalu</Button>
            <Button variant="outline" size="sm" disabled={!!isThisWeek} onClick={() => setDay(addDays(day, 7) > today ? today : addDays(day, 7))}>Minggu berikut →</Button>
          </div>
          {!p ? <Empty>Memuat…</Empty> : (
            <>
              <div className="flex flex-col gap-1.5">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <b className="tabular text-[26px]">{p.cuts}</b><span className="text-sm text-muted">dari target {p.target.cuts} potong</span>
                  {isThisWeek && <span className={`text-sm font-bold ${p.cuts >= pace ? "text-[#1F7A45]" : "text-[#A12A2A]"}`}>
                    {p.cuts >= pace ? "sesuai jalur" : `tertinggal ${pace - p.cuts} dari jalur hari ke-${elapsed} (${pace})`}</span>}
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-[#EEEEEA]" role="progressbar" aria-valuenow={p.cuts} aria-valuemin={0} aria-valuemax={p.target.cuts} aria-label="Potong terhadap target">
                  <div className="h-full rounded-full bg-ink" style={{ width: `${Math.min(100, (p.cuts / Math.max(1, p.target.cuts)) * 100)}%` }} />
                </div>
                <div className="grid grid-cols-7 gap-1 text-center text-xs">
                  {DAYS.map((l, i) => {
                    const d = addDays(p.week, i);
                    return <span key={d} className={`rounded-lg py-1 ${d === today ? "bg-ink text-white" : "bg-[#F5F5F1]"}`}>{l}<br /><b className="tabular">{d > today ? "–" : p.cuts_by_day[d] ?? 0}</b></span>;
                  })}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 min-[700px]:grid-cols-4">
                {[
                  ["Pelanggan kembali", `${p.returning}`, `target ${p.target.returning}`, p.returning >= p.target.returning],
                  ["Pelanggan baru", `${p.new}`, p.target.new ? `target ${p.target.new}` : "tanpa target", p.target.new ? p.new >= p.target.new : null],
                  ["Transaksi ber-WA", p.tx ? `${Math.round((p.tx_with_wa / p.tx) * 100)}%` : "–", `${p.tx_with_wa} dari ${p.tx}`, null],
                  ["Transaksi", `${p.tx}`, "minggu ini", null],
                ].map(([l, v, s, ok]) => (
                  <div key={l as string} className="flex flex-col rounded-[10px] bg-[#F5F5F1] px-3 py-2">
                    <span className="text-xs text-muted">{l}</span>
                    <b className={`tabular text-lg ${ok === true ? "text-[#1F7A45]" : ok === false ? "text-[#A12A2A]" : ""}`}>{v}</b>
                    <span className="text-xs text-muted">{s}</span>
                  </div>
                ))}
              </div>
              <div className="text-sm">
                <span className="text-muted">Pelanggan baru dari: </span>
                {Object.keys(p.new_by_source).length
                  ? Object.entries(p.new_by_source).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${SOURCE_LABEL[k] ?? k} ${n}`).join(" · ")
                  : "belum ada"}
              </div>
              <StaffTargets staff={data?.staff ?? []} studio={p.target.cuts} onSaved={refresh} />
              <Link href="/manajer/analitik#target" className="text-sm font-bold underline">Ubah target mingguan studio</Link>
            </>
          )}
        </section>

        <section aria-label="Daftar tugas" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="flex-1 text-base font-bold">Daftar tugas</h2>
            <span className="text-sm text-muted tabular">
              {live.filter((t) => t.status === "selesai").length}/{live.length} selesai · {live.filter((t) => t.status === "jalan").length} berjalan ·{" "}
              <b className={live.some(late) ? "text-[#A12A2A]" : ""}>{live.filter(late).length} lewat tenggat</b>
            </span>
            <label className="flex h-10 items-center gap-2 text-sm"><Checkbox checked={onlyGrow} onCheckedChange={(v) => setOnlyGrow(v === true)} /> Hanya yang menambah pelanggan</label>
          </div>
          {!data ? <Empty>Memuat…</Empty> : !tasks.length ? <Empty>Belum ada tugas.</Empty> : weeks.map((w) => (
            <div key={w} className="flex flex-col rounded-[14px] border border-line bg-card">
              <h3 className="border-b border-line px-4 py-2.5 text-sm font-bold">Minggu {shortDate(w)} – {shortDate(addDays(w, 6))}</h3>
              {tasks.filter((t) => monday(t.due) === w).map((t) => {
                const [l, bg, fg] = late(t) ? LATE : STATUS[t.status];
                const draft = drafts[t.id] ?? t.note;
                return (
                  <div key={t.id} className={`grid gap-2 border-t border-[#EEEEEA] px-4 py-3 first-of-type:border-t-0 min-[700px]:grid-cols-[84px_1fr_170px] ${late(t) ? "shadow-[inset_3px_0_0_#A12A2A]" : t.status === "selesai" ? "shadow-[inset_3px_0_0_#1F7A45]" : ""}`}>
                    <span className="text-xs font-bold text-muted tabular">{shortDate(t.due)}</span>
                    <div className="flex min-w-0 flex-col gap-0.5">
                      {t.grows_customers && <span className="self-start rounded-full bg-[#F3ECDA] px-2 py-0.5 text-[11px] font-bold text-[#6B5418]">Menambah pelanggan</span>}
                      <b className={`text-sm ${t.status === "batal" ? "line-through text-muted" : ""}`}>{t.title}</b>
                      <span className="text-xs text-muted">Penanggung jawab: {t.pic}</span>
                      {t.measure && <span className="text-xs text-muted">Berhasil bila: {t.measure}</span>}
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <NativeSelect size="sm" aria-label={`Status ${t.title}`} value={t.status} disabled={!online}
                        onChange={(e) => update(t.id, { status: e.target.value }, `Status: ${STATUS[e.target.value][0]}`)}>
                        {Object.entries(STATUS).map(([k, [lab]]) => <option key={k} value={k}>{lab}</option>)}
                      </NativeSelect>
                      <span className="self-start rounded-full px-2.5 py-0.5 text-xs font-bold" style={{ background: bg, color: fg }}>{l}</span>
                    </div>
                    <div className="flex gap-2 min-[700px]:col-start-2 min-[700px]:col-end-4">
                      <Textarea aria-label={`Catatan ${t.title}`} rows={1} className="min-h-10 flex-1 py-2 text-sm" placeholder="Catatan atau bukti pelaksanaan"
                        value={draft} onChange={(e) => setDrafts({ ...drafts, [t.id]: e.target.value })} />
                      <Button variant="outline" size="sm" disabled={!online || draft === t.note} onClick={() => saveNote(t)}>Simpan</Button>
                      <Button variant="outline" size="sm" onClick={() => edit(t)}>Ubah</Button>
                    </div>
                    <span className="text-xs text-muted min-[700px]:col-start-2 min-[700px]:col-end-4">Terakhir diubah {stamp(t.updated_at)} oleh {who(t.updated_by)}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </section>

        <section aria-label="Riwayat perubahan" className="flex flex-col gap-1 rounded-[14px] border border-line bg-card p-4">
          <h2 className="text-base font-bold">Riwayat perubahan</h2>
          {!data?.logs.length ? <span className="text-sm text-muted">Belum ada.</span> : data.logs.map((g) => {
            const title = data.tasks.find((t) => t.id === g.task_id)?.title ?? "tugas";
            const what = g.kind === "status" ? `mengubah status "${title}" dari ${STATUS[g.from_value ?? ""]?.[0] ?? g.from_value} ke ${STATUS[g.to_value ?? ""]?.[0] ?? g.to_value}`
              : g.kind === "catatan" ? `menulis catatan pada "${title}": ${g.to_value || "(dikosongkan)"}`
              : g.kind === "dibuat" ? `membuat tugas "${title}"`
              : `mengubah isi tugas: ${g.to_value}`;
            return <p key={g.id} className="border-t border-[#EEEEEA] pt-1.5 text-[13px] first-of-type:border-t-0"><span className="text-muted tabular">{stamp(g.at)}</span> {who(g.by)} {what}</p>;
          })}
        </section>
      </div>

      <form id="tugas-form" onSubmit={(e) => { e.preventDefault(); submit(); }} className="flex scroll-mt-16 flex-col gap-3 self-start rounded-[14px] border border-line bg-card p-5">
        <h2 className="font-display text-xl font-bold">{editing ? "Ubah tugas" : "Tambah tugas"}</h2>
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
        <div className="grid grid-cols-2 gap-2">
          <Field label="Penanggung jawab" htmlFor="tg-pic"><Input id="tg-pic" value={form.pic} onChange={(e) => setForm({ ...form, pic: e.target.value })} /></Field>
          <Field label="Tenggat" htmlFor="tg-due"><DateInput id="tg-due" value={form.due} onChange={(e) => e.target.value && setForm({ ...form, due: e.target.value })} /></Field>
        </div>
        <Field label="Berhasil bila" htmlFor="tg-measure" hint="Ukuran yang bisa dicek, mis. ≥5 pelanggan kembali minggu ini">
          <Input id="tg-measure" value={form.measure} onChange={(e) => setForm({ ...form, measure: e.target.value })} />
        </Field>
        <label className="flex items-center gap-2 text-sm"><Checkbox checked={form.grows} onCheckedChange={(v) => setForm({ ...form, grows: v === true })} /> Tugas ini langsung menambah pelanggan</label>
        <Button size="lg" disabled={!online}>{editing ? "Simpan perubahan" : "Tambah tugas"}</Button>
        {editing && <Button type="button" variant="outline" onClick={() => { setEditing(null); setForm(BLANK); }}>Batal mengubah</Button>}
        <p className="text-xs text-muted">Tugas tidak bisa dihapus. Pilih status Dibatalkan bila tidak jadi dikerjakan, supaya riwayatnya tetap ada.</p>
      </form>
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
      <span className="text-sm font-bold">Target pribadi per minggu</span>
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
