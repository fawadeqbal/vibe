"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { StreakChip } from "@/components/shared/streak-chip";
import { Avatar, FaceStack } from "@/components/ui/avatar";
import { CircleIconButton, GradientButton } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { EmptyState } from "@/components/ui/misc";
import { PageHeader } from "@/components/ui/page-header";
import { SectionTitle } from "@/components/ui/typography";
import { useNow } from "@/hooks/use-now";
import { cn } from "@/lib/cn";
import { agoShort, plural } from "@/lib/format";
import type { Friend, Profile } from "@/lib/models";
import { useActivity } from "@/stores/activity";
import { friendsOf, useSocial } from "@/stores/social";
import { isVip, useWallet } from "@/stores/wallet";

import { MomentsBar } from "./moments-bar";
import { useRestoreStreak } from "./streak";

/**
 * Your chats, and only chats: the "liked you" teaser for free users, then a
 * calm, unboxed conversation list. Friend requests, sent requests and
 * Messages from Vibe live on the Notifications page (the bell).
 */
export function ChatsList() {
  const router = useRouter();
  const notifications = useActivity((s) => s.unread);
  const path = usePathname();
  const social = useSocial();
  const vip = useWallet((s) => isVip(s.wallet));
  const restore = useRestoreStreak();
  useNow(60_000);
  const friends = friendsOf(social);
  const empty = !friends.length;

  return (
    <div className="flex min-h-0 flex-1 flex-col pt-[env(safe-area-inset-top)]">
      <PageHeader
        title="Chats"
        actions={
          <span className="flex items-center gap-2">
            <span className="relative">
              <CircleIconButton icon="notifications" label={notifications ? `Notifications, ${notifications} new` : "Notifications"} iconSize={21} className="bg-surface2 text-text" onClick={() => router.push("/notifications")} />
              {notifications ? (
                <span className="type-label pointer-events-none absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-[9px] border-2 border-bg bg-pink px-1 text-[10px] font-bold text-white">
                  {notifications > 99 ? "99+" : notifications}
                </span>
              ) : null}
            </span>
            <CircleIconButton icon="card_giftcard" label="Invite friends" iconSize={20} className="bg-surface2 text-gold" onClick={() => router.push("/invite")} />
          </span>
        }
      />
      {empty ? (
        <>
          <div className="px-5">
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
        <div className="quiet-scroll min-h-0 flex-1 overflow-y-auto px-5 pb-8">
          <MomentsBar />
          {!vip && social.likedYouCount > 0 ? (
            <div className="mt-1">
              <LikedTeaser people={social.likedYou} count={social.likedYouCount} />
            </div>
          ) : null}
          <SectionTitle text={`Friends · ${friends.length}`} top={!vip && social.likedYouCount > 0 ? 26 : 4} bottom={4} />
          {friends.map((f, i) => (
            <FriendRow key={f.profile.id} f={f} last={i === friends.length - 1} active={path === `/chats/${f.profile.id}`} onRestore={() => void restore(f)} />
          ))}
        </div>
      )}
    </div>
  );
}


function LikedTeaser({ people, count }: { people: Profile[]; count: number }) {
  return (
    <Link
      href="/vip"
      className="flex items-center rounded-card border border-gold/22 px-3.5 py-3 transition-[filter] hover:brightness-125"
      style={{ backgroundImage: "linear-gradient(90deg, rgb(255 200 87 / .1), rgb(255 200 87 / .02))" }}
    >
      <FaceStack urls={people.slice(0, 3).map((p) => p.avatarUrl)} borderColor="#17141F" />
      <span className="ml-3 flex-1">
        <span className="type-title block text-[14px] font-semibold">
          {count} {plural(count, "person", "people")} liked you
        </span>
        <span className="type-body block text-[12px] text-gold">See who with VIP</span>
      </span>
      <Icon name="chevron_right" className="text-gold" />
    </Link>
  );
}

function UnreadBadge({ n }: { n: number }) {
  return <span className="type-label ml-2 flex h-5 min-w-5 items-center justify-center rounded-[10px] bg-pink px-1.5 text-[11px] font-bold text-white">{n > 99 ? "99+" : n}</span>;
}

function FriendRow({ f, last, active, onRestore }: { f: Friend; last: boolean; active: boolean; onRestore: () => void }) {
  const msgs = useSocial((s) => s.chats[f.profile.id]);
  const at = msgs?.length ? msgs[msgs.length - 1].at : f.since;
  const unread = f.unread > 0;
  const restorable = f.streak.restorable && f.streak.lostCount > 0;
  // The whole row opens the chat (a stretched link), so "Restore" can be its own button.
  return (
    <div className={cn("relative flex items-center py-3 transition-colors hover:bg-white/3", !last && "border-b border-line-soft", active && "bg-white/5")}>
      <Link
        href={`/chats/${f.profile.id}`}
        onClick={() => useSocial.getState().markRead(f.profile.id)}
        aria-current={active ? "page" : undefined}
        aria-label={`Chat with ${f.profile.name}${unread ? `, ${f.unread} unread` : ""}`}
        className="absolute inset-0 z-0"
      />
      <span className="pointer-events-none relative shrink-0">
        <Avatar url={f.profile.avatarUrl} name={f.profile.name} size={52} />
        {f.online ? <span className="absolute right-0 bottom-0 size-3.5 rounded-full border-[2.5px] border-bg bg-ok" /> : null}
      </span>
      <span className="pointer-events-none relative ml-3.5 min-w-0 flex-1">
        <span className="flex items-center">
          <span className="flex min-w-0 flex-1 items-center">
            <span className="type-title truncate text-[16px] font-semibold">{f.profile.name}</span>
            {f.profile.verified ? <Icon name="verified" size={15} className="ml-1 shrink-0 text-trust" label="Verified" /> : null}
            <StreakChip streak={f.streak} riskLabel className="ml-1.5" />
          </span>
          <span className={cn("type-label ml-2 shrink-0 text-[12px]", unread ? "font-semibold text-pink-soft" : "font-normal text-muted")}>{agoShort(at)}</span>
        </span>
        <span className="mt-0.5 flex items-center">
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
            <span className={cn("type-body min-w-0 flex-1 truncate text-[14px]", unread ? "font-medium text-text" : "text-text2")}>
              {f.lastMessage ?? "Say hi 👋"}
            </span>
          )}
          {unread ? <UnreadBadge n={f.unread} /> : null}
        </span>
      </span>
    </div>
  );
}

/** Pinned row for "Messages from Vibe" (the team's messages), above friend requests. */
