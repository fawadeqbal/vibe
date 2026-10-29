"use client";

import { useEffect, useRef } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import { useMatch } from "@/stores/match";
import { useSocial } from "@/stores/social";

const clock = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

/** Plays the other side's audio (a voice call has no video element to do it). */
function RemoteAudio({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const a = ref.current;
    if (!a) return;
    if (a.srcObject !== stream) a.srcObject = stream;
    void a.play().catch(() => {});
  }, [stream]);
  return <audio ref={ref} autoPlay />;
}

/**
 * A voice call with a friend: their photo, the time, mute, "Turn on video"
 * (asks them; both must allow video in the chat) and end. No camera opens.
 */
export function VoiceCall({ onReport }: { onReport: () => void }) {
  const m = useMatch();
  const p = m.partner;
  const friend = useSocial((s) => (p ? s.all.find((f) => f.profile.id === p.id) : undefined));
  if (!p) return null;
  // Video can be turned on only when you both allow video in the chat.
  const videoAllowed = !friend || (friend.calls.mineVideo && friend.calls.theirsVideo);
  const first = p.name.split(" ")[0] || p.name;
  const btn = (on: boolean) => cn("flex size-16 items-center justify-center rounded-full transition-colors", on ? "bg-text text-bg" : "bg-white/10 text-text hover:bg-white/16");
  return (
    <div className="absolute inset-0 flex flex-col items-center bg-[radial-gradient(120%_70%_at_50%_28%,#2b1b4d_0%,#15121d_55%,#0b0a10_100%)] px-6 pt-[calc(48px+env(safe-area-inset-top))] pb-[calc(36px+env(safe-area-inset-bottom))]">
      {m.remoteStream ? <RemoteAudio stream={m.remoteStream} /> : null}
      <div className="flex w-full max-w-[420px] items-center justify-between">
        <p className="type-overline text-text2">Voice call</p>
        <button type="button" onClick={onReport} className="type-label inline-flex h-9 items-center gap-1.5 rounded-full bg-bad/14 px-3 text-[12.5px] font-semibold text-bad">
          <Icon name="flag" size={15} /> Report
        </button>
      </div>

      <div className="relative mt-12 flex size-[220px] items-center justify-center">
        <span aria-hidden="true" className="absolute inset-0 animate-pulse rounded-full border border-pink/18" />
        <span aria-hidden="true" className="absolute inset-[22px] rounded-full border border-pink/30" />
        <span className="rounded-full shadow-[0_0_0_4px_rgb(255_61_143/0.35)]">
          <Avatar url={p.avatarUrl} name={p.name} size={132} />
        </span>
      </div>
      <h1 className="type-display mt-7 text-[30px]">{first}</h1>
      <p className="mt-1.5 font-mono text-[15px] text-lavender tabular-nums">{m.remoteStream ? clock(m.elapsed) : "Connecting…"}</p>
      <p className="type-body mt-5 flex items-center gap-2 rounded-[16px] bg-white/6 px-3.5 py-2 text-[12.5px] text-text2">
        <Icon name="shield" size={14} /> Camera stays off. Not recorded.
      </p>

      {m.videoAsk === "theirs" ? (
        <div role="alertdialog" aria-label={`${first} wants to turn on video`} className="mt-5 w-full max-w-[340px] rounded-[20px] border border-violet/45 bg-surface p-3.5 text-center">
          <p className="type-title text-[15px] font-semibold">{first} wants to turn on video</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => void m.answerVideo(false)} className="type-title h-10 rounded-full border border-white/12 bg-white/6 text-[14px] font-semibold">
              Stay on voice
            </button>
            <button type="button" onClick={() => void m.answerVideo(true)} className="type-title h-10 rounded-full bg-ok text-[14px] font-bold text-bg">
              Turn on video
            </button>
          </div>
        </div>
      ) : null}

      <div className="flex-1" />
      <div className="grid w-full max-w-[300px] grid-cols-2 gap-x-10 gap-y-4">
        <button type="button" aria-pressed={!m.micOn} onClick={() => m.toggleMic()} className="type-label flex flex-col items-center gap-2 text-[12px]">
          <span className={btn(!m.micOn)}>
            <Icon name={m.micOn ? "mic" : "mic_off"} size={26} />
          </span>
          {m.micOn ? "Mute" : "Unmute"}
        </button>
        {videoAllowed ? (
          <button type="button" disabled={m.videoAsk === "mine"} onClick={() => void m.askVideo()} className="type-label flex flex-col items-center gap-2 text-[12px] disabled:opacity-60">
            <span className="bg-brand flex size-16 items-center justify-center rounded-full text-white">
              <Icon name="videocam" size={26} />
            </span>
            {m.videoAsk === "mine" ? `Asking ${first}…` : "Turn on video"}
          </button>
        ) : (
          <span className="type-label flex flex-col items-center gap-2 text-center text-[12px] text-muted" title="You both need to allow video in the chat first">
            <span className="flex size-16 items-center justify-center rounded-full bg-white/6 text-muted">
              <Icon name="videocam_off" size={26} />
            </span>
            Voice only chat
          </span>
        )}
      </div>
      <button type="button" aria-label="End call" onClick={() => m.stop()} className="mt-7 flex size-[72px] items-center justify-center rounded-full bg-bad text-white shadow-[0_12px_30px_rgb(239_68_68/0.35)]">
        <Icon name="call_end" size={32} />
      </button>
    </div>
  );
}
