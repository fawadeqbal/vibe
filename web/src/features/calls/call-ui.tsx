"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

import { VideoView } from "@/components/shared/video-view";
import { Avatar } from "@/components/ui/avatar";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import { useMatch } from "@/stores/match";

/** Their photo, dark and blurred, filling the screen (calling, voice, ended). */
export function BlurredPhoto({ url, brightness = 0.38 }: { url: string; brightness?: number }) {
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ backgroundImage: "linear-gradient(to bottom, #2B1B4D, #0B0A10)" }}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="absolute inset-0 size-full scale-125 object-cover" style={{ filter: `brightness(${brightness}) blur(22px)` }} />
      ) : null}
    </div>
  );
}

/** Their photo with three soft white rings around it. */
export function PulseAvatar({ url, name, size = 124 }: { url: string; name: string; size?: number }) {
  return (
    <div className="relative mx-auto flex items-center justify-center" style={{ width: size + 170, height: size + 170 }} aria-hidden>
      {[
        [44, 0.22],
        [100, 0.12],
        [170, 0.06],
      ].map(([d, a], i) => (
        <span
          key={d}
          className="absolute rounded-full motion-safe:animate-pulse"
          style={{ width: size + d, height: size + d, border: `1.5px solid rgb(255 255 255 / ${a})`, animationDelay: `${i * 0.35}s` }}
        />
      ))}
      <Avatar url={url} name={name} size={size} />
    </div>
  );
}

/** A phone-call control: round, label under it. `on` = the white "active" look (muted, camera off). */
export function CallCtl({
  icon,
  label,
  on = false,
  onClick,
  size = 60,
  bg,
  color,
  disabled,
  ariaLabel,
}: {
  icon: string;
  label: string;
  on?: boolean;
  onClick?: () => void;
  size?: number;
  bg?: string;
  color?: string;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || !onClick}
      aria-pressed={on || undefined}
      aria-label={ariaLabel ?? label}
      className="group flex w-[86px] flex-col items-center gap-[7px] disabled:opacity-50"
    >
      <span
        className="flex items-center justify-center rounded-full backdrop-blur-[16px] transition-[filter] group-enabled:group-hover:brightness-125"
        style={{
          width: size,
          height: size,
          background: bg ?? (on ? "#ffffff" : "rgb(255 255 255 / .14)"),
          color: color ?? (on ? "var(--color-bg)" : "#ffffff"),
        }}
      >
        <Icon name={icon} size={Math.round(size * 0.42)} />
      </span>
      <span className="max-w-full truncate text-[12px] font-semibold text-white/88">{label}</span>
    </button>
  );
}

/** The red hang-up button. */
export function EndCallButton({
  label = "End",
  size = 64,
  onClick,
  ariaLabel = "End call",
}: {
  label?: string;
  size?: number;
  onClick: () => void;
  ariaLabel?: string;
}) {
  return (
    <button type="button" onClick={onClick} aria-label={ariaLabel} className="group flex w-[76px] flex-col items-center gap-[7px]">
      <span
        className="flex items-center justify-center rounded-full bg-bad-deep text-white shadow-[0_10px_26px_rgb(225_29_72/0.45)] transition-[filter] group-hover:brightness-110"
        style={{ width: size, height: size }}
      >
        <Icon name="call_end" size={Math.round(size * 0.46)} />
      </span>
      <span className="text-[12px] font-semibold text-white/88">{label}</span>
    </button>
  );
}

/** The frosted bar of controls at the bottom of a video call. */
export function CallDock({ children }: { children: ReactNode }) {
  return (
    <div className="absolute inset-x-3 bottom-[calc(22px+env(safe-area-inset-bottom))] mx-auto flex max-w-[560px] items-start justify-around rounded-[30px] border border-white/10 bg-bg2/52 px-2.5 pt-3.5 pb-3 backdrop-blur-[18px]">
      {children}
    </div>
  );
}

/** Top of a friend call: shrink to the chat, and who / how long, centred. */
export function CallTopline({
  title,
  verified,
  sub,
  onShrink,
  onReport,
}: {
  title: string;
  verified?: boolean;
  sub: string;
  onShrink: () => void;
  onReport?: () => void;
}) {
  return (
    <div className="absolute inset-x-0 top-0 flex items-center gap-2.5 px-3 pt-[calc(12px+env(safe-area-inset-top))]">
      <button
        type="button"
        onClick={onShrink}
        aria-label="Shrink the call and go to the chat"
        className="flex size-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-bg2/52 text-text backdrop-blur-[18px] hover:brightness-125"
      >
        <Icon name="close_fullscreen" variant="outlined" size={21} />
      </button>
      <span className={cn("flex min-w-0 flex-1 flex-col items-center", !onReport && "mr-[50px]")}>
        <span className="flex max-w-full items-center gap-1 text-[16px] font-bold">
          <span className="truncate">{title}</span>
          {verified ? <Icon name="verified" size={15} className="shrink-0 text-trust" label="Verified" /> : null}
        </span>
        <span className="text-[12.5px] text-white/80">{sub}</span>
      </span>
      {onReport ? (
        <button
          type="button"
          onClick={onReport}
          aria-label="Report"
          className="flex size-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-bg2/52 text-bad backdrop-blur-[18px] hover:brightness-125"
        >
          <Icon name="flag" size={20} />
        </button>
      ) : null}
    </div>
  );
}

/** You, picture-in-picture (blurred while "Blur me" is on). */
export function SelfPreview({ top = 78, className }: { top?: number; className?: string }) {
  return (
    <div
      className={cn(
        "absolute right-3 h-[140px] w-[100px] overflow-hidden rounded-[18px] border-2 border-white/22 bg-surface2 shadow-[0_8px_24px_rgb(0_0_0/.4)]",
        className,
      )}
      style={{ top: `calc(${top}px + env(safe-area-inset-top))` }}
    >
      <SelfVideo />
    </div>
  );
}

/** Your camera filling its box (the corner tile, or the whole stage after a swap). */
export function SelfVideo({ big = false }: { big?: boolean }) {
  const stream = useMatch((s) => s.localStream);
  const camOn = useMatch((s) => s.camOn);
  const front = useMatch((s) => s.frontCamera);
  const blurMe = useMatch((s) => s.blurMe);
  const hasVideo = !!stream?.getVideoTracks().length && camOn;
  return (
    <>
      {hasVideo && stream ? (
        <VideoView stream={stream} mirror={front} blur={blurMe ? (big ? 24 : 12) : 0} />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center bg-surface2 text-muted">
          <Icon name="videocam_off" size={big ? 40 : 24} />
        </span>
      )}
      {blurMe ? (
        <span
          className={cn(
            "absolute rounded-full bg-bg2/70 text-center font-semibold text-trust",
            big ? "bottom-[calc(150px+env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 px-3 py-1 text-[12.5px]" : "inset-x-1.5 bottom-1.5 px-2 py-0.5 text-[10.5px]",
          )}
        >
          Blurred
        </span>
      ) : null}
    </>
  );
}

/** Plays the other side's audio (voice calls and the shrunk call have no video element doing it). */
export function RemoteAudio({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const a = ref.current;
    if (!a) return;
    if (a.srcObject !== stream) a.srcObject = stream;
    void a.play().catch(() => {});
  }, [stream]);
  return <audio ref={ref} autoPlay />;
}

/** How loud the other side is right now (0–1), from their audio — for "Sana is talking". */
export function useVoiceLevel(stream: MediaStream | null): number {
  const [level, setLevel] = useState(0);
  useEffect(() => {
    if (!stream || !stream.getAudioTracks().length || typeof AudioContext === "undefined") return;
    let ctx: AudioContext;
    try {
      ctx = new AudioContext();
    } catch {
      return;
    }
    const src = ctx.createMediaStreamSource(stream);
    const an = ctx.createAnalyser();
    an.fftSize = 256;
    src.connect(an);
    const buf = new Uint8Array(an.frequencyBinCount);
    const t = setInterval(() => {
      an.getByteTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += ((v - 128) / 128) ** 2;
      setLevel(Math.min(1, Math.sqrt(sum / buf.length) * 6));
    }, 150);
    return () => {
      clearInterval(t);
      void ctx.close();
    };
  }, [stream]);
  return level;
}

/** Eleven bars that move with their voice (still when they're quiet). */
export function VoiceBars({ level }: { level: number }) {
  const shape = [10, 18, 28, 16, 24, 12, 20, 30, 14, 22, 10];
  return (
    <span className="flex h-[30px] items-center gap-[3px]" aria-hidden>
      {shape.map((h, i) => {
        const k = 0.25 + 0.75 * Math.min(1, level * (0.6 + ((i * 7) % 5) / 5));
        return (
          <span key={i} className="w-1 rounded bg-pink-soft transition-[height] duration-150" style={{ height: Math.max(4, h * k), opacity: 0.5 + h / 60 }} />
        );
      })}
    </span>
  );
}

/** Ending screens of a friend call: their photo, a title, one line, then buttons. */
export function CallEndCard({ url, name, title, sub, children }: { url: string; name: string; title: string; sub: string; children: ReactNode }) {
  return (
    <div className="absolute inset-0">
      <BlurredPhoto url={url} brightness={0.3} />
      <div className="absolute inset-0 mx-auto flex max-w-[480px] flex-col px-4 pt-[calc(150px+env(safe-area-inset-top))] pb-[calc(34px+env(safe-area-inset-bottom))]">
        <div className="flex flex-col items-center text-center">
          <Avatar url={url} name={name} size={112} ring />
          <h2 className="mt-[18px] mb-1 text-[26px] font-bold tracking-[-0.035em]">{title}</h2>
          <p className="max-w-[340px] text-[14.5px] leading-[1.45] text-white/80">{sub}</p>
        </div>
        <div className="flex-1" />
        <div className="flex flex-col gap-2.5">{children}</div>
      </div>
    </div>
  );
}

/** Phone speaker vs. earpiece where the browser can pick an audio output (Chrome on Android); null elsewhere. */
export function useSpeaker(): { on: boolean; toggle: () => void } | null {
  const [outputs, setOutputs] = useState<MediaDeviceInfo[]>([]);
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (typeof HTMLMediaElement === "undefined" || !("setSinkId" in HTMLMediaElement.prototype) || !navigator.mediaDevices?.enumerateDevices) return;
    void navigator.mediaDevices.enumerateDevices().then((d) => setOutputs(d.filter((x) => x.kind === "audiooutput")));
  }, []);
  if (outputs.length < 2) return null;
  const speaker = outputs.find((o) => /speaker/i.test(o.label)) ?? outputs[outputs.length - 1];
  const earpiece = outputs.find((o) => /earpiece|phone/i.test(o.label)) ?? outputs[0];
  return {
    on,
    toggle: () => {
      const next = !on;
      setOn(next);
      const id = (next ? speaker : earpiece).deviceId;
      document
        .querySelectorAll("audio,video")
        .forEach((el) => void (el as HTMLMediaElement & { setSinkId?: (id: string) => Promise<void> }).setSinkId?.(id).catch(() => {}));
    },
  };
}
