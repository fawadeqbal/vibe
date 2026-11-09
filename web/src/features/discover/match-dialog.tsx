"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";

import { GhostButton } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { errorMessage } from "@/lib/api/errors";
import type { Friend } from "@/lib/models";
import { useCalls } from "@/stores/calls";
import { useDiscover } from "@/stores/discover";
import { useSession } from "@/stores/session";
import { useSocial } from "@/stores/social";
import { toast } from "@/stores/ui";

/** Openers that fit anyone, plus one from a shared interest. */
function openers(f: Friend, mine: string[]): string[] {
  const first = f.profile.name.split(" ")[0] || "there";
  const shared = f.profile.interests.find((i) => mine.includes(i));
  return [`Hey ${first}! 👋`, shared ? `You're into ${shared} too?` : "How's your day going?", "What brings you to Vibe?"];
}

/**
 * "It's a match!" — shown wherever you are when two likes meet (your swipe
 * or theirs). Messaging only: the chat is open, and video calls stay off
 * until you both allow them in the chat.
 */
export function DiscoverMatchHost() {
  const matched = useDiscover((s) => s.matched);
  if (!matched) return null;
  return <MatchDialog key={matched.profile.id} f={matched} />;
}

function MatchDialog({ f }: { f: Friend }) {
  const router = useRouter();
  const me = useSession((s) => s.me);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const close = () => useDiscover.getState().dismissMatch();
  const first = f.profile.name.split(" ")[0] || "them";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const send = async (msg: string, e?: FormEvent) => {
    e?.preventDefault();
    const t = msg.trim();
    if (!t || busy) return;
    setBusy(true);
    try {
      await useSocial.getState().sendMessage(f.profile.id, t);
      close();
      router.push(`/chats/${f.profile.id}`);
    } catch (err) {
      toast(errorMessage(err), { error: true });
      setBusy(false);
    }
  };

  const mine = me?.interests ?? [];
  const both = f.profile.interests.filter((i) => mine.includes(i)).slice(0, 2);
  const videoCall = () => {
    close();
    // Calls are off until you both allow them in the chat: there you can ask.
    if (f.calls.mine && f.calls.theirs && f.calls.mineVideo && f.calls.theirsVideo) void useCalls.getState().ring(f.profile, "video");
    else router.push(`/chats/${f.profile.id}`);
  };
  const photo = (url: string, name: string, cls: string) => (
    <span className={`absolute h-[180px] w-[140px] overflow-hidden rounded-[24px] border-[3px] border-bg bg-surface shadow-[0_14px_30px_rgb(0_0_0/.5)] ${cls}`}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={name} className="size-full object-cover" />
      ) : (
        <span className="bg-brand flex size-full items-center justify-center text-[56px] font-bold text-white/60">{name.trim()[0]?.toUpperCase()}</span>
      )}
    </span>
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="match-title"
      className="fixed inset-0 z-[55] overflow-y-auto bg-bg"
      style={{ animation: "vibe-fade-in 200ms ease-out", backgroundImage: "radial-gradient(90% 60% at 50% 25%, rgb(255 61 143 / .35), rgb(139 92 246 / .18) 45%, var(--color-bg) 75%)" }}
    >
      <div className="relative mx-auto flex min-h-full max-w-[480px] flex-col px-5 pt-[env(safe-area-inset-top)] pb-[calc(26px+env(safe-area-inset-bottom))]">
        <button
          type="button"
          aria-label="Keep discovering"
          onClick={close}
          className="absolute top-[calc(12px+env(safe-area-inset-top))] right-3 flex size-10 items-center justify-center rounded-full border border-white/10 bg-bg2/52 text-text backdrop-blur-[18px]"
        >
          <Icon name="close" size={21} />
        </button>
        <div className="relative mx-auto mt-[70px] h-[210px] w-full max-w-[350px]" style={{ animation: "vibe-dialog-in 260ms ease-out" }}>
          {photo(me?.avatarUrl ?? "", me?.name ?? "You", "top-5 left-[36px] -rotate-[8deg]")}
          {photo(f.profile.avatarUrl, f.profile.name, "top-1.5 right-[36px] rotate-[7deg]")}
          <span className="bg-brand absolute top-[150px] left-1/2 -ml-7 flex size-14 items-center justify-center rounded-full text-white shadow-[0_8px_22px_rgb(255_61_143/.5)]">
            <Icon name="favorite" size={28} />
          </span>
        </div>
        <h2 id="match-title" className="mt-[26px] mb-1 text-center text-[34px] font-bold tracking-[-0.04em]">
          It&apos;s a <span className="type-serif text-[40px] text-pink-soft">match!</span>
        </h2>
        <p className="text-center text-[14.5px] text-text2">
          You and {first} liked each other.{both.length ? ` You both like ${both.join(" and ")}.` : ""}
        </p>
        {f.online ? (
          <span className="mx-auto mt-3 inline-flex h-7 items-center gap-2 rounded-full bg-ok/14 px-3 text-[12.5px] font-semibold text-ok">
            <span className="size-2 rounded-full bg-ok" /> {first} is online now
          </span>
        ) : null}
        <div className="min-h-6 flex-1" />
        <p className="type-overline mb-2.5 text-[12px] text-muted">Say something first</p>
        <div role="group" aria-label="Quick first messages" className="no-scrollbar -mr-5 flex gap-2 overflow-x-auto pr-5">
          {openers(f, mine).map((o) => (
            <button
              key={o}
              type="button"
              disabled={busy}
              onClick={() => void send(o)}
              className="h-9 shrink-0 rounded-full border border-white/14 bg-white/6 px-3.5 text-[13.5px] font-semibold text-text hover:bg-white/10"
            >
              {o}
            </button>
          ))}
        </div>
        <form onSubmit={(e) => void send(text, e)} className="mt-3 flex h-[52px] items-center gap-2 rounded-full border border-line bg-surface pr-1.5 pl-[18px]">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Write your first message…"
            aria-label="Your first message"
            className="min-w-0 flex-1 bg-transparent text-[15px] text-text outline-none placeholder:text-muted"
          />
          <button type="submit" disabled={busy || !text.trim()} aria-label="Send" className="bg-brand flex size-10 shrink-0 items-center justify-center rounded-full text-white disabled:opacity-50">
            <Icon name="send" size={19} />
          </button>
        </form>
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <GhostButton label="Video call" icon="videocam" height={48} expand onClick={videoCall} />
          <GhostButton label="Keep discovering" height={48} expand onClick={close} />
        </div>
      </div>
    </div>
  );
}
