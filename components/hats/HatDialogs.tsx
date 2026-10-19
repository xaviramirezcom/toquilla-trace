"use client";

import { useState } from "react";
import { STAGES } from "@domain/domain";
import { Button, Dialog, Icon, Input, Textarea } from "@/components/ui";
import { cn } from "@/lib/cn";
import { isValidEmail } from "@/lib/hats/format";

export function AdvanceDialog({
  open,
  code,
  stage,
  loading,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  code: string;
  stage: number;
  loading: boolean;
  onCancel: () => void;
  onConfirm: (note: string) => void;
}) {
  const [note, setNote] = useState("");
  const from = STAGES[stage] ?? "";
  const to = STAGES[stage + 1] ?? "";
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      dismissible={false}
      title={`Move ${code} to ${to}?`}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={() => onConfirm(note)} loading={loading} loadingLabel="Moving..." data-autofocus>
            Move to {to}
          </Button>
        </>
      }
    >
      <p className="flex items-center gap-2 text-sm text-ink" aria-label={`${from} to ${to}`}>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-accent" aria-hidden /> {from}
        </span>
        <Icon name="arrow_forward" size={16} className="text-muted" />
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full border border-accent" aria-hidden /> {to}
        </span>
      </p>
      <p className="mt-3 text-[13px] text-muted">This can&apos;t be undone. Stages only move forward.</p>
      <Textarea
        className="mt-4"
        label="Add a note (optional)"
        value={note}
        maxLength={500}
        rows={3}
        onChange={(e) => setNote(e.target.value)}
      />
    </Dialog>
  );
}

export function TransferDialog({
  open,
  code,
  loading,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  code: string;
  loading: boolean;
  onCancel: () => void;
  onConfirm: (v: { to: "seller" | "buyer"; email: string; message: string }) => void;
}) {
  const [to, setTo] = useState<"seller" | "buyer">("buyer");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    if (!isValidEmail(email)) {
      setError("Enter a valid email.");
      return;
    }
    onConfirm({ to, email, message });
  }

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      dismissible={!loading}
      title={`Transfer ${code}`}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={submit} loading={loading} loadingLabel="Transferring...">
            Transfer
          </Button>
        </>
      }
    >
      <fieldset className="grid grid-cols-2 gap-2">
        <legend className="mb-1.5 text-[13px] font-semibold text-ink">New owner</legend>
        {(["seller", "buyer"] as const).map((v) => (
          <label
            key={v}
            className={cn(
              "flex cursor-pointer items-center gap-2 rounded-[12px] border p-3 text-sm",
              to === v ? "border-accent bg-accent-tint text-ink" : "border-line text-ink",
            )}
          >
            <input type="radio" name="transfer-to" value={v} checked={to === v} onChange={() => setTo(v)} className="accent-[var(--accent)]" />
            {v === "seller" ? "To a seller" : "To a buyer"}
          </label>
        ))}
      </fieldset>
      <Input
        className="mt-4"
        label="Email"
        type="email"
        autoComplete="off"
        value={email}
        error={error}
        data-autofocus
        onChange={(e) => {
          setEmail(e.target.value);
          setError(null);
        }}
      />
      <Textarea className="mt-4" label="Message (optional)" rows={2} maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)} />
      <p className="mt-4 flex items-start gap-2 rounded-[10px] bg-warn-tint p-3 text-[13px] text-warn">
        <Icon name="warning" size={18} />
        You won&apos;t be able to change this hat after transferring it.
      </p>
    </Dialog>
  );
}

export function ArchiveDialog({
  open,
  code,
  loading,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  code: string;
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      dismissible={false}
      title={`Archive ${code}?`}
      description="It will be hidden from lists but its passport stays valid."
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} loading={loading} loadingLabel="Archiving...">
            Archive
          </Button>
        </>
      }
    />
  );
}
