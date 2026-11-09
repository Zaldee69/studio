"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import { Label } from "@/components/ui/label";
import { useActionState } from "react";
import { useConfirm } from "@/components/alert-dialog";
import { deleteRow, resetPassword, saveRow, saveSettings, type SaveState } from "./actions";
import { TABLES, type Field, type TableName } from "./tables";

type Row = Record<string, unknown>;
export type Options = Record<string, [string, string][]>;

function FieldInput({ f, value, options, id }: { f: Field; value: unknown; options: Options; id: string }) {
  const common = { id, name: f.name, "aria-label": f.label, disabled: f.readonly };
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
      step={f.type === "money" ? 100 : 1} inputMode={f.type === "text" || f.type === "time" || f.type === "date" ? undefined : "numeric"}
       />
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
  const def = TABLES[table];
  const cols = def.fields.map((f) => f.w ?? "10rem").join(" ") + " auto";
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-card">
      <div className="min-w-max">
        <div className="grid gap-2 border-b border-line bg-paper px-3 py-2 text-xs font-semibold text-muted" style={{ gridTemplateColumns: cols }}>
          {def.fields.map((f) => <span key={f.name}>{f.label}</span>)}<span />
        </div>
        {def.create && <RowForm table={table} row={{ active: true }} options={options} />}
        {rows.map((r) => <RowForm key={String(r.id)} table={table} row={r} options={options} />)}
      </div>
    </div>
  );
}

export function SettingsForm({ values, groups, save = saveSettings, submit = "Simpan pengaturan" }: {
  values: Row; groups: { title: string; fields: Field[] }[]; save?: typeof saveSettings; submit?: string;
}) {
  const [state, action, pending] = useActionState(save, undefined);
  return (
    <form action={action} className="space-y-6">
      {groups.map((g) => (
        <fieldset key={g.title} className="rounded-2xl border border-line bg-card p-5">
          <legend className="px-1 font-display text-lg font-semibold">{g.title}</legend>
          <input type="hidden" name="_g" value={g.title} />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {g.fields.map((f) => (
              <div key={f.name} className={f.type === "textarea" ? "sm:col-span-2 xl:col-span-3" : ""}>
                <Label htmlFor={`set-${f.name}`} className="mb-1">{f.label}</Label>
                <FieldInput f={f} value={values[f.name]} options={{}} id={`set-${f.name}`} />
              </div>
            ))}
          </div>
        </fieldset>
      ))}
      <div className="flex items-center gap-3">
        <Button disabled={pending} variant="brand" >{submit}</Button>
        <Msg s={state} />
      </div>
    </form>
  );
}

export function ResetPasswordForm({ users }: { users: [string, string][] }) {
  const [state, action, pending] = useActionState(resetPassword, undefined);
  return (
    <form action={action} className="flex flex-wrap items-end gap-3 rounded-2xl border border-line bg-card p-5">
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
