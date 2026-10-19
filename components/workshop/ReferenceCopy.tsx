"use client";

import { useToast } from "@/components/ui/Toast";
import { Icon } from "@/components/ui/Icon";

/** Member view of a failure: "Reference: req_8f2a" (first 8 chars), full id copied. */
export function ReferenceCopy({ requestId }: { requestId: string }) {
  const toast = useToast();
  async function copy() {
    try {
      await navigator.clipboard.writeText(requestId);
      toast.success("Reference copied. Share it with support.");
    } catch {
      toast.info(`Reference: ${requestId}`);
    }
  }
  return (
    <button
      type="button"
      onClick={() => void copy()}
      className="inline-flex min-h-11 items-center gap-1.5 rounded-[10px] px-2 text-[13px] text-muted hover:bg-surface2 hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
      aria-label={`Copy reference ${requestId}`}
    >
      Reference: <span className="font-mono">{requestId.slice(0, 8)}</span>
      <Icon name="content_copy" size={16} />
    </button>
  );
}
