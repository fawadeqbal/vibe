"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useRef, useState } from "react";

import { useNeedCoins } from "@/components/shared/dialogs";
import { pickGift } from "@/components/shared/gift-sheet";
import { pickReport } from "@/components/shared/report-sheet";
import { Avatar } from "@/components/ui/avatar";
import { CircleIconButton } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { MenuButton } from "@/components/ui/menu";
import { EmptyState } from "@/components/ui/misc";
import { AppBar } from "@/components/ui/page-header";
import { errorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/cn";
import { ago, time } from "@/lib/format";
import type { ChatMessage, Friend } from "@/lib/models";
import { useCalls } from "@/stores/calls";
import { useCatalog } from "@/stores/catalog";
import { useFollows } from "@/stores/follows";
import { useSocial } from "@/stores/social";
import { toast } from "@/stores/ui";

import { CallButtons, CallsCard, callsMenuItems, useCallState } from "./chat-calls";
import { EmojiPanel, openMessageMenu, PhotoMessage, preparePhoto, rememberEmoji, useHold, useVoiceRecorder, VoiceNote, voiceClock } from "./chat-tools";
import { StreakHeaderChip } from "./streak";

type Panel = "none" | "emoji" | "plus";

/**
 * Chat with a friend: text, emoji, photos, voice notes, gifts, replies and
 * reactions; calls when you both allow them. Gifts here earn them gems too —
 * that is what keeps friends on the app between matches.
 */
export function ChatView({ friendId }: { friendId: string }) {
  const router = useRouter();
  const needCoins = useNeedCoins();
  const f = useSocial((s) => s.all.find((x) => x.profile.id === friendId));
  const msgs = useSocial((s) => s.chats[friendId]);
  const typing = useSocial((s) => !!s.typing[friendId]);
  const seenAt = useSocial((s) => s.seenAt[friendId] ?? null);
  const e = useCatalog((s) => s.economy);
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [panel, setPanel] = useState<Panel>("none");
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const callState = useCallState(friendId);
  const voice = useVoiceRecorder(Math.max(5, e.chatVoiceNoteMaxSeconds || 60));
  const back = () => router.push("/chats");

  useEffect(() => {
    const social = useSocial.getState();
    void social.ensureMessages(friendId);
    return () => social.leaveChat(friendId);
  }, [friendId]);

  // Opening (and every new message while open) marks the chat read.
  useEffect(() => {
    if (f && f.unread > 0) useSocial.getState().markRead(friendId);
  }, [f, friendId]);

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" });
  }, [msgs?.length, typing]);

  // "Calls unlock when you've both said something": re-check once you have.
  const blockedByMessages = callState?.askBlockedBy === "messages";
  useEffect(() => {
    if (blockedByMessages && msgs?.length) void useCalls.getState().loadState(friendId);
  }, [blockedByMessages, msgs?.length, friendId]);

  if (!f) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <AppBar onBack={back} className="lg:hidden" />
        <EmptyState className="flex-1" icon="person_off" title="Not friends any more" body="This conversation is gone." />
      </div>
    );
  }
  const p = f.profile;
  const first = p.name.split(" ")[0] || p.name;

  const send = async (ev?: FormEvent) => {
    ev?.preventDefault();
    const t = text;
    if (!t.trim()) return;
    const reply = replyTo?.id ?? null;
    setText("");
    setReplyTo(null);
    try {
      await useSocial.getState().sendMessage(friendId, t, reply);
    } catch (err) {
      toast(errorMessage(err), { error: true });
    }
  };

  const gift = async () => {
    setPanel("none");
    const g = await pickGift(p.name);
    if (!g) return;
    try {
      if (!(await useSocial.getState().sendGift(friendId, g))) await needCoins(`A ${g.name} costs ${g.coins} coins.`);
    } catch (err) {
      toast(errorMessage(err), { error: true });
    }
  };

  const sendPhoto = async (file: File | undefined) => {
    setPanel("none");
    if (!file) return;
    const reply = replyTo?.id ?? null;
    setReplyTo(null);
    try {
      const { blob, w, h } = await preparePhoto(file);
      await useSocial.getState().sendMedia(friendId, "photo", blob, { w, h, replyToId: reply });
    } catch (err) {
      toast(errorMessage(err), { error: true });
    }
  };

  const recordVoice = async () => {
    setPanel("none");
    try {
      const { result } = await voice.start();
      const reply = replyTo?.id ?? null;
      const r = await result;
      if (!r) return;
      setReplyTo(null);
      await useSocial.getState().sendMedia(friendId, "voice", r.blob, { seconds: r.seconds, replyToId: reply });
    } catch (err) {
      toast(err instanceof DOMException ? "Microphone not available. Allow it in your browser to send voice notes." : errorMessage(err), { error: true });
    }
  };

  const onHold = async (m: ChatMessage) => {
    const a = await openMessageMenu(m, canUnsend(m, e.chatUnsendMinutes));
    if (!a) return;
    try {
      if (a.kind === "react") {
        rememberEmoji(a.emoji);
        await useSocial.getState().react(friendId, m.id, m.reactions?.mine === a.emoji ? null : a.emoji);
      } else if (a.kind === "reply") {
        setReplyTo(m);
        input.current?.focus();
      } else if (a.kind === "copy") {
        await navigator.clipboard.writeText(m.text);
        toast("Copied");
      } else if (a.kind === "unsend") {
        await useSocial.getState().unsend(friendId, m.id);
      } else if (a.kind === "report") {
        const choice = await pickReport(p.name);
        if (!choice) return;
        await useFollows.getState().report(friendId, choice);
        toast(`Thanks. ${first} was reported${choice.block ? " and blocked" : ""}.`);
        if (choice.block) {
          await useSocial.getState().load();
          back();
        }
      }
    } catch (err) {
      toast(errorMessage(err), { error: true });
    }
  };

  // "Seen" under your last message once they've read it.
  const lastMine = [...(msgs ?? [])].reverse().find((m) => m.fromMe && m.kind !== "system" && !m.pending);
  const seen = !!lastMine && ((lastMine.readAt && lastMine.readAt >= lastMine.at) || (seenAt && seenAt >= lastMine.at));

  return (
    <div className="flex h-dvh min-h-0 flex-1 flex-col pt-[env(safe-area-inset-top)] lg:h-dvh">
      <AppBar
        onBack={back}
        className="border-b border-line-soft lg:pl-5 lg:[&>span:first-child]:hidden"
        actions={
          <span className="flex items-center gap-1.5">
            {f.state === "friends" ? <CallButtons f={f} state={callState} /> : null}
            <MenuButton
              label="More"
              items={[
                ...(f.state === "friends" ? callsMenuItems(f, callState) : []),
                { label: "Remove friend", onSelect: () => void useSocial.getState().remove(friendId).then(back) },
                { label: "Block", tone: "bad", onSelect: () => void useSocial.getState().block(p).then(back) },
              ]}
            />
          </span>
        }
      >
        <button type="button" aria-label={`Open ${p.name}'s profile`} className="flex min-w-0 items-center text-left" onClick={() => router.push(`/u/${friendId}`)}>
          <span className="relative shrink-0">
            <Avatar url={p.avatarUrl} name={p.name} size={40} />
            {f.online ? <span className="absolute right-0 bottom-0 size-3 rounded-full border-2 border-bg bg-ok" /> : null}
          </span>
          <span className="ml-3 min-w-0">
            <span className="flex items-center">
              <span className="type-title truncate text-[16px] font-semibold">{p.name}</span>
              {p.verified ? <Icon name="verified" size={15} className="ml-1 text-trust" label="Verified" /> : null}
            </span>
            <span className={cn("type-label block text-[11.5px] font-medium", typing || f.online ? "text-ok" : "text-muted")}>{typing ? "typing…" : f.online ? "Online" : `Last seen ${ago(f.since)}`}</span>
          </span>
        </button>
        <StreakHeaderChip f={f} />
      </AppBar>

      {!msgs?.length ? (
        <EmptyState className="flex-1" icon="waving_hand" title="Say hi to " accent={p.name} body={`You met in a match. ${p.bio}`} />
      ) : (
        <div ref={list} className="quiet-scroll min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {msgs.map((m) => (
            <Bubble
              key={m.id}
              m={m}
              f={f}
              onHold={() => void onHold(m)}
              onCallBack={f.calls.mine && f.calls.theirs ? (video) => void useCalls.getState().ring(p, video && f.calls.mineVideo && f.calls.theirsVideo ? "video" : "voice") : undefined}
            />
          ))}
          {seen ? <p className="type-label -mt-0.5 mb-1.5 text-right text-[11px] text-muted">Seen</p> : null}
          {typing ? (
            <div aria-label={`${first} is typing`} className="mb-1.5 inline-flex gap-1 rounded-[16px] bg-surface2 px-3 py-2.5">
              <span className="size-1.5 animate-bounce rounded-full bg-muted [animation-delay:-0.3s]" />
              <span className="size-1.5 animate-bounce rounded-full bg-muted [animation-delay:-0.15s]" />
              <span className="size-1.5 animate-bounce rounded-full bg-muted" />
            </div>
          ) : null}
        </div>
      )}
      {f.state === "friends" ? <CallsCard f={f} state={callState} /> : null}

      <div className="px-3 pt-2 pb-[calc(10px+env(safe-area-inset-bottom))]">
        {replyTo ? (
          <div className="mb-2 flex items-center gap-2 rounded-[14px] border-l-[3px] border-violet bg-violet/10 py-1.5 pr-1.5 pl-3">
            <span className="min-w-0 flex-1">
              <span className="type-label block text-[11.5px] font-semibold text-lavender">Replying to {replyTo.fromMe ? "yourself" : first}</span>
              <span className="type-body block truncate text-[12.5px] text-text2">{previewOf(replyTo)}</span>
            </span>
            <button type="button" aria-label="Cancel reply" onClick={() => setReplyTo(null)} className="flex size-8 items-center justify-center rounded-full text-muted hover:text-text">
              <Icon name="close" size={16} />
            </button>
          </div>
        ) : null}

        {voice.recording ? (
          <div className="flex items-center gap-2">
            <CircleIconButton icon="delete" label="Cancel voice note" size={48} iconSize={22} className="bg-white/6 text-bad" onClick={voice.cancel} />
            <div className="flex h-12 flex-1 items-center gap-2.5 rounded-[24px] border border-pink/40 bg-pink/8 px-4">
              <span className="size-2.5 animate-pulse rounded-full bg-pink" />
              <span className="type-label text-[14px] text-text tabular-nums">{voiceClock(voice.seconds)}</span>
              <span className="type-body text-[12.5px] text-muted">/ {voiceClock(e.chatVoiceNoteMaxSeconds || 60)} · recording</span>
            </div>
            <CircleIconButton icon="send" label="Send voice note" size={48} iconSize={20} className="bg-brand text-white" onClick={voice.stop} />
          </div>
        ) : (
          <form onSubmit={send} className="flex items-center gap-1.5">
            {(
              <CircleIconButton
                icon={panel === "plus" ? "close" : "add"}
                label="More: photo, voice note, gift"
                size={46}
                iconSize={22}
                className={cn(panel === "plus" ? "bg-text text-bg" : "bg-white/6 text-text")}
                onClick={() => setPanel(panel === "plus" ? "none" : "plus")}
              />
            )}
            <div className="flex h-[46px] min-w-0 flex-1 items-center rounded-[23px] border border-line bg-surface pr-1 pl-4">
              <input
                ref={input}
                value={text}
                onChange={(ev) => {
                  setText(ev.target.value);
                  if (ev.target.value) useSocial.getState().typingTo(friendId);
                }}
                onFocus={() => panel === "emoji" && setPanel("none")}
                placeholder="Message"
                aria-label="Message"
                enterKeyHint="send"
                className="type-body min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted"
              />
              <button
                type="button"
                aria-label="Emoji"
                aria-expanded={panel === "emoji"}
                onClick={() => setPanel(panel === "emoji" ? "none" : "emoji")}
                className={cn("flex size-9 items-center justify-center rounded-full", panel === "emoji" ? "bg-pink/18 text-pink-soft" : "text-muted hover:text-text")}
              >
                <Icon name="sentiment_satisfied" size={22} />
              </button>
            </div>
            {text.trim() ? (
              <CircleIconButton icon="send" label="Send" size={46} iconSize={19} type="submit" className="bg-violet text-white" />
            ) : e.chatVoiceNotesEnabled !== 0 ? (
              <CircleIconButton icon="mic" label="Record a voice note" size={46} iconSize={21} className="bg-brand text-white" onClick={() => void recordVoice()} />
            ) : (
              <CircleIconButton icon="send" label="Send" size={46} iconSize={19} type="submit" className="bg-violet/50 text-white" />
            )}
          </form>
        )}

        {panel === "emoji" ? <EmojiPanel onPick={(em) => setText((t) => t + em)} /> : null}
        {panel === "plus" ? (
          <div className="mt-3 grid grid-cols-4 gap-2">
            {e.chatPhotosEnabled !== 0 ? <Tool icon="image" label="Photo" tint="bg-info/16 text-info" onClick={() => photoInput.current?.click()} /> : null}
            {e.chatVoiceNotesEnabled !== 0 ? <Tool icon="mic" label="Voice note" tint="bg-pink/16 text-pink-soft" onClick={() => void recordVoice()} /> : null}
            <Tool icon="redeem" label="Gift" tint="bg-gold/14 text-gold" onClick={() => void gift()} />
            <Tool icon="sentiment_satisfied" label="Emoji" tint="bg-violet/18 text-lavender" onClick={() => setPanel("emoji")} />
          </div>
        ) : null}
        <input ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp,image/*" hidden onChange={(ev) => void sendPhoto(ev.target.files?.[0] ?? undefined).then(() => (ev.target.value = ""))} />
      </div>
    </div>
  );
}

function Tool({ icon, label, tint, onClick }: { icon: string; label: string; tint: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="type-label flex flex-col items-center gap-1.5 rounded-[14px] py-1.5 text-[12px] text-text2 hover:bg-white/4">
      <span className={cn("flex size-[52px] items-center justify-center rounded-[18px]", tint)}>
        <Icon name={icon} size={24} />
      </span>
      {label}
    </button>
  );
}

/** Your own text, photo or voice note, still inside the unsend window. */
function canUnsend(m: ChatMessage, minutes: number): boolean {
  return m.fromMe && !m.unsent && !m.gift && m.kind !== "system" && minutes > 0 && Date.now() - m.at.getTime() < minutes * 60_000;
}

const previewOf = (m: { kind?: string; text: string; unsent?: boolean }) =>
  m.unsent ? "Message unsent" : m.kind === "photo" ? "📷 Photo" : m.kind === "voice" ? "🎤 Voice message" : m.text;

function Bubble({ m, f, onHold, onCallBack }: { m: ChatMessage; f: Friend; onHold: () => void; onCallBack?: (video: boolean) => void }) {
  const hold = useHold(onHold);
  if (m.kind === "system") return <SystemLine m={m} onCallBack={onCallBack} />;
  const mine = m.fromMe;
  const gift = !!m.gift;
  const media = m.kind === "photo" || m.kind === "voice";
  const url = typeof m.meta?.url === "string" ? m.meta.url : "";
  const first = f.profile.name.split(" ")[0];
  const reactions = [m.reactions?.theirs, m.reactions?.mine].filter((x): x is string => !!x);
  return (
    <div className={cn("mb-1.5 flex flex-col", mine ? "items-end" : "items-start", reactions.length && "mb-3")}>
      <div
        {...(m.unsent || m.pending ? {} : hold)}
        className={cn(
          "relative max-w-[78%] rounded-[18px] select-none",
          mine ? "rounded-br-[6px]" : "rounded-bl-[6px]",
          m.unsent
            ? "border border-dashed border-white/16 px-3 py-2"
            : gift
              ? "border border-gold/40 bg-gold/12 px-3.5 py-2.5"
              : m.kind === "photo"
                ? "p-1"
                : mine
                  ? "bg-violet px-3 py-2"
                  : "bg-surface2 px-3 py-2",
          m.kind === "photo" && (mine ? "bg-violet" : "bg-surface2"),
          m.pending && "opacity-70",
        )}
      >
        {m.replyTo && !m.unsent ? (
          <div className={cn("mb-1.5 rounded-[10px] border-l-[3px] px-2.5 py-1 text-[12px]", mine && !gift ? "border-white/70 bg-white/14 text-white/85" : "border-violet bg-violet/14 text-lavender", m.kind === "photo" && "mx-1 mt-1")}>
            <span className="block font-semibold">{m.replyTo.fromMe === mine ? (mine ? "You" : first) : mine ? first : "You"}</span>
            <span className="block truncate">{previewOf(m.replyTo)}</span>
          </div>
        ) : null}
        {m.unsent ? (
          <p className="type-body text-[13.5px] text-muted italic">{mine ? "You unsent a message" : "Message unsent"}</p>
        ) : (
          <>
            {m.gift ? <p className="text-[30px] leading-[1.2]">{m.gift.emoji}</p> : null}
            {m.kind === "photo" && url ? <PhotoMessage url={url} w={Number(m.meta?.w) || undefined} h={Number(m.meta?.h) || undefined} mine={mine} pending={m.pending} /> : null}
            {m.kind === "voice" && url ? <VoiceNote url={url} seconds={Number(m.meta?.seconds) || 0} mine={mine} /> : null}
            {!media ? <p className={cn("type-body text-[15px] break-words", mine && !gift ? "text-white" : "text-text")}>{m.text}</p> : null}
          </>
        )}
        <p className={cn("type-label mt-0.5 text-[10px] font-medium", m.kind === "photo" && "px-1.5 pb-0.5", mine && !gift && !m.unsent ? "text-white/70" : "text-muted")}>{m.pending ? "Sending…" : time(m.at)}</p>
        {reactions.length ? (
          <button
            type="button"
            onClick={onHold}
            aria-label={`Reactions: ${reactions.join(" ")}`}
            className={cn("absolute -bottom-3 flex h-6 items-center gap-0.5 rounded-full border-2 border-bg bg-surface3 px-1.5 text-[12px]", mine ? "right-2" : "left-2")}
          >
            {reactions.join("")}
            {reactions.length > 1 ? <span className="ml-0.5 text-[11px] text-muted">2</span> : null}
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** A line from Vibe in the chat ("You matched in Discover", call events). */
const SYSTEM_LOOK: Record<string, { icon: string; tone: string }> = {
  matched: { icon: "favorite", tone: "bg-pink/12 text-pink-soft" },
  calls_on: { icon: "call", tone: "bg-ok/10 text-ok" },
  calls_asked: { icon: "call", tone: "bg-violet/14 text-lavender" },
  calls_off: { icon: "phone_disabled", tone: "bg-surface text-text2" },
  calls_voice_only: { icon: "call", tone: "bg-surface text-text2" },
  calls_declined: { icon: "phone_disabled", tone: "bg-surface text-text2" },
  call_ended: { icon: "call", tone: "bg-surface text-text2" },
  call_missed: { icon: "phone_missed", tone: "bg-pink/10 text-pink-soft" },
  call_declined: { icon: "phone_missed", tone: "bg-surface text-text2" },
};

function SystemLine({ m, onCallBack }: { m: ChatMessage; onCallBack?: (video: boolean) => void }) {
  const event = typeof m.meta?.event === "string" ? m.meta.event : "";
  const video = m.meta?.video !== false;
  const look = SYSTEM_LOOK[event] ?? { icon: "info", tone: "bg-surface text-text2" };
  const icon = (event === "call_ended" || event === "calls_on" || event === "calls_asked") && video ? "videocam" : event === "call_missed" && video ? "missed_video_call" : look.icon;
  // Your own ask reads "You asked…"; theirs keeps their name.
  const text =
    event === "calls_asked" && m.fromMe
      ? m.text.includes("video too")
        ? "You asked to allow video too"
        : `You asked to allow ${video ? "voice and video" : "voice"} calls`
      : event === "call_missed" && m.fromMe
        ? "No answer"
        : m.text;
  const callBack = event === "call_missed" && !m.fromMe && onCallBack;
  return (
    <div className="my-2.5 flex justify-center">
      <span className={cn("type-label inline-flex max-w-[86%] items-center gap-1.5 rounded-full py-1.5 pr-3 pl-3 text-center text-[12px] font-semibold", look.tone, callBack && "pr-1.5")}>
        <Icon name={icon} variant={event === "matched" ? "filled" : undefined} size={14} />
        {text} · {time(m.at)}
        {callBack ? (
          <button type="button" onClick={() => onCallBack(video)} className="ml-1 rounded-full bg-white/10 px-2.5 py-1 text-[11.5px] font-semibold text-text hover:bg-white/16">
            Call back
          </button>
        ) : null}
      </span>
    </div>
  );
}
