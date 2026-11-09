import * as React from "react"
import { cn } from "cn"

type NativeSelectProps = Omit<React.ComponentProps<"select">, "size"> & {
  size?: "sm" | "default"
}

// Satu elemen <select> (tanpa pembungkus) supaya lebar/tata letak yang ada tidak bergeser; className digabung ke select.
// Chevron dari aturan global `select` di globals.css (satu gaya untuk semua dropdown).
function NativeSelect({ className, size = "default", ...props }: NativeSelectProps) {
  return (
    <select
      data-slot="native-select"
      data-size={size}
      className={cn(
        "min-h-11 w-full min-w-0 appearance-none rounded-[10px] border border-input bg-card py-2 pr-10 pl-3 text-base text-ink outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:bg-paper disabled:opacity-60 aria-invalid:border-destructive data-[size=sm]:min-h-10",
        className
      )}
      {...props}
    />
  )
}

function NativeSelectOption({
  className,
  ...props
}: React.ComponentProps<"option">) {
  return (
    <option
      data-slot="native-select-option"
      className={cn("bg-[Canvas] text-[CanvasText]", className)}
      {...props}
    />
  )
}

function NativeSelectOptGroup({
  className,
  ...props
}: React.ComponentProps<"optgroup">) {
  return (
    <optgroup
      data-slot="native-select-optgroup"
      className={cn("bg-[Canvas] text-[CanvasText]", className)}
      {...props}
    />
  )
}

export { NativeSelect, NativeSelectOptGroup, NativeSelectOption }
