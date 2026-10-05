"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Screen } from "@/components/layout/screen";
import { confirm, useNeedCoins } from "@/components/shared/dialogs";
import { pickReport } from "@/components/shared/report-sheet";
import { Avatar } from "@/components/ui/avatar";
import { GhostButton, GradientButton } from "@/components/ui/button";
import { Glass } from "@/components/ui/glass";
import { Icon } from "@/components/ui/icon";
import { MenuButton, type MenuItem } from "@/components/ui/menu";
import { EmptyState, Tag } from "@/components/ui/misc";
import { AppBar } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Spinner } from "@/components/ui/spinner";
import { SectionTitle } from "@/components/ui/typography";
import { errorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/cn";
import { thousands } from "@/lib/format";
import type { FollowState, FriendState, ProfileView } from "@/lib/models";
import { economy } from "@/stores/catalog";
import { followStateOf, useFollows } from "@/stores/follows";
import { friendStateOf, useSocial } from "@/stores/social";
import { openSheet, toast } from "@/stores/ui";
import { freeFriendRequestsLeft, useWallet } from "@/stores/wallet";

/**
 * Someone else's profile. It opens up as you get closer: matched → following
 * (counts, stats) → friends (online, Message). Mirror of the Flutter
 * `UserProfileBody`.
 */
export function UserProfileBody({ userId, inCall = false, onGone }: { userId: string; inCall?: boolean; onGone?: () => void }) {
  const router = useRouter();
  const needCoins = useNeedCoins();
  const follow = useFollows((s) => followStateOf(s, userId));
  const friend = useSocial((s) => friendStateOf(s, userId));
  /** undefined = loading, null = may not see it. */
  const [view, setView] = useState<ProfileView | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  /** Bumped after an action to re-read the profile (the tier may have changed). */
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let alive = true;
    useFollows
      .getState()
      .view(userId)
      .then(
        (v) => alive && setView(v),
        (e: unknown) => {
          if (!alive) return;
          toast(errorMessage(e), { error: true });
          setView(null);
        },
      );
    return () => {
      alive = false;
    };
  }, [userId, version]);

  if (view === undefined)
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  if (view === null) return <EmptyState icon="person_off" title="Profile not available" body="You can see the profiles of people you have met in a match." className="py-10" />;

  const p = view.profile;
  const self = view.tier === "self";

  /** Runs an action, then re-reads the profile (the tier may have changed). */
  const run = async (action: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      setVersion((n) => n + 1);
    } catch (e) {
      toast(errorMessage(e), { error: true });
    } finally {
      setBusy(false);
    }
  };

  const onFollow = () =>
    run(async () => {
      if ((await useFollows.getState().follow(userId)) === "requested") toast("Request sent. They have a private account.");
    });

  const onUnfollow = async () => {
    const pending = follow === "requested";
    const ok = await confirm({ title: pending ? "Cancel your request?" : `Unfollow ${p.name}?`, ok: pending ? "Cancel request" : "Unfollow", cancel: "Keep", okTone: "bad" });
    if (ok) await run(() => useFollows.getState().unfollow(userId));
  };

  const onFriend = async () => {
    if (friend === "friends") {
      if (!inCall) router.push(`/chats/${userId}`);
      return;
    }
    if (friend === "incoming") return run(() => useSocial.getState().accept(userId));
    if (friend !== "none") return;
    const e = economy();
    if (freeFriendRequestsLeft(useWallet.getState()) === 0) {
      const ok = await confirm({ title: "Send a friend request?", body: `Your ${e.freeFriendRequestsPerDay} free requests for today are used. This one costs ${e.friendRequestCost} coins.`, ok: `Send for ${e.friendRequestCost}` });
      if (!ok) return;
    }
    await run(async () => {
      if (await useSocial.getState().sendRequest(p)) toast("Request sent");
      else await needCoins(`A friend request costs ${e.friendRequestCost} coins once your free ones are used.`);
    });
  };

  const onReport = async () => {
    const choice = await pickReport(p.name);
    if (!choice) return;
    await run(() => useFollows.getState().report(userId, choice));
    toast(`Thanks. ${p.name} was reported${choice.block ? " and blocked" : ""}.`);
    if (choice.block) {
      await useSocial.getState().load();
      onGone?.();
    }
  };

  const onBlock = async () => {
    const ok = await confirm({ title: `Block ${p.name}?`, body: "You will never match again, and they can't see your profile.", ok: "Block", okTone: "bad" });
    if (!ok) return;
    await run(() => useSocial.getState().block(p));
    onGone?.();
  };

  const menu: MenuItem[] = [
    ...(view.followsYou ? [{ label: "Remove follower", onSelect: () => void run(() => useFollows.getState().removeFollower(userId)) }] : []),
    ...(friend === "friends" ? [{ label: "Unfriend", onSelect: () => void run(() => useSocial.getState().remove(userId)) }] : []),
    { label: "Report", onSelect: () => void onReport() },
    { label: "Block", tone: "bad", onSelect: () => void onBlock() },
  ];

  return (
    <div>
      <div className="flex items-start">
        <span className="relative shrink-0">
          <Avatar url={p.avatarUrl} name={p.name} size={84} ring />
          {view.online ? <span className="absolute right-0.5 bottom-0.5 size-[18px] rounded-full border-[3px] border-bg bg-ok" /> : null}
        </span>
        <span className="ml-4 min-w-0 flex-1 pt-2">
          <span className="flex items-center">
            <span className="type-display truncate text-[26px] leading-[1.1]">
              {p.name}, {p.age}
            </span>
            {p.verified ? <Icon name="verified" size={20} className="ml-1.5 text-trust" label="Verified" /> : null}
            {p.vip ? <Icon name="workspace_premium" size={19} className="ml-1 text-gold" label="VIP" /> : null}
          </span>
          <span className="type-body mt-1 block text-[13px] text-text2">
            {p.country.flag} {p.country.name}
            {view.online ? " · Online now" : ""}
          </span>
          {view.followsYou ? (
            <span className="mt-2 inline-block">
              <Tag text="Follows you" tone="violet" />
            </span>
          ) : null}
        </span>
        {!self ? <MenuButton label="More" items={menu} /> : null}
      </div>

      {!self ? (
        <div className="mt-[18px] flex gap-2.5">
          <span className="flex-1">
            <FollowButton state={follow} busy={busy} onFollow={() => void onFollow()} onUndo={() => void onUnfollow()} />
          </span>
          <span className="flex-1">
            <FriendButton state={friend} inCall={inCall} onClick={() => void onFriend()} />
          </span>
        </div>
      ) : null}

      {view.counts ? (
        <p className="type-body mt-4 text-[13.5px] text-text2">
          <span className="type-number text-[15px] font-semibold text-text">{thousands(view.counts.followers)}</span> {view.counts.followers === 1 ? "follower" : "followers"}
          <span className="mx-2 text-muted">·</span>
          <span className="type-number text-[15px] font-semibold text-text">{thousands(view.counts.following)}</span> following
        </p>
      ) : null}

      <div className="mt-4">
        <StatsBlock view={view} />
      </div>

      {p.bio.trim() ? (
        <>
          <SectionTitle text="About" top={22} bottom={8} />
          <p className="type-body text-[14.5px] text-text">{p.bio}</p>
        </>
      ) : null}
      {p.interests.length ? (
        <>
          <SectionTitle text="Interests" top={22} bottom={10} />
          <div className="flex flex-wrap gap-1.5">
            {p.interests.map((i) => (
              <Tag key={i} text={i} tone="violet" />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

function FollowButton({ state, busy, onFollow, onUndo }: { state: FollowState; busy: boolean; onFollow: () => void; onUndo: () => void }) {
  if (state === "none") return <GradientButton label="Follow" icon="person_add_alt_1" height={46} busy={busy} onClick={onFollow} />;
  return <GhostButton label={state === "requested" ? "Requested" : "Following"} icon={state === "requested" ? "hourglass_top" : "check"} height={46} expand disabled={busy} onClick={onUndo} />;
}

function FriendButton({ state, inCall, onClick }: { state: FriendState; inCall: boolean; onClick: () => void }) {
  if (state === "friends") return <GhostButton label="Message" icon="chat_bubble_outline" height={46} expand disabled={inCall} onClick={onClick} />;
  if (state === "incoming") return <GhostButton label="Accept friend" icon="how_to_reg" height={46} expand onClick={onClick} />;
  if (state === "requested") return <GhostButton label="Request sent" icon="hourglass_top" height={46} expand disabled />;
  if (state === "blocked") return null;
  return <GhostButton label="Add friend" icon="person_add" height={46} expand onClick={onClick} />;
}

/** Matches · Likes · Gifts, or why you can't see them. */
function StatsBlock({ view }: { view: ProfileView }) {
  const s = view.stats;
  if (s && s !== "hidden") {
    const cell = (n: number, label: string) => (
      <span className="flex flex-1 flex-col items-center">
        <span className="type-number text-[20px]">{thousands(n)}</span>
        <span className="type-body mt-0.5 text-[11px] leading-[1.2] text-muted">{label}</span>
      </span>
    );
    return (
      <Panel className="py-4">
        <div className="flex">
          {cell(s.matches, "Matches")}
          {cell(s.likes, "Likes")}
          {cell(s.gifts, "Gifts")}
        </div>
      </Panel>
    );
  }
  const hidden = s === "hidden";
  return (
    <Panel className="px-4 py-[18px]">
      <div className="flex items-center gap-2.5">
        <Icon name={hidden ? "visibility_off" : "lock"} size={18} className="text-muted" />
        <span className="type-body text-[13px] text-text2">{hidden ? "Stats hidden" : "Follow to see their stats"}</span>
      </div>
    </Panel>
  );
}

/** The page at /u/[id]. */
export function UserProfileScreen({ userId }: { userId: string }) {
  const router = useRouter();
  const back = () => (window.history.length > 1 ? router.back() : router.push("/me"));
  return (
    <Screen header={<AppBar onBack={back} />}>
      <div className="pt-2">
        <UserProfileBody userId={userId} onGone={back} />
      </div>
    </Screen>
  );
}

/** Opens a profile over whatever is on screen — used in a live call, so the call keeps going. */
export const openUserProfileSheet = (userId: string, opts: { inCall?: boolean } = {}) =>
  openSheet<void>((close) => (
    <div className="px-5 pt-2 pb-5">
      <UserProfileBody userId={userId} inCall={opts.inCall} onGone={() => close()} />
    </div>
  ));

/** Follow from the call's top bar: a small "+" so the partner's name keeps its room. Reads their profile once to know the current state. */
export function FollowPill({ userId }: { userId: string }) {
  const state = useFollows((s) => followStateOf(s, userId));
  useEffect(() => {
    useFollows
      .getState()
      .view(userId)
      .catch(() => {});
  }, [userId]);
  const label = state === "following" ? "Following" : state === "requested" ? "Follow requested" : "Follow";
  const follow = () => {
    useFollows
      .getState()
      .follow(userId)
      .catch((e: unknown) => toast(errorMessage(e), { error: true }));
  };
  return (
    <button type="button" title={label} aria-label={label} disabled={state !== "none"} onClick={follow} className="shrink-0 enabled:hover:brightness-110">
      <Glass radius={18} className={cn("flex size-9 items-center justify-center p-0", state === "none" ? "border-violet/50 bg-violet/28" : "bg-bg2/45")}>
        <Icon name={state === "following" ? "check" : state === "requested" ? "hourglass_top" : "add"} size={20} className={state === "following" ? "text-ok" : "text-white"} />
      </Glass>
    </button>
  );
}
