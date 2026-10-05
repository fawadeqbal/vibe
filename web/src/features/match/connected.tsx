"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";

import { VideoView } from "@/components/shared/video-view";
import { Avatar } from "@/components/ui/avatar";
import { VideoScrims } from "@/components/ui/brand";
import { Glass, GlassPill, RoundControl } from "@/components/ui/glass";
import { Icon } from "@/components/ui/icon";
import { CoinAmount } from "@/components/ui/money";
import { GroupCard, GroupRow } from "@/components/ui/panel";
import { alpha } from "@/lib/colors";
import { cn } from "@/lib/cn";
import { clock } from "@/lib/format";
import type { FriendState, Profile } from "@/lib/models";
import { useNow } from "@/hooks/use-now";
import { FollowPill, openUserProfileSheet } from "@/features/profile/user-profile";
import { useCatalog } from "@/stores/catalog";
import { cooldownSeconds, mutualLike, useMatch } from "@/stores/match";
import { useSession } from "@/stores/session";
import { friendStateOf, useSocial } from "@/stores/social";
import { openSheet } from "@/stores/ui";

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

  return (
    <div className="absolute inset-0 overflow-hidden">
      <PartnerStage partner={p} remote={m.remoteStream} blurred={m.blurred} />
      <VideoScrims top={220} bottom={460} topAlpha={0.75} bottomAlpha={0.92} bottomMid={0.6} />

      {/* Top: who, timer, report. */}
      <div className="absolute inset-x-0 top-0 flex items-center gap-2 px-3 pt-[calc(10px+env(safe-area-inset-top))]">
        <button type="button" aria-label={`Open ${p.name}'s profile`} onClick={() => void openUserProfileSheet(p.id, { inCall: true })} className="flex min-w-0 shrink text-left">
        <Glass radius={24} className="flex min-w-0 shrink items-center bg-bg2/45 py-[5px] pr-3.5 pl-[5px]">
          <Avatar url={p.avatarUrl} name={p.name} size={36} />
          <span className="ml-2.5 flex min-w-0 flex-col">
            <span className="flex min-w-0 items-center">
              <span className="type-title truncate text-[15px] font-semibold">
                {p.name}, {p.age}
              </span>
              {p.verified ? <Icon name="verified" size={16} className="ml-1 text-trust" label="Verified" /> : null}
              {p.vip ? <Icon name="workspace_premium" size={15} className="ml-1 text-gold" label="VIP" /> : null}
            </span>
            <span className="type-body truncate text-[11.5px] leading-[1.2] text-white/72">
              {p.country.flag} {p.country.name}
            </span>
          </span>
        </Glass>
        </button>
        <Glass radius={16} className="flex h-8 shrink-0 items-center bg-bg2/45 px-2.5 py-0">
          <span className="size-1.5 rounded-full bg-bad" />
          <span className="type-mono ml-1.5 text-[12px] text-text">{clock(m.elapsed)}</span>
        </Glass>
        <span className="flex-1" />
        <FollowPill userId={p.id} />
        <GlassPill label="Report" icon="flag" tint="bad" height={36} onClick={actions.report} className="shrink-0" />
      </div>

      {/* Openers and likes, under the identity pill. */}
      <div className="absolute left-3 flex flex-col items-start gap-2" style={{ top: "calc(64px + env(safe-area-inset-top))", right: 122 }}>
        {opener ? <GlassPill label={opener} icon="interests" iconColor="lavender" height={30} fontSize={12} /> : null}
        {likeText ? <GlassPill label={likeText} icon="favorite" iconColor="pink-soft" tint="pink" height={30} fontSize={12} /> : null}
      </div>

      {/* You, picture-in-picture. */}
      <SelfPip />

      {/* Bottom: chat, controls, composer. */}
      <div className="absolute inset-x-3 bottom-[calc(16px+env(safe-area-inset-bottom))] mx-auto max-w-[560px]">
        <ChatOverlay partnerName={p.name} />
        <div className="mt-3.5 flex items-end justify-between px-1">
          <RoundControl
            icon={m.likedPartner ? "favorite" : "favorite_border"}
            iconColor={m.likedPartner ? "pink" : "white"}
            tint={m.likedPartner ? "pink" : undefined}
            onClick={m.like}
            label={m.likedPartner ? "Liked" : "Like"}
          />
          <RoundControl icon="redeem" iconColor="gold" onClick={actions.gift} label="Gift" />
          <NextButton onClick={actions.next} />
          <FriendControl state={friendState} onAdd={actions.addFriend} />
          <RoundControl icon="more_horiz" onClick={() => void openCallOptions()} label="More" />
        </div>
        <Composer />
      </div>
    </div>
  );
}

/** The partner's video, or their portrait while it connects (or for a dev bot). */
function PartnerStage({ partner, remote, blurred }: { partner: Profile; remote: MediaStream | null; blurred: boolean }) {
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
  return (
    <div
      className="absolute right-3 h-[140px] w-[100px] overflow-hidden rounded-[20px] border-[1.5px] border-white/28 bg-surface2 shadow-[0_12px_35.6px_rgb(0_0_0/.4)] lg:h-[180px] lg:w-[130px]"
      style={{ top: "calc(64px + env(safe-area-inset-top))" }}
    >
      {stream && camOn ? (
        <VideoView stream={stream} mirror={front} />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center">
          <Icon name="videocam_off" className="text-muted" />
        </span>
      )}
      {blurred ? <span className="absolute inset-0" style={{ backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }} /> : null}
      <button type="button" onClick={() => useMatch.getState().toggleMic()} aria-label={micOn ? "Mute microphone" : "Unmute"} className="absolute bottom-1.5 left-1.5">
        <Glass radius={12} className="flex size-6 items-center justify-center border-transparent bg-bg2/55 p-0">
          <Icon name={micOn ? "mic" : "mic_off"} size={14} className={micOn ? "text-white" : "text-bad"} />
        </Glass>
      </button>
    </div>
  );
}

function NextButton({ onClick }: { onClick: () => void }) {
  const cooldownUntil = useMatch((s) => s.cooldownUntil);
  const bypass = useCatalog((s) => s.economy.skipCooldownBypassCost);
  const now = useNow(250, cooldownUntil != null);
  const cd = cooldownSeconds({ cooldownUntil }, now);
  return (
    <button type="button" onClick={onClick} aria-label={cd > 0 ? `Next, wait ${cd} seconds or skip for ${bypass} coins` : "Next person"} className="group flex flex-col items-center">
      <span
        className={cn("flex size-[76px] items-center justify-center rounded-full transition-[filter] group-hover:brightness-110", cd > 0 ? "" : "bg-brand")}
        style={
          cd > 0
            ? { backgroundImage: "linear-gradient(90deg, #2E2840, #241F31)", boxShadow: "0 12px 35.6px rgb(0 0 0 / .42)" }
            : { boxShadow: "0 12px 35.6px rgb(255 61 143 / .42)" }
        }
      >
        {cd > 0 ? <span className="type-number-lg text-[20px] text-white">{cd}s</span> : <Icon name="skip_next" size={38} className="text-white" />}
      </span>
      <span className="mt-1.5 flex items-center">
        {cd > 0 ? (
          <>
            <span className="type-label text-[11px] whitespace-pre text-white/85">Skip · </span>
            <CoinAmount amount={bypass} size={11} />
          </>
        ) : (
          <span className="type-label text-[11px] text-white/85">Next</span>
        )}
      </span>
    </button>
  );
}

function FriendControl({ state, onAdd }: { state: FriendState; onAdd: () => void }) {
  const icon = state === "friends" ? "how_to_reg" : state === "requested" ? "hourglass_top" : "person_add";
  const label = state === "friends" ? "Friends" : state === "requested" ? "Sent" : state === "incoming" ? "Accept" : "Add";
  return (
    <RoundControl
      icon={icon}
      label={label}
      onClick={state === "none" || state === "incoming" ? onAdd : undefined}
      iconColor={state === "friends" ? "ok" : "white"}
      tint={state === "incoming" ? "violet" : undefined}
    />
  );
}

/** The in-match chat, fading out at the top edge. */
function ChatOverlay({ partnerName }: { partnerName: string }) {
  const chat = useMatch((s) => s.chat);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" });
  }, [chat.length]);
  if (!chat.length) return null;
  return (
    <div
      ref={list}
      className="no-scrollbar flex max-h-[168px] flex-col gap-1.5 overflow-y-auto"
      style={{ maskImage: "linear-gradient(to bottom, transparent 0, black 18%)", WebkitMaskImage: "linear-gradient(to bottom, transparent 0, black 18%)" }}
    >
      {chat.map((c) => {
        const text = c.gift ? `${c.gift.emoji}  ${c.text}` : c.text;
        return c.fromMe ? (
          <div key={c.id} className="flex justify-end">
            <p
              className="type-body max-w-[72%] rounded-[18px] rounded-br-[6px] px-3 py-2 text-[14px] leading-[1.35] text-white"
              style={{ backgroundColor: c.gift ? alpha("gold", 0.28) : alpha("violet", 0.6) }}
            >
              {text}
            </p>
          </div>
        ) : (
          <div key={c.id} className="flex justify-start">
            <div
              className="max-w-[72%] rounded-[18px] rounded-bl-[6px] border border-white/10 px-3 py-2"
              style={{ backgroundColor: c.gift ? alpha("gold", 0.2) : "var(--color-glass)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" }}
            >
              <p className="type-label text-[11px] text-pink-soft">{partnerName}</p>
              <p className="type-body text-[14px] leading-[1.35] text-white">{text}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Composer() {
  const [text, setText] = useState("");
  const send = (e?: FormEvent) => {
    e?.preventDefault();
    useMatch.getState().sendMessage(text);
    setText("");
  };
  return (
    <form onSubmit={send} className="mt-3.5">
      <Glass radius={26} className="flex h-[52px] items-center border-white/14 py-0 pr-1.5 pl-[18px]">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Say something…"
          aria-label="Message"
          enterKeyHint="send"
          className="type-body min-w-0 flex-1 bg-transparent text-[15px] text-white outline-none placeholder:text-white/55"
        />
        <button type="submit" aria-label="Send" className="ml-2 flex size-10 shrink-0 items-center justify-center rounded-full bg-violet text-white transition-[filter] hover:brightness-110">
          <Icon name="send" size={19} />
        </button>
      </Glass>
    </form>
  );
}

/** "More": mute, camera, switch, block, end. */
function openCallOptions() {
  return openSheet<void>((close) => <CallOptions onDone={() => close()} />);
}

function CallOptions({ onDone }: { onDone: () => void }) {
  const m = useMatch();
  const run = (fn: () => void) => () => {
    fn();
    onDone();
  };
  return (
    <div className="flex flex-col px-5 pt-2.5 pb-5">
      <h2 className="type-title-lg text-[20px]">Call options</h2>
      <GroupCard className="mt-4">
        <GroupRow icon={m.micOn ? "mic" : "mic_off"} title={m.micOn ? "Mute microphone" : "Unmute"} onClick={run(m.toggleMic)} />
        <GroupRow icon={m.camOn ? "videocam" : "videocam_off"} title={m.camOn ? "Turn camera off" : "Turn camera on"} onClick={run(m.toggleCam)} />
        <GroupRow icon="cameraswitch" title="Switch camera" onClick={run(() => void m.switchCamera())} />
      </GroupCard>
      <GroupCard className="mt-2.5">
        <GroupRow icon="block" iconColor="bad" iconBg={alpha("bad", 0.12)} title="Block and end" titleColor="bad" onClick={run(() => void m.blockPartner())} />
        <GroupRow icon="call_end" title="End and go back" onClick={run(m.stop)} />
      </GroupCard>
    </div>
  );
}
