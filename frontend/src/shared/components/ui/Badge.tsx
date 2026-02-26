import type * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/shared/utils/classNames"

const badgeVariants = cva(
    "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
    {
        variants: {
            variant: {
                default:
                    "luminous-badge px-3 py-1 text-white bg-gradient-to-br from-[hsl(var(--accent))/80] to-[hsl(var(--accent))/60]",
                secondary:
                    "luminous-badge bg-white/5 border-white/10 text-white/80 hover:bg-white/10",
                destructive:
                    "luminous-badge bg-red-900/20 border-red-500/30 text-red-300 hover:bg-red-900/30",
                outline: "text-foreground",
            },
        },
        defaultVariants: {
            variant: "default",
        },
    }
)

function Badge({
    className,
    variant,
    ...props
}: React.ComponentProps<"div"> & VariantProps<typeof badgeVariants>) {
    return (
        <div
            data-slot="badge"
            className={cn(badgeVariants({ variant }), className)}
            {...props}
        />
    )
}

export { Badge, badgeVariants }
