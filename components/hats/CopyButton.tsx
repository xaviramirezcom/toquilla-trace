"use client";

import { Icon, useToast } from "@/components/ui";
import { cn } from "@/lib/cn";

/** Small icon button that copies `text` and shows a toast. Stops the click from opening a parent link. */
export function CopyButton({
  text,
  toastMessage,
  label,
  className,
  size = 16,
  boxClass = "h-11 w-11 md:h-8 md:w-8",
}: {
  text: string;
  toastMessage: string;
  label: string;
  className?: string;
  size?: number;
  /** Button box size: 44px on touch screens (handoff minimum), compact on desktop. */
  boxClass?: string;
}) {
  const toast = useToast();
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "inline-grid place-items-center rounded-[8px] text-muted hover:bg-surface2 hover:text-ink",
        boxClass,
        "focus-visible:outline-2 focus-visible:outline-accent",
        className,
      )}
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(text);
          toast.success(toastMessage);
        } catch {
          toast.error("Couldn't copy. Select the text and copy it by hand.");
        }
      }}
    >
      <Icon name="content_copy" size={size} />
    </button>
  );
}
