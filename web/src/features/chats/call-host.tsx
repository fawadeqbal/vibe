"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import { type IncomingCall, type OutgoingCall, useCalls } from "@/stores/calls";
import { useMatch } from "@/stores/match";

const QUICK_REPLIES = ["Can't talk now", "Call me in 10 min", "Text me instead"];

/**
 * Friend calls, wherever you are in the app: the incoming ring (full screen
 * on phones, a card in the corner on wide screens), your own "Calling…"
 * screen, and the hand-off to the call screen and back to the chat.
 */
export function CallHost() {
  const router = useRouter();
  const path = usePathname();
  const incoming = useCalls((s) => s.incoming);
  const outgoing = useCalls((s) => s.outgoing);
  const inFriendCall = useMatch((s) => s.status === "connected" && s.friendCall);
  const ended = useMatch((s) => s.friendCallEnded);

  // Picked up: the call screen.
  useEffect(() => {
    if (inFriendCall && path !== "/match") router.push("/match");
  }, [inFriendCall, path, router]);

  // Hung up: back to the chat.
  useEffect(() => {
    if (!ended) return;
    useMatch.setState({ friendCallEnded: null });
    router.push(`/chats/${ended.friendId}`);
  }, [ended, router]);

  // A call ringing before the app opened (from a push).
  useEffect(() => {
    void useCalls.getState().checkIncoming();
  }, []);

  return (
    <>
      {outgoing ? <Outgoing c={outgoing} /> : null}
      {incoming ? <Incoming key={incoming.callId} c={incoming} /> : null}
    </>
  );
}

/** A soft two-tone ring while a call comes in (silent if the browser blocks sound). */
function useRing(on: boolean) {
  useEffect(() => {
    if (!on || typeof window === "undefined") return;
    let ctx: AudioContext | null = null;
    try {
      ctx = new AudioContext();
    } catch {
      return;
    }
    const beep = () => {
      if (!ctx || ctx.state === "closed") return;
      for (const [f, at] of [
        [880, 0],
        [660, 0.18],
      ] as const) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, ctx.currentTime + at);
        g.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + at + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.16);
        o.connect(g).connect(ctx.destination);
        o.start(ctx.currentTime + at);
        o.stop(ctx.currentTime + at + 0.18);
      }
    };
    beep();
    const t = setInterval(beep, 1600);
    return () => {
      clearInterval(t);
      void ctx?.close();
    };
  }, [on]);
}

function Incoming({ c }: { c: IncomingCall }) {
  const [left, setLeft] = useState(() => Math.max(0, Math.round((c.expiresAt.getTime() - Date.now()) / 1000)));
  useRing(true);
  useEffect(() => {
    const t = setInterval(() => setLeft(Math.max(0, Math.round((c.expiresAt.getTime() - Date.now()) / 1000))), 500);
    return () => clearInterval(t);
  }, [c.expiresAt]);
  const first = c.from.name.split(" ")[0] || "A friend";
  const calls = useCalls.getState();

  return (
    <div className="fixed inset-0 z-[80] lg:pointer-events-none lg:inset-auto lg:top-5 lg:right-5">
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="incoming-title"
        className={cn(
          "pointer-events-auto flex h-full flex-col items-center bg-[radial-gradient(circle_at_50%_28%,#6b3a7a_0%,#2b1b4d_45%,var(--color-bg)_85%)] px-6 pt-[calc(56px+env(safe-area-inset-top))] pb-[calc(24px+env(safe-area-inset-bottom))]",
          "lg:h-auto lg:w-[360px] lg:rounded-[24px] lg:border lg:border-violet/45 lg:bg-none lg:bg-surface lg:p-5 lg:shadow-[0_24px_60px_rgb(0_0_0/0.55)]",
        )}
        style={{ animation: "vibe-dialog-in 200ms ease-out" }}
      >
        <p className="type-overline text-[#e0d6f5] lg:hidden">Vibe · {c.media === "voice" ? "voice" : "video"} call</p>
        <div className="mt-10 lg:mt-0 lg:flex lg:w-full lg:items-center lg:gap-3">
          <span className="relative inline-flex">
            <span aria-hidden className="absolute -inset-3 animate-ping rounded-full border-2 border-pink-soft/40 lg:hidden" />
            <span className="lg:hidden">
              <Avatar url={c.from.avatarUrl} name={c.from.name} size={160} />
            </span>
            <span className="hidden lg:inline-flex">
              <Avatar url={c.from.avatarUrl} name={c.from.name} size={52} />
            </span>
          </span>
          <div className="mt-8 text-center lg:mt-0 lg:text-left">
            <h2 id="incoming-title" className="type-display text-[32px] lg:type-title lg:text-[16px] lg:font-semibold">
              <span className="lg:hidden">{first}</span>
              <span className="hidden lg:inline">{first} is calling</span>
            </h2>
            <p className="type-body mt-1 text-[15px] text-[#d8cfe8] lg:mt-0.5 lg:text-[13px] lg:text-muted">
              <span className="lg:hidden">{c.media === "voice" ? "wants to voice call you" : "wants to video call you"}</span>
              <span className="hidden lg:inline">{c.media === "voice" ? "Voice" : "Video"} call · {left}s</span>
            </p>
          </div>
        </div>

        <div className="flex-1 lg:hidden" />
        <div role="group" aria-label="Quick replies" className="flex flex-wrap justify-center gap-2 lg:mt-3 lg:justify-start">
          {QUICK_REPLIES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => void calls.decline(r)}
              className="type-label h-9 rounded-full border border-white/18 bg-black/30 px-3.5 text-[13px] font-semibold text-text hover:bg-black/45 lg:h-8 lg:bg-white/6 lg:text-[12px]"
            >
              {r}
            </button>
          ))}
        </div>
        <div className="mt-8 flex w-full justify-around lg:mt-4 lg:grid lg:grid-cols-2 lg:gap-2">
          <button
            type="button"
            onClick={() => void calls.decline()}
            aria-label="Decline"
            className="flex flex-col items-center gap-2 lg:flex-row lg:justify-center lg:rounded-full lg:bg-bad-deep lg:py-2.5"
          >
            <span className="flex size-[76px] items-center justify-center rounded-full bg-bad-deep text-white shadow-[0_12px_30px_rgb(225_29_72/0.35)] lg:size-auto lg:bg-transparent lg:shadow-none">
              <Icon name="call_end" size={32} className="lg:!text-[20px]" />
            </span>
            <span className="type-label text-[13px] font-semibold text-[#e0d6f5] lg:text-white">Decline</span>
          </button>
          <button
            type="button"
            onClick={() => void calls.accept()}
            aria-label={c.media === "voice" ? "Accept voice call" : "Accept video call"}
            className="flex flex-col items-center gap-2 lg:flex-row lg:justify-center lg:rounded-full lg:bg-ok lg:py-2.5"
          >
            <span className="flex size-[76px] items-center justify-center rounded-full bg-ok text-bg shadow-[0_12px_30px_rgb(52_211_153/0.4)] lg:size-auto lg:bg-transparent lg:shadow-none">
              <Icon name={c.media === "voice" ? "call" : "videocam"} size={32} className="lg:!text-[20px]" />
            </span>
            <span className="type-label text-[13px] font-semibold text-[#e0d6f5] lg:text-bg">Accept</span>
          </button>
        </div>
        <p className="type-body mt-5 text-center text-[12px] text-[#b3a9c9] lg:hidden">
          Rings for {left}s more. Not answered, it shows as a missed call in your chat.
        </p>
      </section>
    </div>
  );
}

const OUTCOME: Record<Exclude<OutgoingCall["status"], "ringing">, { title: string; body: (name: string, c: OutgoingCall) => string }> = {
  declined: {
    title: "Not available right now",
    body: (n, c) => (c.reply ? `${n}: "${c.reply}"` : `${n} can't talk now. Send a message instead — calls are still allowed.`),
  },
  no_answer: { title: "No answer", body: (n) => `${n} didn't pick up. It shows as a missed call in your chat.` },
  busy: { title: "In another call", body: (n) => `${n} is busy right now. Try again in a little while.` },
  paused: { title: "Can't call right now", body: () => "They declined a few calls in a row. Try a message instead." },
  error: { title: "Couldn't call", body: (_n, c) => c.message ?? "Something went wrong. Try again." },
};

function Outgoing({ c }: { c: OutgoingCall }) {
  const router = useRouter();
  const first = c.to.name.split(" ")[0] || "your friend";
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (c.status !== "ringing") return;
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [c.status]);
  const done = c.status === "ringing" ? null : OUTCOME[c.status];
  const close = () => useCalls.getState().dismissOutgoing();

  return (
    <div
      className="fixed inset-0 z-[78] flex flex-col items-center bg-[linear-gradient(180deg,#2a2a3a_0%,#17151f_60%,var(--color-bg)_100%)] px-6 pt-[calc(96px+env(safe-area-inset-top))] pb-[calc(32px+env(safe-area-inset-bottom))]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="calling-title"
    >
      <Avatar url={c.to.avatarUrl} name={c.to.name} size={112} />
      <h2 id="calling-title" className="type-display mt-5 text-[30px]">
        {first}
      </h2>
      <p role="status" className="type-body mt-1.5 text-[15px] text-[#d8cfe8]">
        {done ? done.title : `${c.media === "voice" ? "Voice call" : "Video call"} · Calling… ${secs}s`}
      </p>
      {done ? (
        <p className="type-body mt-4 max-w-[340px] rounded-[16px] bg-black/40 px-4 py-3 text-center text-[13.5px] leading-[1.45] text-text">
          {done.body(first, c)}
        </p>
      ) : null}
      <div className="flex-1" />
      {done ? (
        <div className="flex w-full max-w-[340px] flex-col gap-2.5">
          <button
            type="button"
            onClick={() => {
              close();
              router.push(`/chats/${c.to.id}`);
            }}
            className="bg-brand type-title h-[54px] rounded-full text-[15px] font-semibold text-white"
          >
            Send a message
          </button>
          <button
            type="button"
            onClick={close}
            className="type-title h-[50px] rounded-full border border-white/12 bg-white/6 text-[15px] font-semibold text-text"
          >
            Close
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => void useCalls.getState().cancel()} aria-label="Cancel call" className="flex flex-col items-center gap-2">
          <span className="flex size-[68px] items-center justify-center rounded-full bg-bad-deep text-white shadow-[0_10px_26px_rgb(225_29_72/0.35)] hover:brightness-110">
            <Icon name="call_end" size={30} />
          </span>
          <span className="type-label text-[12.5px] text-muted">Cancel</span>
        </button>
      )}
    </div>
  );
}
