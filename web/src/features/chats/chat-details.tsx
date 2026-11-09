"use client";

import { useRouter } from "next/navigation";

import { confirm } from "@/components/shared/dialogs";
import { Avatar } from "@/components/ui/avatar";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import { date } from "@/lib/format";
import { streakDays, streakStatus } from "@/lib/engagement";
import type { ChatMessage, Friend } from "@/lib/models";
import { useSocial } from "@/stores/social";

import { openStreakSheet, useRestoreStreak } from "./streak";

/**
 * Wide screens: who you're talking to, beside the conversation. Their
 * profile and a gift one click away, your streak, the photos you've shared,
 * and remove or block at the foot.
 */
export function ChatDetails({
  f,
  msgs,
  onGift,
  onGone,
  className,
}: {
  f: Friend;
  msgs: ChatMessage[] | undefined;
  onGift: () => void;
  onGone: () => void;
  className?: string;
}) {
  const router = useRouter();
  const restore = useRestoreStreak();
  const p = f.profile;
  const first = p.name.split(" ")[0] || p.name;
  const s = f.streak;
  const photos = (msgs ?? [])
    .filter((m) => m.kind === "photo" && !m.unsent && typeof m.meta?.url === "string")
    .slice(-6)
    .reverse();

  const remove = async () => {
    if (!(await confirm({ title: `Remove ${first}?`, body: "You'll stop being friends. Your chat goes too.", ok: "Remove", okTone: "bad" }))) return;
    await useSocial.getState().remove(p.id);
    onGone();
  };
  const block = async () => {
    if (!(await confirm({ title: `Block ${first}?`, body: "You won't see each other in Discover, matches or chats.", ok: "Block", okTone: "bad" }))) return;
    await useSocial.getState().block(p);
    onGone();
  };

  return (
    <aside
      aria-label={`About ${first}`}
      className={cn("w-[320px] shrink-0 flex-col gap-[18px] overflow-y-auto border-l border-line-soft px-[22px] py-7", className)}
    >
      <div className="flex flex-col items-center gap-2.5 text-center">
        <Avatar url={p.avatarUrl} name={p.name} size={96} ring />
        <span className="type-title flex items-center gap-1 text-[18px]">
          {p.name}
          {p.verified ? <Icon name="verified" size={17} className="text-trust" label="Verified" /> : null}
        </span>
        <span className="type-body text-[13px] text-text2">
          {[p.age || null, p.country.name, `Friends since ${date(f.since)}`].filter(Boolean).join(" · ")}
        </span>
      </div>

      <div className="flex justify-center gap-[22px]">
        <Action icon="person" label="Profile" onClick={() => router.push(`/u/${p.id}`)} />
        <Action icon="redeem" label="Gift" gold onClick={onGift} />
      </div>

      <button
        type="button"
        onClick={() => void openStreakSheet(p.id, (x) => void restore(x))}
        className={cn(
          "flex flex-col rounded-[18px] border px-3.5 py-3 text-left transition-colors",
          s.count > 0 ? "border-gold/22 bg-gold/8 hover:bg-gold/12" : "border-line bg-white/3 hover:bg-white/5",
        )}
      >
        <span className="type-title text-[14px]">{s.count > 0 ? `🔥 ${streakDays(s.count)}` : s.restorable ? "Streak lost" : "No streak yet"}</span>
        <span className="type-body text-[12.5px] text-text2">{streakStatus(s, first)}</span>
      </button>

      {photos.length ? (
        <div>
          <p className="type-overline mb-2.5">Shared photos</p>
          <div className="grid grid-cols-3 gap-2">
            {photos.map((m) => (
              <a key={m.id} href={m.meta!.url as string} target="_blank" rel="noreferrer" className="aspect-square overflow-hidden rounded-[12px] bg-surface2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={m.meta!.url as string} alt="" className="size-full object-cover" />
              </a>
            ))}
          </div>
        </div>
      ) : null}

      <span className="flex-1" />
      <div className="border-t border-line-soft pt-1.5">
        <Row icon="person_remove" label="Remove friend" onClick={() => void remove()} />
        <Row icon="block" label={`Block ${first}`} bad onClick={() => void block()} />
      </div>
    </aside>
  );
}

function Action({ icon, label, gold = false, onClick }: { icon: string; label: string; gold?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="group flex flex-col items-center gap-1.5">
      <span
        className={cn(
          "flex size-12 items-center justify-center rounded-full transition-colors",
          gold ? "bg-gold/12 text-gold group-hover:bg-gold/18" : "bg-white/7 text-text group-hover:bg-white/12",
        )}
      >
        <Icon name={icon} size={21} />
      </span>
      <span className="type-label text-[12px] text-text2">{label}</span>
    </button>
  );
}

function Row({ icon, label, bad = false, onClick }: { icon: string; label: string; bad?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("type-label flex h-11 w-full items-center gap-3 text-[14px] hover:brightness-125", bad ? "text-bad" : "text-text")}
    >
      <Icon name={icon} size={19} className={bad ? "text-bad" : "text-text2"} />
      {label}
    </button>
  );
}
