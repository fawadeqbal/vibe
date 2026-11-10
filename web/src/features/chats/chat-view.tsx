"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { useNeedCoins } from "@/components/shared/dialogs";
import { pickGift } from "@/components/shared/gift-sheet";
import { pickReport } from "@/components/shared/report-sheet";
import { Avatar } from "@/components/ui/avatar";
import { CircleIconButton } from "@/components/ui/button";
import { HiddenNote } from "@/components/shared/hidden-note";
import { Icon } from "@/components/ui/icon";
import { useNow } from "@/hooks/use-now";
import { Spinner } from "@/components/ui/spinner";
import { KeyHint } from "@/components/ui/kbd";
import { EmptyState } from "@/components/ui/misc";
import { AppBar } from "@/components/ui/page-header";
import { errorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/cn";
import { dayLine, plural, presenceLabel, time } from "@/lib/format";
import type { ChatMessage, Friend } from "@/lib/models";
import { useCalls } from "@/stores/calls";
import { useCatalog } from "@/stores/catalog";
import { useFollows } from "@/stores/follows";
import { CHAT_TYPES, useActivity } from "@/stores/activity";
import { useSocial } from "@/stores/social";
import { toast } from "@/stores/ui";

import { CallButtons, CallsCard, callsMenuItems, useCallState } from "./chat-calls";
import { EmojiPanel, openMessageInfo, openMessageMenu, PhotoMessage, preparePhoto, rememberEmoji, useHold, useVoiceRecorder, VoiceNote, voiceClock } from "./chat-tools";
import { ChatDetails } from "./chat-details";
import { ChatHello, openChatMore } from "./chat-sheets";
import { messageStatus, type MessageStatus, statusTimes } from "./message-status";
import { StreakHeaderChip } from "./streak";
import { Ticks } from "./ticks";

type Panel = "none" | "emoji" | "plus";

/**
 * Chat with a friend: text, emoji, photos, voice notes, gifts, replies and
 * reactions; calls when you both allow them. Gifts here earn them gems too —
 * that is what keeps friends on the app between matches.
 */
/** `focusId`: a message to scroll to and flash (a notification about a reaction or a gift). */
export function ChatView({ friendId, focusId }: { friendId: string; focusId?: string }) {
  const router = useRouter();
  const needCoins = useNeedCoins();
  const f = useSocial((s) => s.all.find((x) => x.profile.id === friendId));
  const msgs = useSocial((s) => s.chats[friendId]);
  const typing = useSocial((s) => !!s.typing[friendId]);
  // "Active 5 min ago" keeps counting while the chat is open.
  useNow(60_000);
  const seenAt = useSocial((s) => s.seenAt[friendId] ?? null);
  const deliveredAt = useSocial((s) => s.deliveredAt[friendId] ?? null);
  // "N new messages" marks what was unread when you opened the chat (not what arrives while you're in it).
  const [openedAt] = useState(() => new Date());
  const e = useCatalog((s) => s.economy);
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [panel, setPanel] = useState<Panel>("none");
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  /** Editing one of your messages: the composer holds its text and saves instead of sending. */
  const [editing, setEditing] = useState<ChatMessage | null>(null);
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
  // Its Notifications lines too (messages already read on another device still leave the line to clear).
  const chatLines = useActivity((s) => s.items.filter((i) => !i.read && i.actor?.id === friendId && CHAT_TYPES.includes(i.type)).map((i) => i.id).join(","));
  useEffect(() => {
    if (chatLines) void useActivity.getState().markRead(chatLines.split(","));
  }, [chatLines]);

  // The list is anchored to the bottom (flex-col-reverse): it opens on the newest message with no
  // scroll from the top, new messages stay in view, and older pages added on top don't move what you see.
  const ready = !!f;
  const hasOlder = useSocial((s) => !!s.olderCursor[friendId]);
  const loadingOlder = useSocial((s) => !!s.loadingOlder[friendId]);
  const top = useRef<HTMLDivElement>(null);
  // Where you were (distance from the newest) before an older page came in: at the very top the browser
  // would otherwise keep you pinned there, and you'd jump to the oldest message and pull in page after page.
  const keepAt = useRef<number | null>(null);
  const loadOlder = useCallback(() => {
    if (!list.current || useSocial.getState().loadingOlder[friendId]) return;
    keepAt.current = list.current.scrollTop;
    void useSocial.getState().loadOlder(friendId);
  }, [friendId]);
  const oldestId = msgs?.[0]?.id;
  useLayoutEffect(() => {
    if (keepAt.current == null || !list.current) return;
    list.current.scrollTop = keepAt.current;
    keepAt.current = null;
  }, [oldestId]);
  useEffect(() => {
    const el = top.current;
    const root = list.current;
    if (!el || !root || !hasOlder) return;
    const io = new IntersectionObserver((e) => e[0]?.isIntersecting && loadOlder(), {
      root,
      rootMargin: "400px 0px 0px 0px",
    });
    io.observe(el);
    return () => io.disconnect();
    // `ready`: the list only exists once the friend is loaded too.
  }, [hasOlder, msgs?.length, ready, loadOlder]);

  // You sent something: back to the newest, wherever you were.
  const last = msgs?.[msgs.length - 1];
  const lastSentId = last?.fromMe ? last.id : null;
  const sentBefore = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    // Not when the chat first opens (it already starts at the newest, or at a message you came for).
    if (sentBefore.current !== undefined && lastSentId && lastSentId !== sentBefore.current) list.current?.scrollTo({ top: 0, behavior: "smooth" });
    if (msgs?.length) sentBefore.current = lastSentId;
  }, [lastSentId, msgs?.length]);

  // Opened at a message: load older pages until it's there, scroll to it, and flash it once.
  const [focus, setFocus] = useState(focusId ?? null);
  useEffect(() => {
    if (!focus || !msgs?.length) return;
    const el = list.current?.querySelector(`[data-mid="${CSS.escape(focus)}"]`);
    if (!el) {
      if (hasOlder) loadOlder();
      return;
    }
    el.scrollIntoView({ block: "center" });
    const t = setTimeout(() => setFocus(null), 2400);
    return () => clearTimeout(t);
  }, [focus, msgs?.length, hasOlder, ready, loadOlder]);

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
    if (editing) {
      const m = editing;
      setEditing(null);
      setText("");
      if (t.trim() === m.text.trim()) return;
      try {
        await useSocial.getState().editMessage(friendId, m.id, t);
      } catch (err) {
        toast(errorMessage(err), { error: true });
      }
      return;
    }
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

  const cancelEdit = () => {
    setEditing(null);
    setText("");
  };

  const startReply = (m: ChatMessage) => {
    if (editing) cancelEdit();
    setReplyTo(m);
    input.current?.focus();
  };

  const onHold = async (m: ChatMessage) => {
    const mine = canUnsend(m, e.chatUnsendMinutes);
    const info = m.fromMe && m.kind !== "system" && !m.unsent && !m.pending && !m.failed;
    const a = await openMessageMenu(m, { unsend: mine, edit: mine && m.kind !== "photo" && m.kind !== "voice", info }, time(m.at));
    if (!a) return;
    try {
      if (a.kind === "react") {
        rememberEmoji(a.emoji);
        await useSocial.getState().react(friendId, m.id, m.reactions?.mine === a.emoji ? null : a.emoji);
      } else if (a.kind === "reply") {
        startReply(m);
      } else if (a.kind === "edit") {
        setReplyTo(null);
        setPanel("none");
        setEditing(m);
        setText(m.text);
        requestAnimationFrame(() => {
          const el = input.current;
          el?.focus();
          el?.setSelectionRange(el.value.length, el.value.length);
        });
      } else if (a.kind === "info") {
        await openMessageInfo(m, p.name, statusTimes(m, seenAt, deliveredAt));
      } else if (a.kind === "copy") {
        await navigator.clipboard.writeText(m.text);
        toast("Copied");
      } else if (a.kind === "unsend") {
        if (editing?.id === m.id) cancelEdit();
        await useSocial.getState().unsend(friendId, m.id);
      } else if (a.kind === "report") {
        const choice = await pickReport(p.name, "person");
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

  const isNew = (m: ChatMessage) => !m.fromMe && m.kind !== "system" && !m.readAt && m.at < openedAt;
  const firstNew = msgs ? msgs.findIndex(isNew) : -1;
  const newCount = firstNew < 0 || !msgs ? 0 : msgs.slice(firstNew).filter(isNew).length;

  return (
    <div className="flex h-[var(--app-h,100dvh)] min-h-0 min-w-0 flex-1">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col pt-[env(safe-area-inset-top)]">
        <AppBar
          onBack={back}
          className="border-b border-line-soft lg:pl-5 lg:[&>span:first-child]:hidden"
          actions={
            <span className="flex items-center gap-1.5">
              {f.state === "friends" ? <CallButtons f={f} state={callState} /> : null}
              <button
                type="button"
                aria-label="More"
                onClick={() =>
                  void openChatMore({
                    f,
                    callItems: f.state === "friends" ? callsMenuItems(f, callState) : [],
                    onProfile: () => router.push(`/u/${friendId}`),
                    onGone: back,
                  })
                }
                className="flex size-10 items-center justify-center rounded-full text-text hover:bg-white/8"
              >
                <Icon name="more_horiz" size={22} />
              </button>
            </span>
          }
        >
          <button
            type="button"
            aria-label={`Open ${p.name}'s profile`}
            className="flex min-w-0 items-center text-left"
            onClick={() => router.push(`/u/${friendId}`)}
          >
            <span className="relative shrink-0">
              <Avatar url={p.avatarUrl} name={p.name} size={40} />
              {f.online ? <span className="absolute right-0 bottom-0 size-3 rounded-full border-2 border-bg bg-ok" /> : null}
            </span>
            <span className="ml-3 min-w-0">
              <span className="flex items-center">
                <span className="type-title truncate text-[16px] font-semibold">{p.name}</span>
                {p.verified ? <Icon name="verified" size={15} className="ml-1 text-trust" label="Verified" /> : null}
              </span>
              <span className={cn("type-label block text-[11.5px] font-medium", typing || f.online ? "text-ok" : "text-muted")}>
                {typing ? "typing…" : (presenceLabel(f.online, f.lastSeenAt) ?? "")}
              </span>
            </span>
          </button>
          <StreakHeaderChip f={f} />
        </AppBar>

        {!msgs?.length ? (
          <ChatHello
            f={f}
            onSend={(t) => {
              void useSocial
                .getState()
                .sendMessage(friendId, t, null)
                .catch((err) => toast(errorMessage(err), { error: true }));
            }}
          />
        ) : (
          <div
            ref={list}
            className="quiet-scroll flex min-h-0 flex-1 flex-col-reverse overflow-x-hidden overflow-y-auto overscroll-y-contain px-4 py-3 [-webkit-touch-callout:none] lg:px-7 lg:py-[18px] [@media(pointer:coarse)]:select-none"
          >
            <div>
              <div ref={top} aria-hidden className="h-px" />
              {loadingOlder ? (
                <div className="flex justify-center py-3" role="status" aria-label="Loading older messages">
                  <Spinner size={20} stroke={2} />
                </div>
              ) : null}
              {msgs.map((m, i) => (
                <Fragment key={m.id}>
                  {i === 0 || dayKey(msgs[i - 1].at) !== dayKey(m.at) ? <DayLine at={m.at} /> : null}
                  {i === firstNew ? <NewLine count={newCount} /> : null}
                <Bubble
                  focused={m.id === focus}
                  m={m}
                  f={f}
                  status={messageStatus(m, seenAt, deliveredAt)}
                  tail={endsRun(msgs, i)}
                  onHold={() => void onHold(m)}
                  onReply={() => startReply(m)}
                  onCallBack={
                    f.calls.mine && f.calls.theirs
                      ? (video) => void useCalls.getState().ring(p, video && f.calls.mineVideo && f.calls.theirsVideo ? "video" : "voice")
                      : undefined
                  }
                />
                </Fragment>
              ))}
              {typing ? (
                <div aria-label={`${first} is typing`} className="mb-1.5 inline-flex gap-1 rounded-[16px] bg-surface2 px-3 py-2.5">
                  <span className="size-1.5 animate-bounce rounded-full bg-muted [animation-delay:-0.3s]" />
                  <span className="size-1.5 animate-bounce rounded-full bg-muted [animation-delay:-0.15s]" />
                  <span className="size-1.5 animate-bounce rounded-full bg-muted" />
                </div>
              ) : null}
            </div>
          </div>
        )}
        {f.state === "friends" ? <CallsCard f={f} state={callState} /> : null}

        <div className="px-3 pt-2 pb-[calc(10px+var(--safe-bottom))] lg:border-t lg:border-line-soft lg:px-[22px] lg:pt-3.5 lg:pb-4">
          {editing ? (
            <div className="mb-2 flex items-center gap-2 rounded-[14px] border-l-[3px] border-pink bg-pink/8 py-1.5 pr-1.5 pl-3">
              <Icon name="edit" size={16} className="shrink-0 text-pink-soft" />
              <span className="min-w-0 flex-1">
                <span className="type-label block text-[11.5px] font-semibold text-pink-soft">Editing message</span>
                <span className="type-body block truncate text-[12.5px] text-text2">{editing.text}</span>
              </span>
              <button
                type="button"
                aria-label="Cancel editing"
                onClick={cancelEdit}
                className="flex size-8 items-center justify-center rounded-full text-muted hover:text-text"
              >
                <Icon name="close" size={16} />
              </button>
            </div>
          ) : replyTo ? (
            <div className="mb-2 flex items-center gap-2 rounded-[14px] border-l-[3px] border-violet bg-violet/10 py-1.5 pr-1.5 pl-3">
              <span className="min-w-0 flex-1">
                <span className="type-label block text-[11.5px] font-semibold text-lavender">Replying to {replyTo.fromMe ? "yourself" : first}</span>
                <span className="type-body block truncate text-[12.5px] text-text2">{previewOf(replyTo)}</span>
              </span>
              <button
                type="button"
                aria-label="Cancel reply"
                onClick={() => setReplyTo(null)}
                className="flex size-8 items-center justify-center rounded-full text-muted hover:text-text"
              >
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
              {
                <CircleIconButton
                  icon={panel === "plus" ? "close" : "add"}
                  label="More: photo, voice note, gift"
                  size={46}
                  iconSize={22}
                  className={cn(panel === "plus" ? "bg-text text-bg" : "bg-white/6 text-text")}
                  onClick={() => setPanel(panel === "plus" ? "none" : "plus")}
                />
              }
              <div className="flex h-[46px] min-w-0 flex-1 items-center rounded-[23px] border border-line bg-surface pr-1 pl-4">
                <input
                  ref={input}
                  value={text}
                  onChange={(ev) => {
                    setText(ev.target.value);
                    if (ev.target.value) useSocial.getState().typingTo(friendId);
                  }}
                  onFocus={() => panel === "emoji" && setPanel("none")}
                  onKeyDown={(ev) => {
                    if (ev.key !== "Escape") return;
                    if (editing) cancelEdit();
                    else if (replyTo) setReplyTo(null);
                  }}
                  placeholder={editing ? "Edit message" : "Message"}
                  aria-label="Message"
                  enterKeyHint="send"
                  className="type-body min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted"
                />
                <button
                  type="button"
                  aria-label="Emoji"
                  aria-expanded={panel === "emoji"}
                  onClick={() => setPanel(panel === "emoji" ? "none" : "emoji")}
                  className={cn(
                    "flex size-9 items-center justify-center rounded-full",
                    panel === "emoji" ? "bg-pink/18 text-pink-soft" : "text-muted hover:text-text",
                  )}
                >
                  <Icon name="sentiment_satisfied" size={22} />
                </button>
              </div>
              {editing ? (
                <CircleIconButton
                  icon="check"
                  label="Save edit"
                  size={46}
                  iconSize={21}
                  type="submit"
                  disabled={!text.trim()}
                  className={cn("text-white", text.trim() ? "bg-violet" : "bg-violet/50")}
                />
              ) : text.trim() ? (
                <CircleIconButton icon="send" label="Send" size={46} iconSize={19} type="submit" className="bg-violet text-white" />
              ) : e.chatVoiceNotesEnabled !== 0 ? (
                <CircleIconButton
                  icon="mic"
                  label="Record a voice note"
                  size={46}
                  iconSize={21}
                  className="bg-brand text-white"
                  onClick={() => void recordVoice()}
                />
              ) : (
                <CircleIconButton icon="send" label="Send" size={46} iconSize={19} type="submit" className="bg-violet/50 text-white" />
              )}
            </form>
          )}

          {panel === "emoji" ? <EmojiPanel onPick={(em) => setText((t) => t + em)} /> : null}
          {panel === "plus" ? (
            <div className="mt-3 grid grid-cols-4 gap-2">
              {e.chatPhotosEnabled !== 0 ? <Tool icon="image" label="Photo" tint="bg-info/16 text-info" onClick={() => photoInput.current?.click()} /> : null}
              {e.chatPhotosEnabled !== 0 ? (
                <Tool icon="photo_camera" label="Camera" tint="bg-trust/14 text-trust" onClick={() => cameraInput.current?.click()} />
              ) : null}
              {e.chatVoiceNotesEnabled !== 0 ? (
                <Tool icon="mic" label="Voice note" tint="bg-pink/16 text-pink-soft" onClick={() => void recordVoice()} />
              ) : null}
              <Tool icon="redeem" label="Gift" tint="bg-gold/14 text-gold" onClick={() => void gift()} />
            </div>
          ) : null}
          {panel === "plus" ? (
            <p className="type-body mt-2.5 px-1 text-center text-[12px] text-muted">
              Photos and voice notes go only to {first}. You can unsend for {e.chatUnsendMinutes || 10} minutes.
            </p>
          ) : null}
          <input
            ref={cameraInput}
            type="file"
            accept="image/*"
            capture="user"
            hidden
            onChange={(ev) => void sendPhoto(ev.target.files?.[0] ?? undefined).then(() => (ev.target.value = ""))}
          />
          <input
            ref={photoInput}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/*"
            hidden
            onChange={(ev) => void sendPhoto(ev.target.files?.[0] ?? undefined).then(() => (ev.target.value = ""))}
          />
          <p className="hidden gap-4 pt-2.5 pl-1 lg:flex">
            <KeyHint k="Enter" label="Send" />
          </p>
        </div>
      </div>
      <ChatDetails f={f} msgs={msgs} onGift={() => void gift()} onGone={back} className="hidden xl:flex" />
    </div>
  );
}

function Tool({ icon, label, tint, onClick }: { icon: string; label: string; tint: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="type-label flex flex-col items-center gap-1.5 rounded-[14px] py-1.5 text-[12px] text-text2 hover:bg-white/4"
    >
      <span className={cn("flex size-[52px] items-center justify-center rounded-[18px]", tint)}>
        <Icon name={icon} size={24} />
      </span>
      {label}
    </button>
  );
}

/**
 * Time and ticks in the corner of a bubble (and "edited"), like WhatsApp:
 * floated to the end of the last line of text; on a photo, a dark pill over
 * its corner; under a voice note, on its own line.
 */
function Meta({ m, status, onMine = false, overlay = false, inline = false }: { m: ChatMessage; status: MessageStatus | null; onMine?: boolean; overlay?: boolean; inline?: boolean }) {
  return (
    <span
      className={cn(
        "type-label inline-flex items-center gap-[3px] text-[11px] font-medium whitespace-nowrap tabular-nums not-italic",
        overlay
          ? "absolute right-2 bottom-2 rounded-full bg-black/45 px-2 py-0.5 text-white backdrop-blur-sm"
          : inline
            ? "mt-0.5"
            : "relative top-[5px] float-right ml-2.5",
        !overlay && (onMine ? "text-white/70" : "text-muted"),
      )}
    >
      {m.edited ? <span className="italic">edited</span> : null}
      {time(m.at)}
      {status ? <Ticks status={status} onMine={onMine || overlay} /> : null}
    </span>
  );
}

/** Your own text, photo or voice note, still inside the unsend window. */
function canUnsend(m: ChatMessage, minutes: number): boolean {
  return m.fromMe && !m.unsent && !m.gift && m.kind !== "system" && minutes > 0 && Date.now() - m.at.getTime() < minutes * 60_000;
}

const previewOf = (m: { kind?: string; text: string; unsent?: boolean }) =>
  m.unsent ? "Message unsent" : m.kind === "photo" ? "📷 Photo" : m.kind === "voice" ? "🎤 Voice message" : m.text;

/** The last message of a run from one side (the next is the other side's, a system line, another day, or nothing). */
function endsRun(msgs: ChatMessage[], i: number): boolean {
  const next = msgs[i + 1];
  return !next || next.kind === "system" || next.fromMe !== msgs[i].fromMe || dayKey(next.at) !== dayKey(msgs[i].at);
}

const dayKey = (t: Date) => `${t.getFullYear()}-${t.getMonth()}-${t.getDate()}`;

/** Today · Yesterday · Monday · 12 Oct, between days. */
function DayLine({ at }: { at: Date }) {
  return (
    <div className="my-3 flex justify-center">
      <span className="type-label rounded-full bg-white/6 px-3 py-1 text-[12px] font-semibold text-text2">{dayLine(at)}</span>
    </div>
  );
}

/** Where you stopped reading: "3 new messages". */
function NewLine({ count }: { count: number }) {
  return (
    <div className="my-3 flex items-center gap-2.5" role="separator" aria-label={`${count} new ${plural(count, "message")}`}>
      <span className="h-px flex-1 bg-pink/35" />
      <span className="type-label text-[12px] font-bold text-pink-soft">
        {count} new {plural(count, "message")}
      </span>
      <span className="h-px flex-1 bg-pink/35" />
    </div>
  );
}

function Bubble({
  m,
  f,
  tail,
  focused = false,
  status,
  onHold,
  onReply,
  onCallBack,
}: {
  m: ChatMessage;
  f: Friend;
  tail: boolean;
  focused?: boolean;
  /** Your message: sending, sent, delivered, seen or not sent (the ticks). */
  status: MessageStatus | null;
  onHold: () => void;
  onReply: () => void;
  onCallBack?: (video: boolean) => void;
}) {
  const hold = useHold(onHold, onReply);
  if (m.kind === "system") return <SystemLine m={m} onCallBack={onCallBack} />;
  const mine = m.fromMe;
  const gift = !!m.gift;
  const media = m.kind === "photo" || m.kind === "voice";
  const url = typeof m.meta?.url === "string" ? m.meta.url : "";
  const first = f.profile.name.split(" ")[0];
  const reactions = [m.reactions?.theirs, m.reactions?.mine].filter((x): x is string => !!x);
  const live = !m.unsent && !m.pending && !m.failed;
  return (
    <div
      data-mid={m.id}
      className={cn("group/msg flex flex-col", tail ? "mb-2.5" : "mb-1", mine ? "items-end" : "items-start pl-[34px]", reactions.length && "mb-3.5")}
    >
      <div className={cn("relative flex max-w-[78%] items-center gap-1", mine && "flex-row-reverse")}>
      {live ? (
        // Swipe right to reply: the hint grows beside the bubble as it moves (`--swipe`).
        <span
          aria-hidden
          className="pointer-events-none absolute top-1/2 right-full mr-1.5 flex size-8 items-center justify-center rounded-full bg-white/8 text-text"
          style={{ opacity: "var(--swipe, 0)", transform: "translateY(-50%) scale(calc(0.6 + var(--swipe, 0) * 0.4))" }}
        >
          <Icon name="reply" size={18} />
        </span>
      ) : null}
      <div
        {...(live ? hold : {})}
        className={cn(
          "relative min-w-0 touch-pan-y rounded-[20px] select-none [-webkit-touch-callout:none]",
          tail && (mine ? "rounded-br-[6px]" : "rounded-bl-[6px]"),
          m.unsent
            ? "border border-dashed border-white/16 px-3 py-2"
            : gift
              ? "border border-gold/40 bg-gold/12 px-3.5 py-2.5"
              : m.kind === "photo"
                ? "p-1"
                : mine
                  ? "bg-gradient-to-br from-violet to-[#7c3aed] px-[13px] py-[9px]"
                  : "bg-surface2 px-[13px] py-[9px]",
          m.kind === "photo" && (mine ? "bg-violet" : "bg-surface2"),
          (m.pending || m.failed) && "opacity-70",
          "transition-shadow duration-500",
          focused && "shadow-[0_0_0_2px_var(--color-bg),0_0_0_4px_var(--color-pink-soft)]",
        )}
      >
        {m.replyTo && !m.unsent ? (
          <div
            className={cn(
              "mb-1.5 rounded-[10px] border-l-[3px] px-2.5 py-1 text-[12px]",
              mine && !gift ? "border-white/70 bg-white/14 text-white/85" : "border-violet bg-violet/14 text-lavender",
              m.kind === "photo" && "mx-1 mt-1",
            )}
          >
            <span className="block font-semibold">{m.replyTo.fromMe === mine ? (mine ? "You" : first) : mine ? first : "You"}</span>
            <span className="block truncate">{previewOf(m.replyTo)}</span>
          </div>
        ) : null}
        {m.unsent ? (
          <p className="type-body text-[13.5px] text-muted italic">
            {mine ? "You unsent a message" : "Message unsent"}
            <Meta m={m} status={null} />
          </p>
        ) : (
          <>
            {m.gift ? <p className="text-[30px] leading-[1.2]">{m.gift.emoji}</p> : null}
            {m.kind === "photo" && url ? (
              <span className="relative block">
                <PhotoMessage url={url} w={Number(m.meta?.w) || undefined} h={Number(m.meta?.h) || undefined} mine={mine} pending={m.pending} />
                <Meta m={m} status={status} onMine overlay />
              </span>
            ) : null}
            {m.kind === "voice" && url ? (
              <>
                <VoiceNote url={url} seconds={Number(m.meta?.seconds) || 0} mine={mine} />
                <span className="flex justify-end">
                  <Meta m={m} status={status} onMine={mine} inline />
                </span>
              </>
            ) : null}
            {!media ? (
              <p className={cn("type-body text-[14.5px] leading-[1.4] break-words", mine && !gift ? "text-white" : "text-text")}>
                {m.text}
                <Meta m={m} status={status} onMine={mine && !gift} />
              </p>
            ) : null}
          </>
        )}
        {m.failed ? (
          <button
            type="button"
            onClick={() => void useSocial.getState().retryMessage(f.profile.id, m.id).catch(() => {})}
            className="type-label mt-0.5 flex items-center gap-1 text-[10.5px] font-semibold text-white/90 underline-offset-2 hover:underline"
          >
            <Icon name="error_outline" size={13} />
            Not sent · Tap to retry
          </button>
        ) : null}
        {!mine && tail ? (
          <span className="absolute bottom-0 -left-[34px]">
            <Avatar url={f.profile.avatarUrl} name={f.profile.name} size={26} />
          </span>
        ) : null}
        {reactions.length ? (
          <button
            type="button"
            onClick={onHold}
            aria-label={`Reactions: ${reactions.join(" ")}`}
            className={cn(
              "absolute -bottom-3 flex h-6 items-center gap-0.5 rounded-full border-2 border-bg bg-surface3 px-1.5 text-[12px]",
              mine ? "right-2" : "left-2",
            )}
          >
            {reactions.join("")}
            {reactions.length > 1 ? <span className="ml-0.5 text-[11px] text-muted">2</span> : null}
          </button>
        ) : null}
      </div>
      {live ? (
        // With a mouse: reply and more on hover, beside the bubble.
        <span className="hidden shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/msg:opacity-100 focus-within:opacity-100 [@media(hover:hover)_and_(pointer:fine)]:flex">
          <button type="button" aria-label="Reply" title="Reply" onClick={onReply} className="flex size-8 items-center justify-center rounded-full text-muted hover:bg-white/8 hover:text-text">
            <Icon name="reply" size={18} />
          </button>
          <button type="button" aria-label="More actions" title="React, copy, edit…" onClick={onHold} className="flex size-8 items-center justify-center rounded-full text-muted hover:bg-white/8 hover:text-text">
            <Icon name="more_horiz" size={18} />
          </button>
        </span>
      ) : null}
      </div>
      {mine && m.hidden && !m.unsent ? <HiddenNote className={cn(reactions.length && "mt-3.5")} /> : null}
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
  const icon =
    (event === "call_ended" || event === "calls_on" || event === "calls_asked") && video
      ? "videocam"
      : event === "call_missed" && video
        ? "missed_video_call"
        : look.icon;
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
      <span
        className={cn(
          "type-label inline-flex max-w-[86%] items-center gap-1.5 rounded-full py-1.5 pr-3 pl-3 text-center text-[12px] font-semibold",
          look.tone,
          callBack && "pr-1.5",
        )}
      >
        <Icon name={icon} variant={event === "matched" ? "filled" : undefined} size={14} />
        {text} · {time(m.at)}
        {callBack ? (
          <button
            type="button"
            onClick={() => onCallBack(video)}
            className="ml-1 rounded-full bg-white/10 px-2.5 py-1 text-[11.5px] font-semibold text-text hover:bg-white/16"
          >
            Call back
          </button>
        ) : null}
      </span>
    </div>
  );
}
