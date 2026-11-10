"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { Icon } from "@/components/ui/icon";
import { color } from "@/lib/colors";
import { notificationPath } from "@/lib/notification-path";
import { notificationStyle } from "@/lib/notification-style";
import { readFromTap } from "@/stores/activity";
import { type LiveBanner, startBanners, useBanners } from "@/stores/banners";

let started = false;

/** How many cards show at once; the rest wait under "+N more". */
const VISIBLE = 3;

/**
 * Live notifications at the top of every page: a message, a payment, a
 * cash-out, a friend request… while you're in the app (the server sends
 * them instead of a push). They stack, newest on top, and stay until you
 * tap one (opens it), close it (× or swipe up) or clear them all.
 */
export function LiveBannerHost() {
  const items = useBanners((s) => s.items);
  const path = usePathname();

  useEffect(() => {
    if (started) return;
    started = true;
    startBanners((data) => notificationPath(data));
  }, []);
  useEffect(() => useBanners.getState().setPath(path), [path]);

  if (!items.length) return null;
  const more = items.length - VISIBLE;
  return (
    <div
      aria-label="Notifications"
      className="pointer-events-none fixed inset-x-0 top-[calc(10px+env(safe-area-inset-top))] z-[75] flex flex-col items-center gap-2 px-3"
    >
      {items.slice(0, VISIBLE).map((b) => (
        <BannerCard key={b.id} b={b} />
      ))}
      {items.length > 1 ? (
        <div className="pointer-events-auto flex w-full max-w-[420px] items-center justify-end gap-2 px-1">
          {more > 0 ? <span className="type-label mr-auto rounded-full bg-surface/92 px-2.5 py-1 text-[12px] text-text2 backdrop-blur-[20px]">+{more} more</span> : null}
          <button
            type="button"
            onClick={() => useBanners.getState().clear()}
            className="type-label rounded-full border border-white/10 bg-surface/92 px-3 py-1 text-[12px] font-semibold text-text shadow-[0_6px_20px_rgb(0_0_0/0.35)] backdrop-blur-[20px] hover:bg-surface2"
          >
            Clear all
          </button>
        </div>
      ) : null}
    </div>
  );
}

function BannerCard({ b }: { b: LiveBanner }) {
  const router = useRouter();
  const style = notificationStyle(b.key, b.title);
  const close = () => useBanners.getState().dismiss(b.id);
  const open = () => {
    close();
    readFromTap(b.data);
    router.push(notificationPath(b.data));
  };
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-auto flex w-full max-w-[420px] animate-[banner-in_0.35s_cubic-bezier(0.16,1,0.3,1)] items-center gap-3 rounded-[20px] border border-white/10 bg-surface/92 p-2.5 pr-1.5 shadow-[0_12px_40px_rgb(0_0_0/0.45)] backdrop-blur-[20px]"
      onTouchStart={(e) => ((e.currentTarget as HTMLElement).dataset.y = String(e.touches[0].clientY))}
      onTouchEnd={(e) => {
        const y0 = Number((e.currentTarget as HTMLElement).dataset.y ?? 0);
        if (e.changedTouches[0].clientY - y0 < -24) close();
      }}
    >
      <button type="button" onClick={open} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-[13px]" style={{ background: `color-mix(in srgb, ${color(style.tone)} 18%, transparent)` }}>
          <Icon name={style.icon} size={21} style={{ color: color(style.tone) }} />
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="type-title truncate text-[14px] font-bold text-text">{b.title}</span>
          {b.body ? <span className="type-body line-clamp-2 text-[12.5px] leading-[1.35] text-text2">{b.body}</span> : null}
        </span>
      </button>
      <button type="button" onClick={close} aria-label="Close" className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-white/6 hover:text-text">
        <Icon name="close" size={18} />
      </button>
    </div>
  );
}
