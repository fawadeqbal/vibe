"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Screen } from "@/components/layout/screen";
import { confirm } from "@/components/shared/dialogs";
import { Avatar } from "@/components/ui/avatar";
import { GhostButton, GradientButton, TextButton } from "@/components/ui/button";
import { MenuButton } from "@/components/ui/menu";
import { EmptyState } from "@/components/ui/misc";
import { AppBar } from "@/components/ui/page-header";
import { Spinner } from "@/components/ui/spinner";
import { errorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/cn";
import { ago } from "@/lib/format";
import type { FollowEntry, FollowList } from "@/lib/models";
import { useFollows } from "@/stores/follows";
import { toast } from "@/stores/ui";

const LABEL: Record<FollowList, string> = { followers: "Followers", following: "Following", requests: "Requests" };
const EMPTY: Record<FollowList, { icon: string; title: string; body: string }> = {
  followers: { icon: "group", title: "No followers yet", body: "People you meet can follow you from your profile." },
  following: { icon: "person_search", title: "You don't follow anyone", body: "Tap Follow on someone's profile after a match." },
  requests: { icon: "inbox", title: "No requests", body: "While your account is private, new followers wait here." },
};

/** Your followers, who you follow, and (private accounts) waiting requests. Only you see these. */
export function FollowListsScreen({ initialTab }: { initialTab: FollowList }) {
  const router = useRouter();
  const isPrivate = useFollows((s) => s.settings.privateAccount);
  const tabs: FollowList[] = isPrivate ? ["followers", "following", "requests"] : ["followers", "following"];
  const [tab, setTab] = useState<FollowList>(initialTab);
  const shown = tabs.includes(tab) ? tab : "followers";
  return (
    <Screen header={<AppBar title="Followers" onBack={() => router.push("/me")} />}>
      <div role="tablist" className="mb-2 flex gap-1 border-b border-line-soft">
        {tabs.map((x) => (
          <button
            key={x}
            role="tab"
            type="button"
            aria-selected={shown === x}
            onClick={() => setTab(x)}
            className={cn("type-label -mb-px border-b-2 px-3 py-2.5 text-[14px] font-medium", shown === x ? "border-pink text-text" : "border-transparent text-muted hover:text-text2")}
          >
            {LABEL[x]}
          </button>
        ))}
      </div>
      <FollowListTab key={shown} which={shown} />
    </Screen>
  );
}

function FollowListTab({ which }: { which: FollowList }) {
  const router = useRouter();
  const [items, setItems] = useState<FollowEntry[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [fetching, setFetching] = useState(true);
  const [followedBack, setFollowedBack] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    useFollows
      .getState()
      .list(which, null)
      .then(
        (page) => {
          if (!alive) return;
          setItems(page.items);
          setCursor(page.nextCursor);
          setFetching(false);
        },
        (e: unknown) => {
          if (!alive) return;
          toast(errorMessage(e), { error: true });
          setItems([]);
          setFetching(false);
        },
      );
    return () => {
      alive = false;
    };
  }, [which]);

  const more = async (from: string) => {
    setFetching(true);
    try {
      const page = await useFollows.getState().list(which, from);
      setItems((prev) => [...(prev ?? []), ...page.items]);
      setCursor(page.nextCursor);
    } catch (e) {
      toast(errorMessage(e), { error: true });
    } finally {
      setFetching(false);
    }
  };

  const drop = (id: string) => setItems((prev) => (prev ?? []).filter((x) => x.profile.id !== id));
  const act = async (action: () => Promise<unknown>, after?: () => void) => {
    try {
      await action();
      after?.();
    } catch (e) {
      toast(errorMessage(e), { error: true });
    }
  };
  const unfollow = async (e: FollowEntry) => {
    if (await confirm({ title: `Unfollow ${e.profile.name}?`, ok: "Unfollow", cancel: "Keep", okTone: "bad" })) await act(() => useFollows.getState().unfollow(e.profile.id), () => drop(e.profile.id));
  };

  if (items === null)
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  if (!items.length) {
    const e = EMPTY[which];
    return <EmptyState icon={e.icon} title={e.title} body={e.body} className="py-10" />;
  }

  const actions = (e: FollowEntry) => {
    const id = e.profile.id;
    if (which === "requests")
      return (
        <span className="ml-2 flex shrink-0 items-center gap-1">
          <TextButton onClick={() => void act(() => useFollows.getState().decline(id), () => drop(id))}>Decline</TextButton>
          <GradientButton label="Accept" height={36} expand={false} onClick={() => void act(() => useFollows.getState().accept(id), () => drop(id))} />
        </span>
      );
    if (which === "following") return <GhostButton label="Following" height={34} className="ml-2 shrink-0" onClick={() => void unfollow(e)} />;
    return (
      <span className="ml-2 flex shrink-0 items-center gap-1">
        {!e.followsBack && !followedBack.includes(id) ? (
          <GhostButton label="Follow back" height={34} onClick={() => void act(() => useFollows.getState().follow(id), () => setFollowedBack((x) => [...x, id]))} />
        ) : null}
        <MenuButton label="More" items={[{ label: "Remove follower", tone: "bad", onSelect: () => void act(() => useFollows.getState().removeFollower(id), () => drop(id)) }]} />
      </span>
    );
  };

  return (
    <div>
      {items.map((e) => (
        <div key={e.profile.id} className="flex items-center border-b border-line-soft py-3">
          <button type="button" className="flex min-w-0 flex-1 items-center text-left" onClick={() => router.push(`/u/${e.profile.id}`)}>
            <Avatar url={e.profile.avatarUrl} name={e.profile.name} size={44} />
            <span className="ml-3.5 min-w-0">
              <span className="type-title block truncate text-[15px] font-semibold">
                {e.profile.name}, {e.profile.age} {e.profile.country.flag}
              </span>
              <span className="type-body block text-[12px] text-text2">{ago(e.since)}</span>
            </span>
          </button>
          {actions(e)}
        </div>
      ))}
      {cursor ? (
        <div className="mt-4 flex justify-center">
          <GhostButton
            label={fetching ? "Loading…" : "Show more"}
            disabled={fetching}
            onClick={() => void more(cursor)}
          />
        </div>
      ) : null}
    </div>
  );
}
