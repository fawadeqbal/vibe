"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Screen } from "@/components/layout/screen";
import { confirm, useNeedCoins } from "@/components/shared/dialogs";
import { BadgeRow } from "@/components/shared/level-chip";
import { pickReport } from "@/components/shared/report-sheet";
import { Avatar } from "@/components/ui/avatar";
import { GhostButton, GradientButton } from "@/components/ui/button";
import { Glass } from "@/components/ui/glass";
import { Icon } from "@/components/ui/icon";
import { MenuButton, type MenuItem } from "@/components/ui/menu";
import { EmptyState, Tag } from "@/components/ui/misc";
import { AppBar } from "@/components/ui/page-header";
import { Spinner } from "@/components/ui/spinner";
import { SectionTitle } from "@/components/ui/typography";
import { errorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/cn";
import { streakDays } from "@/lib/engagement";
import { compact, presenceLabel, thousands } from "@/lib/format";
import { type FollowState, type FriendState, genderLabel, intentInfo, type ProfileView } from "@/lib/models";
import { economy } from "@/stores/catalog";
import { followStateOf, useFollows } from "@/stores/follows";
import { useSession } from "@/stores/session";
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
  const follow = useFollows((s) => followStateOf(s, userId));
  const friend = useSocial((s) => friendStateOf(s, userId));
  const asFriend = useSocial((s) => s.all.find((f) => f.profile.id === userId && f.state === "friends"));
  const streak = asFriend?.streak ?? null;
  const me = useSession((st) => st.me);
  /** undefined = loading, null = may not see it. */
  const [view, setView] = useState<ProfileView | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const needCoins = useNeedCoins();
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
  if (view === null)
    return <EmptyState icon="person_off" title="Profile not available" body="You can see the profiles of people you have met in a match." className="py-10" />;

  const p = view.profile;
  const self = view.tier === "self";
  // Friends: live from the friends list (presence events), else what the profile said when it loaded.
  const status = view.tier === "friends" ? presenceLabel(asFriend?.online ?? view.online, asFriend?.lastSeenAt ?? view.lastSeenAt) : null;

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
    const ok = await confirm({
      title: pending ? "Cancel your request?" : `Unfollow ${p.name}?`,
      ok: pending ? "Cancel request" : "Unfollow",
      cancel: "Keep",
      okTone: "bad",
    });
    if (ok) await run(() => useFollows.getState().unfollow(userId));
  };

  const onFriend = async () => {
    if (friend === "friends") {
      if (!inCall) router.push(`/chats/${userId}`);
      return;
    }
    if (friend === "incoming") return run(() => useSocial.getState().accept(userId));
    if (friend === "requested") {
      const ok = await confirm({ title: "Cancel your friend request?", ok: "Cancel request", cancel: "Keep", okTone: "bad" });
      if (ok) await run(() => useSocial.getState().cancel(userId));
      return;
    }
    if (friend === "none" && view.met) {
      const e = economy();
      if (freeFriendRequestsLeft(useWallet.getState()) === 0) {
        const ok = await confirm({
          title: `Send ${p.name} a friend request?`,
          body: `Your ${e.freeFriendRequestsPerDay} free requests for today are used. This one costs ${e.friendRequestCost} coins.`,
          ok: `Send for ${e.friendRequestCost}`,
        });
        if (!ok) return;
      }
      await run(async () => {
        if (await useSocial.getState().sendRequest(p)) toast(`Request sent to ${p.name}`);
        else await needCoins(`A friend request costs ${e.friendRequestCost} coins once your free ones are used.`);
      });
    }
  };

  const onDecline = () => run(() => useSocial.getState().decline(userId));

  const onReport = async () => {
    const choice = await pickReport(p.name, "person");
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
      <div className="flex items-center">
        <span className="relative shrink-0">
          <Avatar url={p.avatarUrl} name={p.name} size={92} ring />
          {view.online ? <span className="absolute right-1 bottom-1 size-[20px] rounded-full border-[3px] border-bg bg-ok" /> : null}
        </span>
        <span className="ml-4 grid flex-1 grid-cols-3 text-center">
          <Stat
            value={view.counts ? compact(view.counts.followers) : "—"}
            label={view.counts?.followers === 1 ? "Follower" : "Followers"}
            title={view.counts && view.counts.followers >= 10_000 ? thousands(view.counts.followers) : undefined}
          />
          <Stat value={view.stats && view.stats !== "hidden" ? compact(view.stats.likes) : "—"} label="Likes" />
          <Stat value={`Lv ${view.level}`} label="Level" />
        </span>
        {!self ? (
          <span className="self-start">
            <MenuButton label="More" items={menu} />
          </span>
        ) : null}
      </div>

      <p className="mt-3.5 flex items-center gap-1.5">
        <span className="type-title truncate text-[18px]">
          {p.name}, {p.age}
        </span>
        {p.verified ? <Icon name="verified" size={18} className="text-trust" label="Verified" /> : null}
        {p.vip ? <Icon name="workspace_premium" size={18} className="text-gold" label="VIP" /> : null}
        {view.followsYou ? <Tag text="Follows you" tone="violet" /> : null}
      </p>
      <p className="type-body mt-0.5 text-[13px] text-text2">
        {[`${p.country.flag} ${p.country.name}`, genderLabel[p.gender], status === "Online" ? "Active now" : status].filter(Boolean).join(" · ")}
      </p>
      {p.bio.trim() ? <p className="type-body mt-1 text-[14px] text-text">{p.bio}</p> : null}
      {streak && streak.count > 0 ? (
        <p
          className="type-label mt-1.5 flex items-center text-[13px]"
          style={{ color: streak.today ? "var(--color-flame)" : streak.atRisk ? "var(--color-warn)" : "var(--color-text2)" }}
        >
          <Icon name="local_fire_department" size={16} className="mr-1" />
          {streakDays(streak.count)}
          {streak.atRisk ? " · ends tonight" : ""}
        </p>
      ) : null}

      {!self ? (
        <div className="mt-[18px] flex gap-2.5">
          <span className="flex-1">
            <FollowButton state={follow} followsYou={view.followsYou} busy={busy} onFollow={() => void onFollow()} onUndo={() => void onUnfollow()} />
          </span>
          {/* Friends: anyone you've met (call or Discover match). On a live call the + on the call screen does it. */}
          {friend !== "blocked" && (friend !== "none" || (view.met && !inCall)) ? (
            <span className="flex-1">
              <FriendButton state={friend} inCall={inCall} busy={busy} onClick={() => void onFriend()} />
            </span>
          ) : null}
        </div>
      ) : null}
      {!self && friend === "incoming" ? (
        <p className="type-body mt-2.5 flex items-center gap-2 text-[12.5px] text-text2">
          <Icon name="person_add" size={16} className="text-muted" />
          <span className="flex-1">{p.name.split(" ")[0]} wants to be friends.</span>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onDecline()}
            className="type-label rounded-full px-3 py-1 text-[12.5px] font-semibold text-text2 hover:bg-surface2 hover:text-text"
          >
            Decline
          </button>
        </p>
      ) : null}
      {!self && friend === "none" && (inCall || !view.met) ? (
        <p className="type-body mt-2.5 flex items-center gap-2 text-[12.5px] text-text2">
          <Icon name="videocam" size={16} className="text-muted" />
          {inCall ? `Tap + on the call to add ${p.name} as a friend` : `You can add ${p.name} as a friend after you meet on a video call.`}
        </p>
      ) : null}

      {p.interests.length ? (
        <>
          <SectionTitle text="Interests" top={22} bottom={10} />
          <div className="flex flex-wrap gap-1.5">
            {p.interests.map((i) => {
              const both = !!me?.interests.includes(i);
              return (
                <span
                  key={i}
                  className={cn(
                    "type-label flex h-8 items-center gap-1 rounded-full border px-3 text-[13px] font-semibold",
                    both ? "border-pink/40 bg-pink/14 text-pink-soft" : "border-line bg-white/5 text-text",
                  )}
                >
                  {both ? <Icon name="check" size={14} /> : null}
                  {i}
                </span>
              );
            })}
          </div>
        </>
      ) : null}
      {p.intent ? (
        <p className="mt-4 flex items-center">
          <Icon name={intentInfo[p.intent].icon} size={16} className="text-pink-soft" />
          <span className="type-label ml-1.5 text-[13px] text-text2">Here for: {intentInfo[p.intent].label}</span>
        </p>
      ) : null}
      {view.badges.length ? (
        <>
          <SectionTitle text="Badges" top={22} bottom={10} />
          <BadgeRow ids={view.badges} />
        </>
      ) : null}
    </div>
  );
}

function Stat({ value, label, title }: { value: string; label: string; title?: string }) {
  return (
    <span className="flex flex-col items-center" title={title}>
      <span className="type-number text-[20px] tracking-[-0.02em]">{value}</span>
      <span className="type-body text-[12px] text-text2">{label}</span>
    </span>
  );
}

function FollowButton({
  state,
  followsYou,
  busy,
  onFollow,
  onUndo,
}: {
  state: FollowState;
  followsYou: boolean;
  busy: boolean;
  onFollow: () => void;
  onUndo: () => void;
}) {
  if (state === "none")
    return <GradientButton label={followsYou ? "Follow back" : "Follow"} icon="person_add_alt_1" height={46} busy={busy} onClick={onFollow} />;
  return (
    <GhostButton
      label={state === "requested" ? "Requested" : "Following"}
      icon={state === "requested" ? "hourglass_top" : "check"}
      height={46}
      expand
      disabled={busy}
      onClick={onUndo}
    />
  );
}

function FriendButton({ state, inCall, busy, onClick }: { state: FriendState; inCall: boolean; busy: boolean; onClick: () => void }) {
  if (state === "friends") return <GhostButton label="Message" icon="chat_bubble_outline" height={46} expand disabled={inCall} onClick={onClick} />;
  if (state === "incoming") return <GhostButton label="Accept friend" icon="how_to_reg" height={46} expand disabled={busy} onClick={onClick} />;
  if (state === "requested") return <GhostButton label="Request sent" icon="hourglass_top" height={46} expand disabled={busy} onClick={onClick} />;
  if (state === "none") return <GhostButton label="Add friend" icon="person_add" height={46} expand disabled={busy} onClick={onClick} />;
  return null;
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
        <Icon
          name={state === "following" ? "check" : state === "requested" ? "hourglass_top" : "add"}
          size={20}
          className={state === "following" ? "text-ok" : "text-white"}
        />
      </Glass>
    </button>
  );
}
