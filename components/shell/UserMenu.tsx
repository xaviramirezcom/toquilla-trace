"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import type { Profile } from "@/lib/auth/types";
import { cn } from "@/lib/cn";
import { applyTheme, readTheme, type ThemePref } from "@/lib/theme";
import { ADMIN_NAV } from "./nav";

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full bg-straw text-[12px] font-bold text-ink"
      style={{ width: size, height: size }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

export interface UserMenuProps {
  profile: Profile;
  /** "sidebar" opens up and to the right of the sidebar; "topbar" drops from the top right (mobile). */
  placement: "sidebar" | "topbar";
  hasRecentErrors?: boolean;
  onLogout: () => void;
}

const THEMES: { value: ThemePref; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

export function UserMenu({ profile, placement, hasRecentErrors = false, onLogout }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<ThemePref>("system");
  const rootRef = useRef<HTMLDivElement>(null);
  const isAdmin = profile.role === "admin";
  const workshopLine = [profile.workshopName, profile.workshopCity].filter(Boolean).join(", ");

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggle() {
    if (!open) setTheme(readTheme());
    setOpen((o) => !o);
  }

  const item =
    "flex h-11 w-full items-center gap-3 rounded-[10px] px-3 text-left text-sm text-ink hover:bg-accent-tint focus-visible:outline-2 focus-visible:outline-accent";

  return (
    <div ref={rootRef} className="relative">
      {placement === "sidebar" ? (
        <button
          type="button"
          onClick={toggle}
          aria-haspopup="menu"
          aria-expanded={open}
          className="flex w-full items-center gap-2.5 rounded-[10px] p-2 text-left hover:bg-accent-tint focus-visible:outline-2 focus-visible:outline-accent"
        >
          <Avatar name={profile.name} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold text-ink">{profile.name}</span>
            {workshopLine && <span className="block truncate text-[12px] text-muted">{workshopLine}</span>}
          </span>
          <Icon name="unfold_more" size={18} className="text-muted" />
        </button>
      ) : (
        <button
          type="button"
          onClick={toggle}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="Open user menu"
          className="grid h-11 w-11 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-accent"
        >
          <Avatar name={profile.name} />
        </button>
      )}

      {open && (
        <div
          role="menu"
          className={cn(
            "absolute z-40 w-[280px] rounded-[14px] border border-line bg-surface p-2 shadow-card animate-enter",
            placement === "sidebar" ? "bottom-0 left-full ml-2" : "top-full right-0 mt-2",
          )}
        >
          <div className="px-3 pt-2 pb-3">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold text-ink">{profile.name}</span>
              {isAdmin && (
                <Badge tone="info" icon="shield_person">
                  Admin
                </Badge>
              )}
            </div>
            {profile.email && <p className="truncate text-[12px] text-muted">{profile.email}</p>}
            {workshopLine && <p className="truncate text-[12px] text-muted">{workshopLine}</p>}
          </div>
          <div className="border-t border-line pt-1">
            <Link href="/settings" role="menuitem" className={item} onClick={() => setOpen(false)}>
              <Icon name="person" size={20} className="text-muted" />
              Profile &amp; workshop
            </Link>
            <Link href="/docs" role="menuitem" className={item} onClick={() => setOpen(false)}>
              <Icon name="menu_book" size={20} className="text-muted" />
              Docs
            </Link>
            <div className="px-3 py-2">
              <p className="mb-1.5 text-[12px] font-semibold text-muted">Theme</p>
              <div
                className="grid grid-cols-3 gap-1 rounded-[10px] bg-surface2 p-1"
                role="radiogroup"
                aria-label="Theme"
              >
                {THEMES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    role="radio"
                    aria-checked={theme === t.value}
                    onClick={() => {
                      applyTheme(t.value);
                      setTheme(t.value);
                    }}
                    className={cn(
                      "h-8 rounded-[8px] text-[13px] font-medium",
                      theme === t.value ? "bg-surface text-ink shadow-card" : "text-muted hover:text-ink",
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            {isAdmin && (
              <div className="border-t border-line pt-1 md:hidden">
                <p className="flex items-center gap-1.5 px-3 pt-2 pb-1 text-[11px] font-bold tracking-[0.04em] text-muted uppercase">
                  <Icon name="shield" size={14} />
                  Admin tools
                </p>
                {ADMIN_NAV.map((n) => (
                  <Link key={n.href} href={n.href} role="menuitem" className={item} onClick={() => setOpen(false)}>
                    <Icon name={n.icon} size={20} className="text-muted" />
                    {n.label}
                    {n.href === "/logs" && hasRecentErrors && (
                      <span className="ml-auto h-2 w-2 rounded-full bg-err" aria-label="Errors in the last hour" />
                    )}
                  </Link>
                ))}
              </div>
            )}
          </div>
          <div className="border-t border-line pt-1">
            <button
              type="button"
              role="menuitem"
              className={item}
              onClick={() => {
                setOpen(false);
                onLogout();
              }}
            >
              <Icon name="logout" size={20} className="text-muted" />
              Log out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
