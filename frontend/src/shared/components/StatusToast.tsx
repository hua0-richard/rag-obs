import { X } from "lucide-react";
import { cn } from "@/shared/utils/classNames";

type StatusToastProps = {
  open: boolean;
  isClosing: boolean;
  label: string;
  message: string;
  busy?: boolean;
  progressText?: string | null;
  onClose: () => void;
  onHoverChange?: (hovering: boolean) => void;
  className?: string;
};

export function StatusToast({
  open,
  isClosing,
  label,
  message,
  busy = false,
  progressText = null,
  onClose,
  onHoverChange,
  className,
}: StatusToastProps) {
  if (!open) {
    return null;
  }

  return (
    <div
      className={cn(
        "fixed z-50 w-[min(92vw,300px)] left-1/2 -translate-x-1/2 top-20 sm:left-auto sm:translate-x-0 sm:top-5 sm:right-5",
        className
      )}
      role="status"
      aria-live="polite"
      onMouseEnter={() => onHoverChange?.(true)}
      onMouseLeave={() => onHoverChange?.(false)}
      onFocusCapture={() => onHoverChange?.(true)}
      onBlurCapture={() => onHoverChange?.(false)}
    >
      <div
        className={cn(
          "status-toast relative overflow-hidden px-3.5 py-3 text-left",
          isClosing ? "status-toast-exit" : "status-toast-enter"
        )}
      >
        <div className="flex items-center justify-between">
          <span className="text-label">{label}</span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-0.5 text-[var(--fg-tertiary)] transition hover:text-[var(--fg)]"
            aria-label="Close"
          >
            <X className="size-3.5" />
          </button>
        </div>
        <div className="mt-1.5 text-[14px] leading-5 text-[var(--fg)]">{message}</div>
        {busy ? (
          <div className="status-progress-track mt-2.5">
            <div className="status-progress" />
          </div>
        ) : null}
        {progressText ? (
          <div className="mt-2 text-[12px] leading-4 text-[var(--fg-tertiary)] font-mono">
            {progressText}
          </div>
        ) : null}
      </div>
    </div>
  );
}
