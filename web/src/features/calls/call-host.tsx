"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { VideoView } from "@/components/shared/video-view";
import { Avatar } from "@/components/ui/avatar";
import { GhostButton, GradientButton } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import { clock } from "@/lib/format";
import type { Profile } from "@/lib/models";
import { type CallNotice, type IncomingCall, type OutgoingCall, useCalls } from "@/stores/calls";
import { useMatch } from "@/stores/match";

import { BlurredPhoto, CallCtl, CallEndCard, EndCallButton, PulseAvatar, RemoteAudio, SelfPreview } from "./call-ui";

const QUICK_REPLIES = ["Can't talk now", "Call me in 10 min", "Text me instead"];
const firstName = (p: Profile) => p.name.split(" ")[0] || p.name;

/**
 * Friend calls, wherever you are in the app: the incoming ring (a banner,
 * or full screen), your own "Calling…" screen and how it ended, the hand-off
 * to the call screen, the call shrunk to the chat, and back to the chat when it ends.
 * Separate from random matches.
 */
export function CallHost() {
  const router = useRouter();
  const path = usePathname();
  const incoming = useCalls((s) => s.incoming);
  const outgoing = useCalls((s) => s.outgoing);
  const notice = useCalls((s) => s.notice);
  const inFriendCall = useMatch((s) => s.status === "connected" && s.friendCall);
  const minimized = useMatch((s) => s.minimized);
  const ended = useMatch((s) => s.friendCallEnded);

  // In a call and not shrunk: the call screen. Shrunk and you open Match again: back to the call.
  const lastPath = useRef(path);
  useEffect(() => {
    const cameBack = path === "/match" && lastPath.current !== "/match";
    lastPath.current = path;
    if (!inFriendCall) return;
    if (minimized && cameBack) useMatch.getState().setMinimized(false);
    else if (!minimized && path !== "/match") router.push("/match");
  }, [inFriendCall, minimized, path, router]);

  // A friend call ended: straight back to the chat with them (no "Call ended" screen).
  useEffect(() => {
    if (!ended || inFriendCall) return;
    useMatch.setState({ friendCallEnded: null });
    router.push(`/chats/${ended.friendId}`);
  }, [ended, inFriendCall, router]);

  // Where your call is, when the app opens (the server keeps it; nothing rings outside the app).
  useEffect(() => {
    void useCalls.getState().reconcile();
  }, []);

  return (
    <>
      {outgoing ? <Outgoing key={`${outgoing.to.id}-${outgoing.callId ?? "new"}-${outgoing.status}`} c={outgoing} /> : null}
      {incoming ? <Incoming key={incoming.callId} c={incoming} startFull={false} /> : null}
      {notice && !incoming ? <Notice key={`${notice.callId}-${notice.kind}`} n={notice} /> : null}
      {inFriendCall && minimized ? <MiniCall /> : null}
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

// ── incoming ─────────────────────────────────────────────────────────────

/** Someone's calling: a banner over whatever you're doing; tap it for the full screen (quick replies, voice only). */
function Incoming({ c, startFull }: { c: IncomingCall; startFull: boolean }) {
  const [full, setFull] = useState(startFull);
  useRing(true);
  const calls = useCalls.getState();
  const video = c.media === "video";

  if (!full) {
    return (
      <div className="pointer-events-none fixed inset-x-2.5 top-[calc(10px+env(safe-area-inset-top))] z-[80] flex justify-center">
        <section
          role="alertdialog"
          aria-label={`${c.from.name} is ${video ? "video" : "voice"} calling you`}
          className="pointer-events-auto flex w-full max-w-[480px] items-center gap-3 rounded-[24px] border border-line bg-surface2/96 p-3 shadow-[0_16px_40px_rgb(0_0_0/.55)]"
          style={{ animation: "vibe-dialog-in 200ms ease-out" }}
        >
          <button type="button" onClick={() => setFull(true)} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-label="Open the call">
            <Avatar url={c.from.avatarUrl} name={c.from.name} size={48} ring />
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-[15px] font-bold">{c.from.name}</span>
              <span className="flex items-center gap-1.5 text-[12.5px] text-text2">
                <Icon name={video ? "videocam" : "call"} size={14} />
                {video ? "Video call" : "Voice call"}
              </span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => void calls.decline()}
            aria-label="Decline"
            className="flex size-[46px] shrink-0 items-center justify-center rounded-full bg-bad-deep text-white hover:brightness-110"
          >
            <Icon name="call_end" size={22} />
          </button>
          <button
            type="button"
            onClick={() => void calls.accept()}
            aria-label="Accept"
            className="flex size-[46px] shrink-0 items-center justify-center rounded-full bg-ok text-[#062a26] hover:brightness-110"
          >
            <Icon name={video ? "videocam" : "call"} size={22} />
          </button>
        </section>
      </div>
    );
  }

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="incoming-title"
      className="fixed inset-0 z-[80]"
      style={{ animation: "vibe-dialog-in 200ms ease-out" }}
    >
      <BlurredPhoto url={c.from.avatarUrl} brightness={0.42} />
      <div className="absolute inset-0 mx-auto flex max-w-[480px] flex-col px-4 pt-[calc(110px+env(safe-area-inset-top))] pb-[calc(34px+env(safe-area-inset-bottom))]">
        <PulseAvatar url={c.from.avatarUrl} name={c.from.name} />
        <div className="mt-2 text-center">
          <h2 id="incoming-title" className="text-[28px] font-bold tracking-[-0.035em]">
            {c.from.name}
          </h2>
          <p className="mt-1.5 text-[14.5px] text-white/80">is {video ? "video" : "voice"} calling you</p>
        </div>
        <div className="flex-1" />
        <div role="group" aria-label="Quick replies" className="flex flex-wrap justify-center gap-2">
          {QUICK_REPLIES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => void calls.decline(r)}
              className="flex h-9 items-center rounded-full bg-white/12 px-3.5 text-[13.5px] font-semibold text-white backdrop-blur-[14px] hover:bg-white/18"
            >
              {r}
            </button>
          ))}
        </div>
        <div className="mt-[22px] flex items-start justify-around">
          <EndCallButton label="Decline" size={68} ariaLabel="Decline" onClick={() => void calls.decline()} />
          {video ? (
            <CallCtl
              icon="call"
              label="Voice only"
              size={68}
              bg="rgb(255 255 255 / .16)"
              ariaLabel="Accept as a voice call"
              onClick={() => void calls.accept("voice")}
            />
          ) : null}
          <button
            type="button"
            onClick={() => void calls.accept()}
            aria-label={video ? "Accept video call" : "Accept voice call"}
            className="group flex w-[76px] flex-col items-center gap-[7px]"
          >
            <span className="flex size-[68px] items-center justify-center rounded-full bg-ok text-[#062a26] shadow-[0_10px_26px_rgb(52_211_153/0.4)] group-hover:brightness-110">
              <Icon name={video ? "videocam" : "call"} size={30} />
            </span>
            <span className="text-[12px] font-semibold text-white/88">Accept</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ── outgoing ─────────────────────────────────────────────────────────────

/** How your call ended (the server's reason), and what you can do next. */
const OUTCOME: Record<Exclude<OutgoingCall["status"], "ringing">, { title: (name: string) => string; body: (name: string, c: OutgoingCall) => string; retry: boolean }> = {
  unavailable: { title: () => "Not in Vibe right now", body: (n) => `${n} isn't using the app, so it can't ring. ${n} will see a missed call.`, retry: false },
  declined: { title: (n) => `${n} can't talk right now`, body: (n, c) => (c.reply ? `"${c.reply}"` : `Send ${n} a message instead.`), retry: false },
  no_answer: { title: () => "No answer", body: (n) => `${n} didn't pick up. We'll show a missed call.`, retry: true },
  busy: { title: (n) => `${n} is on another call`, body: () => "Try again in a few minutes, or leave a message.", retry: true },
  failed: { title: () => "Couldn't connect", body: () => "The call didn't start. Check your internet and try again.", retry: true },
  turned_off: { title: () => "Calls were turned off", body: () => "Calls are off in this chat now.", retry: false },
  paused: { title: () => "Can't call right now", body: () => "They declined a few calls in a row. Try a message instead.", retry: false },
  error: { title: () => "Couldn't call", body: (_n, c) => c.message ?? "Something went wrong. Try again.", retry: true },
};

/** Your call ringing on their side: their photo, "Calling…", your camera and the controls; then how it ended. */
function Outgoing({ c }: { c: OutgoingCall }) {
  const router = useRouter();
  const m = useMatch();
  const first = firstName(c.to);
  const video = c.media === "video";
  const ringing = c.status === "ringing";

  // Your camera, for a video call, while it rings.
  useEffect(() => {
    if (!ringing || !video) return;
    useMatch.getState().setCallPreview(true);
    return () => useMatch.getState().setCallPreview(false);
  }, [ringing, video]);

  if (c.status !== "ringing") {
    const done = OUTCOME[c.status];
    const close = () => useCalls.getState().dismissOutgoing();
    return (
      <div role="dialog" aria-modal="true" aria-label={done.title(first)} className="fixed inset-0 z-[78]">
        <CallEndCard url={c.to.avatarUrl} name={c.to.name} title={done.title(first)} sub={done.body(first, c)}>
          <GradientButton
            label={c.status === "declined" ? "Reply" : "Send a message"}
            icon="chat_bubble"
            height={54}
            onClick={() => {
              close();
              router.push(`/chats/${c.to.id}`);
            }}
          />
          {done.retry ? (
            <GhostButton label="Try again" icon="replay" height={48} expand onClick={() => void useCalls.getState().ring(c.to, c.media)} />
          ) : (
            <GhostButton label="Close" height={48} expand onClick={close} />
          )}
        </CallEndCard>
      </div>
    );
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="calling-title" className="fixed inset-0 z-[78]">
      <BlurredPhoto url={c.to.avatarUrl} />
      {video ? <SelfPreview top={16} /> : null}
      <div className="absolute inset-0 mx-auto flex max-w-[480px] flex-col px-5 pt-[calc(110px+env(safe-area-inset-top))] pb-[calc(40px+env(safe-area-inset-bottom))]">
        <PulseAvatar url={c.to.avatarUrl} name={c.to.name} />
        <div className="mt-2 text-center">
          <h2 id="calling-title" className="text-[28px] font-bold tracking-[-0.035em]">
            {c.to.name}
          </h2>
          <p role="status" className={cn("mt-1.5 flex items-center justify-center gap-1.5 text-[14.5px] font-semibold", c.reached ? "text-pink-soft" : "text-white/80")}>
            <Icon name={video ? "videocam" : "call"} size={17} />
            {c.reached ? "Ringing…" : "Calling…"}
          </p>
          <p className="mx-auto mt-2 max-w-[300px] text-[13px] leading-[1.5] text-white/60">
            {c.reached ? `${first}'s screen is showing your call` : `Reaching ${first}'s app`}
          </p>
        </div>
        <div className="flex-1" />
        <div className="flex items-start justify-evenly">
          {video ? <CallCtl icon="cameraswitch" label="Flip" onClick={() => void m.switchCamera()} /> : null}
          {video ? <CallCtl icon="videocam_off" label={m.camOn ? "Camera off" : "Camera on"} on={!m.camOn} onClick={m.toggleCam} /> : null}
          <CallCtl icon="mic_off" label={m.micOn ? "Mute" : "Unmute"} on={!m.micOn} onClick={m.toggleMic} />
          <EndCallButton label="Cancel" ariaLabel="Cancel call" onClick={() => void useCalls.getState().cancel()} />
        </div>
      </div>
    </div>
  );
}

// ── after the ring, for the person called ───────────────────────────────

const NOTICE: Record<CallNotice["kind"], { title: (n: string) => string; body: (n: string) => string; auto: boolean }> = {
  hung_up: { title: (n) => `${n} hung up`, body: () => "Missed call. It's in your chat.", auto: true },
  elsewhere: { title: () => "Answered on your other device", body: () => "The call goes on there.", auto: true },
  over: { title: () => "That call has ended", body: (n) => `${n} hung up just before you answered.`, auto: false },
  failed: { title: () => "Couldn't connect", body: () => "The call didn't start. Check your internet.", auto: false },
};

/** Why the ring stopped: a moment (hung up, answered elsewhere), or with Call back (too late, couldn't connect). */
function Notice({ n }: { n: CallNotice }) {
  const d = NOTICE[n.kind];
  const first = firstName(n.from);
  useEffect(() => {
    if (!d.auto) return;
    const t = setTimeout(() => useCalls.getState().dismissNotice(), 1800);
    return () => clearTimeout(t);
  }, [d.auto]);
  const close = () => useCalls.getState().dismissNotice();
  return (
    <div role="dialog" aria-modal="true" aria-label={d.title(first)} className="fixed inset-0 z-[78]">
      <CallEndCard url={n.from.avatarUrl} name={n.from.name} title={d.title(first)} sub={d.body(first)}>
        {d.auto ? null : (
          <>
            <GradientButton
              label={`Call ${first} back`}
              icon={n.media === "voice" ? "call" : "videocam"}
              height={54}
              onClick={() => {
                close();
                void useCalls.getState().ring(n.from, n.media);
              }}
            />
            <GhostButton label="Close" height={48} expand onClick={close} />
          </>
        )}
      </CallEndCard>
    </div>
  );
}

// ── shrunk to the chat ───────────────────────────────────────────────────

/** The green bar across the top while a call runs in the background (in the page flow, so it pushes content down). */
export function CallReturnBar() {
  const show = useMatch((s) => s.status === "connected" && s.friendCall && s.minimized);
  const elapsed = useMatch((s) => s.elapsed);
  if (!show) return null;
  return (
    <button
      type="button"
      onClick={() => useMatch.getState().setMinimized(false)}
      aria-label="Go back to the call"
      className="flex h-[calc(34px+env(safe-area-inset-top))] shrink-0 items-center gap-2 bg-ok px-4 pt-[env(safe-area-inset-top)] text-[13px] font-bold text-[#062a26] lg:h-[34px] lg:pt-0"
    >
      <Icon name="call" size={16} />
      <span>Tap to go back to the call</span>
      <span className="ml-auto tabular-nums">{clock(elapsed)}</span>
    </button>
  );
}

/** The call, small, over the chat: their video (or photo), mute and end. Tap it to go back. */
function MiniCall() {
  const m = useMatch();
  const p = m.partner;
  if (!p) return null;
  const video = !m.voiceCall && m.remoteStream && m.partnerCamOn;
  return (
    <div
      className="fixed right-3 z-[70] h-[150px] w-[108px] overflow-hidden rounded-[18px] border-2 border-white/22 bg-surface2 shadow-[0_12px_30px_rgb(0_0_0/.55)]"
      style={{ top: "calc(112px + env(safe-area-inset-top))" }}
    >
      <button type="button" onClick={() => m.setMinimized(false)} aria-label={`Go back to the call with ${p.name}`} className="absolute inset-0">
        {video && m.remoteStream ? (
          <VideoView stream={m.remoteStream} muted={false} blur={m.partnerBlur ? 12 : 0} />
        ) : (
          <>
            {m.remoteStream ? <RemoteAudio stream={m.remoteStream} /> : null}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.avatarUrl} alt="" className="size-full object-cover" />
          </>
        )}
      </button>
      <span className="absolute inset-x-1.5 bottom-1.5 flex justify-between">
        <button
          type="button"
          onClick={m.toggleMic}
          aria-label={m.micOn ? "Mute" : "Unmute"}
          className="flex size-[30px] items-center justify-center rounded-full bg-bg2/60 text-white"
        >
          <Icon name={m.micOn ? "mic" : "mic_off"} size={15} className={m.micOn ? "" : "text-bad"} />
        </button>
        <button
          type="button"
          onClick={m.stop}
          aria-label="End call"
          className="flex size-[30px] items-center justify-center rounded-full bg-bad-deep text-white"
        >
          <Icon name="call_end" size={15} />
        </button>
      </span>
    </div>
  );
}

// ── ended ────────────────────────────────────────────────────────────────

