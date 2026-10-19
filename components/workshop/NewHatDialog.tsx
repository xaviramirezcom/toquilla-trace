"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Input, Textarea } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import {
  GRADES,
  ROWS_MAX,
  ROWS_MIN,
  STRAWS,
  gradeFor,
  gradeMismatchMessage,
  validateHatFields,
  type Grade,
  type Straw,
} from "@domain/domain";
import { log } from "@/lib/log";
import { newRequestId } from "@/lib/request-id";
import { tryGetSupabaseBrowserClient } from "@/lib/supabase/client";
import { loadWeavers, type WeaverOption } from "@/lib/workshop/api";
import { Segmented } from "./ProposalEditForm";

function toNumber(s: string): number | null {
  if (s.trim() === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

/** "+ New hat manually" (handoff "Manual create dialog"), calling the create_hat RPC (spec 08 5.4). */
export function NewHatDialog({
  open,
  onClose,
  workshopId,
}: {
  open: boolean;
  onClose: () => void;
  workshopId: string | null;
}) {
  const toast = useToast();
  const router = useRouter();
  const [weavers, setWeavers] = useState<WeaverOption[] | null>(null);
  const [weaversFailed, setWeaversFailed] = useState(false);
  const [weaverId, setWeaverId] = useState("");
  const [grade, setGrade] = useState<Grade>("Fino");
  const [rows, setRows] = useState("");
  const [straw, setStraw] = useState<Straw>("Natural");
  const [size, setSize] = useState("");
  const [price, setPrice] = useState("");
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void loadWeavers(workshopId).then((w) => {
      if (cancelled) return;
      setWeavers(w ?? []);
      setWeaversFailed(w === null);
    });
    return () => {
      cancelled = true;
    };
  }, [open, workshopId]);

  const rowsN = rows.trim() === "" ? NaN : Number(rows);
  const sizeN = toNumber(size);
  const priceN = toNumber(price);
  const errors = validateHatFields({
    rows_per_inch: rowsN,
    grade,
    straw,
    size_cm: sizeN,
    price_usd: priceN,
  });
  if (priceN !== null && !Number.isNaN(priceN) && priceN > 10000) errors.price_usd = "Price must be 10000 or less.";
  if (note.length > 500) errors.note = "Use 500 characters or fewer.";
  if (!weaverId) errors.weaver = "Pick a weaver.";
  const mismatch = !errors.rows_per_inch ? gradeMismatchMessage(grade, rowsN) : null;
  const suggested = !errors.rows_per_inch ? gradeFor(rowsN) : null;
  const valid = Object.keys(errors).length === 0 && !mismatch;

  function reset() {
    setWeaverId("");
    setGrade("Fino");
    setRows("");
    setStraw("Natural");
    setSize("");
    setPrice("");
    setNote("");
    setTouched(false);
    setError(null);
  }

  async function create() {
    setTouched(true);
    if (!valid) return;
    const supabase = tryGetSupabaseBrowserClient();
    if (!supabase) return;
    setSaving(true);
    setError(null);
    const requestId = newRequestId();
    // create_hat generates the code in SQL and retries on a collision (supabase/seed-notes.md).
    const { data, error: rpcError } = await supabase.rpc("create_hat", {
      p_weaver_id: weaverId,
      p_grade: grade,
      p_rows: rowsN,
      p_straw: straw,
      p_size: sizeN,
      p_price: priceN,
      p_note: note.trim() || null,
    });
    setSaving(false);
    const created = (Array.isArray(data) ? data[0] : data) as { id: string; code: string } | null;
    if (rpcError || !created?.code) {
      const msg = rpcError?.message ?? "";
      log.error("ui.error", rpcError ?? null, { request_id: requestId, payload: { where: "workshop.create_hat", code: msg } });
      setError(
        /weaver_not_found/.test(msg)
          ? "That weaver isn't in your workshop."
          : /grade_mismatch/.test(msg)
            ? "The grade doesn't match the rows per inch."
            : "Couldn't create the hat. Try again.",
      );
      return;
    }
    const code = created.code;
    log.info("hat.create", {
      request_id: requestId,
      hat_code: code,
      payload: { code, grade, rows_per_inch: rowsN, weaver_id: weaverId, source: "manual" },
    });
    toast.success(`${code} created.`, { action: { label: "View", onClick: () => router.push(`/hats/${code}`) } });
    reset();
    onClose();
    router.refresh();
  }

  const show = (k: string) => (touched ? errors[k] : undefined);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="wide"
      title="Add a hat manually"
      description="Prefer typing a note? The assistant can do this for you."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void create()} loading={saving} loadingLabel="Creating..." disabled={touched && !valid}>
            Create hat
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error && (
          <p role="alert" className="flex items-center gap-2 rounded-[10px] bg-err-tint px-3 py-2 text-[13px] text-ink">
            <Icon name="error" size={18} className="text-err" />
            {error}
          </p>
        )}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="newhat-weaver" className="text-[13px] font-semibold text-ink">
            Weaver
          </label>
          {weavers !== null && weavers.length === 0 && !weaversFailed ? (
            <p className="text-[13px] text-muted">
              <Link href="/weavers" className="font-semibold text-accent hover:underline">
                Add a weaver first
              </Link>
            </p>
          ) : (
            <div className="relative">
              <select
                id="newhat-weaver"
                data-autofocus
                value={weaverId}
                onChange={(e) => setWeaverId(e.target.value)}
                aria-invalid={show("weaver") ? true : undefined}
                className="h-11 w-full appearance-none rounded-[10px] border border-line bg-surface pr-10 pl-3 text-ink outline-none focus:border-accent focus:ring-[3px] focus:ring-accent-tint"
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
          )}
          {weaversFailed && <p role="alert" className="text-[12px] text-err">Couldn&apos;t load weavers. Close this and try again.</p>}
          {show("weaver") && <p className="text-[12px] text-err">{errors.weaver}</p>}
          <Link href="/weavers" className="text-[13px] font-medium text-accent hover:underline">
            + Add new weaver
          </Link>
        </div>
        <Segmented label="Grade" options={GRADES} value={grade} onChange={setGrade} />
        <div className="flex flex-col gap-1.5">
          <Input
            label="Rows per inch"
            type="number"
            inputMode="numeric"
            min={ROWS_MIN}
            max={ROWS_MAX}
            required
            value={rows}
            onChange={(e) => setRows(e.target.value)}
            error={rows !== "" || touched ? errors.rows_per_inch : undefined}
          />
          {mismatch && (
            <div className="flex flex-wrap items-center gap-2 rounded-[10px] bg-warn-tint px-3 py-2 text-[13px] text-ink">
              <Icon name="warning" size={18} className="text-warn" />
              {mismatch}
              {suggested && (
                <Button size="sm" variant="secondary" onClick={() => setGrade(suggested)}>
                  Use {suggested}
                </Button>
              )}
            </div>
          )}
        </div>
        <Segmented label="Straw color" options={STRAWS} value={straw} onChange={setStraw} />
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Size cm (optional)"
            type="number"
            inputMode="numeric"
            value={size}
            onChange={(e) => setSize(e.target.value)}
            error={size !== "" ? errors.size_cm : undefined}
          />
          <Input
            label="Price USD (optional)"
            type="number"
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            error={price !== "" ? errors.price_usd : undefined}
          />
        </div>
        <Textarea
          label="Notes (optional)"
          rows={2}
          maxLength={500}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          error={errors.note}
        />
      </div>
    </Dialog>
  );
}
