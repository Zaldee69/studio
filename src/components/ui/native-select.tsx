"use client"

import * as React from "react"
import { cn } from "cn"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select"

// Tampilan shadcn Select (daftar pilihan mengikuti tema), tetapi API-nya tetap <NativeSelect>…<option>…</NativeSelect>
// agar 60+ pemakaian tidak perlu diubah. Catatan penyesuaian terhadap <select> asli:
//  - Radix melarang nilai "" → dipetakan ke penanda internal, dan ke luar tetap "".
//  - Form server-action membaca FormData → nilai dikirim lewat <input type="hidden" name>, bukan lewat Radix.
//  - onChange dipanggil dengan objek mirip event ({ target: { value, name } }); semua pemanggil hanya memakai e.target.value.
//  - Tes e2e memakai pilih() di e2e/helpers.ts (selectOption tidak bisa dipakai pada Radix).
const EMPTY = "__kosong__"

type Opt = { value: string; label: React.ReactNode; disabled?: boolean }
const textOf = (n: React.ReactNode): string => (typeof n === "string" || typeof n === "number" ? String(n) : Array.isArray(n) ? n.map(textOf).join("") : "")

function collect(children: React.ReactNode): Opt[] {
  const out: Opt[] = []
  React.Children.forEach(children, (c) => {
    if (!React.isValidElement(c)) return
    const el = c as React.ReactElement<{ value?: string | number; children?: React.ReactNode; disabled?: boolean }>
    if (el.type === React.Fragment || el.type === "optgroup") out.push(...collect(el.props.children))
    else if (el.type === "option") out.push({ value: String(el.props.value ?? textOf(el.props.children)), label: el.props.children, disabled: el.props.disabled })
  })
  return out
}

type NativeSelectProps = Omit<React.ComponentProps<"select">, "size"> & {
  size?: "sm" | "default"
}

function NativeSelect({ className, size = "default", children, value, defaultValue, onChange, name, id, disabled, ...rest }: NativeSelectProps) {
  const opts = collect(children)
  const [inner, setInner] = React.useState(String(defaultValue ?? ""))
  const cur = value !== undefined ? String(value) : inner
  const aria = Object.fromEntries(Object.entries(rest).filter(([k]) => k.startsWith("aria-")))
  const set = (v: string) => {
    const real = v === EMPTY ? "" : v
    if (value === undefined) setInner(real)
    const t = { value: real, name: name ?? "" }
    onChange?.({ target: t, currentTarget: t } as unknown as React.ChangeEvent<HTMLSelectElement>)
  }
  return (
    <>
      {name && <input type="hidden" name={name} value={cur} disabled={disabled} />}
      <Select value={cur === "" ? EMPTY : cur} onValueChange={set} disabled={disabled}>
        <SelectTrigger id={id} size={size} data-slot="native-select" className={cn("min-h-11 w-full min-w-0 text-left field-text", className)} {...aria}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper" sideOffset={6} className="max-h-72">
          {opts.map((o) => (
            <SelectItem key={o.value} value={o.value === "" ? EMPTY : o.value} disabled={o.disabled} data-v={o.value} className="min-h-10 field-text">{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  )
}

function NativeSelectOption({ className, ...props }: React.ComponentProps<"option">) {
  return <option data-slot="native-select-option" className={className} {...props} />
}

function NativeSelectOptGroup({ className, ...props }: React.ComponentProps<"optgroup">) {
  return <optgroup data-slot="native-select-optgroup" className={className} {...props} />
}

export { NativeSelect, NativeSelectOptGroup, NativeSelectOption }
