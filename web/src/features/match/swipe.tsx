"use client";

import { type PointerEvent as ReactPointerEvent, type ReactNode, useRef, useState } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Icon } from "@/components/ui/icon";
import { CoinAmount } from "@/components/ui/money";
import { useNow } from "@/hooks/use-now";
import { freeReconnectLeft } from "@/lib/engagement";
import { duration } from "@/lib/format";
import { matchLengthSeconds } from "@/lib/models";
import { useMatch } from "@/stores/match";
import { friendStateOf, useSocial } from "@/stores/social";

/** How far up (px) counts as "next person". */
export const SWIPE_NEXT_PX = 120;
/** A quick flick counts too (px per ms). */
const FLICK = 0.6;
const DOUBLE_TAP_MS = 300;

/** Swiping up far or fast enough means "next". */
export function isSwipeNext(dy: number, ms: number): boolean {
  if (dy >= 0) return false;
  return -dy >= SWIPE_NEXT_PX || (-dy >= 40 && -dy / Math.max(ms, 1) >= FLICK);
}

/**
 * The video stage in a call: swipe up for the next person (it slides up
 * with "Let go for someone new"), double-tap to like. Buttons above it keep
 * working; the Next button stays for anyone who doesn't swipe.
 */
export function SwipeStage({ children, onNext, onLike, disabled = false }: { children: ReactNode; onNext: () => void; onLike: () => void; disabled?: boolean }) {
  const [dy, setDy] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [heart, setHeart] = useState(0);
  const start = useRef<{ y: number; x: number; t: number; id: number } | null>(null);
  const lastTap = useRef(0);

  const down = (e: ReactPointerEvent) => {
    if (disabled) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    start.current = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId };
    setDragging(true);
  };
  const move = (e: ReactPointerEvent) => {
    const s = start.current;
    if (!s || s.id !== e.pointerId) return;
    setDy(Math.min(0, e.clientY - s.y));
  };
  const up = (e: ReactPointerEvent) => {
    const s = start.current;
    start.current = null;
    setDragging(false);
    if (!s) return;
    const moved = e.clientY - s.y;
    const ms = performance.now() - s.t;
    if (isSwipeNext(moved, ms)) {
      setDy(-window.innerHeight);
      onNext();
      window.setTimeout(() => setDy(0), 350);
      return;
    }
    setDy(0);
    // A tap that barely moved: two in a row is a like.
    if (Math.abs(moved) < 10 && Math.abs(e.clientX - s.x) < 10) {
      const now = performance.now();
      if (now - lastTap.current < DOUBLE_TAP_MS) {
        lastTap.current = 0;
        onLike();
        setHeart((h) => h + 1);
      } else lastTap.current = now;
    }
  };

  const pull = Math.min(1, -dy / SWIPE_NEXT_PX);
  return (
    <>
      <div
        className="absolute inset-0 overflow-hidden"
        style={{
          transform: dy ? `translateY(${dy}px)` : undefined,
          borderRadius: dy ? 36 : undefined,
          transition: dragging ? "none" : "transform 300ms var(--ease-spring, ease-out), border-radius 300ms",
        }}
      >
        {children}
      </div>
      {/* The touch surface: under the controls (they come later in the page), over the video. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 touch-none select-none"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      />
      {dy < -12 ? (
        <div className="pointer-events-none absolute inset-x-6 top-[30%] mx-auto flex max-w-[320px] flex-col items-center rounded-[24px] bg-bg/70 px-4 py-5 text-center backdrop-blur-md">
          <span className="bg-brand flex size-14 items-center justify-center rounded-full text-white shadow-[0_10px_30px_rgb(255_61_143/0.4)]">
            <Icon name="arrow_upward" size={28} />
          </span>
          <span className="type-title mt-3 text-[19px] font-bold">{pull >= 1 ? "Let go for someone new" : "Swipe up for someone new"}</span>
          <span className="type-body mt-1 text-[13px] text-text2">Pull back down to stay</span>
          <span className="mt-3 h-1.5 w-[140px] overflow-hidden rounded-full bg-surface">
            <span className="bg-brand block h-full rounded-full" style={{ width: `${pull * 100}%` }} />
          </span>
        </div>
      ) : null}
      {heart ? (
        <span key={heart} aria-hidden="true" className="animate-heart-pop pointer-events-none absolute inset-0 flex items-center justify-center">
          <Icon name="favorite" variant="filled" size={132} className="text-pink drop-shadow-[0_10px_30px_rgb(255_61_143/0.5)]" />
        </span>
      ) : null}
    </>
  );
}

const HINT_KEY = "vibe.swipeHint.v1";

/** Whether the "swipe up for next" hint was already shown on this device. */
export function swipeHintSeen(): boolean {
  try {
    return localStorage.getItem(HINT_KEY) === "1";
  } catch {
    return true;
  }
}

export function markSwipeHintSeen() {
  try {
    localStorage.setItem(HINT_KEY, "1");
  } catch {}
}

/** First call only: how to move on and how to like, then "Got it". */
export function SwipeHint({ onDone }: { onDone: () => void }) {
  return (
    <div role="dialog" aria-label="How to move on" className="absolute inset-0 z-20 flex flex-col items-center bg-black/75 px-6 pt-[18vh] pb-[calc(28px+env(safe-area-inset-bottom))]">
      <div className="relative flex h-[200px] w-[84px] justify-center rounded-full border-[1.5px] border-dashed border-white/30" aria-hidden="true">
        <Icon name="keyboard_arrow_up" size={30} className="absolute top-3 text-pink-soft" />
        <span className="animate-swipe-hint absolute bottom-6 size-[54px] rounded-full bg-white/90 shadow-[0_0_0_10px_rgb(255_255_255/0.15)] motion-reduce:animate-none" />
      </div>
      <h2 className="type-display mt-7 text-center text-[26px] leading-[1.15]">
        Swipe up for the <span className="type-serif text-pink-soft">next person</span>
      </h2>
      <p className="type-body mt-2 max-w-[300px] text-center text-[14px] leading-[1.5] text-text2">Not a vibe? One swipe and you&apos;re on to someone new. The Next button works too.</p>
      <div className="mt-5 flex w-full max-w-[360px] gap-2.5">
        <span className="flex flex-1 flex-col gap-1 rounded-[16px] bg-surface2/90 p-3">
          <Icon name="favorite" variant="filled" size={20} className="text-pink-soft" />
          <span className="type-title text-[13px] font-bold">Double-tap</span>
          <span className="type-body text-[12px] text-text2">to like them</span>
        </span>
        <span className="flex flex-1 flex-col gap-1 rounded-[16px] bg-surface2/90 p-3">
          <Icon name="skip_next" size={20} className="text-lavender" />
          <span className="type-title text-[13px] font-bold">Next button</span>
          <span className="type-body text-[12px] text-text2">same as a swipe</span>
        </span>
      </div>
      <div className="flex-1" />
      <button type="button" onClick={onDone} className="type-title h-[52px] w-full max-w-[360px] rounded-full bg-text text-[16px] font-bold text-bg hover:brightness-95">
        Got it
      </button>
    </div>
  );
}

/**
 * While finding the next person after a skip: who you just left, with Add
 * friend and Undo (call them back — the reconnect price, or free for a while).
 */
export function SkippedBar({ onUndo, onAddFriend }: { onUndo: () => void; onAddFriend: () => void }) {
  const p = useMatch((s) => (s.endReason === "skipped" && s.status === "searching" ? s.lastPartner : null));
  const last = useMatch((s) => (s.history.length ? s.history[s.history.length - 1] : null));
  const ended = useMatch((s) => s.ended);
  const friend = useSocial((s) => (p ? friendStateOf(s, p.id) : "none"));
  const now = useNow(1000, !!ended?.freeReconnectUntil);
  if (!p) return null;
  const freeLeft = freeReconnectLeft(ended?.freeReconnectUntil ?? null, now);
  const together = last ? duration(matchLengthSeconds(last)) : null;
  return (
    <div role="status" className="absolute inset-x-3 top-[calc(12px+env(safe-area-inset-top))] z-10 mx-auto flex max-w-[480px] items-center gap-2.5 rounded-[20px] border border-white/10 bg-surface px-2 py-2 shadow-[0_12px_30px_rgb(0_0_0/0.5)]">
      <Avatar url={p.avatarUrl} name={p.name} size={32} />
      <span className="type-body min-w-0 flex-1 truncate text-[13px]">
        <strong>{p.name}</strong>
        {together ? ` · ${together} together` : ""}
      </span>
      {friend === "none" || friend === "incoming" ? (
        <button type="button" onClick={onAddFriend} className="type-label h-[34px] shrink-0 rounded-full bg-violet/24 px-3 text-[12.5px] font-bold text-lavender hover:bg-violet/32">
          Add friend
        </button>
      ) : friend === "requested" ? (
        <span className="type-label shrink-0 px-2 text-[12px] text-text2">Request sent</span>
      ) : null}
      <button
        type="button"
        onClick={onUndo}
        aria-label={freeLeft > 0 ? `Undo — go back to ${p.name}, free` : `Undo — go back to ${p.name}, ${ended?.reconnectCost ?? ""} coins`}
        className="type-label flex h-[34px] shrink-0 items-center gap-1 rounded-full bg-gold/14 px-3 text-[12.5px] font-bold text-gold hover:bg-gold/20"
      >
        Undo
        {freeLeft > 0 ? null : ended ? <CoinAmount amount={ended.reconnectCost} size={11} /> : null}
      </button>
    </div>
  );
}
