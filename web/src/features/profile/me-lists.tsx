"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { Avatar } from "@/components/ui/avatar";
import { GhostButton } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { EmptyState } from "@/components/ui/misc";
import { Spinner } from "@/components/ui/spinner";
import { useNow } from "@/hooks/use-now";
import { usePaged } from "@/hooks/use-paged";
import { asList, asMap, matchRecord, profile as mapProfile } from "@/lib/api/mappers";
import { ago, duration, presenceLabel } from "@/lib/format";
import { type MatchRecord, matchLengthSeconds, type Profile } from "@/lib/models";
import { api } from "@/stores/services";
import { friendsOf, useSocial } from "@/stores/social";

import { MeSection } from "./me-sections";

// The lists behind your numbers on Me. Only you see them.

/** Me → Recent matches (See all): every call, newest first, more as you scroll. */
export function MatchesPage() {
  useNow(60_000);
  const { items, loading, hasMore, sentinel } = usePaged<MatchRecord>(async (cursor) => {
    const r = asMap(await api.get("/me/matches", { limit: 30, ...(cursor ? { cursor } : {}) }));
    return {
      items: asList(r.items)
        .map((e) => matchRecord(asMap(e)))
        .filter((m): m is MatchRecord => m != null),
      nextCursor: typeof r.nextCursor === "string" ? r.nextCursor : null,
    };
  });
  return (
    <MeSection title="Matches" parent="/me">
      <PagedBody items={items} loading={loading} hasMore={hasMore} sentinel={sentinel} empty={<EmptyState className="mt-10" icon="history" title="No calls " accent="yet" body="Everyone you meet on a call shows up here." />}>
        {(items ?? []).map((r) => (
          <MatchRow key={r.id} r={r} />
        ))}
      </PagedBody>
    </MeSection>
  );
}

function MatchRow({ r }: { r: MatchRecord }) {
  const bits = [duration(matchLengthSeconds(r)), ago(r.startedAt), ...(r.likedMe ? ["liked you"] : []), ...(r.giftsReceived > 0 ? [`${r.giftsReceived} gift${r.giftsReceived === 1 ? "" : "s"}`] : [])];
  return (
    <PersonRow person={r.partner} line={bits.join(" · ")} trailing={r.liked ? <Icon name="favorite" size={18} className="text-pink" label="You liked them" /> : null} />
  );
}

/** Me → Friends: everyone you're friends with; message them or open their profile. */
export function FriendsPage() {
  const router = useRouter();
  // Select the raw lists (a fresh sorted array per render would loop the store).
  const all = useSocial((s) => s.all);
  const chats = useSocial((s) => s.chats);
  const friends = friendsOf({ all, chats });
  useNow(60_000);
  return (
    <MeSection title="Friends" parent="/me">
      {!friends.length ? (
        <EmptyState className="mt-10" icon="group" title="No friends " accent="yet" body="After a good call, add them as a friend from their profile." />
      ) : (
        friends.map((f) => (
          <PersonRow
            key={f.profile.id}
            person={f.profile}
            line={presenceLabel(f.online, f.lastSeenAt) ?? `Friends since ${ago(f.since)}`}
            online={f.online}
            trailing={<GhostButton label="Message" icon="chat_bubble_outline" height={34} onClick={() => router.push(`/chats/${f.profile.id}`)} />}
          />
        ))
      )}
    </MeSection>
  );
}

interface Like {
  id: string;
  profile: Profile;
  likedAt: Date;
}

/** Me → Likes: everyone who liked you on a call, newest first, more as you scroll. */
export function LikesPage() {
  useNow(60_000);
  const { items, loading, hasMore, sentinel } = usePaged<Like>(async (cursor) => {
    const r = asMap(await api.get("/me/likes", { limit: 30, ...(cursor ? { cursor } : {}) }));
    return {
      items: asList(r.items).map((e) => {
        const m = asMap(e);
        return { id: String(m.id), profile: mapProfile(asMap(m.profile)), likedAt: new Date(String(m.likedAt)) };
      }),
      nextCursor: typeof r.nextCursor === "string" ? r.nextCursor : null,
    };
  });
  return (
    <MeSection title="Likes" parent="/me" footer="People who tapped the heart on a call with you.">
      <PagedBody items={items} loading={loading} hasMore={hasMore} sentinel={sentinel} empty={<EmptyState className="mt-10" icon="favorite_border" title="No likes " accent="yet" body="When someone taps the heart on a call with you, they show up here." />}>
        {(items ?? []).map((l) => (
          <PersonRow key={l.id} person={l.profile} line={`Liked you ${ago(l.likedAt)}`} trailing={<Icon name="favorite" size={18} className="text-pink" />} />
        ))}
      </PagedBody>
    </MeSection>
  );
}

/** A person in one of these lists: photo, name, one line; tap for their profile. */
function PersonRow({ person, line, trailing, online = false }: { person: Profile; line: string; trailing?: React.ReactNode; online?: boolean }) {
  return (
    <div className="flex items-center border-b border-line-soft py-3 last:border-b-0">
      <Link href={`/u/${person.id}`} className="flex min-w-0 flex-1 items-center transition-opacity hover:opacity-85">
        <span className="relative shrink-0">
          <Avatar url={person.avatarUrl} name={person.name} size={44} />
          {online ? <span className="absolute right-0 bottom-0 size-3 rounded-full border-2 border-bg bg-ok" aria-label="Online" /> : null}
        </span>
        <span className="ml-3.5 min-w-0">
          <span className="type-title block truncate text-[15px] font-semibold">
            {person.name}, {person.age} {person.country.flag}
          </span>
          <span className="type-body mt-px block truncate text-[12px] text-text2">{line}</span>
        </span>
      </Link>
      {trailing ? <span className="ml-2 flex shrink-0 items-center">{trailing}</span> : null}
    </div>
  );
}

/** First-load spinner, the empty state, the rows, then a sentinel that loads the next page. */
function PagedBody<T>({
  items,
  loading,
  hasMore,
  sentinel,
  empty,
  children,
}: {
  items: T[] | null;
  loading: boolean;
  hasMore: boolean;
  sentinel: (el: HTMLElement | null) => void;
  empty: React.ReactNode;
  children: React.ReactNode;
}) {
  if (items === null)
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  if (!items.length) return <>{empty}</>;
  return (
    <div>
      {children}
      {hasMore ? (
        <div ref={sentinel} className="flex justify-center py-5">
          {loading ? <Spinner size={22} /> : null}
        </div>
      ) : null}
    </div>
  );
}
