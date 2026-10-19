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
}: {
  text: string;
  toastMessage: string;
  label: string;
  className?: string;
  size?: number;
}) {
  const toast = useToast();
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "inline-grid h-8 w-8 place-items-center rounded-[8px] text-muted hover:bg-surface2 hover:text-ink",
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
