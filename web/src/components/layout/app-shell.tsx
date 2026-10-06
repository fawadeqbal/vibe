"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";

import { VibeLogo } from "@/components/ui/brand";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import { useInbox } from "@/stores/inbox";
import { useMatch } from "@/stores/match";
import { incomingOf, unreadTotal, useSocial } from "@/stores/social";

interface Tab {
  href: string;
  label: string;
  icon: string;
  iconVariant: "round" | "outlined";
  activeIcon: string;
  badge?: number;
}

function useTabs(): Tab[] {
  const chatsBadge = useSocial((s) => unreadTotal(s) + incomingOf(s).length);
  const teamUnread = useInbox((s) => s.unread);
  return [
    { href: "/match", label: "Match", icon: "videocam", iconVariant: "outlined", activeIcon: "videocam" },
    { href: "/chats", label: "Chats", icon: "chat_bubble_outline", iconVariant: "round", activeIcon: "chat_bubble", badge: chatsBadge + teamUnread },
    { href: "/store", label: "Store", icon: "storefront", iconVariant: "outlined", activeIcon: "storefront" },
    { href: "/me", label: "Me", icon: "person_outline", iconVariant: "round", activeIcon: "person" },
  ];
}

const isActive = (path: string, href: string) => path === href || path.startsWith(`${href}/`) || (href === "/chats" && path.startsWith("/inbox"));

/** Rail destination (wide screens): icon over label; the selected one sits in a glass lens. */
function RailItem({ tab, on }: { tab: Tab; on: boolean }) {
  const badge = tab.badge ?? 0;
  return (
    <Link
      href={tab.href}
      aria-current={on ? "page" : undefined}
      aria-label={badge > 0 ? `${tab.label}, ${badge} new` : tab.label}
      className={cn(
        "group relative flex h-[62px] w-[66px] flex-col items-center justify-center rounded-[22px] transition-[transform,background-color] duration-300 ease-(--ease-spring) active:scale-95",
        on ? "glass-lens" : "hover:bg-white/6",
      )}
    >
      <TabGlyph tab={tab} on={on} badge={badge} />
      <span className={cn("type-label mt-1 text-[11px]", on ? "font-semibold text-pink-soft" : "font-medium text-text2")}>{tab.label}</span>
    </Link>
  );
}

function TabGlyph({ tab, on, badge }: { tab: Tab; on: boolean; badge: number }) {
  return (
    <span className="relative flex h-[26px] items-center justify-center">
      <Icon name={on ? tab.activeIcon : tab.icon} variant={on ? "round" : tab.iconVariant} size={25} className={cn("transition-colors duration-200", on ? "text-pink" : "text-text2")} />
      {badge > 0 ? (
        <span className="type-label absolute -top-1 left-[17px] flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-pink px-1 text-[10px] font-bold text-white shadow-[0_0_0_2px_rgb(28_24_40/.9)]">
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
    </span>
  );
}

/**
 * The phone tab bar, iOS 26 style: a floating capsule of glass above the
 * content (which scrolls on under it, blurred), with a lighter glass lens
 * that glides to the selected tab.
 */
function TabBar({ tabs, path }: { tabs: Tab[]; path: string }) {
  const index = tabs.findIndex((t) => isActive(path, t.href));
  const n = tabs.length;
  return (
    <nav aria-label="Main" className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[calc(10px+env(safe-area-inset-bottom))] lg:hidden">
      <div className="glass-bar pointer-events-auto relative flex h-[66px] w-full max-w-[420px] items-stretch rounded-full p-[5px]">
        {index >= 0 ? (
          <span
            aria-hidden
            className="glass-lens absolute top-[5px] bottom-[5px] rounded-full transition-[left] duration-500 ease-(--ease-spring)"
            style={{ width: `calc((100% - 10px) / ${n})`, left: `calc(5px + (100% - 10px) * ${index} / ${n})` }}
          />
        ) : null}
        {tabs.map((t, i) => {
          const on = i === index;
          const badge = t.badge ?? 0;
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={on ? "page" : undefined}
              aria-label={badge > 0 ? `${t.label}, ${badge} new` : t.label}
              className="relative z-[2] flex flex-1 flex-col items-center justify-center rounded-full transition-transform duration-300 ease-(--ease-spring) active:scale-[0.92]"
            >
              <TabGlyph tab={t} on={on} badge={badge} />
              <span className={cn("type-label mt-[3px] text-[10.5px] tracking-[0.01em]", on ? "font-semibold text-pink-soft" : "font-medium text-text2")}>{t.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/** Height the floating tab bar takes from the bottom of a page (bar + gap + breathing room). */
const TABBAR_SPACE = "calc(96px + env(safe-area-inset-bottom))";

/**
 * Four tabs. Match is the app; the other three exist to keep people coming
 * back to it (friends), to pay (store) and to trust it (profile). Phones get
 * a floating glass tab bar (hidden during a live match); wide screens get a
 * floating glass rail. Pages scroll on under the bar; they end with a
 * `.tabbar-spacer` so the last row can scroll clear of it.
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
    <div className="flex h-dvh overflow-hidden">
      {/* Rail (wide screens). */}
      <div className="hidden shrink-0 py-3 pl-3 lg:flex">
        <nav aria-label="Main" className="glass-bar relative flex h-full w-[90px] flex-col items-center rounded-[32px] py-5">
          <Link href="/match" aria-label="Vibe home" className="mb-7">
            <VibeLogo size={42} shadow={false} />
          </Link>
          <div className="flex flex-col gap-2">
            {tabs.map((t) => (
              <RailItem key={t.href} tab={t} on={isActive(path, t.href)} />
            ))}
          </div>
        </nav>
      </div>

      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <main
          className="flex min-h-0 flex-1 flex-col"
          style={showBar && !onVideo ? ({ "--tabbar-space": TABBAR_SPACE } as CSSProperties) : undefined}
        >
          {children}
        </main>

        {showBar ? <TabBar tabs={tabs} path={path} /> : null}
      </div>
    </div>
  );
}
