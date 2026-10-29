"use client";

import { useEffect, useRef, useState } from "react";

import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import type { ChatMessage } from "@/lib/models";
import { openSheet } from "@/stores/ui";

// ── emoji ───────────────────────────────────────────────────────────────────

export const QUICK_REACTIONS = ["❤️", "😂", "😮", "😢", "🙏", "👍"];

const EMOJI_GROUPS: [string, string[]][] = [
  ["Smileys", ["😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😂", "🙂", "😉", "😊", "😇", "🥰", "😍", "🤩", "😘", "😋", "😛", "😜", "🤪", "🤗", "🤭", "🤔", "😐", "😏", "😒", "🙄", "😬", "😌", "😔", "😴", "🥳", "😎", "🥹", "😭", "😤", "😡", "🤯", "😳", "🥺"]],
  ["Love", ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💖", "💗", "💓", "💕", "💞", "💘", "💝", "💌", "😻", "🌹", "💐", "🫶", "💋", "💯", "✨"]],
  ["Hands", ["👍", "👎", "👏", "🙌", "🙏", "🤝", "✌️", "🤞", "🤟", "🤙", "👋", "👌", "💪", "✋", "👊", "🫡", "🤌", "☝️", "👀", "🫣"]],
  ["Food", ["☕", "🍵", "🧋", "🍕", "🍔", "🍟", "🌮", "🍜", "🍩", "🍰", "🧁", "🍫", "🍦", "🍿", "🥭", "🍉", "🍓", "🍌", "🥤", "🍽️"]],
  ["Fun", ["🎉", "🎂", "🎁", "🎮", "🎵", "🎧", "🎤", "🎬", "📸", "⚽", "🏏", "🏆", "✈️", "🏔️", "🏖️", "🚗", "🌙", "⭐", "🌸", "🔥"]],
];
const RECENT_KEY = "vibe.recentEmoji";

function readRecent(): string[] {
  try {
    const v = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? "[]") as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 24) : [];
  } catch {
    return [];
  }
}

export function rememberEmoji(e: string) {
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify([e, ...readRecent().filter((x) => x !== e)].slice(0, 24)));
  } catch {}
}

/** Recent emoji first, then groups. Picking one calls `onPick`. */
export function EmojiPanel({ onPick }: { onPick: (e: string) => void }) {
  const [recent] = useState(readRecent);
  const groups: [string, string[]][] = recent.length ? [["Recent", recent], ...EMOJI_GROUPS] : EMOJI_GROUPS;
  const [tab, setTab] = useState(0);
  return (
    <div className="mt-2.5">
      <div role="tablist" aria-label="Emoji groups" className="quiet-scroll flex gap-1 overflow-x-auto pb-1.5">
        {groups.map(([label], i) => (
          <button
            key={label}
            type="button"
            role="tab"
            aria-selected={i === tab}
            onClick={() => setTab(i)}
            className={cn("type-label h-[30px] shrink-0 rounded-full px-3 text-[12px] font-semibold", i === tab ? "bg-text text-bg" : "bg-white/6 text-text2 hover:bg-white/10")}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="quiet-scroll grid max-h-[200px] grid-cols-8 gap-0.5 overflow-y-auto">
        {groups[tab][1].map((e) => (
          <button
            key={e}
            type="button"
            aria-label={e}
            onClick={() => {
              rememberEmoji(e);
              onPick(e);
            }}
            className="flex h-10 items-center justify-center rounded-[10px] text-[24px] hover:bg-white/8"
          >
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── hold a message ──────────────────────────────────────────────────────────

export type MessageAction = { kind: "react"; emoji: string } | { kind: "reply" } | { kind: "copy" } | { kind: "unsend" } | { kind: "report" };

/** Hold (or right-click) a message: react, reply, copy, unsend yours, report theirs. */
export const openMessageMenu = (m: ChatMessage, canUnsend: boolean) => openSheet<MessageAction>((close) => <MessageMenu m={m} canUnsend={canUnsend} onDone={close} />);

function MessageMenu({ m, canUnsend, onDone }: { m: ChatMessage; canUnsend: boolean; onDone: (a?: MessageAction) => void }) {
  const row = (icon: string, label: string, a: MessageAction, bad = false) => (
    <li>
      <button type="button" onClick={() => onDone(a)} className={cn("type-body flex h-12 w-full items-center gap-3 rounded-[12px] px-3 text-left text-[15px] hover:bg-white/6", bad ? "text-bad" : "text-text")}>
        <Icon name={icon} size={20} />
        {label}
      </button>
    </li>
  );
  const preview = m.kind === "photo" ? "📷 Photo" : m.kind === "voice" ? "🎤 Voice message" : m.gift ? `${m.gift.emoji} ${m.gift.name}` : m.text;
  return (
    <div className="flex flex-col px-4 pt-2 pb-4">
      <p className="type-body mx-1 mb-3 line-clamp-2 rounded-[14px] bg-surface2 px-3 py-2 text-[13.5px] text-text2">{preview}</p>
      <div role="group" aria-label="React" className="flex justify-between rounded-full border border-line bg-surface px-1.5 py-1">
        {QUICK_REACTIONS.map((e) => (
          <button
            key={e}
            type="button"
            aria-label={`React ${e}`}
            aria-pressed={m.reactions?.mine === e}
            onClick={() => onDone({ kind: "react", emoji: e })}
            className={cn("flex size-11 items-center justify-center rounded-full text-[26px] transition-transform hover:scale-110", m.reactions?.mine === e && "bg-pink/20")}
          >
            {e}
          </button>
        ))}
      </div>
      <ul className="mt-3 flex flex-col">
        {row("reply", "Reply", { kind: "reply" })}
        {m.kind === "text" || (!m.kind && !m.gift) ? row("content_copy", "Copy", { kind: "copy" }) : null}
        {canUnsend ? row("undo", "Unsend", { kind: "unsend" }, true) : null}
        {!m.fromMe ? row("flag", "Report", { kind: "report" }, true) : null}
      </ul>
    </div>
  );
}

/** Long press on touch, right-click on desktop. */
export function useHold(onHold: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  return {
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      onHold();
    },
    onTouchStart: () => {
      clear();
      timer.current = setTimeout(() => {
        timer.current = null;
        if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(12);
        onHold();
      }, 450);
    },
    onTouchEnd: clear,
    onTouchMove: clear,
  };
}

// ── voice notes ─────────────────────────────────────────────────────────────

type VoiceResult = { blob: Blob; seconds: number } | null;

/** One recording with the microphone (MediaRecorder), outside React. */
class Recorder {
  private rec: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private started = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private cancelled = false;

  /** Resolves once recording has started; `result` resolves when it stops. (Wrapped: an async function can't return a bare promise without waiting for it.) */
  async start(maxSeconds: number, onTick: (s: number) => void, onStop: () => void): Promise<{ result: Promise<VoiceResult> }> {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    const type = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t));
    const r = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    this.chunks = [];
    this.cancelled = false;
    r.ondataavailable = (e) => {
      if (e.data.size) this.chunks.push(e.data);
    };
    const result = new Promise<VoiceResult>((resolve) => {
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const secs = Math.min(maxSeconds, (Date.now() - this.started) / 1000);
        const blob = new Blob(this.chunks, { type: (r.mimeType || type || "audio/webm").split(";")[0] });
        resolve(this.cancelled || blob.size === 0 || secs < 0.6 ? null : { blob, seconds: secs });
        onStop();
      };
    });
    this.rec = r;
    this.started = Date.now();
    r.start(250);
    this.timer = setInterval(() => {
      const secs = (Date.now() - this.started) / 1000;
      onTick(secs);
      if (secs >= maxSeconds) this.stop();
    }, 200);
    return { result };
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.rec?.state === "recording") this.rec.stop();
  }

  cancel() {
    this.cancelled = true;
    this.stop();
  }
}

/** Records a voice note: `start()` resolves to a promise of the recording (null if cancelled or too short). */
export function useVoiceRecorder(maxSeconds: number) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const rec = useRef<Recorder | null>(null);
  useEffect(() => () => rec.current?.cancel(), []);
  const start = async () => {
    rec.current ??= new Recorder();
    setSeconds(0);
    const { result } = await rec.current.start(maxSeconds, setSeconds, () => setRecording(false));
    setRecording(true);
    return { result };
  };
  return { recording, seconds, start, stop: () => rec.current?.stop(), cancel: () => rec.current?.cancel() };
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** Play / pause, a simple wave and the length. */
export function VoiceNote({ url, seconds, mine }: { url: string; seconds: number; mine: boolean }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const bars = [6, 10, 16, 9, 20, 14, 8, 18, 12, 22, 10, 6, 14, 18, 9, 12, 20, 8, 6, 12, 16, 10, 7, 5];
  const progress = seconds > 0 ? pos / seconds : 0;
  return (
    <div className="flex w-[220px] items-center gap-2.5">
      <audio
        ref={audio}
        src={url}
        preload="none"
        onTimeUpdate={(e) => setPos(e.currentTarget.currentTime)}
        onEnded={() => {
          setPlaying(false);
          setPos(0);
        }}
        onPause={() => setPlaying(false)}
        onPlay={() => setPlaying(true)}
      />
      <button
        type="button"
        aria-label={playing ? "Pause voice note" : `Play voice note, ${clock(seconds)}`}
        onClick={() => (playing ? audio.current?.pause() : void audio.current?.play())}
        className={cn("flex size-9 shrink-0 items-center justify-center rounded-full", mine ? "bg-white text-violet" : "bg-violet text-white")}
      >
        <Icon name={playing ? "pause" : "play_arrow"} size={20} />
      </button>
      <span aria-hidden="true" className="flex h-6 flex-1 items-center gap-[2px]">
        {bars.map((h, i) => (
          <span key={i} className={cn("w-[3px] rounded-full", i / bars.length < progress ? (mine ? "bg-white" : "bg-lavender") : mine ? "bg-white/40" : "bg-white/25")} style={{ height: h }} />
        ))}
      </span>
      <span className={cn("type-label text-[11.5px] tabular-nums", mine ? "text-white/80" : "text-muted")}>{clock(playing || pos > 0 ? pos : seconds)}</span>
    </div>
  );
}

// ── photos ──────────────────────────────────────────────────────────────────

/** Theirs show blurred until tapped (safety); yours show plainly. Tap again for full size. */
export function PhotoMessage({ url, w, h, mine, pending }: { url: string; w?: number; h?: number; mine: boolean; pending?: boolean }) {
  const [shown, setShown] = useState(mine);
  const ratio = w && h ? Math.min(1.4, Math.max(0.6, h / w)) : 1;
  return (
    <div className="relative overflow-hidden rounded-[14px] bg-surface3" style={{ width: 220, height: Math.round(220 * ratio) }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={mine ? "Your photo" : "Photo"} className={cn("size-full object-cover transition-[filter]", !shown && "scale-110 blur-xl", pending && "opacity-60")} />
      {!shown ? (
        <button type="button" onClick={() => setShown(true)} className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/35 text-[12.5px] font-semibold text-white">
          <Icon name="visibility" size={22} />
          Photo · tap to view
        </button>
      ) : (
        <a href={url} target="_blank" rel="noopener" aria-label="Open photo full size" className="absolute inset-0" />
      )}
      {pending ? <span className="absolute right-2 bottom-2 size-5 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : null}
    </div>
  );
}

/** Shrinks big photos (longest side 1600 px, JPEG) so they send fast; returns the size too. */
export async function preparePhoto(file: File): Promise<{ blob: Blob; w: number; h: number }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  if (scale === 1 && file.size < 1_500_000 && /image\/(jpeg|png|webp)/.test(file.type)) return { blob: file, w, h };
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, w, h);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
  return { blob: blob ?? file, w, h };
}

export { clock as voiceClock };
