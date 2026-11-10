"use client";

import { useRouter } from "next/navigation";
import { type KeyboardEvent, type PointerEvent, useEffect, useState } from "react";

import { Avatar } from "@/components/ui/avatar";
import { GlassPill } from "@/components/ui/glass";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import { clock } from "@/lib/format";
import type { Profile } from "@/lib/models";
import { useMatch } from "@/stores/match";
import { useSocial } from "@/stores/social";
import { openSheet, useUi } from "@/stores/ui";

import { GameCard } from "@/features/match/game";
import { PartnerStage, PartnerMediaPills, playGame } from "@/features/match/connected";

import {
  BlurredPhoto,
  CallCtl,
  CallDock,
  CallTopline,
  EndCallButton,
  PulseAvatar,
  RemoteAudio,
  SelfVideo,
  useSpeaker,
  useVoiceLevel,
  VoiceBars,
} from "./call-ui";
import { useAutoHide } from "./auto-hide";
import { PIP_FRAME, PIP_FRAME_BARE, usePip } from "./pip";

export interface FriendCallActions {
  gift: () => void;
  report: () => void;
}

const firstName = (p: Profile) => p.name.split(" ")[0] || p.name;

/** Shrink the call to the chat: the call keeps going, a green bar brings you back. */
function useShrink() {
  const router = useRouter();
  return (p: Profile) => {
    useMatch.getState().setMinimized(true);
    router.push(`/chats/${p.id}`);
  };
}

/** Whether you can both turn on video in this chat (each allows video). */
function useVideoAllowed(p: Profile) {
  const friend = useSocial((s) => s.all.find((f) => f.profile.id === p.id));
  return !friend || (friend.calls.mineVideo && friend.calls.theirsVideo);
}

/**
 * A video call with a friend: their video, you in the corner, one frosted dock. Not the random-match screen.
 * The header and dock hide 4 s after the last tap and come back on the next one; a tap on the video hides
 * them at once. They stay up while a sheet is open, a game is on, the small picture is dragged, or before
 * their video starts.
 */
export function FriendVideoCall({ actions }: { actions: FriendCallActions }) {
  const m = useMatch();
  const shrink = useShrink();
  const p = m.partner!;
  // Tap the small picture to swap it with the big one; drag it to any corner.
  const [swapped, setSwapped] = useState(false);
  const controls = useAutoHide();
  const bare = !controls.shown;
  const { corner, style: pipStyle, handlers: pipHandlers, probe, dragging } = usePip(() => setSwapped((x) => !x), bare ? PIP_FRAME_BARE : PIP_FRAME);
  const sheetOpen = useUi((s) => s.overlays.length > 0);
  const held = !m.remoteStream || sheetOpen || dragging || !!m.game;
  const { hold, poke, toggle } = controls;
  useEffect(() => hold(held), [hold, held]);
  // A tap on the big picture shows or hides them; any other tap, key or mouse move keeps them up.
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => ((e.target as Element).closest("[data-call-stage]") ? toggle() : poke());
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => e.pointerType === "mouse" && poke();
  const tile = "absolute z-[15] cursor-grab touch-none overflow-hidden rounded-[18px] border-2 border-white/22 bg-surface2 shadow-[0_8px_24px_rgb(0_0_0/.4)] select-none active:cursor-grabbing";
  const tileProps = { ...pipHandlers, style: pipStyle, role: "button", tabIndex: 0, onKeyDown: (e: KeyboardEvent) => (e.key === "Enter" || e.key === " ") && setSwapped((x) => !x) };
  return (
    <div className="absolute inset-0 overflow-hidden" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onKeyDownCapture={poke} onFocusCapture={poke}>
      <span ref={probe} aria-hidden className="pointer-events-none invisible absolute inset-x-0 top-[env(safe-area-inset-top)] bottom-[env(safe-area-inset-bottom)]" />
      {/* The same two pictures stay mounted (no flicker, their sound keeps playing); a swap only changes which is big. */}
      <div
        className={swapped ? tile : "absolute inset-0"}
        {...(swapped
          ? { ...tileProps, "aria-label": `Show ${firstName(p)} big` }
          : { "data-call-stage": "", style: m.partnerBlur ? { filter: "blur(24px)", transform: "scale(1.08)" } : undefined })}
      >
        <div className="absolute inset-0" style={swapped && m.partnerBlur ? { filter: "blur(10px)" } : undefined}>
          <PartnerStage partner={p} remote={m.remoteStream} blurred={m.blurred} camOff={!m.partnerCamOn} />
        </div>
      </div>
      <div className={swapped ? "absolute inset-0" : tile} {...(swapped ? { "data-call-stage": "" } : { ...tileProps, "aria-label": "Show yourself big" })}>
        <SelfVideo big={swapped} />
      </div>
      <div
        className={cn("pointer-events-none absolute inset-0 transition-opacity duration-300", bare && "opacity-0")}
        style={{ background: "linear-gradient(to bottom, rgb(11 10 16 / .6), transparent 170px, transparent calc(100% - 260px), rgb(11 10 16 / .75))" }}
      />
      <CallTopline title={p.name} verified={p.verified} sub={`${clock(m.elapsed)} · video call`} onShrink={() => shrink(p)} hidden={bare} />
      <div
        className="absolute flex flex-col items-start gap-2 transition-[top] duration-300 ease-out"
        style={{ top: `calc(${bare ? 18 : 78}px + env(safe-area-inset-top))`, left: corner === "tl" ? 124 : 12, right: corner === "tr" ? 124 : 12 }}
      >
        {/* With the dock gone, your own mute and camera stay in sight. */}
        {bare && !m.micOn ? <GlassPill label="You're muted" icon="mic_off" iconColor="bad" height={28} fontSize={12} /> : null}
        {bare && !m.camOn ? <GlassPill label="Your camera is off" icon="videocam_off" height={28} fontSize={12} /> : null}
        {m.partnerBlur ? <GlassPill label={`${firstName(p)} turned on Blur me`} icon="blur_on" iconColor="trust" height={30} fontSize={12} /> : null}
        <PartnerMediaPills name={firstName(p)} />
      </div>
      {m.game ? (
        <div className="absolute inset-x-3 bottom-[calc(130px+env(safe-area-inset-bottom))] mx-auto max-w-[560px]">
          <GameCard game={m.game} partnerName={p.name} />
        </div>
      ) : null}
      <CallDock hidden={bare}>
        <CallCtl icon="cameraswitch" label="Flip" size={54} onClick={() => void m.switchCamera()} />
        <CallCtl icon={m.camOn ? "videocam" : "videocam_off"} label={m.camOn ? "Camera" : "Camera off"} on={!m.camOn} size={54} onClick={m.toggleCam} />
        <CallCtl icon={m.micOn ? "mic" : "mic_off"} label={m.micOn ? "Mute" : "Unmute"} on={!m.micOn} size={54} onClick={m.toggleMic} />
        <CallCtl icon="more_horiz" label="More" size={54} onClick={() => void openCallTools(p, actions, () => shrink(p))} />
        <EndCallButton size={58} onClick={m.stop} />
      </CallDock>
    </div>
  );
}

/** A voice call with a friend: their photo, the time, their voice as bars, six controls. No camera opens. */
export function FriendVoiceCall({ actions }: { actions: FriendCallActions }) {
  const m = useMatch();
  const shrink = useShrink();
  const p = m.partner!;
  const level = useVoiceLevel(m.remoteStream);
  const videoAllowed = useVideoAllowed(p);
  const first = firstName(p);
  const talking = level > 0.12;
  const speaker = useSpeaker();
  return (
    <div className="absolute inset-0 overflow-hidden">
      {m.remoteStream ? <RemoteAudio stream={m.remoteStream} /> : null}
      <BlurredPhoto url={p.avatarUrl} brightness={0.3} />
      <CallTopline title={p.name} verified={p.verified} sub="Voice call" onShrink={() => shrink(p)} onReport={actions.report} />
      {m.videoAsk === "theirs" ? <VideoAskCard partner={p} /> : null}
      <div className="absolute inset-0 mx-auto flex max-w-[480px] flex-col items-center pt-[calc(110px+env(safe-area-inset-top))] pb-[calc(40px+env(safe-area-inset-bottom))]">
        <PulseAvatar url={p.avatarUrl} name={p.name} size={140} />
        <div className="mt-2 flex flex-col items-center gap-2.5" aria-live="polite">
          <span className="text-[30px] font-bold tracking-[-0.02em] tabular-nums">{m.remoteStream ? clock(m.elapsed) : "Connecting…"}</span>
          <VoiceBars level={level} />
          <span className="text-[13px] text-white/75">
            {!m.partnerMicOn ? `${first} muted their mic` : talking ? `${first} is talking` : "Camera stays off. Not recorded."}
          </span>
        </div>
        <div className="flex-1" />
        {m.game ? (
          <div className="mb-4 w-full px-3">
            <GameCard game={m.game} partnerName={p.name} />
          </div>
        ) : null}
        <div className="flex w-full flex-wrap justify-center gap-y-[22px] px-2 [&>*]:flex [&>*]:basis-1/3 [&>*]:justify-center">
          <span>
            <CallCtl icon={m.micOn ? "mic" : "mic_off"} label={m.micOn ? "Mute" : "Unmute"} on={!m.micOn} onClick={m.toggleMic} />
          </span>
          {speaker ? (
            <span>
              <CallCtl icon="record_voice_over" label="Speaker" on={speaker.on} onClick={speaker.toggle} />
            </span>
          ) : null}
          <span>
            {videoAllowed ? (
              <CallCtl
                icon="videocam"
                label={m.videoAsk === "mine" ? `Asking ${first}…` : "Turn on video"}
                disabled={m.videoAsk === "mine"}
                onClick={() => void m.askVideo()}
              />
            ) : (
              <CallCtl icon="videocam_off" label="Voice only chat" disabled ariaLabel="Video is off in this chat: you both need to allow video first" />
            )}
          </span>
          <span>
            <CallCtl icon="chat_bubble" label="Message" onClick={() => shrink(p)} />
          </span>
          <span>
            <EndCallButton onClick={m.stop} />
          </span>
          <span>
            <CallCtl icon="redeem" label="Gift" color="var(--color-gold)" onClick={actions.gift} />
          </span>
        </div>
      </div>
    </div>
  );
}

/** In a voice call: they asked to turn on video. */
function VideoAskCard({ partner }: { partner: Profile }) {
  const m = useMatch();
  return (
    <div
      role="alertdialog"
      aria-label={`${firstName(partner)} wants to turn on video`}
      className="absolute inset-x-3 z-10 mx-auto max-w-[480px] rounded-[22px] border border-line bg-surface2/96 p-3.5 shadow-[0_14px_34px_rgb(0_0_0/.5)]"
      style={{ top: "calc(70px + env(safe-area-inset-top))" }}
    >
      <div className="flex items-center gap-2.5">
        <Avatar url={partner.avatarUrl} name={partner.name} size={40} />
        <span className="flex-1 text-[14.5px] font-semibold">{firstName(partner)} wants to turn on video</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => void m.answerVideo(false)}
          className="h-[42px] rounded-full border border-white/10 bg-white/6 text-[14.5px] font-semibold hover:bg-white/9"
        >
          Not now
        </button>
        <button
          type="button"
          onClick={() => void m.answerVideo(true)}
          className="flex h-[42px] items-center justify-center gap-1.5 rounded-full bg-ok text-[14.5px] font-bold text-[#062a26] hover:brightness-110"
        >
          <Icon name="videocam" size={18} />
          Turn on
        </button>
      </div>
    </div>
  );
}

/** "During the call": message, gift, a game, blur me; voice only; report. */
function openCallTools(p: Profile, actions: FriendCallActions, toChat: () => void) {
  return openSheet<void>((close) => <CallTools partner={p} actions={actions} toChat={toChat} onDone={() => close()} />);
}

function CallTools({ partner, actions, toChat, onDone }: { partner: Profile; actions: FriendCallActions; toChat: () => void; onDone: () => void }) {
  const blurMe = useMatch((s) => s.blurMe);
  const run = (fn: () => void) => () => {
    onDone();
    fn();
  };
  const tile = (icon: string, label: string, color: string, onClick: () => void, pressed?: boolean) => (
    <button type="button" onClick={onClick} aria-pressed={pressed} className="group flex flex-col items-center gap-[7px]">
      <span
        className="flex size-14 items-center justify-center rounded-[18px] transition-[filter] group-hover:brightness-125"
        style={{ background: `color-mix(in srgb, ${color} ${pressed ? 34 : 16}%, transparent)`, color }}
      >
        <Icon name={icon} size={26} />
      </span>
      <span className="text-[12.5px] font-semibold">{label}</span>
    </button>
  );
  return (
    <div className="px-5 pt-2.5 pb-5">
      <h2 className="mt-1 mb-3.5 text-[18px] font-bold tracking-[-0.012em]">During the call</h2>
      <div className="mb-2.5 grid grid-cols-4 gap-2">
        {tile("chat_bubble", "Message", "var(--color-lavender)", run(toChat))}
        {tile("redeem", "Gift", "var(--color-gold)", run(actions.gift))}
        {tile(
          "casino",
          "Play a game",
          "var(--color-pink-soft)",
          run(() => void playGame()),
        )}
        {tile("blur_on", blurMe ? "Blurred" : "Blur me", "var(--color-trust)", () => useMatch.getState().toggleBlurMe(), blurMe)}
      </div>
      <div className="my-1.5 h-px bg-line-soft" />
      <button type="button" onClick={run(() => void useMatch.getState().switchToVoice())} className="flex w-full items-center gap-3.5 px-1 py-3 text-left">
        <span className="flex size-10 items-center justify-center rounded-xl bg-white/5 text-text2">
          <Icon name="call" size={21} />
        </span>
        <span className="flex flex-1 flex-col">
          <span className="text-[15px] font-semibold">Switch to voice only</span>
          <span className="text-[12px] text-text2">Both cameras turn off</span>
        </span>
      </button>
      <button type="button" onClick={run(actions.report)} className="flex w-full items-center gap-3.5 px-1 py-3 text-left text-bad">
        <span className="flex size-10 items-center justify-center rounded-xl bg-bad/14">
          <Icon name="flag" size={21} />
        </span>
        <span className="flex flex-1 flex-col">
          <span className="text-[15px] font-semibold">Report {firstName(partner)}</span>
          <span className="text-[12px] text-text2">The call ends and our team takes a look</span>
        </span>
      </button>
    </div>
  );
}
