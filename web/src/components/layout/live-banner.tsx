"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { Icon } from "@/components/ui/icon";
import { color } from "@/lib/colors";
import { notificationPath } from "@/lib/notification-path";
import { notificationStyle } from "@/lib/notification-style";
import { startBanners, useBanners } from "@/stores/banners";

let started = false;

/**
 * The live notification banner at the top of every page: a message, a
 * payment, a cash-out, a friend request… while you're in the app (the server
 * sends it instead of a push). Tap to open it, swipe it up or × to close.
 */
export function LiveBannerHost() {
  const router = useRouter();
  const path = usePathname();
  const b = useBanners((s) => s.current);

  useEffect(() => {
    if (started) return;
    started = true;
    startBanners((data) => notificationPath(data));
  }, []);
  useEffect(() => useBanners.getState().setPath(path), [path]);

  if (!b) return null;
  const style = notificationStyle(b.key, b.title);
  const open = () => {
    useBanners.getState().dismiss();
    router.push(notificationPath(b.data));
  };
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(10px+env(safe-area-inset-top))] z-[75] flex justify-center px-3">
      <div
        key={b.id}
        role="status"
        aria-live="polite"
        className="pointer-events-auto flex w-full max-w-[420px] animate-[banner-in_0.35s_cubic-bezier(0.16,1,0.3,1)] items-center gap-3 rounded-[20px] border border-white/10 bg-surface/92 p-2.5 pr-1.5 shadow-[0_12px_40px_rgb(0_0_0/0.45)] backdrop-blur-[20px]"
        onTouchStart={(e) => ((e.currentTarget as HTMLElement).dataset.y = String(e.touches[0].clientY))}
        onTouchEnd={(e) => {
          const y0 = Number((e.currentTarget as HTMLElement).dataset.y ?? 0);
          if (e.changedTouches[0].clientY - y0 < -24) useBanners.getState().dismiss();
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
        <button type="button" onClick={() => useBanners.getState().dismiss()} aria-label="Close" className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-white/6 hover:text-text">
          <Icon name="close" size={18} />
        </button>
      </div>
    </div>
  );
}
