import type * as React from "react"

import { cn } from "@/shared/utils/classNames"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
    return (
        <textarea
            data-slot="textarea"
            className={cn(
                "glass-control placeholder:text-white/45 flex min-h-[80px] w-full px-3 py-2 text-sm outline-none transition-all duration-200 focus:ring-2 focus:ring-[hsl(var(--accent))/35] focus:border-[hsl(var(--accent))/35] disabled:cursor-not-allowed disabled:opacity-50",
                className
            )}
            {...props}
        />
    )
}

export { Textarea }
