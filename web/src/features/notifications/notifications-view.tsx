"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { TeamAvatar } from "@/components/shared/team-avatar";
import { Avatar } from "@/components/ui/avatar";
import { GhostButton, GradientButton } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { EmptyState } from "@/components/ui/misc";
import { AppBar } from "@/components/ui/page-header";
import { Spinner } from "@/components/ui/spinner";
import { errorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/cn";
import { agoShort } from "@/lib/format";
import type { ActivityItem } from "@/lib/models";
import { notificationPath } from "@/lib/notification-path";
import { useActivity } from "@/stores/activity";
import { useFollows } from "@/stores/follows";
import { useSocial } from "@/stores/social";
import { toast } from "@/stores/ui";

/**
 * Notifications: friend and follow requests (answer them right here), new
 * followers (follow back), matches and accepted requests (say hi), missed
 * calls, money and account news. Opening the page clears the badge; this
 * visit still shows which lines are new.
 */
export function NotificationsView() {
  const router = useRouter();
  const items = useActivity((s) => s.items);
  const loaded = useActivity((s) => s.loaded);
  const hasMore = useActivity((s) => s.cursor != null);
  const end = useRef<HTMLDivElement>(null);
  /** What was unread when the page opened: stays "New" for this visit, whatever reloads come later. */
  const [freshIds, setFreshIds] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    let alive = true;
    const a = useActivity.getState();
    void (a.loaded ? a.refresh() : a.load()).then(() => {
      if (!alive) return;
      setFreshIds(new Set(useActivity.getState().items.filter((i) => !i.read).map((i) => i.id)));
      void useActivity.getState().markAllRead();
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const el = end.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver((e) => e[0]?.isIntersecting && void useActivity.getState().loadMore(), { rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore]);

  const isNew = (i: ActivityItem) => !i.read || freshIds.has(i.id);
  const fresh = items.filter(isNew);
  const earlier = items.filter((i) => !isNew(i));

  return (
    <div className="flex min-h-0 flex-1 flex-col pt-[env(safe-area-inset-top)] lg:h-dvh">
      <AppBar title="Notifications" onBack={() => router.back()} />
      {!loaded ? (
        <div className="flex flex-1 justify-center py-20">
          <Spinner />
        </div>
      ) : !items.length ? (
        <EmptyState className="flex-1" icon="notifications" iconVariant="outlined" title="Nothing " accent="yet" body="Friend requests, new followers, matches and news about your coins show up here." />
      ) : (
        <div className="quiet-scroll min-h-0 flex-1 overflow-y-auto px-3 pt-1 pb-8">
          {fresh.length ? <Section title="New" items={fresh} isNew /> : null}
          {earlier.length ? <Section title={fresh.length ? "Earlier" : "All"} items={earlier} /> : null}
          {hasMore ? (
            <div ref={end} className="flex justify-center p-4">
              <Spinner size={22} stroke={2} />
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function Section({ title, items, isNew = false }: { title: string; items: ActivityItem[]; isNew?: boolean }) {
  return (
    <section className="mb-2">
      <h2 className="type-label px-2 pt-3 pb-1.5 text-[13px] font-semibold text-text2">{title}</h2>
      <ul className="flex flex-col">
        {items.map((i) => (
          <Row key={i.id} item={i} isNew={isNew} />
        ))}
      </ul>
    </section>
  );
}

function Row({ item, isNew }: { item: ActivityItem; isNew: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const a = item.actor;

  const act = async (fn: () => Promise<unknown>, done?: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      if (done) toast(done);
      await useActivity.getState().refresh();
    } catch (e) {
      toast(errorMessage(e), { error: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className={cn("flex items-center gap-3 rounded-2xl px-2 py-2.5", isNew && "bg-pink/6")}>
      <button type="button" onClick={() => router.push(notificationPath(item.data))} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <span className="relative shrink-0">
          {a ? <Avatar url={a.avatarUrl} name={a.name} size={48} /> : <TeamAvatar size={48} />}
          <span className="absolute -right-0.5 -bottom-0.5 grid size-[22px] place-items-center rounded-full border-2 border-bg bg-surface2">
            <Icon name={iconFor(item.type)} size={13} className="text-text" />
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="type-body line-clamp-2 block text-[13.5px] leading-snug">
            <span className="font-semibold text-text">{item.title}</span>
            {item.body ? <span className="text-text2"> {item.body}</span> : null}
          </span>
          <span className="type-label mt-0.5 block text-[11.5px] text-muted">{agoShort(item.at)}</span>
        </span>
        {isNew ? <span className="size-2 shrink-0 rounded-full bg-pink" aria-label="New" /> : null}
      </button>
      {a && item.rel ? <Actions item={item} busy={busy} act={act} /> : null}
    </li>
  );
}

/** Compact action buttons: label-sized, smaller text than the full-width default. */
const SMALL = "px-4 [&>span]:text-[13px]";

/** The one or two buttons that fit where you stand with them now. */
function Actions({ item, busy, act }: { item: ActivityItem; busy: boolean; act: (fn: () => Promise<unknown>, done?: string) => Promise<void> }) {
  const router = useRouter();
  const a = item.actor!;
  const rel = item.rel!;
  const first = a.name.split(" ")[0];
  const pair = (yes: () => Promise<unknown>, no: () => Promise<unknown>, done: string) => (
    <span className="flex shrink-0 gap-1.5">
      <GhostButton label="Decline" height={34} className="px-3 text-text2 [&>span]:text-[13px]" disabled={busy} onClick={() => void act(no)} />
      <GradientButton label="Accept" height={34} expand={false} className={SMALL} busy={busy} onClick={() => void act(yes, done)} />
    </span>
  );

  if (item.type === "friend.request" && rel.friend === "incoming") return pair(() => useSocial.getState().accept(a.id), () => useSocial.getState().decline(a.id), `You and ${first} are friends now`);
  if (item.type === "follow.request" && rel.followRequest) return pair(() => useFollows.getState().accept(a.id), () => useFollows.getState().decline(a.id), `${first} can see your profile now`);
  if (item.type === "follow.new" && rel.follow === "none")
    return (
      <GradientButton label={rel.followsYou ? "Follow back" : "Follow"} height={34} expand={false} className={cn(SMALL, "shrink-0")} busy={busy} onClick={() => void act(() => useFollows.getState().follow(a.id))} />
    );
  if ((item.type === "friend.accepted" || item.type === "discover.match" || item.type === "friend.request") && rel.friend === "friends")
    return <GhostButton label="Message" height={34} className="shrink-0 px-3.5 [&>span]:text-[13px]" onClick={() => router.push(`/chats/${a.id}`)} />;
  return null;
}

function iconFor(type: string): string {
  if (type.startsWith("friend.")) return "person_add";
  if (type.startsWith("follow.")) return "group_add";
  if (type.startsWith("discover.")) return "favorite";
  if (type.startsWith("wave.")) return "waving_hand";
  if (type.startsWith("call.")) return "call_missed";
  if (type.startsWith("referral.")) return "card_giftcard";
  if (type.startsWith("account.")) return "shield";
  return "account_balance_wallet";
}
