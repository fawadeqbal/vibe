"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { Avatar, FaceStack } from "@/components/ui/avatar";
import { CircleIconButton, GradientButton } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { EmptyState } from "@/components/ui/misc";
import { PageHeader } from "@/components/ui/page-header";
import { useNow } from "@/hooks/use-now";
import { errorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/cn";
import { agoShort, plural } from "@/lib/format";
import type { Friend, Profile } from "@/lib/models";
import { useActivity } from "@/stores/activity";
import { friendsOf, incomingOf, lastActivity, useSocial } from "@/stores/social";
import { toast } from "@/stores/ui";
import { isVip, useWallet } from "@/stores/wallet";

import { chatPreview } from "./chat-preview";
import { Ticks } from "./ticks";
import { MomentsBar } from "./moments-bar";
import { useRestoreStreak } from "./streak";

type Filter = "all" | "unread" | "online" | "requests";

/**
 * Your chats, edge to edge like the messaging apps people know: search,
 * four filters (All · Unread · Online · Requests), then — under All —
 * moments and who's online, friend requests and "liked you" as slim rows,
 * and your chats, newest first. Each line says what the last message was
 * (seen ticks, photo, voice note, gift, a missed call in red, typing…).
 * (Design: Chats list, redesigned.)
 */
export function ChatsList() {
  const router = useRouter();
  const notifications = useActivity((s) => s.unread);
  const path = usePathname();
  const social = useSocial();
  const vip = useWallet((s) => isVip(s.wallet));
  const restore = useRestoreStreak();
  useNow(60_000);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const all = friendsOf(social);
  const requests = incomingOf(social);
  const q = query.trim().toLowerCase();
  const named = (f: Friend) => !q || f.profile.name.toLowerCase().includes(q);
  const unreadCount = all.filter((f) => f.unread > 0).length;
  const onlineCount = all.filter((f) => f.online).length;
  const shown =
    filter === "requests"
      ? requests.filter(named)
      : all.filter((f) => named(f) && (filter === "unread" ? f.unread > 0 : filter === "online" ? f.online : true));
  const empty = !all.length && !requests.length;

  const markAllRead = () => {
    for (const f of all) if (f.unread > 0) useSocial.getState().markRead(f.profile.id);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col pt-[env(safe-area-inset-top)]">
      <PageHeader
        title="Chats"
        actions={
          <span className="relative">
            <CircleIconButton
              icon="notifications"
              label={notifications ? `Notifications, ${notifications} new` : "Notifications"}
              iconSize={21}
              className="bg-surface2 text-text"
              onClick={() => router.push("/notifications")}
            />
            {notifications ? (
              <span className="type-label pointer-events-none absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-[9px] border-2 border-bg bg-pink px-1 text-[10px] font-bold text-white">
                {notifications > 99 ? "99+" : notifications}
              </span>
            ) : null}
          </span>
        }
      />
      {empty ? (
        <>
          <div className="px-4">
            <MomentsBar />
          </div>
          <EmptyState
            className="flex-1"
            icon="chat_bubble_outline"
            title="No friends "
            accent="yet"
            body="Tap Add during a match. When they accept, you can keep talking here — text and gifts, any time."
            action={<GradientButton label="Find people" icon="videocam" expand={false} onClick={() => router.push("/match")} />}
          />
        </>
      ) : (
        <>
          {/* Search and filters stay put; only the list under them scrolls. */}
          <div className="flex shrink-0 flex-col gap-3 px-4 pb-2">
            <label className="flex h-[42px] items-center gap-2.5 rounded-[14px] border border-line bg-surface px-3.5">
              <Icon name="search" variant="outlined" size={19} className="shrink-0 text-muted" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search"
                aria-label="Search chats"
                className="type-body min-w-0 flex-1 bg-transparent text-[15px] text-text outline-none placeholder:text-muted"
              />
              {query ? (
                <button type="button" aria-label="Clear search" onClick={() => setQuery("")} className="text-muted hover:text-text">
                  <Icon name="close" size={18} />
                </button>
              ) : null}
            </label>
            <div role="group" aria-label="Show" className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
              <Chip label="All" on={filter === "all"} onClick={() => setFilter("all")} />
              <Chip label="Unread" count={unreadCount} on={filter === "unread"} onClick={() => setFilter("unread")} />
              <Chip label="Online" count={onlineCount} on={filter === "online"} onClick={() => setFilter("online")} />
              <Chip label="Requests" count={requests.length} on={filter === "requests"} onClick={() => setFilter("requests")} />
            </div>
          </div>
          <div className="quiet-scroll min-h-0 flex-1 overflow-x-hidden overflow-y-auto pb-8 lg:px-2">
            {filter === "all" && !q ? (
              <>
                <div className="px-4 pt-1 lg:px-2">
                  <MomentsBar />
                </div>
                {requests.length ? <RequestsRow requests={requests} onOpen={() => setFilter("requests")} /> : null}
                {!vip && social.likedYouCount > 0 ? <LikedRow people={social.likedYou} count={social.likedYouCount} /> : null}
              </>
            ) : null}
            {filter === "requests" ? (
              shown.map((f) => <RequestRow key={f.profile.id} f={f} />)
            ) : (
              <ul aria-label="Chats">
                {shown.map((f) => (
                  <li key={f.profile.id}>
                    <ChatRow f={f} active={path === `/chats/${f.profile.id}`} onRestore={() => void restore(f)} />
                  </li>
                ))}
              </ul>
            )}
            {!shown.length ? (
              <p className="type-body px-6 pt-8 text-center text-[13.5px] text-muted">
                {q
                  ? `Nobody called “${query.trim()}”.`
                  : filter === "unread"
                    ? "You're all caught up."
                    : filter === "online"
                      ? "None of your friends are online right now."
                      : filter === "requests"
                        ? "No friend requests right now."
                        : "No chats yet."}
              </p>
            ) : filter === "unread" ? (
              <p className="type-body px-6 pt-5 text-center text-[13px] text-muted">
                That&apos;s everything unread.{" "}
                <button type="button" onClick={markAllRead} className="font-semibold text-pink-soft hover:text-pink">
                  Mark all as read
                </button>
              </p>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

function Chip({ label, count, on, onClick }: { label: string; count?: number; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "type-label flex h-[34px] shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13.5px] font-semibold transition-colors",
        on ? "border-text bg-text text-bg" : "border-line bg-surface text-text2 hover:text-text",
      )}
    >
      {label}
      {count ? <span className={cn("text-[12px] font-bold tabular-nums", on ? "text-bg" : "text-pink-soft")}>{count > 99 ? "99+" : count}</span> : null}
    </button>
  );
}

/** Slim row above the chats: who's asking to be friends; opens the Requests filter. */
function RequestsRow({ requests, onOpen }: { requests: Friend[]; onOpen: () => void }) {
  const n = requests.length;
  const first = requests[0].profile.name.split(" ")[0];
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Friend requests, ${n} waiting`}
      className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-white/3 lg:rounded-2xl lg:px-3"
    >
      <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-violet/16 lg:size-[50px]">
        <Icon name="person_add" size={24} className="text-lavender" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="type-title text-[15.5px] font-bold">Friend requests</span>
        <span className="type-body truncate text-[13.5px] text-text2">
          {n === 1 ? `${first} wants to be friends` : `${first} and ${n - 1} more want to be friends`}
        </span>
      </span>
      <Badge n={n} />
      <Icon name="chevron_right" size={20} className="text-muted" />
    </button>
  );
}

function LikedRow({ people, count }: { people: Profile[]; count: number }) {
  return (
    <Link
      href="/vip"
      className="mx-4 my-1.5 flex items-center gap-3 rounded-2xl border border-gold/20 bg-gold/8 px-3.5 py-2.5 transition-[filter] hover:brightness-125 lg:mx-2"
    >
      {people.length ? (
        <FaceStack urls={people.slice(0, 3).map((p) => p.avatarUrl)} borderColor="#17141F" size={28} />
      ) : (
        <Icon name="favorite_border" size={20} className="text-gold" />
      )}
      <span className="type-title flex-1 text-[13.5px] font-semibold">
        {count} {plural(count, "person", "people")} liked you
      </span>
      <span className="type-label text-[13px] font-bold text-gold">See with VIP</span>
      <Icon name="chevron_right" size={18} className="text-gold" />
    </Link>
  );
}

function Badge({ n }: { n: number }) {
  return (
    <span className="type-label flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-pink px-1.5 text-[11.5px] font-bold text-white tabular-nums">
      {n > 99 ? "99+" : n}
    </span>
  );
}

const PREVIEW_ICON = { photo: "image", mic: "mic", gift: "card_giftcard", call: "call", call_missed: "call_missed" } as const;

function ChatRow({ f, active, onRestore }: { f: Friend; active: boolean; onRestore: () => void }) {
  const at = useSocial((s) => lastActivity(s.chats, f));
  const typing = useSocial((s) => !!s.typing[f.profile.id]);
  const seenAt = useSocial((s) => s.seenAt[f.profile.id]);
  const deliveredAt = useSocial((s) => s.deliveredAt[f.profile.id]);
  const unread = f.unread > 0;
  const restorable = f.streak.restorable && f.streak.lostCount > 0;
  const p = chatPreview(f, seenAt, deliveredAt);
  const tone = typing ? "font-semibold text-ok" : p.missed ? "text-bad" : unread ? "font-semibold text-text" : "text-text2";
  // The whole row opens the chat (a stretched link), so "Restore" can be its own button.
  return (
    <div
      className={cn(
        "relative flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-white/3 lg:rounded-2xl lg:px-3",
        active && "bg-surface2 hover:bg-surface2",
      )}
    >
      <Link
        href={`/chats/${f.profile.id}`}
        onClick={() => useSocial.getState().markRead(f.profile.id)}
        aria-current={active ? "page" : undefined}
        aria-label={`Chat with ${f.profile.name}${unread ? `, ${f.unread} unread` : ""}`}
        className="absolute inset-0 z-0 lg:rounded-2xl"
      />
      <span className="pointer-events-none relative shrink-0">
        <span className="lg:hidden">
          <Avatar url={f.profile.avatarUrl} name={f.profile.name} size={56} />
        </span>
        <span className="hidden lg:inline-flex">
          <Avatar url={f.profile.avatarUrl} name={f.profile.name} size={50} />
        </span>
        {f.online ? (
          <span className={cn("absolute right-0 bottom-0 size-3.5 rounded-full border-[2.5px] bg-ok", active ? "border-surface2" : "border-bg")} />
        ) : null}
      </span>
      <span className="pointer-events-none relative flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className={cn("type-title truncate text-[15.5px] tracking-[-0.01em]", unread ? "font-bold" : "font-semibold")}>{f.profile.name}</span>
          {f.profile.verified ? <Icon name="verified" size={15} className="shrink-0 text-trust" label="Verified" /> : null}
          {f.streak.count > 0 ? <StreakPill count={f.streak.count} atRisk={f.streak.atRisk} /> : null}
          <span className="flex-1" />
          <span className={cn("type-label shrink-0 text-[12px] tabular-nums", unread ? "font-semibold text-pink-soft" : "font-medium text-muted")}>
            {agoShort(at)}
          </span>
        </span>
        <span className="flex min-w-0 items-center gap-1.5">
          {restorable ? (
            <span className="flex min-w-0 flex-1 items-center">
              <span className="type-body truncate text-[13.5px] text-muted">Streak lost ·</span>
              <button
                type="button"
                onClick={onRestore}
                className="pointer-events-auto ml-1.5 flex h-7 shrink-0 items-center rounded-full border border-gold/30 bg-gold/12 pr-2.5 pl-2 transition-[filter] hover:brightness-125"
              >
                <span className="type-label text-[12.5px] text-gold">Restore</span>
                <Icon name="local_fire_department" size={14} className="ml-1 text-flame" />
                <span className="type-number text-[12.5px] text-gold">{f.streak.lostCount}</span>
              </button>
            </span>
          ) : (
            <>
              {!typing && p.ticks ? <Ticks status={p.ticks} /> : null}
              {!typing && p.icon ? (
                <Icon
                  name={PREVIEW_ICON[p.icon]}
                  size={15}
                  className={cn("shrink-0", p.icon === "gift" ? "text-gold" : p.missed ? "text-bad" : "text-text2")}
                />
              ) : null}
              <span className={cn("type-body min-w-0 flex-1 truncate text-[13.5px]", tone)}>{typing ? "typing…" : p.text}</span>
            </>
          )}
          {unread ? <Badge n={f.unread} /> : null}
        </span>
      </span>
    </div>
  );
}

function StreakPill({ count, atRisk }: { count: number; atRisk: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-0.5 rounded-full pr-1.5 pl-1 text-[11.5px] font-bold tabular-nums",
        atRisk ? "bg-gold/12 text-gold" : "bg-pink/12 text-pink-soft",
      )}
      aria-label={`${count}-day streak${atRisk ? ", ends at midnight" : ""}`}
    >
      <Icon name="local_fire_department" size={13} />
      {count}
      {atRisk ? <Icon name="hourglass_bottom" size={12} /> : null}
    </span>
  );
}

/** Requests filter: someone wants to be friends; answer right here. */
function RequestRow({ f }: { f: Friend }) {
  const [busy, setBusy] = useState(false);
  const answer = async (yes: boolean) => {
    setBusy(true);
    try {
      if (yes) await useSocial.getState().accept(f.profile.id);
      else await useSocial.getState().decline(f.profile.id);
      toast(yes ? `You and ${f.profile.name.split(" ")[0]} are friends` : "Request declined");
    } catch (e) {
      toast(errorMessage(e), { error: true });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 lg:px-3">
      <Link href={`/u/${f.profile.id}`} aria-label={`${f.profile.name}'s profile`} className="shrink-0">
        <Avatar url={f.profile.avatarUrl} name={f.profile.name} size={52} />
      </Link>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-1">
          <span className="type-title truncate text-[15.5px] font-semibold">{f.profile.name}</span>
          {f.profile.verified ? <Icon name="verified" size={15} className="shrink-0 text-trust" label="Verified" /> : null}
        </span>
        <span className="type-body truncate text-[13px] text-text2">Wants to be friends · {agoShort(f.since)}</span>
      </span>
      <button
        type="button"
        disabled={busy}
        onClick={() => void answer(false)}
        className="type-label h-9 shrink-0 rounded-full border border-line px-3.5 text-[13px] font-semibold text-text2 hover:text-text disabled:opacity-50"
      >
        Decline
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => void answer(true)}
        className="type-label h-9 shrink-0 rounded-full bg-pink px-3.5 text-[13px] font-bold text-white hover:brightness-110 disabled:opacity-50"
      >
        Accept
      </button>
    </div>
  );
}
