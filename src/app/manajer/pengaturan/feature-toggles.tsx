"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useActionState } from "react";
import { FEATURES } from "@/lib/features";
import { saveHiddenFeatures } from "./actions";
import { Msg } from "./crud-table";

/** Modul yang belum dipakai disembunyikan dari menu & tab (audit 10 Nov); datanya tetap, bisa dinyalakan kapan saja. */
export function FeatureToggles({ hidden }: { hidden: string[] }) {
  const [state, action, pending] = useActionState(saveHiddenFeatures, undefined);
  return (
    <form action={action} className="space-y-3">
      <fieldset className="overflow-hidden rounded-3xl border border-line bg-card">
        <legend className="sr-only">Fitur yang ditampilkan</legend>
        <div aria-hidden="true" className="border-b border-line px-6 py-4 font-display text-lg font-semibold">Fitur yang ditampilkan</div>
        <p className="border-b border-line px-6 py-4 text-sm text-muted">Fitur yang tidak dicentang disembunyikan dari menu dan tab. Datanya tidak dihapus.</p>
        <div className="grid gap-1 px-6 py-3 sm:grid-cols-2">
          {FEATURES.map(([k, label]) => (
            <label key={k} className="flex min-h-11 items-center gap-3 text-sm">
              <Checkbox name="show" value={k} defaultChecked={!hidden.includes(k)} className="size-5" />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex items-center gap-3">
        <Button variant="brand" disabled={pending}>Simpan fitur</Button>
        <Msg s={state} />
      </div>
    </form>
  );
}
