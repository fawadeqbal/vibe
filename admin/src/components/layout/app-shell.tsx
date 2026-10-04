"use client";

import { useQuery } from "@tanstack/react-query";
import { LogOut, Menu as MenuIcon, Monitor, Moon, Search, Sun, User, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as React from "react";

import { VibeLogo } from "@/components/common/vibe-logo";
import { Button } from "@/components/ui/button";
import { Avatar, Kbd, Skeleton } from "@/components/ui/controls";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { useTheme } from "@/components/theme";
import { useCan, useMe, useSignOut } from "@/features/auth/session";
import { api } from "@/lib/api/client";
import type { DashboardSummary } from "@/lib/api/types";
import { isActive, NAV } from "@/lib/nav";
import { P } from "@/lib/permissions";
import { cn } from "@/lib/utils";

import { CommandPalette } from "./command-palette";

/** Sidebar + top bar around every signed-in screen. */
export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const pathname = usePathname();

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- close the drawer after navigating
    setMobileOpen(false);
  }, [pathname]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="min-h-dvh lg:pl-60">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[60] focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:shadow-pop">
        Skip to content
      </a>
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-surface lg:flex">
        <Sidebar />
      </aside>
      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col border-r border-line bg-surface shadow-pop animate-slide-in">
            <button className="absolute top-3 right-3 rounded-md p-1.5 text-muted hover:bg-surface-2" onClick={() => setMobileOpen(false)} aria-label="Close menu">
              <X className="size-4" />
            </button>
            <Sidebar />
          </aside>
        </div>
      )}

      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-bg/80 px-4 backdrop-blur-md sm:px-6">
        <Button size="icon-sm" variant="ghost" className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu">
          <MenuIcon />
        </Button>
        <button
          onClick={() => setPaletteOpen(true)}
          className="flex h-8 w-full max-w-sm items-center gap-2 rounded-lg border border-line bg-surface px-3 text-sm text-muted shadow-card transition-colors hover:border-line-strong"
        >
          <Search className="size-4" />
          <span className="flex-1 truncate text-left">Find a user or page…</span>
          <span className="hidden sm:inline-flex">
            <Kbd>⌘K</Kbd>
          </span>
        </button>
        <div className="ml-auto flex items-center gap-1">
          <ThemeMenu />
          <AccountMenu />
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6">
        {children}
      </main>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}

function Sidebar() {
  const pathname = usePathname();
  const can = useCan();
  const { data: me } = useMe();
  // Badge counts come from the dashboard summary (cached server-side for a minute).
  const { data: summary } = useQuery({
    queryKey: ["dashboard", "summary"],
    queryFn: ({ signal }) => api.get<DashboardSummary>("admin/dashboard/summary", undefined, signal),
    enabled: can(P.DashboardView),
    refetchInterval: 60_000,
  });
  const counts = { openReports: summary?.queues.openReports, cashoutsReview: summary?.queues.cashoutsReview, pendingPurchases: summary?.queues.pendingPurchases };

  return (
    <>
      <div className="flex h-14 items-center gap-2.5 border-b border-line px-4">
        <VibeLogo className="size-8" />
        <div className="leading-tight">
          <p className="text-sm font-semibold text-text">Vibe</p>
          <p className="text-[11px] text-muted">Admin</p>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-3" aria-label="Main">
        {!me
          ? Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="mb-2 h-7 w-full" />)
          : NAV.map((group) => {
              const items = group.items.filter((i) => can(i.permission));
              if (!items.length) return null;
              return (
                <div key={group.label} className="mb-4">
                  <p className="mb-1 px-2 text-[11px] font-medium tracking-wide text-muted uppercase">{group.label}</p>
                  <ul className="space-y-0.5">
                    {items.map((item) => {
                      const active = isActive(pathname, item);
                      const count = item.badge ? counts[item.badge] : undefined;
                      return (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            aria-current={active ? "page" : undefined}
                            className={cn(
                              "flex h-8 items-center gap-2.5 rounded-lg px-2 text-sm text-text-2 transition-colors hover:bg-surface-2 hover:text-text",
                              active && "bg-primary-soft font-medium text-primary hover:bg-primary-soft hover:text-primary",
                            )}
                          >
                            <item.icon className="size-4 shrink-0" />
                            <span className="flex-1 truncate">{item.label}</span>
                            {!!count && <span className="rounded-full bg-warn-soft px-1.5 text-[11px] font-semibold text-warn tabular">{count > 99 ? "99+" : count}</span>}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
      </nav>
      {me && (
        <div className="border-t border-line p-3 text-[11px] text-muted">
          Signed in as <span className="font-medium text-text-2">{me.role.name}</span>
        </div>
      )}
    </>
  );
}

function ThemeMenu() {
  const { mode, setMode, resolved } = useTheme();
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button size="icon-sm" variant="ghost" aria-label="Theme">
          {resolved === "dark" ? <Moon /> : <Sun />}
        </Button>
      </MenuTrigger>
      <MenuContent>
        {(
          [
            ["light", "Light", Sun],
            ["dark", "Dark", Moon],
            ["system", "System", Monitor],
          ] as const
        ).map(([m, label, Icon]) => (
          <MenuItem key={m} icon={<Icon />} onSelect={() => setMode(m)} className={cn(mode === m && "font-medium text-primary")}>
            {label}
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  );
}

function AccountMenu() {
  const { data: me } = useMe();
  const signOut = useSignOut();
  const router = useRouter();
  if (!me) return <Skeleton className="size-8 rounded-full" />;
  return (
    <Menu>
      <MenuTrigger asChild>
        <button className="rounded-full" aria-label="Account">
          <Avatar name={me.name} size={30} />
        </button>
      </MenuTrigger>
      <MenuContent className="w-60">
        <MenuLabel className="font-normal">
          <span className="block truncate text-sm font-medium text-text">{me.name}</span>
          <span className="block truncate">{me.email}</span>
        </MenuLabel>
        <MenuSeparator />
        <MenuItem icon={<User />} onSelect={() => router.push("/account")}>
          Your account & security
        </MenuItem>
        <MenuItem icon={<LogOut />} onSelect={() => void signOut()}>
          Sign out
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
