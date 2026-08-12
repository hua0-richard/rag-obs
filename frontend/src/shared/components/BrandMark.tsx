import { Link } from "react-router-dom";
import { cn } from "@/shared/utils/classNames";

type BrandMarkProps = {
  className?: string;
  size?: "sm" | "md";
  showWordmark?: boolean;
  to?: string;
};

export function BrandMark({
  className,
  size = "sm",
  showWordmark = true,
  to = "/",
}: BrandMarkProps) {
  const logoSize = size === "md" ? "h-8 w-8" : "h-6 w-6";

  const content = (
    <>
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
    </>
  );

  const sharedClass = cn(
    "inline-flex items-center gap-2 min-w-0 rounded-md transition-opacity hover:opacity-80",
    className
  );

  if (to) {
    return (
      <Link to={to} className={sharedClass} aria-label="Obsidian home">
        {content}
      </Link>
    );
  }

  return <span className={sharedClass}>{content}</span>;
}
