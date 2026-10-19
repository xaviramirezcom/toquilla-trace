"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { GRADES } from "@domain/domain";
import { saveWeaver } from "@/app/(app)/weavers/actions";
import { Badge, Button, Card, Dialog, EmptyState, Icon, Input, Textarea, useToast } from "@/components/ui";
import { cn } from "@/lib/cn";
import { log } from "@/lib/log";
import { newRequestId } from "@/lib/request-id";
import { PROVINCES, initials, passportLine, type WeaverInput } from "@/lib/hats/format";
import type { WeaverRow } from "@/lib/hats/types";

export function WeaversView({ weavers, canEdit }: { weavers: WeaverRow[]; canEdit: boolean }) {
  const [editing, setEditing] = useState<WeaverRow | "new" | null>(null);
  const count = `${weavers.length} ${weavers.length === 1 ? "weaver" : "weavers"}`;

  return (
    <section>
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-semibold tracking-[-0.015em] text-ink">Weavers</h1>
          <p className="text-[13px] text-muted">{count}</p>
        </div>
        {canEdit && (
          <div className="hidden md:block">
            <Button icon="add" onClick={() => setEditing("new")}>
              Add weaver
            </Button>
          </div>
        )}
      </div>

      {weavers.length === 0 ? (
        <Card className="mt-6">
          <EmptyState
            icon="groups"
            title="No weavers yet."
            description="Add the artisans you work with so the assistant can recognize them in your notes."
            action={
              canEdit ? (
                <Button icon="add" onClick={() => setEditing("new")}>
                  Add weaver
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <ul className="mt-6 grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
          {weavers.map((w) => (
            <li key={w.id}>
              <Card padding="lg" className="h-full">
                <div className="flex items-start gap-3">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-straw font-serif text-lg text-ink" aria-hidden>
                    {initials(w.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-ink">{w.name}</p>
                    <p className="text-[13px] text-muted">{[w.village, w.province].filter(Boolean).join(", ")}</p>
                  </div>
                  {canEdit && (
                    <Button variant="ghost" size="sm" icon="edit" aria-label={`Edit ${w.name}`} onClick={() => setEditing(w)}>
                      Edit
                    </Button>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {w.specialty.map((s) => (
                    <Badge key={s} tone="accent">
                      {s}
                    </Badge>
                  ))}
                </div>
                <p className="mt-3 text-[13px] text-muted">
                  {w.hat_count} {w.hat_count === 1 ? "hat" : "hats"}
                  {w.weaving_since ? ` · Weaving since ${w.weaving_since}` : ""}
                </p>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {canEdit && (
        <button
          type="button"
          aria-label="Add weaver"
          onClick={() => setEditing("new")}
          className="fixed right-4 bottom-24 z-30 grid h-14 w-14 place-items-center rounded-full bg-accent text-on-accent shadow-card md:hidden"
        >
          <Icon name="add" size={28} />
        </button>
      )}

      {editing && (
        <WeaverDialog key={editing === "new" ? "new" : editing.id} weaver={editing === "new" ? null : editing} onClose={() => setEditing(null)} />
      )}
    </section>
  );
}

function WeaverDialog({ weaver, onClose }: { weaver: WeaverRow | null; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [form, setForm] = useState<WeaverInput>({
    name: weaver?.name ?? "",
    village: weaver?.village ?? "",
    province: weaver?.province ?? "Azuay",
    specialty: weaver?.specialty ?? [],
    weavingSince: weaver?.weaving_since ?? null,
    bio: weaver?.bio ?? "",
    showName: weaver?.show_name ?? true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [duplicate, setDuplicate] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof WeaverInput>(k: K, v: WeaverInput[K]) {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: "" }));
    if (k === "name" || k === "village") setDuplicate(null);
  }

  async function submit() {
    const request_id = newRequestId();
    const t0 = Date.now();
    setSaving(true);
    const res = await saveWeaver({ ...form, id: weaver?.id, force: Boolean(duplicate) });
    setSaving(false);
    if (!res.ok) {
      if (res.code === "duplicate") setDuplicate(res.message);
      else if (res.fieldErrors) setErrors(res.fieldErrors);
      else toast.error(res.message);
      return;
    }
    if (weaver) {
      const changed = (Object.keys(form) as (keyof WeaverInput)[]).filter((k) => {
        const before = {
          name: weaver.name,
          village: weaver.village ?? "",
          province: weaver.province ?? "",
          specialty: weaver.specialty,
          weavingSince: weaver.weaving_since,
          bio: weaver.bio ?? "",
          showName: weaver.show_name,
        }[k];
        return JSON.stringify(before) !== JSON.stringify(form[k]);
      });
      log.info("weaver.edit", { request_id, duration_ms: Date.now() - t0, payload: { weaver_id: res.data.id, fields_changed: changed } });
    } else {
      log.info("weaver.create", {
        request_id,
        duration_ms: Date.now() - t0,
        payload: { weaver_id: res.data.id, province: form.province, forced_duplicate: Boolean(duplicate) },
      });
    }
    toast.success(`${form.name.trim()} saved.`);
    onClose();
    router.refresh();
  }

  return (
    <Dialog
      open
      onClose={onClose}
      dismissible={!saving}
      size="wide"
      title={weaver ? `Edit ${weaver.name}` : "Add weaver"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} loading={saving} loadingLabel="Saving...">
            {duplicate ? "Add anyway" : "Save"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Full name *" value={form.name} error={errors.name} required data-autofocus maxLength={80} onChange={(e) => set("name", e.target.value)} />
        <Input label="Village *" value={form.village} error={errors.village} required maxLength={60} onChange={(e) => set("village", e.target.value)} />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="weaver-province" className="text-[13px] font-semibold text-ink">
            Province
          </label>
          <select
            id="weaver-province"
            value={form.province}
            onChange={(e) => set("province", e.target.value)}
            className="h-11 rounded-[10px] border border-line bg-surface px-3 text-sm text-ink focus:border-accent focus:outline-none"
          >
            {PROVINCES.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </div>
        <Input
          label="Weaving since (optional)"
          inputMode="numeric"
          value={form.weavingSince ?? ""}
          error={errors.weavingSince}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "").slice(0, 4);
            set("weavingSince", v ? Number(v) : null);
          }}
        />
      </div>
      <fieldset className="mt-4">
        <legend className="text-[13px] font-semibold text-ink">Specialty</legend>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {GRADES.map((g) => {
            const on = form.specialty.includes(g);
            return (
              <button
                key={g}
                type="button"
                aria-pressed={on}
                onClick={() => set("specialty", on ? form.specialty.filter((s) => s !== g) : [...form.specialty, g])}
                className={cn(
                  "inline-flex h-9 items-center gap-1 rounded-full border px-3 text-[13px] font-medium",
                  on ? "border-accent bg-accent-tint text-accent" : "border-line text-ink hover:bg-surface2",
                )}
              >
                {on && <Icon name="check" size={14} />}
                {g}
              </button>
            );
          })}
        </div>
      </fieldset>
      <Textarea
        className="mt-4"
        label="Bio"
        rows={3}
        maxLength={200}
        value={form.bio}
        error={errors.bio}
        hint={`${form.bio.length}/200`}
        onChange={(e) => set("bio", e.target.value)}
      />
      <label className="mt-4 flex items-start gap-2 text-sm text-ink">
        <input type="checkbox" checked={form.showName} onChange={(e) => set("showName", e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--accent)]" />
        <span>
          Show this weaver&apos;s name on public passports
          <span className="mt-0.5 block text-[13px] text-muted">Preview: {passportLine(form.name, form.village, form.showName)}</span>
        </span>
      </label>
      {duplicate && (
        <p className="mt-4 flex items-start gap-2 rounded-[10px] bg-warn-tint p-3 text-[13px] text-warn" role="alert">
          <Icon name="warning" size={18} /> {duplicate}
        </p>
      )}
    </Dialog>
  );
}
