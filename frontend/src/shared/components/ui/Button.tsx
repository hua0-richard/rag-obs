import type * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/shared/utils/classNames"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors duration-150 disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-hex)]",
  {
    variants: {
      variant: {
        default: "luminous-btn px-3.5",
        destructive:
          "bg-destructive text-destructive-foreground hover:opacity-90 rounded-lg",
        outline:
          "border border-[var(--stroke-secondary)] bg-transparent text-[var(--fg-secondary)] hover:bg-[var(--fill-quaternary)] hover:text-[var(--fg)] rounded-lg",
        secondary:
          "bg-[var(--fill-secondary)] text-[var(--fg)] hover:bg-[var(--fill-primary)] rounded-lg",
        ghost:
          "text-[var(--fg-secondary)] hover:bg-[var(--fill-quaternary)] hover:text-[var(--fg)] rounded-lg",
        link: "text-[var(--accent-hex)] underline-offset-4 hover:underline",
      },
      size: {
        default: "h-8 px-3.5 text-[14px]",
        sm: "h-7 gap-1.5 px-2.5 text-[13px]",
        lg: "h-9 px-4 text-[15px]",
        icon: "size-8",
        "icon-sm": "size-7",
        "icon-lg": "size-9",
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
  const Comp = asChild ? Slot : "button"

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

// eslint-disable-next-line react-refresh/only-export-components
export { Button, buttonVariants }
