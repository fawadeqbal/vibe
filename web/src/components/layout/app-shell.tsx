"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { VibeLogo } from "@/components/ui/brand";
import { TabIcon, type TabIconName } from "@/components/ui/tab-icons";
import { cn } from "@/lib/cn";
import { useInbox } from "@/stores/inbox";
import { useMatch } from "@/stores/match";
import { incomingOf, unreadTotal, useSocial } from "@/stores/social";
import { useWaitlist } from "@/stores/waitlist";
import { useWaves } from "@/stores/waves";

import { dismissLooking } from "@/features/match/waitlist-strip";

interface Tab {
  href: string;
  label: string;
  /** Solar glyph: outline when idle, bold when selected (same as the app). */
  icon: TabIconName;
  badge?: number;
}

function useTabs(): Tab[] {
  const chatsBadge = useSocial((s) => unreadTotal(s) + incomingOf(s).length);
  const teamUnread = useInbox((s) => s.unread);
  return [
    { href: "/match", label: "Match", icon: "match" },
    { href: "/chats", label: "Chats", icon: "chats", badge: chatsBadge + teamUnread },
    { href: "/store", label: "Store", icon: "store" },
    { href: "/me", label: "Me", icon: "me" },
  ];
}

const isActive = (path: string, href: string) => path === href || path.startsWith(`${href}/`) || (href === "/chats" && path.startsWith("/inbox"));

/** One destination: the pill indicator, icon, badge and label (bottom bar and rail share it). */
function TabItem({ tab, on, className }: { tab: Tab; on: boolean; className?: string }) {
  const badge = tab.badge ?? 0;
  return (
    <Link
      href={tab.href}
      aria-current={on ? "page" : undefined}
      aria-label={badge > 0 ? `${tab.label}, ${badge} new` : tab.label}
      className={cn("group flex flex-col items-center justify-center", className)}
    >
      <span className={cn("relative flex h-[30px] w-14 items-center justify-center rounded-[15px] transition-colors duration-200 ease-out", on ? "bg-pink/16" : "group-hover:bg-white/5")}>
        <TabIcon name={tab.icon} filled={on} size={23} className={on ? "text-pink" : "text-muted"} />
        {badge > 0 ? (
          <span className="type-label absolute top-px left-8 flex h-4 min-w-4 items-center justify-center rounded-[8px] bg-pink px-1 text-[10px] font-bold text-white">{badge > 99 ? "99+" : badge}</span>
        ) : null}
      </span>
      <span className={cn("type-label mt-1 text-[11px]", on ? "font-semibold text-text" : "font-medium text-muted")}>{tab.label}</span>
    </Link>
  );
}

/**
 * Four tabs. Match is the app; the other three exist to keep people coming
 * back to it (friends), to pay (store) and to trust it (profile). Phones get
 * the bottom bar (frosted over the camera on Match, hidden during a live
 * match); wide screens get a navigation rail.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const tabs = useTabs();
  const live = useMatch((s) => s.status === "connected" || s.status === "searching");
  const onVideo = path === "/match";
  // Pushed pages (wallet, chat, checkout…) cover the bar on phones, like a
  // pushed route in the app; the rail stays on wide screens.
  const tabRoot = tabs.some((t) => t.href === path);
  const showBar = tabRoot && !(live && onVideo);

  return (
    <div className="flex h-dvh overflow-hidden bg-bg">
      {/* Rail (wide screens). */}
      <nav aria-label="Main" className="sticky top-0 hidden h-dvh w-[92px] shrink-0 flex-col items-center border-r border-line-soft bg-bg py-6 lg:flex">
        <Link href="/match" aria-label="Vibe home" className="mb-8">
          <VibeLogo size={40} shadow={false} />
        </Link>
        <div className="flex flex-col gap-5">
          {tabs.map((t) => (
            <TabItem key={t.href} tab={t} on={isActive(path, t.href)} className="w-[76px]" />
          ))}
        </div>
      </nav>

      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        {!onVideo ? <SomeoneLookingBar /> : null}
        <main className={cn("flex min-h-0 flex-1 flex-col", showBar && !onVideo && "pb-[calc(64px+env(safe-area-inset-bottom))] lg:pb-0")}>{children}</main>

        {/* Bottom bar (phones). */}
        {showBar ? (
          <nav
            aria-label="Main"
            className={cn(
              "fixed inset-x-0 bottom-0 z-40 border-t border-line-soft pb-[env(safe-area-inset-bottom)] lg:hidden",
              onVideo ? "bg-bg/88 backdrop-blur-[20px]" : "bg-bg",
            )}
          >
            <div className="flex h-16">
              {tabs.map((t) => (
                <TabItem key={t.href} tab={t} on={isActive(path, t.href)} className="flex-1" />
              ))}
            </div>
          </nav>
        ) : null}
      </div>
    </div>
  );
}

/**
 * You asked to be told when someone's looking, and you're on another page:
 * one bar across the top that takes you to Match. (On Match the lobby shows it.)
 */
function SomeoneLookingBar() {
  const at = useWaitlist((s) => s.someoneLookingAt);
  const who = useWaves((s) => s.lookingFrom);
  if (!at) return null;
  return (
    <div role="alert" className="flex items-center gap-3 border-b border-pink/30 bg-pink/14 px-4 py-2.5 pt-[calc(10px+env(safe-area-inset-top))] lg:pt-2.5">
      <span className="relative flex size-2.5 shrink-0">
        <span className="absolute inset-0 animate-ping rounded-full bg-pink-soft opacity-70" />
        <span className="relative size-2.5 rounded-full bg-pink" />
      </span>
      <span className="type-label flex-1 text-[13px] text-text">{who ? `${who.name.split(" ")[0]} is looking for a match right now` : "Someone's looking for a match right now"}</span>
      <Link href="/match" className="type-label rounded-full bg-pink px-3.5 py-1.5 text-[13px] font-semibold text-white hover:brightness-110">
        Go
      </Link>
      <button type="button" aria-label="Dismiss" onClick={dismissLooking} className="type-label text-[12.5px] text-text2 hover:text-text">
        Not now
      </button>
    </div>
  );
}
