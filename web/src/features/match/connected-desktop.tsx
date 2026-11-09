"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";

import { HiddenNote } from "@/components/shared/hidden-note";
import { Avatar } from "@/components/ui/avatar";
import { VideoScrims } from "@/components/ui/brand";
import { Glass, GlassPill, RoundControl } from "@/components/ui/glass";
import { Icon } from "@/components/ui/icon";
import { KeyHint, typingIn } from "@/components/ui/kbd";
import { cn } from "@/lib/cn";
import { clock } from "@/lib/format";
import type { Profile } from "@/lib/models";
import { openUserProfileSheet } from "@/features/profile/user-profile";
import { mutualLike, useMatch } from "@/stores/match";
import { useSession } from "@/stores/session";
import { friendStateOf, useSocial } from "@/stores/social";

import {
  type ConnectedActions,
  FriendControl,
  NextButton,
  openCallOptions,
  PartnerMediaPills,
  PartnerStage,
  playGame,
  QUICK_REACTIONS,
  SelfPip,
} from "./connected";
import { GameCard } from "./game";
import { MutualCelebration } from "./mutual";

/**
 * In a match, on a desktop: their video gets the stage, you sit in its
 * corner, one control dock at the bottom; the chat (or who they are) stays
 * open on the right instead of floating over the video. Keys: → next,
 * M mic, V camera, L like.
 */
export function DesktopConnected({ actions }: { actions: ConnectedActions }) {
  const m = useMatch();
  const me = useSession((s) => s.me);
  const friendState = useSocial((s) => (m.partner ? friendStateOf(s, m.partner.id) : "none"));
  const [tab, setTab] = useState<"chat" | "about">("chat");
  const p = m.partner!;
  const shared = p.interests.filter((i) => me?.interests.includes(i));
  const likeText = mutualLike(m) ? "You both liked each other" : m.partnerLikedMe ? `${p.name} liked you` : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || typingIn(e) || e.metaKey || e.ctrlKey || e.altKey || document.querySelector("[role=dialog]")) return;
      const s = useMatch.getState();
      if (e.key === "ArrowRight") actions.next();
      else if (e.key === "m" || e.key === "M") s.toggleMic();
      else if (e.key === "v" || e.key === "V") s.toggleCam();
      else if ((e.key === "l" || e.key === "L") && !s.likedPartner) s.like();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [actions]);

  return (
    <div className="absolute inset-0 flex flex-col">
      <header className="flex h-[72px] shrink-0 items-center gap-3 px-7">
        <h1 className="type-display min-w-0 truncate text-[26px]">
          Live with <span className="type-serif text-[30px] text-pink-soft">{p.name}</span>
        </h1>
        <span className="flex-1" />
        <KeyHint k="→" label="Next" />
        <KeyHint k="M" label="Mic" />
        <KeyHint k="V" label="Camera" />
        <KeyHint k="L" label="Like" />
      </header>

      <div className="flex min-h-0 flex-1 gap-6 px-7 pb-7">
        <section aria-label={`${p.name}'s video`} className="relative min-w-0 flex-1 overflow-hidden rounded-[28px] bg-surface">
          <PartnerStage partner={p} remote={m.remoteStream} blurred={m.blurred} camOff={!m.partnerCamOn && !m.voiceCall} />
          <VideoScrims top={160} bottom={220} topAlpha={0.55} bottomAlpha={0.75} bottomMid={0.4} />

          <div className="absolute top-[18px] left-[18px] flex max-w-[55%] flex-col items-start gap-2">
            <button
              type="button"
              aria-label={`Open ${p.name}'s profile`}
              onClick={() => void openUserProfileSheet(p.id, { inCall: true })}
              className="flex min-w-0 text-left"
            >
              <Glass radius={999} blur={18} className="flex h-12 min-w-0 items-center gap-2.5 border-white/10 bg-bg2/52 py-0 pr-4 pl-1.5">
                <Avatar url={p.avatarUrl} name={p.name} size={36} />
                <span className="flex min-w-0 flex-col">
                  <span className="flex min-w-0 items-center gap-1">
                    <span className="truncate text-[14.5px] font-bold">
                      {p.name}, {p.age}
                    </span>
                    {p.verified ? <Icon name="verified" size={15} className="shrink-0 text-trust" label="Verified" /> : null}
                    {p.vip ? <Icon name="workspace_premium" size={15} className="shrink-0 text-gold" label="VIP" /> : null}
                  </span>
                  <span className="truncate text-[12px] leading-[1.2] text-white/75">
                    {p.country.flag} {p.country.name} · Level {p.level}
                  </span>
                </span>
              </Glass>
            </button>
            {likeText ? <GlassPill label={likeText} icon="favorite" iconColor="pink-soft" tint="pink" height={30} fontSize={12} /> : null}
            <PartnerMediaPills name={p.name} />
          </div>

          <Glass
            radius={999}
            blur={18}
            className="absolute top-6 left-1/2 flex h-[30px] -translate-x-1/2 items-center gap-1.5 border-white/10 bg-bg2/52 px-3 py-0"
          >
            <span className="size-[7px] rounded-full bg-bad" />
            <span className="type-mono text-[13px] text-text">{clock(m.elapsed)}</span>
          </Glass>

          <SelfPip className="top-[18px] right-[18px] h-[140px] w-[224px]" style={{}} />

          {m.game ? (
            <div className="absolute bottom-[104px] left-[18px] w-[340px]">
              <GameCard game={m.game} partnerName={p.name} />
            </div>
          ) : null}

          <div className="absolute bottom-[22px] left-1/2 flex -translate-x-1/2 items-center gap-2.5 rounded-full border border-white/10 bg-bg2/52 p-2.5 backdrop-blur-[18px]">
            <RoundControl
              size={52}
              icon={m.micOn ? "mic" : "mic_off"}
              iconColor={m.micOn ? "white" : "bad"}
              onClick={m.toggleMic}
              ariaLabel={m.micOn ? "Mute my mic" : "Unmute my mic"}
            />
            {m.voiceCall ? null : (
              <RoundControl
                size={52}
                icon={m.camOn ? "videocam" : "videocam_off"}
                iconColor={m.camOn ? "white" : "bad"}
                onClick={m.toggleCam}
                ariaLabel={m.camOn ? "Turn my camera off" : "Turn my camera on"}
              />
            )}
            <RoundControl size={52} icon="redeem" iconColor="gold" tint="gold" onClick={actions.gift} ariaLabel="Send a gift" />
            <RoundControl
              size={52}
              icon={m.likedPartner ? "favorite" : "favorite_border"}
              iconColor={m.likedPartner ? "pink" : "pink-soft"}
              tint="pink"
              onClick={m.likedPartner ? undefined : m.like}
              ariaLabel={m.likedPartner ? "Liked" : "Like"}
            />
            <FriendControl state={friendState} onAdd={actions.addFriend} bare />
            <RoundControl
              size={52}
              icon="casino"
              iconColor={m.game ? "lavender" : "white"}
              tint={m.game ? "violet" : undefined}
              onClick={() => void playGame()}
              ariaLabel="Play a game"
            />
            <RoundControl size={52} icon="more_horiz" onClick={() => void openCallOptions(actions)} ariaLabel="More" />
            <span className="mx-1 h-[30px] w-px bg-white/14" />
            <button
              type="button"
              onClick={m.stop}
              className="flex h-[52px] items-center gap-2 rounded-full bg-bad px-5 text-[14.5px] font-bold text-white transition-[filter] hover:brightness-110"
            >
              <Icon name="call_end" size={22} />
              End
            </button>
            <NextButton onClick={actions.next} />
          </div>

          {m.mutual && m.current ? (
            <MutualCelebration key={m.current.id} matchId={m.current.id} friendState={friendState} onAddFriend={actions.addFriend} />
          ) : null}
        </section>

        <aside className="flex w-[380px] shrink-0 flex-col gap-3.5 rounded-[24px] border border-line bg-surface p-4">
          <div role="tablist" aria-label="Beside the call" className="flex gap-1 rounded-full border border-line bg-white/4 p-1">
            {(
              [
                ["chat", "Chat"],
                ["about", `About ${p.name.split(" ")[0]}`],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={tab === k}
                onClick={() => setTab(k)}
                className={cn(
                  "type-label h-[34px] flex-1 truncate rounded-full px-2 text-[13.5px]",
                  tab === k ? "bg-surface3 font-bold text-text" : "text-text2 hover:text-text",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {tab === "chat" ? <ChatPanel partnerName={p.name} /> : <AboutPanel partner={p} shared={shared} />}
        </aside>
      </div>
    </div>
  );
}

/** The in-call chat as a proper panel: bubbles, quick reactions, a composer. */
function ChatPanel({ partnerName }: { partnerName: string }) {
  const chat = useMatch((s) => s.chat);
  const list = useRef<HTMLDivElement>(null);
  const [text, setText] = useState("");
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" });
  }, [chat.length]);
  const send = (e?: FormEvent, value = text) => {
    e?.preventDefault();
    if (!value.trim()) return;
    useMatch.getState().sendMessage(value);
    setText("");
  };
  return (
    <>
      <div ref={list} role="log" aria-label="Chat" className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-0.5">
        <span className="flex-1" />
        {chat.length ? (
          chat.map((c) => (
            <div key={c.id} className={cn("flex max-w-[85%] flex-col", c.fromMe ? "items-end self-end" : "items-start self-start")}>
              <p
                className={cn(
                  "rounded-[18px] px-3.5 py-2 text-[14px] leading-[1.4]",
                  c.gift ? "bg-gold/20 text-text" : c.fromMe ? "bg-gradient-to-br from-violet to-[#7c3aed] text-white" : "bg-surface2 text-text",
                )}
              >
                {c.gift ? `${c.gift.emoji} ${c.text}` : c.text}
              </p>
              {c.hidden ? <HiddenNote /> : null}
            </div>
          ))
        ) : (
          <p className="type-body self-center px-6 pb-2 text-center text-[13px] text-muted">
            Say hi to {partnerName}. Messages here disappear when the call ends.
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {QUICK_REACTIONS.map((r) => (
          <button
            key={r}
            type="button"
            aria-label={`Send ${r}`}
            onClick={() => send(undefined, r)}
            className="flex h-9 w-11 items-center justify-center rounded-full border border-line bg-white/4 text-[18px] hover:bg-white/8"
          >
            {r}
          </button>
        ))}
      </div>
      <form onSubmit={send} className="flex h-12 items-center gap-2 rounded-full border border-line bg-white/5 pr-1.5 pl-4">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Say something…"
          aria-label={`Message ${partnerName}`}
          className="type-body min-w-0 flex-1 bg-transparent text-[14px] text-text outline-none placeholder:text-muted"
        />
        <button
          type="submit"
          aria-label="Send"
          disabled={!text.trim()}
          className="bg-brand flex size-9 shrink-0 items-center justify-center rounded-full text-white transition-opacity disabled:opacity-40"
        >
          <Icon name="send" size={18} />
        </button>
      </form>
    </>
  );
}

/** Who they are, without leaving the call. */
function AboutPanel({ partner: p, shared }: { partner: Profile; shared: string[] }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-1">
      <div className="flex items-center gap-3">
        <Avatar url={p.avatarUrl} name={p.name} size={56} />
        <span className="flex min-w-0 flex-col">
          <span className="type-title flex items-center gap-1 text-[17px]">
            {p.name}, {p.age}
            {p.verified ? <Icon name="verified" size={16} className="text-trust" label="Verified" /> : null}
          </span>
          <span className="type-body text-[13px] text-text2">
            {p.country.flag} {p.country.name} · Level {p.level}
          </span>
        </span>
      </div>
      {p.bio ? <p className="type-body text-[14px] leading-[1.55] text-text">{p.bio}</p> : null}
      {p.interests.length ? (
        <div>
          <p className="type-overline mb-2.5">{shared.length ? `${shared.length} in common` : "Interests"}</p>
          <div className="flex flex-wrap gap-1.5">
            {p.interests.map((i) => {
              const both = shared.includes(i);
              return (
                <span
                  key={i}
                  className={cn(
                    "type-label flex h-[30px] items-center gap-1 rounded-full px-3 text-[12.5px]",
                    both ? "bg-pink/16 text-pink-soft" : "bg-white/6 text-text",
                  )}
                >
                  {both ? <Icon name="check" size={13} /> : null}
                  {i}
                </span>
              );
            })}
          </div>
        </div>
      ) : null}
      <span className="flex-1" />
      <button
        type="button"
        onClick={() => void openUserProfileSheet(p.id, { inCall: true })}
        className="type-label flex h-11 items-center justify-center gap-2 rounded-full border border-white/10 bg-white/5 text-[14px] hover:bg-white/8"
      >
        <Icon name="visibility" size={18} className="text-text2" />
        See full profile
      </button>
    </div>
  );
}
