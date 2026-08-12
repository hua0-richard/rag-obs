import { cn } from "@/shared/utils/classNames";

type BrandMarkProps = {
  className?: string;
  size?: "sm" | "md";
  showWordmark?: boolean;
};

export function BrandMark({ className, size = "sm", showWordmark = true }: BrandMarkProps) {
  const logoSize = size === "md" ? "h-8 w-8" : "h-6 w-6";

  return (
    <span className={cn("inline-flex items-center gap-2 min-w-0", className)}>
      <img
        src="/obsidian-logo.png"
        alt=""
        aria-hidden
        className={cn(logoSize, "object-contain shrink-0")}
      />
      {showWordmark ? (
        <span className="brand-mark text-[15px] leading-none text-[var(--fg)] truncate">
          Obsidian
        </span>
      ) : null}
    </span>
  );
}
