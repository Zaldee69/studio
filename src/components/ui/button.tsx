import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Slot } from "radix-ui"

// Disesuaikan dengan tombol aplikasi (btn-ink / btn-ghost / btn-primary / btn-danger): tinggi ≥44px untuk jari di tablet kasir.
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-2 rounded-[14px] border border-transparent bg-clip-padding text-sm font-semibold whitespace-nowrap transition outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-grad-primary bg-accent text-white hover:bg-none hover:bg-accent-hover disabled:bg-none disabled:bg-sage-green",
        brand: "bg-grad-primary bg-accent text-white hover:bg-none hover:bg-accent-hover",
        // hierarki hPanel: default/brand = aksi utama (satu per konteks), outline = aksi pendukung, soft = penekanan ringan, ghost = teks (batal, tautan aksi)
        outline: "border-input bg-card text-ink hover:bg-paper aria-expanded:bg-paper",
        soft: "bg-accent-soft text-accent hover:bg-accent-soft/70",
        ghost: "text-accent hover:bg-accent-soft aria-expanded:bg-accent-soft",
        destructive: "border-danger/25 bg-card text-danger hover:bg-st-completed",
        link: "text-ink underline-offset-4 hover:underline",
        // bekas kelas `btn` polos: warna sepenuhnya dari className (mis. tombol hijau "Setujui")
        plain: "",
      },
      size: {
        default: "min-h-11 px-4",
        sm: "min-h-10 px-3",
        lg: "min-h-12 px-5",
        icon: "size-11",
        "icon-sm": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

/** Gaya tombol untuk elemen lain (Link, <a>, <label>) — kelas tambahan digabung dengan tailwind-merge. */
function buttonClass(variant: VariantProps<typeof buttonVariants>["variant"] = "default", className?: string) {
  return cn(buttonVariants({ variant }), className)
}

export { Button, buttonClass, buttonVariants }
