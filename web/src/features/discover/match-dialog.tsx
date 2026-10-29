"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Icon } from "@/components/ui/icon";
import { errorMessage } from "@/lib/api/errors";
import type { Friend } from "@/lib/models";
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

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center p-4" role="presentation">
      <div className="absolute inset-0 bg-black/72 backdrop-blur-[6px]" style={{ animation: "vibe-fade-in 200ms ease-out" }} onClick={close} aria-hidden />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="match-title"
        className="relative flex w-full max-w-[460px] flex-col items-center rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_50%_0%,#3d1a45_0%,var(--color-surface)_62%)] px-6 pt-8 pb-6 shadow-2xl"
        style={{ animation: "vibe-dialog-in 220ms ease-out" }}
      >
        <button type="button" aria-label="Close" onClick={close} className="absolute top-3 right-3 flex size-10 items-center justify-center rounded-full bg-white/8 text-text hover:bg-white/12">
          <Icon name="close" size={20} />
        </button>
        <div className="flex items-center">
          <span className="-rotate-6">
            <Avatar url={me?.avatarUrl ?? ""} name={me?.name ?? "You"} size={104} border="var(--color-surface)" />
          </span>
          <span className="-ml-5 rotate-6">
            <Avatar url={f.profile.avatarUrl} name={f.profile.name} size={104} border="var(--color-surface)" />
          </span>
        </div>
        <h2 id="match-title" className="type-display mt-5 text-center text-[36px]">
          It&apos;s a <span className="type-serif text-[44px] text-pink-soft">match!</span>
        </h2>
        <p className="type-body mt-1 text-center text-[15px] text-text2">You and {first} liked each other.</p>
        {f.online ? (
          <span className="type-label mt-3 inline-flex h-7 items-center gap-2 rounded-full bg-ok/14 px-3 text-[12.5px] font-semibold text-ok">
            <span className="size-2 rounded-full bg-ok" /> {first} is online now
          </span>
        ) : null}

        <div role="group" aria-label="Quick first messages" className="mt-6 flex flex-wrap justify-center gap-2">
          {openers(f, me?.interests ?? []).map((o) => (
            <button
              key={o}
              type="button"
              disabled={busy}
              onClick={() => void send(o)}
              className="type-label h-9 rounded-full border border-white/14 bg-white/6 px-3.5 text-[13px] font-semibold text-text hover:bg-white/10"
            >
              {o}
            </button>
          ))}
        </div>
        <form onSubmit={(e) => void send(text, e)} className="mt-3 flex w-full gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Write your first message…"
            aria-label="First message"
            autoFocus
            className="type-body h-[52px] min-w-0 flex-1 rounded-full border border-white/12 bg-bg2 px-5 text-[15px] text-text outline-none placeholder:text-muted focus:border-pink/60"
          />
          <button
            type="submit"
            disabled={busy || !text.trim()}
            aria-label="Send"
            className="bg-brand flex size-[52px] shrink-0 items-center justify-center rounded-full text-white shadow-[0_10px_30px_rgb(255_61_143/0.32)] disabled:opacity-50"
          >
            <Icon name="send" size={20} />
          </button>
        </form>
        <button type="button" onClick={close} className="type-label mt-3 h-10 px-4 text-[14px] font-semibold text-text2 hover:text-text">
          Keep swiping
        </button>
        <p className="type-body mt-1 text-center text-[12px] leading-[1.45] text-muted">Chat is open now. Video calls stay off until you both allow them in the chat.</p>
      </section>
    </div>
  );
}
