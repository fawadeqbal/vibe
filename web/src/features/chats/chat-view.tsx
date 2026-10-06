"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useRef, useState } from "react";

import { useNeedCoins } from "@/components/shared/dialogs";
import { pickGift } from "@/components/shared/gift-sheet";
import { Avatar } from "@/components/ui/avatar";
import { CircleIconButton } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { MenuButton } from "@/components/ui/menu";
import { EmptyState } from "@/components/ui/misc";
import { AppBar } from "@/components/ui/page-header";
import { errorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/cn";
import { ago, time } from "@/lib/format";
import type { ChatMessage } from "@/lib/models";
import { useSocial } from "@/stores/social";
import { toast } from "@/stores/ui";

import { StreakHeaderChip } from "./streak";

/**
 * Text chat with a friend. Gifts here earn them gems too — that is what keeps
 * friends on the app between matches.
 */
export function ChatView({ friendId }: { friendId: string }) {
  const router = useRouter();
  const needCoins = useNeedCoins();
  const f = useSocial((s) => s.all.find((x) => x.profile.id === friendId));
  const msgs = useSocial((s) => s.chats[friendId]);
  const list = useRef<HTMLDivElement>(null);
  const [text, setText] = useState("");
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
  }, [msgs?.length]);

  if (!f) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <AppBar onBack={back} className="lg:hidden" />
        <EmptyState className="flex-1" icon="person_off" title="Not friends any more" body="This conversation is gone." />
      </div>
    );
  }
  const p = f.profile;

  const send = async (e?: FormEvent) => {
    e?.preventDefault();
    const t = text;
    setText("");
    try {
      await useSocial.getState().sendMessage(friendId, t);
    } catch (err) {
      toast(errorMessage(err), { error: true });
    }
  };

  const gift = async () => {
    const g = await pickGift(p.name);
    if (!g) return;
    try {
      if (!(await useSocial.getState().sendGift(friendId, g))) await needCoins(`A ${g.name} costs ${g.coins} coins.`);
    } catch (err) {
      toast(errorMessage(err), { error: true });
    }
  };

  return (
    <div className="flex h-dvh min-h-0 flex-1 flex-col pt-[env(safe-area-inset-top)] lg:h-dvh">
      <AppBar
        onBack={back}
        className="border-b border-line-soft lg:pl-5 lg:[&>span:first-child]:hidden"
        actions={
          <MenuButton
            label="More"
            items={[
              { label: "Remove friend", onSelect: () => void useSocial.getState().remove(friendId).then(back) },
              { label: "Block", tone: "bad", onSelect: () => void useSocial.getState().block(p).then(back) },
            ]}
          />
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
          <span className={cn("type-label block text-[11.5px] font-medium", f.online ? "text-ok" : "text-muted")}>{f.online ? "Online" : `Last seen ${ago(f.since)}`}</span>
        </span>
        </button>
        <StreakHeaderChip f={f} />
      </AppBar>

      {!msgs?.length ? (
        <EmptyState className="flex-1" icon="waving_hand" title="Say hi to " accent={p.name} body={`You met in a match. ${p.bio}`} />
      ) : (
        <div ref={list} className="quiet-scroll min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {msgs.map((m) => (
            <Bubble key={m.id} m={m} />
          ))}
        </div>
      )}

      <form onSubmit={send} className="flex items-center px-3 pt-2 pb-[calc(10px+env(safe-area-inset-bottom))]">
        <CircleIconButton icon="redeem" label="Send a gift" size={52} iconSize={24} className="bg-gold/12 text-gold" onClick={() => void gift()} />
        <div className="ml-2 flex h-[52px] flex-1 items-center rounded-[26px] border border-line bg-surface pr-1.5 pl-[18px]">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Message"
            aria-label="Message"
            enterKeyHint="send"
            className="type-body min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted"
          />
          <CircleIconButton icon="send" label="Send" iconSize={19} type="submit" className="bg-violet text-white" />
        </div>
      </form>
    </div>
  );
}

function Bubble({ m }: { m: ChatMessage }) {
  const mine = m.fromMe;
  const gift = !!m.gift;
  return (
    <div className={cn("mb-1.5 flex", mine ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[72%] rounded-[18px]",
          mine ? "rounded-br-[6px]" : "rounded-bl-[6px]",
          gift ? "border border-gold/40 bg-gold/12 px-3.5 py-2.5" : mine ? "bg-violet px-3 py-2" : "bg-surface2 px-3 py-2",
        )}
      >
        {m.gift ? <p className="text-[30px] leading-[1.2]">{m.gift.emoji}</p> : null}
        <p className={cn("type-body text-[15px] break-words", mine && !gift ? "text-white" : "text-text")}>{m.text}</p>
        <p className={cn("type-label mt-0.5 text-[10px] font-medium", mine && !gift ? "text-white/70" : "text-muted")}>{time(m.at)}</p>
      </div>
    </div>
  );
}
