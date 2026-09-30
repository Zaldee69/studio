"use client";

import { useActionState } from "react";
import type { FormState } from "@/lib/auth-actions";

export type AuthField = { name: string; label: string; type?: string; autoComplete?: string; options?: [string, string][] };

/** Form kecil untuk server action auth: field + pesan error + tombol. */
export function AuthForm({ action, fields, submit }: {
  action: (s: FormState, fd: FormData) => Promise<FormState>;
  fields: AuthField[];
  submit: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const input = "input";
  return (
    <form key={state?.at} action={formAction} className="space-y-4">
      {fields.map((f) => (
        <div key={f.name}>
          <label htmlFor={f.name} className="label">{f.label}</label>
          {f.options ? (
            <select id={f.name} name={f.name} className={input} defaultValue={state?.values?.[f.name] ?? ""}>
              <option value="" disabled>Pilih…</option>
              {f.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          ) : (
            <input id={f.name} name={f.name} type={f.type ?? "text"} autoComplete={f.autoComplete} className={input} required
              defaultValue={state?.values?.[f.name]} />
          )}
        </div>
      ))}
      {state?.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? "Memproses…" : submit}
      </button>
    </form>
  );
}
