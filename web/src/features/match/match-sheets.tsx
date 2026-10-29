"use client";

import { useEffect, useRef, useState } from "react";

import { rewardedAds } from "@/components/shared/rewarded-ads";
import { GhostButton, GradientButton, TextButton } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { CoinAmount } from "@/components/ui/money";
import { Headline } from "@/components/ui/typography";
import { useNow } from "@/hooks/use-now";
import { cn } from "@/lib/cn";
import type { CameraErrorKind } from "@/stores/match";
import { openSheet } from "@/stores/ui";

// ── Camera blocked ─────────────────────────────────────────────────────────

const isIos = () => typeof navigator !== "undefined" && /iPhone|iPad|iPod/i.test(navigator.userAgent);

/** What to do for each way the camera can fail, in the words people see. */
export function cameraHelp(kind: CameraErrorKind, ios = isIos()): { title: string; body: string; steps: string[] } {
  switch (kind) {
    case "blocked":
      return {
        title: "Vibe can't use your camera",
        body: "Camera and microphone are turned off for Vibe in this browser. Turn them back on to start matching — it takes a few seconds.",
        steps: ios
          ? ["Open Settings on your iPhone", "Tap Safari → Camera, then Microphone", "Choose Allow, come back and tap Try again"]
          : ["Tap the lock or camera icon next to the web address", "Set Camera and Microphone to Allow", "Tap Try again below"],
      };
    case "missing":
      return {
        title: "No camera found",
        body: "We couldn't find a camera on this device. Plug one in, or open Vibe on your phone.",
        steps: ["Connect a camera (or use your phone)", "Tap Try again below"],
      };
    case "busy":
      return {
        title: "Your camera is busy",
        body: "Another app is using your camera right now — a video call, Zoom, or another tab.",
        steps: ["Close the other app or tab using the camera", "Tap Try again below"],
      };
    case "insecure":
      return {
        title: "Camera needs a secure page",
        body: "Browsers only allow the camera on secure (https) pages. Open Vibe from its normal address.",
        steps: ["Open vibe.fawadiqbal.dev (with https)", "Tap Try again"],
      };
    default:
      return {
        title: "Your camera didn't start",
        body: "Something stopped the camera from starting. Trying again usually fixes it.",
        steps: ["Close other apps that might use the camera", "Tap Try again below"],
      };
  }
}

/** Resolves true when the person wants to try the camera again. */
export const openCameraBlocked = (kind: CameraErrorKind) => openSheet<boolean>((close) => <CameraBlockedSheet kind={kind} onClose={close} />);

function CameraBlockedSheet({ kind, onClose }: { kind: CameraErrorKind; onClose: (retry?: boolean) => void }) {
  const help = cameraHelp(kind);
  return (
    <div className="flex flex-col px-5 pt-2.5 pb-5">
      <div className="flex gap-2.5">
        <span className="flex size-12 items-center justify-center rounded-[16px] bg-bad/14 text-bad">
          <Icon name="videocam_off" size={24} />
        </span>
        <span className="flex size-12 items-center justify-center rounded-[16px] bg-bad/14 text-bad">
          <Icon name="mic_off" size={24} />
        </span>
      </div>
      <h2 className="type-title-lg mt-4 text-[22px] leading-[1.2]">{help.title}</h2>
      <p className="type-body mt-1.5 text-[14px] leading-[1.5] text-text2">{help.body}</p>
      <ol className="mt-4 flex flex-col gap-2">
        {help.steps.map((s, i) => (
          <li key={s} className="flex items-center gap-3 rounded-[16px] bg-surface2 px-3.5 py-3">
            <span className="type-label flex size-[26px] shrink-0 items-center justify-center rounded-full bg-violet text-[13px] font-bold text-white">{i + 1}</span>
            <span className="type-body text-[14px]">{s}</span>
          </li>
        ))}
      </ol>
      <GradientButton label="Try again" icon="refresh" className="mt-5" onClick={() => onClose(true)} />
      <TextButton className="mt-1.5 w-full text-text2" onClick={() => onClose(false)}>
        Not now
      </TextButton>
      <p className="type-body mt-1 text-center text-[12.5px] text-text2">Nothing is recorded. Your video goes only to the person you talk to.</p>
    </div>
  );
}

// ── A filter you can't afford ─────────────────────────────────────────────

export type FilterCoinsChoice = "store" | "ad" | "vip" | "anyone";

/** "This filter costs N coins": get coins, watch a video, VIP, or match with anyone for free. */
export const openFilterCoins = (o: { cost: number; coins: number; filterLabel: string }) =>
  openSheet<FilterCoinsChoice>((close) => <FilterCoinsSheet {...o} onPick={close} />);

function FilterCoinsSheet({ cost, coins, filterLabel, onPick }: { cost: number; coins: number; filterLabel: string; onPick: (c?: FilterCoinsChoice) => void }) {
  const row = (choice: FilterCoinsChoice, icon: string, iconCls: string, title: string, sub?: string, highlight = false) => (
    <button
      type="button"
      onClick={() => onPick(choice)}
      className={cn(
        "flex min-h-14 w-full items-center gap-3 rounded-[18px] px-4 py-2.5 text-left transition-colors",
        highlight ? "border border-gold/45 bg-gold/10 hover:bg-gold/14" : "border border-white/10 bg-surface2 hover:bg-surface3",
      )}
    >
      <Icon name={icon} size={20} variant="filled" className={iconCls} />
      <span className="min-w-0 flex-1">
        <span className="type-title block text-[15px] font-semibold">{title}</span>
        {sub ? <span className="type-body block text-[12px] text-text2">{sub}</span> : null}
      </span>
      <Icon name="chevron_right" size={18} className="text-text2" />
    </button>
  );
  return (
    <div className="flex flex-col px-5 pt-2.5 pb-5">
      <div className="flex items-center gap-2">
        <span className="type-label flex h-[30px] items-center rounded-full bg-pink/16 px-3 text-[13px] font-bold text-pink-soft">{filterLabel}</span>
        <span className="flex-1" />
        <span className="type-label flex h-[30px] items-center gap-1 rounded-full bg-gold/12 px-3 text-[13px] font-bold text-gold">
          You have <CoinAmount amount={coins} size={13} />
        </span>
      </div>
      <Headline as="h2" text="This filter costs " accent={`${cost} coins`} accentColor="gold" size={24} className="mt-3.5" />
      <p className="type-body mt-1.5 text-[14px] leading-[1.5] text-text2">You only pay when you&apos;re matched. Matching with anyone is always free.</p>
      <div className="mt-4 flex flex-col gap-2">
        {row("store", "monetization_on", "text-gold", "Get coins", undefined, true)}
        {rewardedAds.available ? row("ad", "smart_display", "text-lavender", "Watch a short video for free coins") : null}
        {row("vip", "workspace_premium", "text-gold", "VIP — every filter free", "Plus unlimited likes in Discover")}
      </div>
      <GradientButton label="Match with anyone — free" className="mt-4" onClick={() => onPick("anyone")} />
    </div>
  );
}

// ── Skipping too fast ─────────────────────────────────────────────────────

export type CooldownChoice = "next" | "pay";

/**
 * "Take a breath": a countdown, a tip, and paying to skip it. Reaching zero
 * resolves "next" by itself (they asked for the next person).
 */
export const openCooldown = (o: { until: number; bypassCost: number; skipped: number }) =>
  openSheet<CooldownChoice>((close) => <CooldownSheet {...o} onPick={close} />);

const RING = 2 * Math.PI * 52;

function CooldownSheet({ until, bypassCost, skipped, onPick }: { until: number; bypassCost: number; skipped: number; onPick: (c?: CooldownChoice) => void }) {
  const now = useNow(250);
  const [total] = useState(() => Math.max(1, Math.ceil((until - Date.now()) / 1000)));
  const left = Math.max(0, Math.ceil((until - now) / 1000));
  const done = useRef(false);
  useEffect(() => {
    if (left === 0 && !done.current) {
      done.current = true;
      onPick("next");
    }
  }, [left, onPick]);
  return (
    <div className="flex flex-col items-center px-5 pt-3 pb-5 text-center">
      <div className="relative size-[124px]" role="timer" aria-label={`${left} seconds`}>
        <svg width="124" height="124" viewBox="0 0 124 124" aria-hidden="true">
          <circle cx="62" cy="62" r="52" fill="none" stroke="var(--color-surface2)" strokeWidth="9" />
          <circle
            cx="62"
            cy="62"
            r="52"
            fill="none"
            stroke="var(--color-gold)"
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={RING}
            strokeDashoffset={RING * (1 - left / total)}
            transform="rotate(-90 62 62)"
            className="transition-[stroke-dashoffset] duration-300"
          />
        </svg>
        <span className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="type-number-lg text-[38px] leading-none">{left}</span>
          <span className="type-label mt-0.5 text-[11px] text-text2">seconds</span>
        </span>
      </div>
      <Headline as="h2" text="Take a " accent="breath" accentColor="gold" size={26} align="center" className="mt-4" />
      <p className="type-body mt-1.5 max-w-[320px] text-[14px] leading-[1.5] text-text2">
        You skipped {skipped} people in a row. We&apos;ll find the next one in a moment.
      </p>
      <p className="type-body mt-4 flex w-full items-start gap-3 rounded-[18px] bg-surface2 px-4 py-3 text-left text-[13.5px] leading-[1.5]">
        <Icon name="lightbulb" size={20} className="mt-px shrink-0 text-lavender" />
        Give the next person 10 seconds — say hi and ask one question. A real hello is how likes and friends start.
      </p>
      <div className="mt-5 flex w-full flex-col gap-2">
        <GhostButton
          label="Skip the wait"
          icon="bolt"
          expand
          onClick={() => onPick("pay")}
          trailing={
            <span className="flex h-[22px] items-center rounded-[11px] bg-gold/14 px-2">
              <CoinAmount amount={bypassCost} size={12} />
            </span>
          }
        />
        <TextButton className="w-full text-text2" onClick={() => onPick()}>
          Keep talking
        </TextButton>
      </div>
    </div>
  );
}
