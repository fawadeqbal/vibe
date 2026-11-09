"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";

import { VideoView } from "@/components/shared/video-view";
import { Avatar } from "@/components/ui/avatar";
import { VideoScrims } from "@/components/ui/brand";
import { Glass, GlassPill, RoundControl } from "@/components/ui/glass";
import { HiddenNote } from "@/components/shared/hidden-note";
import { Icon } from "@/components/ui/icon";
import { CoinAmount } from "@/components/ui/money";
import { alpha } from "@/lib/colors";
import { cn } from "@/lib/cn";
import { clock } from "@/lib/format";
import type { FriendState, Profile } from "@/lib/models";
import { useNow } from "@/hooks/use-now";
import { openUserProfileSheet } from "@/features/profile/user-profile";
import { useCatalog } from "@/stores/catalog";
import { cooldownSeconds, mutualLike, useMatch } from "@/stores/match";
import { useSession } from "@/stores/session";
import { friendStateOf, useSocial } from "@/stores/social";
import { openSheet } from "@/stores/ui";

import { GameCard, gameError, openGamePicker } from "./game";
import { MutualCelebration } from "./mutual";
import { markSwipeHintSeen, SwipeHint, swipeHintSeen, SwipeStage } from "./swipe";

export interface ConnectedActions {
  next: () => void;
  gift: () => void;
  addFriend: () => void;
  report: () => void;
}

/** In a match: the partner takes the stage, you shrink to a corner. */
export function Connected({ actions }: { actions: ConnectedActions }) {
  const m = useMatch();
  const me = useSession((s) => s.me);
  const friendState = useSocial((s) => (m.partner ? friendStateOf(s, m.partner.id) : "none"));
  const p = m.partner!;
  const shared = p.interests.filter((i) => me?.interests.includes(i));
  const opener = shared.length ? `You both like ${shared.slice(0, 2).join(" · ")}` : p.interests.length ? `Into ${p.interests.slice(0, 2).join(" · ")}` : null;
  const likeText = mutualLike(m) ? "You both liked each other" : m.partnerLikedMe ? `${p.name} liked you` : null;
  // First call on this device: show how swiping works, once.
  const [hint, setHint] = useState(() => !m.friendCall && !swipeHintSeen());
  const doneHint = () => {
    markSwipeHintSeen();
    setHint(false);
  };
  const swipeNext = () => {
    if (hint) doneHint();
    actions.next();
  };
  const doubleTapLike = () => {
    const s = useMatch.getState();
    if (!s.likedPartner) s.like();
  };

  return (
    <div className="absolute inset-0 overflow-hidden">
      {m.friendCall ? (
        <>
          <PartnerStage partner={p} remote={m.remoteStream} blurred={m.blurred} camOff={!m.partnerCamOn && !m.voiceCall} />
          <VideoScrims top={200} bottom={380} topAlpha={0.65} bottomAlpha={0.9} bottomMid={0.55} />
        </>
      ) : (
        <SwipeStage onNext={swipeNext} onLike={doubleTapLike}>
          <PartnerStage partner={p} remote={m.remoteStream} blurred={m.blurred} camOff={!m.partnerCamOn && !m.voiceCall} />
          <VideoScrims top={200} bottom={380} topAlpha={0.65} bottomAlpha={0.9} bottomMid={0.55} />
        </SwipeStage>
      )}

      <CallTop partner={p} elapsed={m.elapsed} onReport={actions.report} />

      {/* What you share and who liked whom, under the name. */}
      <div className="absolute left-3 flex flex-col items-start gap-2" style={{ top: "calc(72px + env(safe-area-inset-top))", right: 120 }}>
        {opener ? <GlassPill label={opener} icon="interests" iconColor="lavender" height={30} fontSize={12} /> : null}
        {likeText ? <GlassPill label={likeText} icon="favorite" iconColor="pink-soft" tint="pink" height={30} fontSize={12} /> : null}
        <PartnerMediaPills name={p.name} />
      </div>

      <SelfPip />

      {m.friendCall ? (
        <div className="absolute inset-x-3 bottom-[calc(16px+env(safe-area-inset-bottom))] mx-auto max-w-[560px]">
          <ChatOverlay partnerName={p.name} compact={!!m.game} />
          {m.game ? (
            <div className="mt-2.5">
              <GameCard game={m.game} partnerName={p.name} />
            </div>
          ) : null}
          <div className="mt-3.5 flex items-end justify-center gap-6 px-1">
            <RoundControl icon="redeem" iconColor="gold" onClick={actions.gift} label="Gift" />
            <RoundControl icon="casino" iconColor={m.game ? "lavender" : "white"} tint={m.game ? "violet" : undefined} onClick={() => void playGame()} label="Play" />
            <button type="button" onClick={() => m.stop()} aria-label="End call" className="flex flex-col items-center">
              <span className="flex size-[64px] items-center justify-center rounded-full bg-bad-deep text-white shadow-[0_10px_26px_rgb(225_29_72/0.4)] hover:brightness-110">
                <Icon name="call_end" size={30} />
              </span>
              <span className="type-label mt-1.5 text-[11px] font-semibold text-white/85">End</span>
            </button>
            <RoundControl icon="more_horiz" onClick={() => void openCallOptions(actions)} label="More" />
          </div>
          <div className="mt-3.5">
            <Composer partnerName={p.name} />
          </div>
        </div>
      ) : (
        <>
          {/* The rail: everything you can do for this person, one thumb away. */}
          <div className="absolute right-3 flex flex-col gap-3.5 bottom-[calc(112px+env(safe-area-inset-bottom))]">
            <RoundControl
              size={50}
              icon={m.likedPartner ? "favorite" : "favorite_border"}
              iconColor={m.likedPartner ? "pink" : "white"}
              tint={m.likedPartner ? "pink" : undefined}
              onClick={m.like}
              label={m.likedPartner ? "Liked" : "Like"}
            />
            <FriendControl state={friendState} onAdd={actions.addFriend} />
            <RoundControl size={50} icon="redeem" iconColor="gold" onClick={actions.gift} label="Gift" />
            <RoundControl size={50} icon="casino" iconColor={m.game ? "lavender" : "white"} tint={m.game ? "violet" : undefined} onClick={() => void playGame()} label="Play" />
            <RoundControl size={50} icon="more_horiz" onClick={() => void openCallOptions(actions)} label="More" />
          </div>

          {/* Chat and a game, bottom left, clear of the rail. */}
          <div className="absolute left-3 flex flex-col gap-2.5 bottom-[calc(96px+env(safe-area-inset-bottom))]" style={{ right: 84 }}>
            {m.game ? <GameCard game={m.game} partnerName={p.name} /> : null}
            <ChatOverlay partnerName={p.name} compact={!!m.game} />
          </div>

          <div className="absolute inset-x-3 flex items-center gap-2.5 bottom-[calc(22px+env(safe-area-inset-bottom))]">
            <Composer partnerName={p.name} />
            <NextButton onClick={actions.next} />
          </div>
        </>
      )}

      {hint ? <SwipeHint onDone={doneHint} /> : null}
      {m.mutual && m.current && !m.friendCall ? <MutualCelebration key={m.current.id} matchId={m.current.id} friendState={friendState} onAddFriend={actions.addFriend} /> : null}
    </div>
  );
}

/** Top: who you're with (opens their profile), how long, and Report. */
function CallTop({ partner: p, elapsed, onReport }: { partner: Profile; elapsed: number; onReport: () => void }) {
  return (
    <div className="absolute inset-x-0 top-0 flex items-center gap-2 px-3 pt-[calc(12px+env(safe-area-inset-top))]">
      <button type="button" aria-label={`Open ${p.name}'s profile`} onClick={() => void openUserProfileSheet(p.id, { inCall: true })} className="flex min-w-0 shrink text-left">
        <Glass radius={999} blur={18} className="flex h-[46px] min-w-0 items-center gap-2 border-white/10 bg-bg2/52 py-0 pr-3.5 pl-1.5">
          <Avatar url={p.avatarUrl} name={p.name} size={34} />
          <span className="flex min-w-0 flex-col">
            <span className="flex min-w-0 items-center gap-1">
              <span className="truncate text-[14.5px] font-bold">
                {p.name}, {p.age}
              </span>
              {p.verified ? <Icon name="verified" size={15} className="shrink-0 text-trust" label="Verified" /> : null}
              {p.vip ? <Icon name="workspace_premium" size={15} className="shrink-0 text-gold" label="VIP" /> : null}
            </span>
            <span className="truncate text-[11.5px] leading-[1.2] text-white/75">
              {p.country.name} · Level {p.level}
            </span>
          </span>
        </Glass>
      </button>
      <Glass radius={999} blur={18} className="flex h-8 shrink-0 items-center gap-1.5 border-white/10 bg-bg2/52 px-2.5 py-0">
        <span className="size-[7px] rounded-full bg-bad" />
        <span className="type-mono text-[12.5px] text-text">{clock(elapsed)}</span>
      </Glass>
      <span className="flex-1" />
      <button
        type="button"
        onClick={onReport}
        aria-label="Report"
        className="flex size-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-bg2/52 text-bad backdrop-blur-[18px] transition-[filter] hover:brightness-125"
      >
        <Icon name="flag" size={21} />
      </button>
    </div>
  );
}

/** Play → pick a game → it opens for both of you. */
async function playGame() {
  const g = await openGamePicker();
  if (!g) return;
  try {
    await useMatch.getState().startGame(g);
  } catch (e) {
    gameError(e);
  }
}

/** Their mic is off, or the connection is weak: small, calm notes under the name. */
export function PartnerMediaPills({ name }: { name: string }) {
  const micOff = useMatch((s) => !s.partnerMicOn);
  const weak = useMatch((s) => s.weakSignal);
  return (
    <>
      {weak ? (
        <span role="status">
          <GlassPill label="Weak connection — video may freeze" icon="signal_cellular_alt_1_bar" iconColor="gold" height={30} fontSize={12} />
        </span>
      ) : null}
      {micOff ? (
        <span role="status">
          <GlassPill label={`${name} muted their mic`} icon="mic_off" height={30} fontSize={12} />
        </span>
      ) : null}
    </>
  );
}

/** The partner turned their camera off: their photo, dimmed, and a plain line saying so. */
function CameraOffCover({ partner }: { partner: Profile }) {
  return (
    <div role="status" className="absolute inset-0 flex flex-col items-center justify-center bg-bg/80 px-6 text-center backdrop-blur-xl">
      <span className="relative">
        <Avatar url={partner.avatarUrl} name={partner.name} size={112} ring />
        <span className="absolute -right-1 -bottom-1 flex size-10 items-center justify-center rounded-full bg-surface2 text-text2 ring-4 ring-bg">
          <Icon name="videocam_off" size={20} />
        </span>
      </span>
      <span className="type-title mt-4 text-[19px] font-bold">{partner.name} turned their camera off</span>
      <span className="type-body mt-1 max-w-[280px] text-[13.5px] text-text2">You can still talk and chat. It comes back when they turn it on.</span>
    </div>
  );
}

/** The partner's video, or their portrait while it connects (or for a dev bot). */
function PartnerStage({ partner, remote, blurred, camOff = false }: { partner: Profile; remote: MediaStream | null; blurred: boolean; camOff?: boolean }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="absolute inset-0">
      {remote ? (
        <VideoView stream={remote} muted={false} />
      ) : partner.avatarUrl && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={partner.avatarUrl} alt="" className="absolute inset-0 size-full object-cover" onError={() => setFailed(true)} />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundImage: "linear-gradient(to bottom, #2B1B4D, #0B0A10)" }}>
          <Avatar url="" name={partner.name} size={120} ring />
        </div>
      )}
      {/* Over the video, not instead of it: their voice keeps playing. */}
      {camOff ? <CameraOffCover partner={partner} /> : null}
      <div
        className={cn("absolute inset-0 flex items-center justify-center bg-black/10 transition-opacity duration-600", blurred ? "opacity-100" : "pointer-events-none opacity-0")}
        style={{ backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)" }}
      >
        <GlassPill label="Starts blurred · clearing in a moment" icon="blur_on" iconColor="trust" height={34} />
      </div>
    </div>
  );
}

function SelfPip() {
  const stream = useMatch((s) => s.localStream);
  const camOn = useMatch((s) => s.camOn);
  const micOn = useMatch((s) => s.micOn);
  const front = useMatch((s) => s.frontCamera);
  const blurred = useMatch((s) => s.blurred);
  const me = useSession((s) => s.me);
  return (
    <div
      className="absolute right-3 h-[136px] w-[96px] overflow-hidden rounded-[18px] border-2 border-white/22 bg-surface2 shadow-[0_8px_24px_rgb(0_0_0/.4)] lg:h-[180px] lg:w-[128px]"
      style={{ top: "calc(70px + env(safe-area-inset-top))" }}
    >
      {stream && camOn ? (
        <VideoView stream={stream} mirror={front} />
      ) : me?.avatarUrl ? (
        // Camera off: they see your photo, so you do too.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={me.avatarUrl} alt="You" className="absolute inset-0 size-full object-cover opacity-70" />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center">
          <Icon name="videocam_off" className="text-muted" />
        </span>
      )}
      {blurred ? <span className="absolute inset-0" style={{ backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }} /> : null}
      {!micOn ? (
        <button type="button" onClick={() => useMatch.getState().toggleMic()} aria-label="Unmute microphone" className="absolute bottom-1.5 left-1.5 flex size-6 items-center justify-center rounded-full bg-bg2/70">
          <Icon name="mic_off" size={14} className="text-bad" />
        </button>
      ) : null}
    </div>
  );
}

/** Next, as a pill beside the composer. In a cooldown it counts down and offers the skip. */
function NextButton({ onClick }: { onClick: () => void }) {
  const cooldownUntil = useMatch((s) => s.cooldownUntil);
  const bypass = useCatalog((s) => s.economy.skipCooldownBypassCost);
  const now = useNow(250, cooldownUntil != null);
  const cd = cooldownSeconds({ cooldownUntil }, now);
  if (cd > 0) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={`Next in ${cd} seconds, or skip the wait for ${bypass} coins`}
        className="flex h-[52px] shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-surface3/90 pr-4 pl-3.5 text-[14px] font-bold text-white transition-[filter] hover:brightness-125"
      >
        <span className="type-mono text-[15px]">{cd}s</span>
        <span className="text-white/60">·</span>
        <span>Skip</span>
        <CoinAmount amount={bypass} size={13} />
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Next person"
      className="flex h-[52px] shrink-0 items-center gap-1 rounded-full bg-brand pr-5 pl-3.5 text-[15px] font-bold text-white shadow-[0_10px_26px_rgb(255_61_143/0.4)] transition-[filter] hover:brightness-110"
    >
      <Icon name="skip_next" size={26} />
      Next
    </button>
  );
}

function FriendControl({ state, onAdd }: { state: FriendState; onAdd: () => void }) {
  const icon = state === "friends" ? "how_to_reg" : state === "requested" ? "hourglass_top" : "person_add";
  const label = state === "friends" ? "Friends" : state === "requested" ? "Sent" : state === "incoming" ? "Accept" : "Add friend";
  return (
    <RoundControl
      size={50}
      icon={icon}
      label={label}
      onClick={state === "none" || state === "incoming" ? onAdd : undefined}
      iconColor={state === "friends" ? "ok" : "white"}
      tint={state === "incoming" ? "violet" : undefined}
    />
  );
}

/** The in-call chat: frosted bubbles, the sender's name first, fading at the top. */
function ChatOverlay({ partnerName, compact = false }: { partnerName: string; compact?: boolean }) {
  const chat = useMatch((s) => s.chat);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" });
  }, [chat.length]);
  if (!chat.length) return null;
  return (
    <div
      ref={list}
      role="log"
      aria-label="Chat"
      className={cn("no-scrollbar flex flex-col items-start gap-1.5 overflow-y-auto", compact ? "max-h-[84px]" : "max-h-[168px]")}
      style={{ maskImage: "linear-gradient(to bottom, transparent 0, black 18%)", WebkitMaskImage: "linear-gradient(to bottom, transparent 0, black 18%)" }}
    >
      {chat.map((c) => (
        <div key={c.id} className="flex max-w-[250px] flex-col items-start">
          <p
            className="rounded-2xl px-3 py-[7px] text-[13.5px] leading-[1.35] text-white"
            style={{
              backgroundColor: c.gift ? alpha("gold", 0.28) : c.fromMe ? "rgb(139 92 246 / .55)" : "rgb(18 16 26 / .55)",
              backdropFilter: "blur(14px)",
              WebkitBackdropFilter: "blur(14px)",
            }}
          >
            <b className={cn("font-bold", c.fromMe ? "text-white" : "text-pink-soft")}>{c.fromMe ? "You" : partnerName}</b> {c.gift ? `${c.gift.emoji} ${c.text}` : c.text}
          </p>
          {c.hidden ? <HiddenNote className="text-white/80 [text-shadow:0_1px_3px_rgb(0_0_0/0.6)]" /> : null}
        </div>
      ))}
    </div>
  );
}

/** Quick reactions behind the smile: one tap sends. */
export const QUICK_REACTIONS = ["👋", "😂", "😍", "🔥", "👍", "🙏"];

function Composer({ partnerName }: { partnerName: string }) {
  const [text, setText] = useState("");
  const [quick, setQuick] = useState(false);
  const send = (e?: FormEvent, value = text) => {
    e?.preventDefault();
    if (!value.trim()) return;
    useMatch.getState().sendMessage(value);
    setText("");
    setQuick(false);
  };
  return (
    <form onSubmit={send} className="relative min-w-0 flex-1">
      {quick ? (
        <div role="menu" aria-label="Quick reactions" className="absolute bottom-[60px] left-0 flex gap-1 rounded-full border border-white/10 bg-bg2/80 p-1.5 backdrop-blur-[18px]">
          {QUICK_REACTIONS.map((r) => (
            <button key={r} type="button" role="menuitem" aria-label={`Send ${r}`} onClick={() => send(undefined, r)} className="flex size-10 items-center justify-center rounded-full text-[22px] hover:bg-white/10">
              {r}
            </button>
          ))}
        </div>
      ) : null}
      <label className="flex h-[52px] items-center gap-2 rounded-full border border-white/10 bg-bg2/52 pr-2 pl-[18px] backdrop-blur-[18px]">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Say something…"
          aria-label={`Message ${partnerName}`}
          enterKeyHint="send"
          className="type-body min-w-0 flex-1 bg-transparent text-[15px] text-white outline-none placeholder:text-white/55"
        />
        {text.trim() ? (
          <button type="submit" aria-label="Send" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-violet text-white transition-[filter] hover:brightness-110">
            <Icon name="send" size={18} />
          </button>
        ) : (
          <button type="button" aria-label="Quick reactions" aria-expanded={quick} onClick={() => setQuick((q) => !q)} className="flex size-9 shrink-0 items-center justify-center rounded-full text-white/75 hover:text-white">
            <Icon name="face" variant="outlined" size={22} />
          </button>
        )}
      </label>
    </form>
  );
}

/** "More": camera, mic, their profile, then report, block and end. */
function openCallOptions(actions: ConnectedActions) {
  return openSheet<void>((close) => <CallOptions actions={actions} onDone={() => close()} />);
}

function OptionRow({ icon, title, subtitle, tone, onClick }: { icon: string; title: string; subtitle?: string; tone?: "bad"; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={cn("flex w-full items-center gap-3.5 rounded-2xl px-1 py-[13px] text-left hover:bg-white/[.03]", tone ? "text-bad" : "text-text")}>
      <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", tone ? "bg-bad/12" : "bg-white/5")}>
        <Icon name={icon} size={21} className={tone ? "text-bad" : "text-text2"} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[15px] font-semibold">{title}</span>
        {subtitle ? <span className="text-[12px] text-text2">{subtitle}</span> : null}
      </span>
    </button>
  );
}

function CallOptions({ actions, onDone }: { actions: ConnectedActions; onDone: () => void }) {
  const m = useMatch();
  const name = m.partner?.name ?? "They";
  const run = (fn: () => void) => () => {
    onDone();
    fn();
  };
  return (
    <div className="flex flex-col px-5 pt-2.5 pb-5">
      <h2 className="mt-1 mb-3.5 text-[18px] font-bold tracking-[-0.012em]">Call options</h2>
      {m.voiceCall ? null : <OptionRow icon="cameraswitch" title="Switch camera" onClick={run(() => void m.switchCamera())} />}
      <OptionRow icon={m.micOn ? "mic_off" : "mic"} title={m.micOn ? "Mute my mic" : "Unmute my mic"} onClick={run(m.toggleMic)} />
      {m.voiceCall ? null : (
        <OptionRow
          icon={m.camOn ? "videocam_off" : "videocam"}
          title={m.camOn ? "Turn my camera off" : "Turn my camera on"}
          subtitle={m.camOn ? `${name} sees your photo instead` : undefined}
          onClick={run(m.toggleCam)}
        />
      )}
      {m.partner ? <OptionRow icon="visibility" title={`See ${name}'s profile`} onClick={run(() => void openUserProfileSheet(m.partner!.id, { inCall: true }))} /> : null}
      <div className="my-1.5 h-px bg-line-soft" />
      <OptionRow icon="flag" title="Report" subtitle="Our team reviews every report" tone="bad" onClick={run(actions.report)} />
      <OptionRow icon="block" title="Block and end" subtitle="You won't be matched again" tone="bad" onClick={run(() => void m.blockPartner())} />
      <OptionRow icon="call_end" title="End and go back" onClick={run(m.stop)} />
    </div>
  );
}
