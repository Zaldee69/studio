"use client";

import { useActionState } from "react";
import { useConfirm } from "@/components/alert-dialog";
import { deleteRow, resetPassword, saveRow, saveSettings, type SaveState } from "./actions";
import { SETTINGS_GROUPS, TABLES, type Field, type TableName } from "./tables";

type Row = Record<string, unknown>;
export type Options = Record<string, [string, string][]>;

function FieldInput({ f, value, options, id }: { f: Field; value: unknown; options: Options; id: string }) {
  const common = { id, name: f.name, "aria-label": f.label, disabled: f.readonly };
  if (f.type === "bool")
    return <input type="checkbox" {...common} defaultChecked={Boolean(value)} className="size-5 accent-[#5646C8]" />;
  if (f.type === "select") {
    const opts = Array.isArray(f.options) ? f.options : options[f.options ?? ""] ?? [];
    return (
      <select {...common} defaultValue={String(value ?? "")} className="input">
        <option value="">{f.nullable ? "—" : "Pilih…"}</option>
        {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    );
  }
  if (f.type === "textarea")
    return <textarea {...common} defaultValue={String(value ?? "")} rows={3} className="input py-2" />;
  return (
    <input {...common} defaultValue={value == null ? "" : String(value)}
      type={f.type === "time" ? "time" : f.type === "text" ? "text" : "number"}
      step={f.type === "money" ? 100 : 1} inputMode={f.type === "text" || f.type === "time" ? undefined : "numeric"}
      className="input" />
  );
}

function Msg({ s }: { s: SaveState }) {
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
        <button disabled={pending} className={id ? "btn-ghost" : "btn-primary"}>{id ? "Simpan" : "Tambah"}</button>
        {id && def.remove && (
          <button formAction={delAction} disabled={deleting} className="btn-danger"
            onClick={async (e) => {
              e.preventDefault();
              const btn = e.currentTarget; // requestSubmit tidak memicu onClick lagi → tak perlu penanda "sudah dikonfirmasi"
              if (await confirm({ title: "Hapus baris ini?", description: "Data yang dihapus tidak bisa dikembalikan.", confirmLabel: "Hapus", tone: "danger" })) btn.form?.requestSubmit(btn);
            }}>Hapus</button>
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

export function SettingsForm({ values, groups = SETTINGS_GROUPS, save = saveSettings, submit = "Simpan pengaturan" }: {
  values: Row; groups?: typeof SETTINGS_GROUPS; save?: typeof saveSettings; submit?: string;
}) {
  const [state, action, pending] = useActionState(save, undefined);
  return (
    <form action={action} className="space-y-6">
      {groups.map((g) => (
        <fieldset key={g.title} className="rounded-2xl border border-line bg-card p-5">
          <legend className="px-1 font-display text-lg font-semibold">{g.title}</legend>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {g.fields.map((f) => (
              <div key={f.name} className={f.type === "textarea" ? "sm:col-span-2 xl:col-span-3" : ""}>
                <label htmlFor={`set-${f.name}`} className="label">{f.label}</label>
                <FieldInput f={f} value={values[f.name]} options={{}} id={`set-${f.name}`} />
              </div>
            ))}
          </div>
        </fieldset>
      ))}
      <div className="flex items-center gap-3">
        <button disabled={pending} className="btn-primary">{submit}</button>
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
        <label htmlFor="rp-user" className="label">Akun</label>
        <select id="rp-user" name="user_id" className="input" defaultValue="">
          <option value="" disabled>Pilih akun…</option>
          {users.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      <div className="min-w-48 flex-1">
        <label htmlFor="rp-pass" className="label">Sandi baru (min. 8)</label>
        <input id="rp-pass" name="password" type="text" autoComplete="off" className="input" />
      </div>
      <button disabled={pending} className="btn-primary">Reset sandi</button>
      <div className="w-full"><Msg s={state} /></div>
    </form>
  );
}
