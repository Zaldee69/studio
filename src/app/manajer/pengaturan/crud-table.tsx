"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import { Label } from "@/components/ui/label";
import { useActionState, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatRupiah } from "@/lib/domain/format";
import { useConfirm } from "@/components/alert-dialog";
import { deleteRow, resetPassword, saveRow, saveSettings, type SaveState } from "./actions";
import { Icon } from "@/components/icons";
import { LIST_VIEWS, TABLES, type Field, type ListView, type TableName } from "./tables";

type Row = Record<string, unknown>;
export type Options = Record<string, [string, string][]>;

/** Nominal dengan pemisah ribuan saat mengetik; yang dikirim ke server tetap angka polos (isian tersembunyi). */
function MoneyInput({ id, name, label, value, disabled, className }: { id: string; name: string; label: string; value: unknown; disabled?: boolean; className?: string }) {
  const [raw, setRaw] = useState(value == null || value === "" ? "" : String(Math.round(Number(value))));
  return (
    <>
      <input type="hidden" name={name} value={raw} disabled={disabled} />
      <Input id={id} type="text" inputMode="numeric" autoComplete="off" aria-label={label} disabled={disabled} className={className}
        value={raw ? Number(raw).toLocaleString("id-ID") : ""} onChange={(e) => setRaw(e.target.value.replace(/\D/g, "").slice(0, 12))} />
    </>
  );
}

function FieldInput({ f, value, options, id, className }: { f: Field; value: unknown; options: Options; id: string; className?: string }) {
  const common = { id, name: f.name, "aria-label": f.label, disabled: f.readonly };
  if (f.type === "money") return <MoneyInput id={id} name={f.name} label={f.label} value={value} disabled={f.readonly} className={className} />;
  if (f.type === "bool")
    return <Checkbox {...common} defaultChecked={Boolean(value)} className="size-5" />;
  if (f.type === "select") {
    const opts = Array.isArray(f.options) ? f.options : options[f.options ?? ""] ?? [];
    return (
      <NativeSelect {...common} defaultValue={String(value ?? "")} >
        <option value="">{f.nullable ? "—" : "Pilih…"}</option>
        {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </NativeSelect>
    );
  }
  if (f.type === "textarea")
    return <Textarea {...common} defaultValue={String(value ?? "")} rows={3} className="py-2" />;
  return (
    <Input {...common} defaultValue={value == null ? "" : String(value)}
      type={f.type === "time" || f.type === "date" || f.type === "text" ? f.type : "number"}
      step={1} inputMode={f.type === "text" || f.type === "time" || f.type === "date" ? undefined : "numeric"}
      className={className} />
  );
}

export function Msg({ s }: { s: SaveState }) {
  if (!s) return null;
  return <p role={s.error ? "alert" : "status"} className={`text-xs ${s.error ? "text-danger" : "text-green-700"}`}>{s.error ?? s.ok}</p>;
}

function RowForm({ table, row, options }: { table: TableName; row: Row; options: Options }) {
  const def = TABLES[table];
  const id = row.id as string | undefined;
  const [state, action, pending] = useActionState(saveRow.bind(null, table), undefined);
  const [delState, delAction, deleting] = useActionState(deleteRow.bind(null, table, id ?? ""), undefined);
  const confirm = useConfirm();
  const cols = def.fields.map((f) => f.w ?? "10rem").join(" ") + " auto";
  return (
    <form action={action} className="grid items-center gap-2 border-b border-line px-3 py-2 last:border-0"
      style={{ gridTemplateColumns: cols }}>
      {id && <input type="hidden" name="id" value={id} />}
      {def.fields.map((f) => <FieldInput key={f.name} f={f} value={row[f.name]} options={options} id={`${table}-${id ?? "new"}-${f.name}`} />)}
      <div className="flex items-center gap-1">
        <Button disabled={pending} variant={id ? "outline" : "brand"}>{id ? "Simpan" : "Tambah"}</Button>
        {id && def.remove && (
          <Button formAction={delAction} disabled={deleting} variant="destructive" 
            onClick={async (e) => {
              e.preventDefault();
              const btn = e.currentTarget; // requestSubmit tidak memicu onClick lagi → tak perlu penanda "sudah dikonfirmasi"
              if (await confirm({ title: "Hapus baris ini?", description: "Data yang dihapus tidak bisa dikembalikan.", confirmLabel: "Hapus", tone: "danger" })) btn.form?.requestSubmit(btn);
            }}>Hapus</Button>
        )}
        <Msg s={delState ?? state} />
      </div>
    </form>
  );
}

export function CrudTable({ table, rows, options = {} }: { table: TableName; rows: Row[]; options?: Options }) {
  if (LIST_VIEWS[table]) return <CrudList table={table} rows={rows} options={options} />;
  const def = TABLES[table];
  const cols = def.fields.map((f) => f.w ?? "10rem").join(" ") + " auto";
  return (
    <div className="overflow-x-auto rounded-3xl border border-line bg-card">
      <div className="min-w-max">
        <div className="grid gap-2 border-b border-line bg-paper px-3 py-2 text-xs font-medium text-muted" style={{ gridTemplateColumns: cols }}>
          {def.fields.map((f) => <span key={f.name}>{f.label}</span>)}<span />
        </div>
        {def.create && <RowForm table={table} row={{ active: true }} options={options} />}
        {rows.map((r) => <RowForm key={String(r.id)} table={table} row={r} options={options} />)}
      </div>
    </div>
  );
}

/** Pisahkan label jadi judul + petunjuk + satuan: "Paling cepat (menit dari sekarang)" → judul, petunjuk; "Jeda (menit)" → satuan di dalam isian. */
const UNITS = /^(Rp|%|menit|mnt|jam|hari|minggu|bulan|detik|kali|orang|kg|gram|ml|cm|poin)$/i;
function splitLabel(label: string) {
  let title = label, hint: string | undefined, unit: string | undefined;
  const dash = title.indexOf(" — ");
  if (dash > 0) { hint = title.slice(dash + 3); title = title.slice(0, dash); }
  const m = title.match(/ \(([^()]*)\)\s*$/);
  if (m) {
    if (UNITS.test(m[1])) unit = m[1]; else hint = [m[1], hint].filter(Boolean).join(". ");
    title = title.slice(0, m.index);
  }
  return { title, hint, unit };
}

export function SettingsForm({ values, groups, save = saveSettings, submit = "Simpan pengaturan" }: {
  values: Row; groups: { title: string; fields: Field[] }[]; save?: typeof saveSettings; submit?: string;
}) {
  const [state, action, pending] = useActionState(save, undefined);
  return (
    <form action={action} className="space-y-4">
      {groups.map((g, gi) => (
        <details key={g.title} open={groups.length <= 2 || gi === 0} className="group overflow-hidden rounded-3xl border border-line bg-card">
          <summary className="flex cursor-pointer list-none items-center justify-between px-6 py-4 font-display text-lg font-semibold marker:hidden [&::-webkit-details-marker]:hidden group-open:border-b group-open:border-line">
            {g.title}
            <span className="flex items-center gap-2 text-sm font-normal text-muted">{g.fields.length} isian<Icon name="chevron" className="size-5 transition-transform group-open:rotate-180" /></span>
          </summary>
          <input type="hidden" name="_g" value={g.title} />
          {g.fields.map((f) => {
            const { title, hint, unit } = splitLabel(f.label);
            const prefix = f.type === "money" ? "Rp" : undefined;
            const suffix = prefix || !unit ? undefined : unit;
            const wide = f.type === "textarea" || f.type === "text";
            return (
              <div key={f.name} className={`grid gap-2 border-b border-line px-6 py-4 last:border-0 ${f.type === "textarea" ? "" : "md:grid-cols-[260px_minmax(0,1fr)] md:items-center md:gap-6"}`}>
                <div>
                  <Label htmlFor={`set-${f.name}`} className="font-medium">{title}</Label>
                  {hint && <p className="mt-0.5 text-xs font-normal text-muted">{hint}</p>}
                </div>
                <div className={f.type === "textarea" ? "" : wide ? "md:max-w-xl" : f.type === "select" ? "md:max-w-sm" : f.type === "bool" ? "" : "md:max-w-56"}>
                  {prefix || suffix ? (
                    <div className="relative">
                      {prefix && <span aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-muted">{prefix}</span>}
                      <FieldInput f={f} value={values[f.name]} options={{}} id={`set-${f.name}`} className={prefix ? "pl-10" : "pr-20"} />
                      {suffix && <span aria-hidden="true" className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-muted">{suffix}</span>}
                    </div>
                  ) : <FieldInput f={f} value={values[f.name]} options={{}} id={`set-${f.name}`} />}
                </div>
              </div>
            );
          })}
        </details>
      ))}
      <div className="sticky bottom-3 z-10 flex items-center gap-3 rounded-[14px] border border-line bg-card px-4 py-3 shadow-[0_8px_24px_rgba(29,30,32,0.10)]">
        <Button disabled={pending} variant="brand">{submit}</Button>
        <Msg s={state} />
      </div>
    </form>
  );
}

export function ResetPasswordForm({ users }: { users: [string, string][] }) {
  const [state, action, pending] = useActionState(resetPassword, undefined);
  return (
    <form action={action} className="flex flex-wrap items-end gap-3 rounded-3xl border border-line bg-card p-5">
      <div className="min-w-56 flex-1">
        <Label htmlFor="rp-user" className="mb-1">Akun</Label>
        <NativeSelect id="rp-user" name="user_id" defaultValue="">
          <option value="" disabled>Pilih akun…</option>
          {users.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </NativeSelect>
      </div>
      <div className="min-w-48 flex-1">
        <Label htmlFor="rp-pass" className="mb-1">Sandi baru (min. 8)</Label>
        <Input id="rp-pass" name="password" type="text" autoComplete="off" />
      </div>
      <Button disabled={pending} variant="brand" >Reset sandi</Button>
      <div className="w-full"><Msg s={state} /></div>
    </form>
  );
}

const fmtCell = (f: Field | undefined, v: unknown, options: Options) => {
  if (v == null || v === "") return "—";
  if (f?.type === "money") return formatRupiah(Number(v));
  if (f?.type === "select") {
    const opts = Array.isArray(f.options) ? f.options : options[f.options ?? ""] ?? [];
    return opts.find(([k]) => k === String(v))?.[1] ?? String(v);
  }
  return f?.name === "duration_min" ? `${v} mnt` : String(v);
};

/** Daftar ringkas (+ dialog Ubah/Tambah berisi semua isian) menggantikan tabel selebar banyak kolom. */
export function CrudList({ table, rows, options = {} }: { table: TableName; rows: Row[]; options?: Options }) {
  const def = TABLES[table];
  const view = LIST_VIEWS[table]!;
  const field = (n: string) => (def.fields as readonly Field[]).find((f) => f.name === n);
  const groupField = view.group ? field(view.group) : undefined;
  const groupOpts = (Array.isArray(groupField?.options) ? groupField.options : []) as [string, string][];
  const known = new Set(groupOpts.map(([k]) => k));
  const buckets: [string, string, Row[]][] = !view.group ? [["_", def.label, rows]] : [
    ...groupOpts.map(([k, l]) => [k, l, rows.filter((r) => r[view.group!] === k)] as [string, string, Row[]]),
    ["_lain", "Lainnya", rows.filter((r) => !known.has(String(r[view.group!])))],
  ];
  const cols = view.cols.length ? `minmax(0,1fr) ${view.cols.map(() => "9rem").join(" ")} auto` : "minmax(0,1fr) auto";
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">{rows.length ? `${rows.length} ${view.noun}. Pilih "Ubah" untuk melihat semua isian.` : ""}</p>
        {def.create && <EditDialog table={table} row={{ active: true }} options={options} view={view} label={`Tambah ${view.noun}`} primary />}
      </div>
      {rows.length === 0 && <p className="rounded-3xl border border-dashed border-line bg-card px-6 py-8 text-center text-sm text-muted">Belum ada {view.noun}.{def.create ? ` Tekan "Tambah ${view.noun}" untuk membuat yang pertama.` : ""}</p>}
      {buckets.filter(([, , list]) => list.length).map(([key, label, list]) => (
        <section key={key} className="overflow-hidden rounded-3xl border border-line bg-card">
          <div className="grid items-center gap-x-4 border-b border-line px-6 py-3" style={{ gridTemplateColumns: cols }}>
            <h3 className="font-display text-base font-semibold">{label} <span className="font-normal text-muted">· {list.length}</span></h3>
            {view.cols.map((c) => <span key={c} className="hidden text-xs text-muted sm:block">{field(c)?.label.replace(/ \(.*$/, "")}</span>)}
            <span className="hidden sm:block sm:w-16" />
          </div>
          <ul>
            {list.map((r) => (
              <li key={String(r.id)} className={`grid items-center gap-x-4 gap-y-1 border-b border-line px-6 py-3 last:border-0 ${r.active === false ? "opacity-60" : ""}`} style={{ gridTemplateColumns: cols }}>
                <div className="min-w-0">
                  <b className="block truncate">{String(r[view.title] ?? "—")}</b>
                  <span className="flex flex-wrap gap-1.5 pt-0.5 text-xs">
                    {r.active === false && <span className="rounded-full bg-paper px-2 py-0.5 font-medium text-muted">Nonaktif</span>}
                    {(view.chips ?? []).filter((c) => r[c] === true).map((c) => <span key={c} className="rounded-full bg-accent-soft px-2 py-0.5 font-medium text-accent">{field(c)?.label}</span>)}
                    {table === "services" && r.next_price != null && <span className="rounded-full bg-st-booked px-2 py-0.5 font-medium text-[#5A4300]">Harga baru {formatRupiah(Number(r.next_price))}</span>}
                  </span>
                </div>
                {view.cols.map((c) => <span key={c} className={`tabular hidden truncate text-sm sm:block ${field(c)?.type === "money" || c === "price" ? "font-semibold" : "text-muted"}`}>{fmtCell(field(c), r[c], options)}</span>)}
                <EditDialog table={table} row={r} options={options} view={view} label="Ubah" />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function EditDialog({ table, row, options, view, label, primary }: { table: TableName; row: Row; options: Options; view: ListView; label: string; primary?: boolean }) {
  const def = TABLES[table];
  const id = row.id as string | undefined;
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(async (p: SaveState, fd: FormData) => { const r = await saveRow(table, p, fd); if (r?.ok) setOpen(false); return r; }, undefined);
  const [delState, delAction, deleting] = useActionState(async () => { const r = await deleteRow(table, id ?? ""); if (r?.ok) setOpen(false); return r; }, undefined);
  const confirm = useConfirm();
  const byName = new Map((def.fields as readonly Field[]).map((f) => [f.name, f]));
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)} variant={primary ? "brand" : "outline"} size={primary ? "default" : "sm"}>{label}</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
          <DialogHeader className="gap-1 border-b border-line px-6 py-4 pr-14">
            <DialogTitle className="text-lg">{id ? `Ubah ${String(row[view.title] ?? "")}` : label}</DialogTitle>
            <DialogDescription>Perubahan berlaku setelah Anda menekan Simpan.</DialogDescription>
          </DialogHeader>
          <form action={action} className="flex min-h-0 flex-1 flex-col">
            {id && <input type="hidden" name="id" value={id} />}
            <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 py-5 [scrollbar-width:thin]">
            {view.sections.map((sec) => (
              <fieldset key={sec.title} className="flex flex-col gap-3">
                <legend className="mb-1 text-sm font-semibold">{sec.title}</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  {sec.fields.map((n) => {
                    const f = byName.get(n);
                    if (!f) return null;
                    const fid = `${table}-${id ?? "new"}-${f.name}`;
                    return f.type === "bool" ? (
                      <label key={n} htmlFor={fid} className="flex min-h-11 items-center gap-3 text-sm">
                        <FieldInput f={f} value={row[f.name]} options={options} id={fid} />{f.label}
                      </label>
                    ) : (
                      <div key={n} className={f.name === "public_description" ? "sm:col-span-2" : ""}>
                        <Label htmlFor={fid} className="mb-1">{f.label}</Label>
                        <FieldInput f={f} value={row[f.name]} options={options} id={fid} />
                      </div>
                    );
                  })}
                </div>
              </fieldset>
            ))}
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-line bg-paper px-6 py-4">
              <Button disabled={pending} variant="brand">{id ? "Simpan" : "Tambah"}</Button>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Batal</Button>
              {id && def.remove && (
                <Button formAction={delAction} disabled={deleting} variant="destructive" className="ml-auto"
                  onClick={async (e) => {
                    e.preventDefault();
                    const btn = e.currentTarget;
                    if (await confirm({ title: "Hapus baris ini?", description: "Data yang dihapus tidak bisa dikembalikan.", confirmLabel: "Hapus", tone: "danger" })) btn.form?.requestSubmit(btn);
                  }}>Hapus</Button>
              )}
              <Msg s={delState ?? state} />
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
