"use client";

import { useEffect, useState } from "react";

import { confirm } from "@/components/shared/dialogs";
import { GradientButton, TextButton } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import type { MenuItem } from "@/components/ui/menu";
import { Headline } from "@/components/ui/typography";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/cn";
import type { Friend } from "@/lib/models";
import { type CallState, useCalls } from "@/stores/calls";
import { useCatalog } from "@/stores/catalog";
import { openSheet, toast } from "@/stores/ui";

/** The server's view of calls in this chat (re-read when the chat opens and on every change). */
export function useCallState(friendId: string): CallState | null {
  const st = useCalls((s) => s.states[friendId] ?? null);
  useEffect(() => {
    void useCalls.getState().loadState(friendId);
  }, [friendId]);
  return st;
}

const firstName = (f: Friend) => f.profile.name.split(" ")[0] || "them";
const callsOn = (f: Friend) => f.calls.mine && f.calls.theirs;
const videoOn = (f: Friend) => callsOn(f) && f.calls.mineVideo && f.calls.theirsVideo;

/** Ask (or answer, or change your level): `video` false = voice calls only. */
async function allow(f: Friend, video: boolean) {
  try {
    const st = await useCalls.getState().allow(f.profile.id, video);
    toast(st.video ? "Voice and video calls are on" : st.on ? "Voice calls are on" : `Asked ${firstName(f)} to allow ${video ? "voice and video" : "voice"} calls`);
  } catch (e) {
    if (e instanceof ApiError && e.code === "CALL_NEEDS_MESSAGES") toast("Say hi first — you both need to have written before asking for calls", { error: true });
    else toast(errorMessage(e), { error: true });
  }
}

async function turnOff(f: Friend, st: CallState | null) {
  const on = callsOn(f);
  if (on) {
    const ok = await confirm({
      title: "Turn off calls?",
      body: `Neither of you will be able to call until you both allow it again. ${firstName(f)} won't be told it was you.`,
      ok: "Turn off",
      okTone: "bad",
    });
    if (!ok) return;
  }
  try {
    await useCalls.getState().turnOff(f.profile.id);
    toast(on ? "Calls turned off" : st?.theirs && !st.mine ? "OK — not now" : "Request taken back");
  } catch (e) {
    toast(errorMessage(e), { error: true });
  }
}

/** "Talk to X live": pick voice only or voice and video, then ask. */
export const openAskCalls = (f: Friend) => openSheet<void>((close) => <AskCallsSheet f={f} onDone={() => close()} />);

function AskCallsSheet({ f, onDone }: { f: Friend; onDone: () => void }) {
  const [video, setVideo] = useState(true);
  const [busy, setBusy] = useState(false);
  const first = firstName(f);
  const option = (on: boolean, value: boolean, icon: string, title: string, body: string, tint: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={() => setVideo(value)}
      className={cn("flex w-full items-center gap-3 rounded-[20px] p-3.5 text-left transition-colors", on ? "border-[1.5px] border-pink bg-surface2" : "border border-line bg-surface hover:bg-surface2")}
    >
      <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-[16px]", tint)}>
        <Icon name={icon} size={22} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="type-title block text-[15px] font-semibold">{title}</span>
        <span className="type-body mt-0.5 block text-[12.5px] leading-[1.4] text-muted">{body}</span>
      </span>
      <span className={cn("size-[22px] shrink-0 rounded-full", on ? "border-[7px] border-pink bg-white" : "border-2 border-white/25")} />
    </button>
  );
  return (
    <div className="flex flex-col px-5 pt-2.5 pb-5">
      <Headline as="h2" text={`Talk to ${first} `} accent="live" size={24} />
      <p className="type-body mt-1.5 text-[13.5px] leading-[1.5] text-text2">
        Calls only work after you both say yes. Pick what you&apos;re comfortable with — {first} picks too, and the chat uses whichever is less.
      </p>
      <div role="radiogroup" aria-label="What to allow" className="mt-4 flex flex-col gap-2.5">
        {option(!video, false, "call", "Voice calls", "Just talk — no camera. Good for a first call.", "bg-info/16 text-info")}
        {option(video, true, "videocam", "Voice and video calls", "See each other. You can still start with voice and switch.", "bg-pink/16 text-pink-soft")}
      </div>
      <p className="type-body mt-3.5 flex items-start gap-2 rounded-[14px] bg-ok/8 px-3 py-2.5 text-[12.5px] leading-[1.45] text-ok">
        <Icon name="shield" size={16} className="mt-px shrink-0" />
        Either of you can lower it to voice, or turn calls off, at any time. Calls are never recorded.
      </p>
      <GradientButton
        label={busy ? "Asking…" : video ? "Ask to allow voice and video" : "Ask to allow voice calls"}
        className="mt-4"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await allow(f, video);
          setBusy(false);
          onDone();
        }}
      />
      <TextButton className="mt-1.5 w-full text-text2" onClick={onDone}>
        Not now
      </TextButton>
    </div>
  );
}

/** The phone and camera in the chat header: call when allowed, otherwise ask. */
export function CallButtons({ f, state }: { f: Friend; state: CallState | null }) {
  const enabled = useCatalog((s) => s.economy.friendCallsEnabled !== 0);
  if (!enabled) return null;
  if (callsOn(f))
    return (
      <span className="flex items-center gap-1.5">
        <button
          type="button"
          aria-label={`Voice call ${f.profile.name}`}
          title="Voice call"
          onClick={() => void useCalls.getState().ring(f.profile, "voice")}
          className="flex size-10 items-center justify-center rounded-full border border-white/12 bg-white/6 text-text hover:bg-white/12"
        >
          <Icon name="call" size={20} />
        </button>
        {videoOn(f) ? (
          <button
            type="button"
            aria-label={`Video call ${f.profile.name}`}
            title="Video call"
            onClick={() => void useCalls.getState().ring(f.profile, "video")}
            className="bg-brand flex size-10 items-center justify-center rounded-full text-white shadow-[0_8px_20px_rgb(255_61_143/0.3)] hover:brightness-110"
          >
            <Icon name="videocam" size={21} />
          </button>
        ) : null}
      </span>
    );
  const label = f.calls.mine ? `Waiting for ${firstName(f)} to allow calls` : f.calls.theirs ? `${firstName(f)} wants to call` : "Calls are off — ask to allow them";
  const theyAsked = f.calls.theirs && !f.calls.mine;
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => (theyAsked ? toast(`${firstName(f)} asked — answer in the card below`) : !f.calls.mine && state?.canAsk !== false ? void openAskCalls(f) : toast(label))}
      className={cn("relative flex size-10 items-center justify-center rounded-full border border-white/12 text-muted hover:text-text", theyAsked && "border-violet/50 text-lavender")}
    >
      <Icon name="phone_disabled" size={20} />
      {theyAsked ? <span className="absolute top-1 right-1 size-2 rounded-full bg-pink" /> : null}
    </button>
  );
}

/** The chat menu rows: ask / take back / voice only / allow video / turn off. */
export function callsMenuItems(f: Friend, state: CallState | null): MenuItem[] {
  if (callsOn(f)) {
    return [
      f.calls.mineVideo
        ? { label: "Voice calls only (no video)", onSelect: () => void allow(f, false) }
        : { label: f.calls.theirsVideo ? "Allow video too" : "Ask to allow video too", onSelect: () => void allow(f, true) },
      { label: "Turn off calls", tone: "bad", onSelect: () => void turnOff(f, state) },
    ];
  }
  if (f.calls.mine) return [{ label: "Take back call request", onSelect: () => void turnOff(f, state) }];
  return [{ label: f.calls.theirs ? "Answer call request…" : "Ask to allow calls", onSelect: () => (f.calls.theirs ? toast("Answer in the card above the message box") : void openAskCalls(f)) }];
}

/**
 * Above the composer: what's going on with calls in this chat. Off → a line
 * and Ask; they asked → Allow voice and video / Voice only / Not now; you
 * asked → waiting, with take back; on with voice only and they'd like video
 * → Allow video. Nothing otherwise.
 */
export function CallsCard({ f, state }: { f: Friend; state: CallState | null }) {
  const enabled = useCatalog((s) => s.economy.friendCallsEnabled !== 0);
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(false);
  if (!enabled || hidden) return null;
  const run = (fn: () => Promise<void>) => async () => {
    setBusy(true);
    await fn();
    setBusy(false);
  };
  const first = firstName(f);
  const pill = "type-title h-10 rounded-full text-[13.5px] font-semibold";

  // On, you're voice only and they'd like video.
  if (callsOn(f)) {
    if (f.calls.theirsVideo && !f.calls.mineVideo && state?.mineVideo === false) {
      return (
        <div className="mx-3 mb-1 flex items-center gap-3 rounded-[18px] border border-violet/35 bg-surface px-3.5 py-2.5">
          <Icon name="videocam" size={18} className="shrink-0 text-lavender" />
          <span className="type-body min-w-0 flex-1 text-[12.5px] text-text2">{first} would like video calls too.</span>
          <button type="button" disabled={busy} onClick={run(() => allow(f, true))} className="type-label h-8 shrink-0 rounded-full bg-ok px-3 text-[12px] font-bold text-bg">
            Allow video
          </button>
          <button type="button" aria-label="Keep voice only" onClick={() => setHidden(true)} className="shrink-0 text-muted hover:text-text">
            <Icon name="close" size={16} />
          </button>
        </div>
      );
    }
    return null;
  }

  if (f.calls.theirs && !f.calls.mine) {
    const askedVideo = f.calls.theirsVideo;
    return (
      <section aria-label={`${first} wants to call`} className="mx-3 mb-1 rounded-[20px] border border-violet/45 bg-surface p-3.5">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-violet/20 text-lavender">
            <Icon name="call" size={20} />
          </span>
          <span className="min-w-0">
            <span className="type-title block text-[15px] font-semibold">{first} wants to call</span>
            <span className="type-body block text-[12px] leading-[1.4] text-muted">
              {askedVideo ? "They asked for voice and video. Allow what you're comfortable with." : "Voice calls only. Either of you can turn it off any time."}
            </span>
          </span>
        </div>
        <div className="mt-3 flex flex-col gap-2">
          {askedVideo ? (
            <>
              <button type="button" disabled={busy} onClick={run(() => allow(f, true))} className={cn(pill, "flex items-center justify-center gap-2 bg-ok font-bold text-bg hover:brightness-105")}>
                <Icon name="videocam" size={18} /> Allow voice and video
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" disabled={busy} onClick={run(() => allow(f, false))} className={cn(pill, "border border-info/40 bg-info/10 text-info")}>
                  Voice only
                </button>
                <button type="button" disabled={busy} onClick={run(() => turnOff(f, state))} className={cn(pill, "border border-white/12 bg-white/6 text-text hover:bg-white/10")}>
                  Not now
                </button>
              </div>
            </>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <button type="button" disabled={busy} onClick={run(() => turnOff(f, state))} className={cn(pill, "border border-white/12 bg-white/6 text-text hover:bg-white/10")}>
                Not now
              </button>
              <button type="button" disabled={busy} onClick={run(() => allow(f, false))} className={cn(pill, "bg-ok font-bold text-bg hover:brightness-105")}>
                Allow voice calls
              </button>
            </div>
          )}
        </div>
      </section>
    );
  }

  if (f.calls.mine) {
    return (
      <div className="mx-3 mb-1 flex items-center gap-3 rounded-[18px] border border-pink/30 bg-surface2 px-3.5 py-2.5">
        <span className="size-2 shrink-0 rounded-full bg-pink" />
        <span className="type-body min-w-0 flex-1 text-[12.5px] text-text2">
          You asked to allow {f.calls.mineVideo ? "voice and video" : "voice"} calls. Waiting for {first}.
        </span>
        <button type="button" disabled={busy} onClick={run(() => turnOff(f, state))} className="type-label h-8 shrink-0 rounded-full border border-white/14 px-3 text-[12px] font-semibold text-text hover:bg-white/6">
          Take back
        </button>
      </div>
    );
  }

  const blocked = state?.askBlockedBy;
  return (
    <div className="mx-3 mb-1 flex items-center gap-3 rounded-[18px] border border-dashed border-white/14 bg-bg2 px-3.5 py-2.5">
      <Icon name="phone_disabled" size={18} className="shrink-0 text-muted" />
      <span className="type-body min-w-0 flex-1 text-[12.5px] leading-[1.4] text-text2">
        {blocked === "messages"
          ? "Calls unlock when you've both said something."
          : blocked === "wait" && state?.askAfter
            ? `Calls are off. You can ask again ${state.askAfter.toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })}.`
            : "Calls are off. You both need to allow them."}
      </span>
      {!blocked ? (
        <button type="button" disabled={busy} onClick={() => void openAskCalls(f)} className="type-label h-8 shrink-0 rounded-full bg-violet/24 px-3 text-[12px] font-semibold text-lavender hover:bg-violet/32">
          Ask
        </button>
      ) : null}
      <button type="button" aria-label="Hide" onClick={() => setHidden(true)} className="shrink-0 text-muted hover:text-text">
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}
