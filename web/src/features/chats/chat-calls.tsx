"use client";

import { useEffect, useState } from "react";

import { confirm } from "@/components/shared/dialogs";
import { Icon } from "@/components/ui/icon";
import type { MenuItem } from "@/components/ui/menu";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/cn";
import type { Friend } from "@/lib/models";
import { type CallState, useCalls } from "@/stores/calls";
import { useCatalog } from "@/stores/catalog";
import { toast } from "@/stores/ui";

/** The server's view of calls in this chat (re-read when the chat opens and on every change). */
export function useCallState(friendId: string): CallState | null {
  const st = useCalls((s) => s.states[friendId] ?? null);
  useEffect(() => {
    void useCalls.getState().loadState(friendId);
  }, [friendId]);
  return st;
}

const firstName = (f: Friend) => f.profile.name.split(" ")[0] || "them";

async function ask(f: Friend) {
  try {
    const st = await useCalls.getState().allow(f.profile.id);
    toast(st.on ? "Video calls are on" : `Asked ${firstName(f)} to allow video calls`);
  } catch (e) {
    if (e instanceof ApiError && e.code === "CALL_NEEDS_MESSAGES")
      toast("Say hi first — you both need to have written before asking for calls", { error: true });
    else toast(errorMessage(e), { error: true });
  }
}

async function turnOff(f: Friend, st: CallState | null) {
  const on = f.calls.mine && f.calls.theirs;
  if (on) {
    const ok = await confirm({
      title: "Turn off video calls?",
      body: `Neither of you will be able to call until you both allow it again. ${firstName(f)} won't be told it was you.`,
      ok: "Turn off",
      okTone: "bad",
    });
    if (!ok) return;
  }
  try {
    await useCalls.getState().turnOff(f.profile.id);
    toast(on ? "Video calls turned off" : st?.theirs && !st.mine ? "OK — not now" : "Request taken back");
  } catch (e) {
    toast(errorMessage(e), { error: true });
  }
}

/** The camera in the chat header: calls when both allowed, otherwise asks. */
export function CallButton({ f, state }: { f: Friend; state: CallState | null }) {
  const enabled = useCatalog((s) => s.economy.friendCallsEnabled !== 0);
  if (!enabled) return null;
  const on = f.calls.mine && f.calls.theirs;
  if (on)
    return (
      <button
        type="button"
        aria-label={`Video call ${f.profile.name}`}
        title="Video call"
        onClick={() => void useCalls.getState().ring(f.profile)}
        className="bg-brand flex size-10 items-center justify-center rounded-full text-white shadow-[0_8px_20px_rgb(255_61_143/0.3)] hover:brightness-110"
      >
        <Icon name="videocam" size={21} />
      </button>
    );
  const label = f.calls.mine
    ? "Waiting for them to allow video calls"
    : f.calls.theirs
      ? `${firstName(f)} asked to allow video calls`
      : "Video calls are off — ask to allow them";
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => (f.calls.theirs && !f.calls.mine ? void ask(f) : !f.calls.mine && state?.canAsk !== false ? void ask(f) : toast(label))}
      className={cn(
        "relative flex size-10 items-center justify-center rounded-full border border-white/12 text-muted hover:text-text",
        f.calls.theirs && !f.calls.mine && "border-violet/50 text-lavender",
      )}
    >
      <Icon name="videocam_off" size={20} />
      {f.calls.theirs && !f.calls.mine ? <span className="absolute top-1 right-1 size-2 rounded-full bg-pink" /> : null}
    </button>
  );
}

/** The chat menu row: allow / take back / turn off. */
export function callsMenuItem(f: Friend, state: CallState | null): MenuItem {
  const on = f.calls.mine && f.calls.theirs;
  if (on) return { label: "Turn off video calls", tone: "bad", onSelect: () => void turnOff(f, state) };
  if (f.calls.mine) return { label: "Take back video call request", onSelect: () => void turnOff(f, state) };
  return { label: f.calls.theirs ? "Allow video calls" : "Ask to allow video calls", onSelect: () => void ask(f) };
}

/**
 * Above the composer: what's going on with calls in this chat. Off → how it
 * works and a button to ask; they asked → Allow / Not now; you asked →
 * waiting, with take back. Nothing when calls are on.
 */
export function CallsCard({ f, state }: { f: Friend; state: CallState | null }) {
  const enabled = useCatalog((s) => s.economy.friendCallsEnabled !== 0);
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(false);
  const on = f.calls.mine && f.calls.theirs;
  if (!enabled || on || hidden) return null;
  const run = (fn: () => Promise<void>) => async () => {
    setBusy(true);
    await fn();
    setBusy(false);
  };
  const first = firstName(f);

  if (f.calls.theirs && !f.calls.mine) {
    return (
      <section aria-label={`${first} asked to allow video calls`} className="mx-3 mb-1 rounded-[20px] border border-violet/45 bg-surface p-3.5">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-violet/20 text-lavender">
            <Icon name="videocam" size={20} />
          </span>
          <span className="min-w-0">
            <span className="type-title block text-[15px] font-semibold">{first} wants to allow video calls</span>
            <span className="type-body block text-[12px] leading-[1.4] text-muted">
              Say yes and you can call each other from here. Either of you can turn it off any time.
            </span>
          </span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={run(() => turnOff(f, state))}
            className="type-title h-10 rounded-full border border-white/12 bg-white/6 text-[14px] font-semibold text-text hover:bg-white/10"
          >
            Not now
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={run(() => ask(f))}
            className="type-title h-10 rounded-full bg-ok text-[14px] font-bold text-bg hover:brightness-105"
          >
            Allow calls
          </button>
        </div>
      </section>
    );
  }

  if (f.calls.mine) {
    return (
      <div className="mx-3 mb-1 flex items-center gap-3 rounded-[18px] border border-pink/30 bg-surface2 px-3.5 py-2.5">
        <span className="size-2 shrink-0 rounded-full bg-pink" />
        <span className="type-body min-w-0 flex-1 text-[12.5px] text-text2">You asked to allow video calls. Waiting for {first}.</span>
        <button
          type="button"
          disabled={busy}
          onClick={run(() => turnOff(f, state))}
          className="type-label h-8 shrink-0 rounded-full border border-white/14 px-3 text-[12px] font-semibold text-text hover:bg-white/6"
        >
          Take back
        </button>
      </div>
    );
  }

  const blocked = state?.askBlockedBy;
  return (
    <div className="mx-3 mb-1 flex items-center gap-3 rounded-[18px] border border-dashed border-white/14 bg-bg2 px-3.5 py-2.5">
      <Icon name="videocam_off" size={18} className="shrink-0 text-muted" />
      <span className="type-body min-w-0 flex-1 text-[12.5px] leading-[1.4] text-text2">
        {blocked === "messages"
          ? "Video calls unlock when you've both said something."
          : blocked === "wait" && state?.askAfter
            ? `Video calls are off. You can ask again ${state.askAfter.toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })}.`
            : "Video calls are off. You both need to allow them."}
      </span>
      {!blocked ? (
        <button
          type="button"
          disabled={busy}
          onClick={run(() => ask(f))}
          className="type-label h-8 shrink-0 rounded-full bg-violet/24 px-3 text-[12px] font-semibold text-lavender hover:bg-violet/32"
        >
          Ask
        </button>
      ) : null}
      <button type="button" aria-label="Hide" onClick={() => setHidden(true)} className="shrink-0 text-muted hover:text-text">
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}
