"use client";

import { useActionState } from "react";
import { FEATURES } from "@/lib/features";
import { saveHiddenFeatures } from "./actions";
import { Msg } from "./crud-table";

/** Modul yang belum dipakai disembunyikan dari menu & tab (audit 10 Nov); datanya tetap, bisa dinyalakan kapan saja. */
export function FeatureToggles({ hidden }: { hidden: string[] }) {
  const [state, action, pending] = useActionState(saveHiddenFeatures, undefined);
  return (
    <form action={action} className="space-y-3">
      <fieldset className="rounded-2xl border border-line bg-card p-5">
        <legend className="px-1 font-display text-lg font-semibold">Fitur yang ditampilkan</legend>
        <p className="mb-3 text-sm text-muted">Fitur yang tidak dicentang disembunyikan dari menu dan tab. Datanya tidak dihapus.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {FEATURES.map(([k, label]) => (
            <label key={k} className="flex min-h-11 items-center gap-3 text-sm">
              <input type="checkbox" name="show" value={k} defaultChecked={!hidden.includes(k)} className="size-5" />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex items-center gap-3">
        <button disabled={pending} className="btn-primary">Simpan fitur</button>
        <Msg s={state} />
      </div>
    </form>
  );
}
