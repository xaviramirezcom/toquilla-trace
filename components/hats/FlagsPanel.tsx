"use client";

import { useState } from "react";
import { reviewFlag } from "@/app/(app)/hats/actions";
import { Button, Card, Icon, Input, useToast } from "@/components/ui";
import { log } from "@/lib/log";
import { newRequestId } from "@/lib/request-id";
import { validateReason } from "@/lib/hats/format";
import type { HatFlag } from "@/lib/hats/types";

/** Warn card listing the hat's flags, with "Mark as reviewed" (reason required). Shown only when flags exist. */
export function FlagsPanel({ code, flags, canReview }: { code: string; flags: HatFlag[]; canReview: boolean }) {
  if (flags.length === 0) return null;
  return (
    <Card padding="lg" className="border-warn/40 bg-warn-tint">
      <h2 className="flex items-center gap-2 text-[16px] font-semibold text-warn">
        <Icon name="flag" size={20} /> Flags
      </h2>
      <ul className="mt-3 flex flex-col gap-3">
        {flags.map((f) => (
          <FlagItem key={f.id} code={code} flag={f} canReview={canReview} />
        ))}
      </ul>
    </Card>
  );
}

function FlagItem({ code, flag, canReview }: { code: string; flag: HatFlag; canReview: boolean }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [reviewed, setReviewed] = useState<{ by: string; reason: string } | null>(
    flag.reviewed_at ? { by: flag.reviewer_name ?? "someone", reason: flag.review_reason ?? "" } : null,
  );

  async function save() {
    const problem = validateReason(reason);
    if (problem) {
      setError(problem);
      return;
    }
    const request_id = newRequestId();
    const t0 = Date.now();
    setSaving(true);
    const res = await reviewFlag({ code, flagId: flag.id, reason });
    setSaving(false);
    const payload = { ok: res.ok, flag_id: flag.id, kind: flag.kind, reason_length: reason.trim().length };
    if (!res.ok) {
      log.warn("hat.flag.review", { request_id, hat_code: code, duration_ms: Date.now() - t0, message: res.message, payload: { ...payload, error_code: res.code } });
      setError(res.message);
      return;
    }
    log.info("hat.flag.review", { request_id, hat_code: code, duration_ms: Date.now() - t0, payload });
    setReviewed({ by: "you", reason: reason.trim() });
    setEditing(false);
    toast.success("Flag marked as reviewed.");
  }

  return (
    <li className={reviewed ? "text-muted" : "text-ink"}>
      <p className="text-sm">{flag.message}</p>
      <p className="mt-1 flex items-center gap-1 text-xs text-muted">
        <Icon name={flag.raised_by === "assistant" ? "auto_awesome" : "settings"} size={14} />
        Raised by {flag.raised_by === "assistant" ? "Assistant" : "System"}
      </p>
      {reviewed ? (
        <p className="mt-1 text-[13px]">
          Reviewed by {reviewed.by}: &lsquo;{reviewed.reason}&rsquo;
        </p>
      ) : editing ? (
        <div className="mt-2 flex flex-col gap-2">
          <Input
            label="Reason"
            value={reason}
            maxLength={300}
            required
            data-autofocus
            error={error}
            onChange={(e) => {
              setReason(e.target.value);
              setError(null);
            }}
            placeholder="Recounted, it's 28."
          />
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setEditing(false)} disabled={saving}>
              Cancel
            </Button>
            <Button size="sm" onClick={save} loading={saving} loadingLabel="Saving...">
              Save
            </Button>
          </div>
        </div>
      ) : (
        canReview && (
          <Button variant="secondary" size="sm" className="mt-2" icon="task_alt" onClick={() => setEditing(true)}>
            Mark as reviewed
          </Button>
        )
      )}
    </li>
  );
}
