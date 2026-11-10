"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";

import { TeamAvatar } from "@/components/shared/team-avatar";
import { Avatar } from "@/components/ui/avatar";
import { GhostButton, GradientButton } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { errorMessage } from "@/lib/api/errors";
import { alpha, color } from "@/lib/colors";
import { cn } from "@/lib/cn";
import { agoShort, date } from "@/lib/format";
import type { ActivityItem } from "@/lib/models";
import { notificationPath } from "@/lib/notification-path";
import { notificationStyle } from "@/lib/notification-style";
import { useActivity } from "@/stores/activity";
import { useCalls } from "@/stores/calls";
import { useFollows } from "@/stores/follows";
import { useSocial } from "@/stores/social";
import { toast } from "@/stores/ui";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** When, as short as it can be: "5m" today, "Mon" this week, "3 Nov 2026" before. */
export function when(at: Date, now = new Date()): string {
  const age = now.getTime() - at.getTime();
  if (sameLocalDay(at, now)) return agoShort(at, now.getTime());
  if (age < 6 * 86_400_000) return DAYS[at.getDay()];
  return date(at);
}

export const sameLocalDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** "Today", "This week" or "Earlier". */
export function bucketOf(at: Date, now = new Date()): "today" | "week" | "earlier" {
  if (sameLocalDay(at, now)) return "today";
  return now.getTime() - at.getTime() < 7 * 86_400_000 ? "week" : "earlier";
}

/**
 * The sentence: who in bold, then what. Lines from a person that start with
 * their name read as one sentence ("**Omar** started following you"); the
 * rest are "**title** · body".
 */
export function sentence(item: ActivityItem): ReactNode {
  const name = item.actor?.name ?? "";
  const first = name.split(" ")[0];
  if (name && !item.title.includes(first)) {
    const who = item.body.startsWith(name) ? name : first && item.body.startsWith(first) ? first : null;
    if (who)
      return (
        <>
          <b className="font-bold">{who}</b>
          {item.body.slice(who.length)}
        </>
      );
  }
  return (
    <>
      <b className="font-bold">{item.title}</b>
      {item.count > 1 ? <b className="font-bold text-pink-soft"> · {item.count} new</b> : null}
      {item.body ? <span className="text-text2"> · {item.body}</span> : null}
    </>
  );
}

/** The photo with a small type badge, or Vibe's coloured tile. */
export function Lead({ item, size = 46 }: { item: ActivityItem; size?: number }) {
  const st = notificationStyle(item.type, item.title);
  const a = item.actor;
  if (a)
    return (
      <span className="relative shrink-0" style={{ width: size, height: size }}>
        <Avatar url={a.avatarUrl} name={a.name} size={size} />
        <span
          className="absolute -right-[3px] -bottom-[3px] grid size-5 place-items-center rounded-full border-[2.5px] border-bg"
          style={{ backgroundColor: color(st.tone) }}
          aria-hidden
        >
          <Icon name={st.icon} size={11} className="text-white" />
        </span>
      </span>
    );
  if (item.type === "team.message") return <TeamAvatar size={size} />;
  return (
    <span
      className="grid shrink-0 place-items-center rounded-[15px] border"
      style={{ width: size, height: size, backgroundColor: alpha(st.tone, 0.14), borderColor: alpha(st.tone, 0.22) }}
      aria-hidden
    >
      <Icon name={st.icon} size={23} style={{ color: color(st.tone) }} />
    </span>
  );
}

/** One line: opens the thing it is about. */
export function NotificationRow({ item, isNew }: { item: ActivityItem; isNew: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const act = async (fn: () => Promise<unknown>, done?: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      void useActivity.getState().markRead([item.id]);
      if (done) toast(done);
      await useActivity.getState().refresh();
    } catch (e) {
      toast(errorMessage(e), { error: true });
    } finally {
      setBusy(false);
    }
  };

  // Opening a line reads it (the page already cleared the bell when it opened).
  const open = () => {
    void useActivity.getState().markRead([item.id]);
    router.push(notificationPath(item.data, item.id));
  };

  return (
    <li className={cn("relative flex items-center gap-3 py-3 pr-3.5 pl-[18px] transition-colors", isNew && "bg-pink/5")}>
      {isNew ? <span className="absolute top-1/2 left-1.5 size-[7px] -translate-y-1/2 rounded-full bg-pink" aria-label="New" /> : null}
      <button type="button" data-notification-row onClick={open} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left outline-offset-4">
        <Lead item={item} />
        <span className="min-w-0 flex-1">
          <span className="type-body line-clamp-3 block text-[14px] leading-[1.38] text-text">{sentence(item)}</span>
          <span className="type-label mt-[3px] block text-[12px] text-muted">{when(item.at)}</span>
        </span>
      </button>
      <Trailing item={item} busy={busy} act={act} />
    </li>
  );
}

/** Compact action buttons: label-sized, smaller text than the full-width default. */
const SMALL = "px-[13px] [&>span]:text-[13px]";

/** At most one action (or a pair for a request still waiting). */
function Trailing({ item, busy, act }: { item: ActivityItem; busy: boolean; act: (fn: () => Promise<unknown>, done?: string) => Promise<void> }) {
  const router = useRouter();
  const a = item.actor;
  const rel = item.rel;
  if (!a || !rel) return null;
  const first = a.name.split(" ")[0];
  const pair = (yes: () => Promise<unknown>, no: () => Promise<unknown>, done: string) => (
    <span className="flex shrink-0 gap-1.5">
      <GhostButton label="Decline" height={34} className="px-3 text-text2 [&>span]:text-[13px]" disabled={busy} onClick={() => void act(no)} />
      <GradientButton label="Accept" height={34} expand={false} className={SMALL} busy={busy} onClick={() => void act(yes, done)} />
    </span>
  );

  if (item.type === "friend.request" && rel.friend === "incoming")
    return pair(
      () => useSocial.getState().accept(a.id),
      () => useSocial.getState().decline(a.id),
      `You and ${first} are friends now`,
    );
  if (item.type === "follow.request" && rel.followRequest)
    return pair(
      () => useFollows.getState().accept(a.id),
      () => useFollows.getState().decline(a.id),
      `${first} can see your profile now`,
    );
  if ((item.type === "follow.new" || item.type === "follow.accepted") && rel.follow === "none")
    return (
      <GradientButton
        label={rel.followsYou ? "Follow back" : "Follow"}
        height={34}
        expand={false}
        className={cn(SMALL, "shrink-0")}
        busy={busy}
        onClick={() => void act(() => useFollows.getState().follow(a.id))}
      />
    );
  if (item.type === "call.missed" && rel.friend === "friends") {
    const callBack = () => {
      const f = useSocial.getState().all.find((x) => x.profile.id === a.id);
      if (f && f.calls.mine && f.calls.theirs) void useCalls.getState().ring(f.profile, f.calls.mineVideo && f.calls.theirsVideo ? "video" : "voice");
      else router.push(`/chats/${a.id}`);
    };
    return <GhostButton label="Call back" icon="videocam" height={34} className="shrink-0 px-3 [&>span]:text-[13px]" onClick={callBack} />;
  }
  if ((item.type === "friend.accepted" || item.type === "discover.match" || item.type === "friend.request") && rel.friend === "friends")
    return (
      <GhostButton label="Say hi" icon="chat_bubble" height={34} className="shrink-0 px-3 [&>span]:text-[13px]" onClick={() => router.push(`/chats/${a.id}`)} />
    );
  return null;
}
