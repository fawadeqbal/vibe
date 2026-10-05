"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { TeamAvatar } from "@/components/shared/team-avatar";
import { Avatar, FaceStack } from "@/components/ui/avatar";
import { GhostButton, GradientButton } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { EmptyState } from "@/components/ui/misc";
import { PageHeader } from "@/components/ui/page-header";
import { SectionTitle } from "@/components/ui/typography";
import { useNow } from "@/hooks/use-now";
import { cn } from "@/lib/cn";
import { agoShort, plural } from "@/lib/format";
import type { Friend, Profile, TeamMessage } from "@/lib/models";
import { useInbox } from "@/stores/inbox";
import { friendsOf, incomingOf, requestedOf, useSocial } from "@/stores/social";
import { isVip, useWallet } from "@/stores/wallet";

/**
 * Friends you made in matches. Requests on top with labelled Accept/Decline,
 * the "liked you" teaser for free users, then a calm, unboxed conversation list.
 */
export function ChatsList() {
  const router = useRouter();
  const path = usePathname();
  const social = useSocial();
  const vip = useWallet((s) => isVip(s.wallet));
  const latest = useInbox((s) => s.messages[0] ?? null);
  const teamUnread = useInbox((s) => s.unread);
  useNow(60_000);
  const friends = friendsOf(social);
  const incoming = incomingOf(social);
  const requested = requestedOf(social);
  const empty = !friends.length && !incoming.length && !requested.length && !latest;

  return (
    <div className="flex min-h-0 flex-1 flex-col pt-[env(safe-area-inset-top)]">
      <PageHeader title="Chats" />
      {empty ? (
        <EmptyState
          className="flex-1"
          icon="chat_bubble_outline"
          title="No friends "
          accent="yet"
          body="Tap Add during a match. When they accept, you can keep talking here — text and gifts, any time."
          action={<GradientButton label="Find people" icon="videocam" expand={false} onClick={() => router.push("/match")} />}
        />
      ) : (
        <div className="quiet-scroll min-h-0 flex-1 overflow-y-auto px-5 pb-8">
          {latest ? <TeamRow latest={latest} unread={teamUnread} active={path === "/chats/inbox"} /> : null}
          {incoming.length ? (
            <>
              <SectionTitle text={`Requests · ${incoming.length}`} top={latest ? 18 : 4} />
              {incoming.map((f) => (
                <RequestCard key={f.profile.id} f={f} />
              ))}
            </>
          ) : null}
          {!vip && social.likedYouCount > 0 ? (
            <div className={incoming.length ? "mt-2.5" : "mt-1"}>
              <LikedTeaser people={social.likedYou} count={social.likedYouCount} />
            </div>
          ) : null}
          {requested.length ? (
            <div className="mt-3.5">
              {requested.map((f) => (
                <div key={f.profile.id} className="flex items-center px-0.5 py-1">
                  <span className="opacity-80">
                    <Avatar url={f.profile.avatarUrl} name={f.profile.name} size={24} />
                  </span>
                  <p className="type-body ml-2.5 flex-1 text-[12.5px] text-muted">
                    Waiting for <span className="font-semibold text-text2">{f.profile.name}</span> to accept
                  </p>
                  <Icon name="hourglass_top" size={16} className="text-muted" />
                </div>
              ))}
            </div>
          ) : null}
          <SectionTitle text={`Friends · ${friends.length}`} top={26} bottom={4} />
          {!friends.length ? <p className="type-body px-0.5 py-3 text-[13px] text-text2">Nobody has accepted yet.</p> : null}
          {friends.map((f, i) => (
            <FriendRow key={f.profile.id} f={f} last={i === friends.length - 1} active={path === `/chats/${f.profile.id}`} />
          ))}
        </div>
      )}
    </div>
  );
}

function RequestCard({ f }: { f: Friend }) {
  const p = f.profile;
  const { accept, decline } = useSocial.getState();
  return (
    <div className="mb-2.5 rounded-card border border-pink/32 bg-surface p-3.5">
      <div className="flex items-center">
        <Avatar url={p.avatarUrl} name={p.name} size={52} ring gapColor="var(--color-surface)" />
        <div className="ml-3 min-w-0 flex-1">
          <p className="flex items-center">
            <span className="type-title truncate text-[16px] font-semibold">
              {p.name}, {p.age}
            </span>
            {p.verified ? <Icon name="verified" size={16} className="ml-1 text-trust" label="Verified" /> : null}
          </p>
          <p className="type-body mt-px truncate text-[12.5px] text-text2">
            {p.country.flag} {p.country.name} · wants to be friends
          </p>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <GhostButton label="Decline" height={42} expand className="flex-1 text-text2" onClick={() => void decline(p.id)} />
        <div className="flex-1">
          <GradientButton label="Accept" height={42} onClick={() => void accept(p.id)} />
        </div>
      </div>
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

function FriendRow({ f, last, active }: { f: Friend; last: boolean; active: boolean }) {
  const msgs = useSocial((s) => s.chats[f.profile.id]);
  const at = msgs?.length ? msgs[msgs.length - 1].at : f.since;
  const unread = f.unread > 0;
  return (
    <Link
      href={`/chats/${f.profile.id}`}
      onClick={() => useSocial.getState().markRead(f.profile.id)}
      aria-current={active ? "page" : undefined}
      className={cn("relative flex items-center py-3 transition-colors hover:bg-white/3", !last && "border-b border-line-soft", active && "bg-white/5")}
    >
      <span className="relative shrink-0">
        <Avatar url={f.profile.avatarUrl} name={f.profile.name} size={52} />
        {f.online ? <span className="absolute right-0 bottom-0 size-3.5 rounded-full border-[2.5px] border-bg bg-ok" /> : null}
      </span>
      <span className="ml-3.5 min-w-0 flex-1">
        <span className="flex items-center">
          <span className="flex min-w-0 flex-1 items-center">
            <span className="type-title truncate text-[16px] font-semibold">{f.profile.name}</span>
            {f.profile.verified ? <Icon name="verified" size={15} className="ml-1 text-trust" label="Verified" /> : null}
          </span>
          <span className={cn("type-label text-[12px]", unread ? "font-semibold text-pink-soft" : "font-normal text-muted")}>{agoShort(at)}</span>
        </span>
        <span className="mt-0.5 flex items-center">
          <span className={cn("type-body min-w-0 flex-1 truncate text-[14px]", unread ? "font-medium text-text" : "text-text2")}>{f.lastMessage ?? "Say hi 👋"}</span>
          {unread ? <UnreadBadge n={f.unread} /> : null}
        </span>
      </span>
    </Link>
  );
}

/** Pinned row for "Messages from Vibe" (the team's messages), above friend requests. */
function TeamRow({ latest, unread, active }: { latest: TeamMessage; unread: number; active: boolean }) {
  const hasUnread = unread > 0;
  return (
    <Link
      href="/chats/inbox"
      aria-label={hasUnread ? `Messages from Vibe, ${unread} new` : "Messages from Vibe"}
      className={cn("flex items-center rounded-card border bg-surface p-3 transition-[filter] hover:brightness-110", hasUnread ? "border-pink/32" : "border-line", active && "brightness-125")}
    >
      <TeamAvatar size={46} />
      <span className="ml-3 min-w-0 flex-1">
        <span className="flex items-center">
          <span className="type-title flex-1 truncate text-[15px] font-semibold">Messages from Vibe</span>
          <span className={cn("type-label text-[12px]", hasUnread ? "font-semibold text-pink-soft" : "font-normal text-muted")}>{agoShort(latest.at)}</span>
        </span>
        <span className="mt-0.5 flex items-center">
          <span className={cn("type-body min-w-0 flex-1 truncate text-[13.5px]", hasUnread ? "font-medium text-text" : "text-text2")}>{latest.title}</span>
          {hasUnread ? <UnreadBadge n={unread} /> : null}
        </span>
      </span>
    </Link>
  );
}
