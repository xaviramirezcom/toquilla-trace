"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import type { Profile } from "@/lib/auth/types";
import { cn } from "@/lib/cn";
import { log } from "@/lib/log";
import { tryGetSupabaseBrowserClient } from "@/lib/supabase/client";
import { Logo } from "./Logo";
import { ADMIN_NAV, MAIN_NAV, isActive } from "./nav";
import { UserMenu } from "./UserMenu";

export interface AppShellProps {
  profile: Profile;
  /** Pending proposals: badge on Workshop, and a confirm before logout when > 0. */
  pendingCount?: number;
  /** Red dot on Logs (admins) when there were errors in the last hour. */
  hasRecentErrors?: boolean;
  children: ReactNode;
}

/** Desktop: 240px sidebar. Mobile (< 768px): 56px top bar and a 64px bottom bar with 3 tabs. */
export function AppShell({ profile, pendingCount = 0, hasRecentErrors = false, children }: AppShellProps) {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const isAdmin = profile.role === "admin";

  useEffect(() => {
    log.setContext({ user_id: profile.userId, workshop_id: profile.workshopId });
  }, [profile.userId, profile.workshopId]);

  async function logout() {
    setLoggingOut(true);
    log.info("auth.logout");
    await log.flush();
    log.clearContext();
    try {
      await tryGetSupabaseBrowserClient()?.auth.signOut();
    } catch {
      // Sign-out failures still leave the page; the proxy re-checks the session.
    }
    router.replace("/login");
    router.refresh();
  }

  function requestLogout() {
    if (pendingCount > 0) setConfirmLogout(true);
    else void logout();
  }

  const navLink = (active: boolean) =>
    cn(
      "flex h-11 items-center gap-3 rounded-[10px] px-3 text-sm transition-colors duration-150",
      "focus-visible:outline-2 focus-visible:outline-accent",
      active ? "bg-accent-tint font-bold text-ink" : "text-ink hover:bg-accent-tint",
    );

  return (
    <div className="min-h-dvh bg-bg md:flex">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-[240px] shrink-0 flex-col border-r border-line bg-surface p-3 md:flex">
        <div className="px-2 pt-2 pb-5">
          <Logo />
        </div>
        <nav aria-label="Main" className="flex flex-col gap-1">
          {MAIN_NAV.map((n) => {
            const active = isActive(pathname, n.href);
            return (
              <Link key={n.href} href={n.href} className={navLink(active)} aria-current={active ? "page" : undefined}>
                <Icon name={n.icon} size={21} className={active ? "text-accent" : "text-muted"} />
                {n.label}
                {n.href === "/workshop" && pendingCount > 0 && (
                  <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1.5 text-[11px] font-bold text-on-accent">
                    {pendingCount}
                  </span>
                )}
              </Link>
            );
          })}
          {isAdmin && (
            <>
              <div className="my-3 border-t border-line" />
              <p className="flex items-center gap-1.5 px-3 pb-1 text-[11px] font-bold tracking-[0.04em] text-muted uppercase">
                <Icon name="shield" size={14} />
                Admin
              </p>
              {ADMIN_NAV.map((n) => {
                const active = isActive(pathname, n.href);
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    className={navLink(active)}
                    aria-current={active ? "page" : undefined}
                  >
                    <Icon name={n.icon} size={21} className={active ? "text-accent" : "text-muted"} />
                    {n.label}
                    {n.href === "/logs" && hasRecentErrors && (
                      <span className="ml-auto h-2 w-2 rounded-full bg-err" aria-label="Errors in the last hour" />
                    )}
                  </Link>
                );
              })}
            </>
          )}
        </nav>
        <div className="mt-auto border-t border-line pt-3">
          <UserMenu profile={profile} placement="sidebar" hasRecentErrors={hasRecentErrors} onLogout={requestLogout} />
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-surface px-4 md:hidden">
        <Logo />
        <UserMenu profile={profile} placement="topbar" hasRecentErrors={hasRecentErrors} onLogout={requestLogout} />
      </header>

      <main className="min-w-0 flex-1 px-4 pt-4 pb-24 md:px-9 md:pt-8 md:pb-10">{children}</main>

      {/* Mobile bottom tab bar: exactly 3 tabs, never admin pages */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 grid h-16 grid-cols-3 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {MAIN_NAV.map((n) => {
          const active = isActive(pathname, n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium",
                active ? "text-accent" : "text-muted",
              )}
            >
              <Icon name={n.icon} size={23} filled={active} />
              {n.label}
              {n.href === "/workshop" && pendingCount > 0 && (
                <span className="absolute top-1.5 left-1/2 ml-2 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-on-accent">
                  {pendingCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <Dialog
        open={confirmLogout}
        onClose={() => setConfirmLogout(false)}
        title="Log out?"
        description={`You have ${pendingCount} ${pendingCount === 1 ? "proposal" : "proposals"} waiting for review. They'll still be here when you come back.`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmLogout(false)}>
              Stay
            </Button>
            <Button onClick={() => void logout()} loading={loggingOut} loadingLabel="Logging out…">
              Log out
            </Button>
          </>
        }
      />
    </div>
  );
}
