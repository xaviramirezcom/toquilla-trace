"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { GRADES, QUANTITY_MAX, QUANTITY_MIN, ROWS_MAX, ROWS_MIN, STAGES, type Grade } from "@domain/domain";
import { cn } from "@/lib/cn";
import { loadWeavers, type WeaverOption } from "@/lib/workshop/api";
import { checkDraft, effectivePayload, type Card, type Edits } from "@/lib/workshop/proposals";

const selectCls =
  "h-11 w-full appearance-none rounded-[10px] border border-line bg-surface pr-10 pl-3 text-ink outline-none focus:border-accent focus:ring-[3px] focus:ring-accent-tint";

export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly T[];
  value: T | null;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13px] font-semibold text-ink">{label}</span>
      <div role="radiogroup" aria-label={label} className="grid grid-flow-col gap-1 rounded-[10px] bg-surface2 p-1">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            role="radio"
            aria-checked={value === o}
            onClick={() => onChange(o)}
            className={cn(
              "h-9 rounded-[8px] px-2 text-[13px] font-medium",
              value === o ? "bg-surface text-ink shadow-card" : "text-muted hover:text-ink",
            )}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Per-type edit form (spec 04 state 2). Validation comes from domain.ts through checkDraft. */
export function ProposalEditForm({
  card,
  workshopId,
  onSave,
  onCancel,
}: {
  card: Card;
  workshopId: string | null;
  onSave: (draft: Edits) => void;
  onCancel: () => void;
}) {
  const p = effectivePayload(card);
  const type = card.row.type;
  const [quantity, setQuantity] = useState<number>(Number(p.quantity ?? 1));
  const [grade, setGrade] = useState<Grade | null>((GRADES as readonly string[]).includes(String(p.grade)) ? (p.grade as Grade) : null);
  const [rows, setRows] = useState<string>(p.rows_per_inch == null ? "" : String(p.rows_per_inch));
  const [weaverId, setWeaverId] = useState<string>(typeof p.weaver_id === "string" ? p.weaver_id : "");
  const [toStage, setToStage] = useState<number>(Number(p.to_stage ?? Number(p.from_stage ?? 0) + 1));
  const [message, setMessage] = useState<string>(typeof p.message === "string" ? p.message : "");
  const [weavers, setWeavers] = useState<WeaverOption[] | null>(null);
  const [weaversFailed, setWeaversFailed] = useState(false);

  useEffect(() => {
    if (type !== "create_hat") return;
    let cancelled = false;
    void loadWeavers(workshopId).then((w) => {
      if (cancelled) return;
      setWeavers(w ?? []);
      setWeaversFailed(w === null);
    });
    return () => {
      cancelled = true;
    };
  }, [type, workshopId]);

  const values =
    type === "create_hat"
      ? { quantity, grade, rows_per_inch: rows === "" ? NaN : Number(rows), weaver_id: weaverId || null }
      : type === "advance_stage"
        ? { from_stage: p.from_stage, to_stage: toStage }
        : { message };
  const check = checkDraft(type, values);

  function save() {
    if (!check.ok) return;
    if (type === "create_hat") onSave({ quantity, grade, rows_per_inch: Number(rows), weaver_id: weaverId });
    else if (type === "advance_stage") onSave({ to_stage: toStage });
    else onSave({ message: message.trim() });
  }

  const from = Number(p.from_stage ?? 0);

  return (
    <div className="flex flex-col gap-4">
      {type === "create_hat" && (
        <>
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-ink" id={`qty-${card.row.id}`}>
              Quantity
            </span>
            <div className="flex items-center gap-2" role="group" aria-labelledby={`qty-${card.row.id}`}>
              <Button
                variant="secondary"
                size="icon"
                icon="remove"
                aria-label="Fewer"
                disabled={quantity <= QUANTITY_MIN}
                onClick={() => setQuantity((q) => Math.max(QUANTITY_MIN, q - 1))}
              />
              <span className="w-10 text-center font-mono text-[16px]" aria-live="polite">
                {quantity}
              </span>
              <Button
                variant="secondary"
                size="icon"
                icon="add"
                aria-label="More"
                disabled={quantity >= QUANTITY_MAX}
                onClick={() => setQuantity((q) => Math.min(QUANTITY_MAX, q + 1))}
              />
            </div>
            {check.errors.quantity && <p className="text-[12px] text-err">{check.errors.quantity}</p>}
          </div>
          <Segmented label="Grade" options={GRADES} value={grade} onChange={setGrade} />
          <div className="flex flex-col gap-1.5">
            <Input
              label="Rows per inch"
              type="number"
              inputMode="numeric"
              min={ROWS_MIN}
              max={ROWS_MAX}
              value={rows}
              onChange={(e) => setRows(e.target.value)}
              error={check.errors.rows_per_inch}
            />
            {check.mismatch && (
              <div className="flex flex-wrap items-center gap-2 rounded-[10px] bg-warn-tint px-3 py-2 text-[13px] text-ink">
                <Icon name="warning" size={18} className="text-warn" />
                {check.mismatch.message}
                {check.mismatch.grade && (
                  <Button size="sm" variant="secondary" onClick={() => setGrade(check.mismatch?.grade ?? null)}>
                    Use {check.mismatch.grade}
                  </Button>
                )}
              </div>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`weaver-${card.row.id}`} className="text-[13px] font-semibold text-ink">
              Weaver
            </label>
            <div className="relative">
              <select
                id={`weaver-${card.row.id}`}
                className={selectCls}
                value={weaverId}
                onChange={(e) => setWeaverId(e.target.value)}
                aria-invalid={check.errors.weaver_id ? true : undefined}
              >
                <option value="">{weavers === null ? "Loading weavers..." : weaversFailed ? "Couldn't load weavers" : "Pick a weaver"}</option>
                {(weavers ?? []).map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.village ? `${w.name} (${w.village})` : w.name}
                  </option>
                ))}
              </select>
              <Icon name="expand_more" size={20} className="pointer-events-none absolute top-3 right-3 text-muted" />
            </div>
            {weaversFailed && <p role="alert" className="text-[12px] text-err">Couldn&apos;t load weavers. Cancel and try again.</p>}
            <Link href="/weavers" className="text-[13px] font-medium text-accent hover:underline">
              + Add new weaver
            </Link>
          </div>
        </>
      )}

      {type === "advance_stage" && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`stage-${card.row.id}`} className="text-[13px] font-semibold text-ink">
            Stage
          </label>
          <div className="relative">
            <select
              id={`stage-${card.row.id}`}
              className={selectCls}
              value={toStage}
              onChange={(e) => setToStage(Number(e.target.value))}
            >
              {STAGES.map((s, i) => (
                <option key={s} value={i} disabled={i !== from + 1}>
                  {s}
                  {i === from ? " (current)" : ""}
                </option>
              ))}
            </select>
            <Icon name="expand_more" size={20} className="pointer-events-none absolute top-3 right-3 text-muted" />
          </div>
          <p className="text-[12px] text-muted">Stages move forward one step at a time.</p>
          {check.errors.to_stage && <p className="text-[12px] text-err">{check.errors.to_stage}</p>}
        </div>
      )}

      {type === "flag_issue" && (
        <Textarea
          label="Message"
          rows={3}
          maxLength={200}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          error={check.errors.message}
          hint={`${message.length} / 200`}
        />
      )}

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={save} disabled={!check.ok}>
          Save changes
        </Button>
      </div>
    </div>
  );
}
