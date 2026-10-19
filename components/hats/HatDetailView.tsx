"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { STAGES, type Actor } from "@domain/domain";
import { advanceHat, archiveHat, transferHat } from "@/app/(app)/hats/actions";
import { Badge, Button, Card, Icon, useToast } from "@/components/ui";
import { cn } from "@/lib/cn";
import { log } from "@/lib/log";
import { newRequestId } from "@/lib/request-id";
import { FINISHED_STAGE, advanceBlockReason, nextStageName, openFlags, timelineSteps } from "@/lib/hats/format";
import type { HatDetail } from "@/lib/hats/types";
import { CopyButton } from "./CopyButton";
import { FlagsPanel } from "./FlagsPanel";
import { GradeBadge } from "./GradeBadge";
import { AdvanceDialog, ArchiveDialog, TransferDialog } from "./HatDialogs";
import { ActivityList, DetailsCard, OwnershipChain, Timeline } from "./HatSections";

export interface HatLogRow {
  id: number;
  created_at: string;
  level: string;
  action: string;
  message: string | null;
  request_id: string | null;
}

export function HatDetailView({
  hat,
  actor,
  isAdmin,
  nowIso,
  logs,
}: {
  hat: HatDetail;
  actor: Actor;
  isAdmin: boolean;
  nowIso: string;
  logs: HatLogRow[] | null;
}) {
  const router = useRouter();
  const toast = useToast();
  // Optimistic copy of the fields an advance changes. Re-synced when the server sends fresh props.
  const [stage, setStage] = useState(hat.stage);
  const [version, setVersion] = useState(hat.version);
  const [dialog, setDialog] = useState<"advance" | "transfer" | "archive" | null>(null);
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [tab, setTab] = useState<"activity" | "logs">("activity");
  const [synced, setSynced] = useState({ stage: hat.stage, version: hat.version });
  if (synced.stage !== hat.stage || synced.version !== hat.version) {
    setSynced({ stage: hat.stage, version: hat.version });
    setStage(hat.stage);
    setVersion(hat.version);
  }

  const view = { ...hat, stage };
  const blockReason = advanceBlockReason(view, actor);
  const next = nextStageName(stage);
  const canWrite = !hat.archived && actor.workshopId === hat.workshop_id && hat.owner_type === "workshop";
  const canTransferNow = canWrite && !hat.transfer_email;
  const steps = timelineSteps(view, hat.events);
  const flagsOpen = openFlags(hat.flags).length;

  async function confirmAdvance(note: string) {
    const request_id = newRequestId();
    const t0 = Date.now();
    const prev = { stage, version };
    const from = STAGES[stage];
    const to = STAGES[stage + 1];
    setBusy(true);
    setStage(stage + 1); // optimistic
    setDialog(null);
    const res = await advanceHat({ code: hat.code, expectedVersion: prev.version, note });
    setBusy(false);
    const base = { request_id, hat_code: hat.code, duration_ms: Date.now() - t0 };
    if (!res.ok) {
      setStage(prev.stage);
      setVersion(prev.version);
      const payload = { ok: false, from, to, reason: res.code, has_note: Boolean(note.trim()) };
      if (res.code === "unknown") log.error("hat.stage.advance", new Error(res.message), { ...base, message: res.message, payload });
      else log.warn("hat.stage.advance", { ...base, message: res.message, payload });
      toast.error(res.message, res.code === "version_conflict" ? { action: { label: "Refresh", onClick: () => router.refresh() } } : undefined);
      return;
    }
    setVersion(res.data.version);
    log.info("hat.stage.advance", { ...base, payload: { ok: true, from, to, version: res.data.version, has_note: Boolean(note.trim()) } });
    toast.success(`${hat.code} moved to ${to}.`);
    router.refresh();
  }

  async function confirmTransfer(v: { to: "seller" | "buyer"; email: string; message: string }) {
    const request_id = newRequestId();
    const t0 = Date.now();
    setBusy(true);
    const res = await transferHat({ code: hat.code, expectedVersion: version, ...v });
    setBusy(false);
    const payload = { ok: res.ok, to: v.to, email_domain: v.email.split("@")[1] ?? null };
    const base = { request_id, hat_code: hat.code, duration_ms: Date.now() - t0 };
    if (!res.ok) {
      log.warn("hat.transfer", { ...base, message: res.message, payload: { ...payload, error_code: res.code } });
      toast.error(res.message, res.code === "version_conflict" ? { action: { label: "Refresh", onClick: () => router.refresh() } } : undefined);
      return;
    }
    log.info("hat.transfer", { ...base, payload });
    setDialog(null);
    toast.success("Transfer recorded. They can claim it from the hat's passport.");
    router.refresh();
  }

  async function confirmArchive() {
    const request_id = newRequestId();
    const t0 = Date.now();
    setBusy(true);
    const res = await archiveHat({ code: hat.code, expectedVersion: version });
    setBusy(false);
    const base = { request_id, hat_code: hat.code, duration_ms: Date.now() - t0 };
    if (!res.ok) {
      log.warn("hat.archive", { ...base, message: res.message, payload: { ok: false, error_code: res.code } });
      toast.error(res.message);
      return;
    }
    log.info("hat.archive", { ...base, payload: { ok: true } });
    setDialog(null);
    toast.success(`${hat.code} archived.`);
    router.push("/hats");
  }

  async function share() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/hat/${hat.code}`);
      toast.success("Link copied.");
    } catch {
      toast.error("Couldn't copy. Select the link and copy it by hand.");
    }
  }

  const advanceLabel = next ? `Advance to ${next}` : "Finished";

  return (
    <section className="pb-28 md:pb-0">
      <nav aria-label="Breadcrumb" className="text-[13px] text-muted">
        <Link href="/hats" className="hover:underline">
          Hats
        </Link>{" "}
        / <span className="font-mono text-ink">{hat.code}</span>
      </nav>

      <div className="mt-2 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-1">
            <h1 className="font-mono text-[28px] font-semibold tracking-tight text-ink md:text-[36px]">{hat.code}</h1>
            <CopyButton text={hat.code} toastMessage="Code copied." label={`Copy ${hat.code}`} size={20} boxClass="h-11 w-11 md:h-10 md:w-10" />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <GradeBadge grade={hat.grade} />
            <Badge tone={stage === FINISHED_STAGE ? "ok" : "accent"}>{STAGES[stage]}</Badge>
            <Badge tone="ok" icon="verified">
              Verified
            </Badge>
            {flagsOpen > 0 && (
              <Badge tone="warn" icon="flag">
                {flagsOpen} {flagsOpen === 1 ? "flag" : "flags"}
              </Badge>
            )}
            {hat.archived && <Badge icon="inventory_2">Archived</Badge>}
          </div>
        </div>

        {/* Desktop actions */}
        <div className="hidden items-center gap-2 md:flex">
          <span title={blockReason ?? undefined}>
            <Button
              onClick={() => setDialog("advance")}
              disabled={Boolean(blockReason) || busy}
              icon="arrow_forward"
              aria-describedby={blockReason ? "advance-reason" : undefined}
            >
              {advanceLabel}
            </Button>
          </span>
          <Button variant="secondary" icon="share" onClick={share}>
            Share
          </Button>
          <MoreMenu
            open={menuOpen}
            setOpen={setMenuOpen}
            items={[
              ...(canTransferNow ? [{ label: "Transfer ownership...", icon: "swap_horiz", onClick: () => setDialog("transfer") }] : []),
              ...(canWrite ? [{ label: "Archive", icon: "inventory_2", onClick: () => setDialog("archive"), danger: true }] : []),
              ...(isAdmin
                ? [
                    { label: "View in agent runs", icon: "account_tree", href: `/runs?hat=${hat.code}` },
                    { label: "View logs for this hat", icon: "receipt_long", href: `/logs?hat=${hat.code}` },
                  ]
                : []),
            ]}
          />
        </div>
      </div>
      {blockReason && (
        <p id="advance-reason" className="mt-2 hidden text-[13px] text-muted md:block">
          {blockReason}
        </p>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-4">
          <FlagsPanel code={hat.code} flags={hat.flags} canReview={canWrite} failed={hat.flagsFailed} />
          <Timeline steps={steps} nowIso={nowIso} isAdmin={isAdmin} />
          <Card padding="lg">
            <div role="tablist" aria-label="Hat history" className="flex gap-1 border-b border-line">
              <TabButton active={tab === "activity"} onClick={() => setTab("activity")}>
                Activity
              </TabButton>
              {isAdmin && (
                <TabButton active={tab === "logs"} onClick={() => setTab("logs")}>
                  Logs
                </TabButton>
              )}
            </div>
            <div className="mt-2" role="tabpanel">
              {tab === "activity" || !isAdmin ? (
                <ActivityList events={hat.events} ownerType={hat.owner_type} nowIso={nowIso} />
              ) : (
                <HatLogs code={hat.code} logs={logs} />
              )}
            </div>
          </Card>
        </div>
        <div className="flex flex-col gap-4">
          <DetailsCard hat={hat} />
          <OwnershipChain hat={hat} />
          {isAdmin && (
            <div className="flex flex-col gap-2 md:hidden">
              <Link href={`/runs?hat=${hat.code}`} className="text-sm font-semibold text-accent">
                View in agent runs
              </Link>
              <Link href={`/logs?hat=${hat.code}`} className="text-sm font-semibold text-accent">
                View logs for this hat
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Mobile bottom bar */}
      <div className="fixed inset-x-0 bottom-16 z-30 border-t border-line bg-surface px-4 pt-2 pb-3 md:hidden">
        {blockReason && <p className="mb-2 text-center text-[13px] text-muted">{blockReason}</p>}
        <div className="flex gap-2">
          <Button variant="secondary" icon="share" onClick={share} className="h-12">
            Share
          </Button>
          <Button fullWidth className="h-12" onClick={() => setDialog("advance")} disabled={Boolean(blockReason) || busy}>
            {advanceLabel}
          </Button>
        </div>
      </div>

      <AdvanceDialog
        key={`adv-${stage}-${dialog === "advance"}`}
        open={dialog === "advance"}
        code={hat.code}
        stage={stage}
        loading={busy}
        onCancel={() => setDialog(null)}
        onConfirm={confirmAdvance}
      />
      <TransferDialog
        key={`tr-${dialog === "transfer"}`}
        open={dialog === "transfer"}
        code={hat.code}
        loading={busy}
        onCancel={() => setDialog(null)}
        onConfirm={confirmTransfer}
      />
      <ArchiveDialog open={dialog === "archive"} code={hat.code} loading={busy} onCancel={() => setDialog(null)} onConfirm={confirmArchive} />
    </section>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "-mb-px border-b-2 px-3 py-2 text-sm font-semibold",
        active ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

interface MenuItem {
  label: string;
  icon: string;
  onClick?: () => void;
  href?: string;
  danger?: boolean;
}

function MoreMenu({ open, setOpen, items }: { open: boolean; setOpen: (v: boolean) => void; items: MenuItem[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, setOpen]);
  if (items.length === 0) return null;
  return (
    <div className="relative" ref={ref}>
      <Button variant="secondary" size="icon" aria-label="More actions" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon name="more_horiz" />
      </Button>
      {open && (
        <div role="menu" className="absolute right-0 z-20 mt-1 w-60 rounded-[12px] border border-line bg-surface p-1 shadow-card">
          {items.map((it) => {
            const cls = cn(
              "flex w-full items-center gap-2 rounded-[8px] px-3 py-2 text-left text-sm hover:bg-surface2",
              it.danger ? "text-err" : "text-ink",
            );
            return it.href ? (
              <Link key={it.label} role="menuitem" href={it.href} className={cls} onClick={() => setOpen(false)}>
                <Icon name={it.icon} size={18} /> {it.label}
              </Link>
            ) : (
              <button
                key={it.label}
                type="button"
                role="menuitem"
                className={cls}
                onClick={() => {
                  setOpen(false);
                  it.onClick?.();
                }}
              >
                <Icon name={it.icon} size={18} /> {it.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function HatLogs({ code, logs }: { code: string; logs: HatLogRow[] | null }) {
  if (!logs || logs.length === 0) return <p className="py-6 text-center text-[13px] text-muted">No log rows for this hat yet.</p>;
  return (
    <ul className="flex flex-col font-mono text-xs">
      {logs.map((l) => (
        <li key={l.id} className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line py-2 first:border-t-0", l.level === "error" && "bg-err-tint")}>
          <span className="text-muted">{l.created_at.slice(11, 23)}</span>
          <span className={cn(l.level === "error" ? "text-err" : l.level === "warn" ? "text-warn" : "text-muted")}>{l.level}</span>
          <span className="text-ink">{l.action}</span>
          <span className="min-w-0 flex-1 truncate font-sans text-muted">{l.message ?? ""}</span>
          <Link href={`/logs?id=${l.id}&hat=${code}`} className="font-sans font-semibold text-accent hover:underline">
            Open in Logs
          </Link>
        </li>
      ))}
    </ul>
  );
}
