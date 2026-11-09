"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type CSSProperties, type PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef, useState } from "react";

import { useNeedCoins } from "@/components/shared/dialogs";
import { FaceStack } from "@/components/ui/avatar";
import { Icon } from "@/components/ui/icon";
import { errorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/cn";
import { type DiscoverCard, type SwipeKind, useDiscover } from "@/stores/discover";
import { asMap } from "@/lib/api/mappers";
import { api } from "@/stores/services";
import { toast } from "@/stores/ui";

import { FilterButton, FilterTags } from "@/features/filters/filter-chips";

import { DiscoverCardView } from "./discover-card";
import { DiscoverProfile } from "./discover-profile";
import { openDiscoverFilters, openOutOfLikes } from "./discover-sheets";
import { DeckEmpty, DeckOffline, DeckResting, DeckSkeleton, NoPhotoPanel, OutOfLikesBanner, openWelcomeBack } from "./discover-states";

/** How far a card must be dragged to count (px). */
const SWIPE_X = 110;
const SWIPE_UP = 120;
const FLY_MS = 240;
/** Loading longer than this says "taking longer than usual" with a retry. */
const SLOW_MS = 8_000;
/** The cards behind the top one: the next peeks out, the one after waits unseen (its photo loads early). */
const BEHIND: Record<number, CSSProperties> = {
  1: { transform: "scale(0.96) translateY(10px)", opacity: 0.85, transition: "transform 260ms var(--ease-spring, ease-out), opacity 260ms ease-out" },
  2: { transform: "scale(0.92) translateY(20px)", opacity: 0, transition: "transform 260ms var(--ease-spring, ease-out), opacity 260ms ease-out" },
};

type Fly = { id: string; kind: SwipeKind } | null;

/**
 * Discover: real people, one card at a time. Drag or tap — left passes,
 * right likes, up (or the star) Super Likes. Keyboard on wide screens:
 * ← pass, → like, ↑ Super Like, Backspace undo. Two likes make a match
 * (the dialog opens wherever you are, see DiscoverMatchHost).
 */
let welcomeAsk: Promise<unknown> | null = null;
let welcomeShown = false;

export function DiscoverScreen() {
  const router = useRouter();
  const needCoins = useNeedCoins();
  const filtersExpired = useDiscover((x) => x.filtersExpired);
  useEffect(() => {
    if (!filtersExpired) return;
    toast("Your filter pass ended, so only age and verified only are on now");
    useDiscover.getState().clearFiltersExpired();
  }, [filtersExpired]);
  const editFilters = () => openDiscoverFilters();
  const deck = useDiscover((s) => s.deck);
  const loading = useDiscover((s) => s.loading);
  const failed = useDiscover((s) => s.failed);
  const filters = useDiscover((s) => s.filters);
  const [lookAround, setLookAround] = useState(false);
  const [offline, setOffline] = useState(false);
  const status = useDiscover((s) => s.status);
  const lastPassed = useDiscover((s) => s.lastPassed);
  const returnedId = useDiscover((s) => s.returnedId);
  const refilling = useDiscover((s) => s.refilling);
  const [fly, setFly] = useState<Fly>(null);
  const [profileOf, setProfileOf] = useState<string | null>(null);
  const [notifyOn, setNotifyOn] = useState<boolean | null>(null);
  const [drag, setDrag] = useState({ x: 0, y: 0, active: false });
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    void useDiscover.getState().load();
    void useDiscover.getState().loadLikedYou();
  }, []);

  // Back after a few days: what happened while you were away (once per visit).
  useEffect(() => {
    let live = true;
    // Asked once per page load: the server records the visit, so a second ask would say "nothing new".
    welcomeAsk ??= api.get("/discover/welcome");
    welcomeAsk
      .then(async (r) => {
        const w = asMap(r);
        if (!live || w.show !== true || welcomeShown) return;
        welcomeShown = true;
        const st = useDiscover.getState().status;
        const pick = await openWelcomeBack({
          awayDays: Number(w.awayDays) || 0,
          likesSince: Number(w.likesSince) || 0,
          newPeople: Number(w.newPeople) || 0,
          freeLikes: st && st.likesLeft != null ? st.likesLeft : null,
        });
        if (pick === "liked") router.push("/discover/liked-you");
      })
      .catch(() => {});
    api
      .get("/discover/notify-new")
      .then((r) => live && setNotifyOn(asMap(r).on === true))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [router]);

  const setNotify = async (on: boolean) => {
    setNotifyOn(on);
    try {
      await api.put("/discover/notify-new", { on });
      if (on) toast("We'll tell you when new people join");
    } catch (e) {
      setNotifyOn(!on);
      toast(errorMessage(e));
    }
  };

  // Offline: say so, and reload by itself when the connection is back.
  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    const back = () => {
      sync();
      if (useDiscover.getState().failed) void useDiscover.getState().load();
    };
    sync();
    window.addEventListener("online", back);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", back);
      window.removeEventListener("offline", sync);
    };
  }, []);

  const top = deck[0];
  const profileCard = profileOf ? deck.find((c) => c.profile.id === profileOf) : undefined;
  const vip = status?.vip ?? false;
  // What the deck area shows — one of these, and the buttons follow it:
  // the cards; the "add a photo" gate; a skeleton while people load; or a
  // state (empty, offline). Buttons only act on a card you can see.
  const photoGate = !!status && status.enabled && !status.hasPhoto && !lookAround;
  const showCards = status?.enabled !== false && !photoGate && !!top;
  const waiting = status?.enabled !== false && !photoGate && !top && (loading || refilling);
  const showActions = showCards || waiting;
  const cardsOn = useRef(showCards);
  useEffect(() => {
    cardsOn.current = showCards;
  }, [showCards]);
  // Loading that drags on says so (and offers a retry) instead of looking stuck.
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!waiting) return;
    const t = setTimeout(() => setSlow(true), SLOW_MS);
    return () => {
      clearTimeout(t);
      setSlow(false);
    };
  }, [waiting]);

  /** No likes left: VIP, or buy a pack of likes. */
  const moreLikes = useCallback(async () => {
    const st = useDiscover.getState().status;
    const pick = await openOutOfLikes();
    if (pick === "vip") router.push("/vip");
    if (pick === "buy") {
      const r = await useDiscover
        .getState()
        .buyLikes()
        .catch((e) => (toast(errorMessage(e), { error: true }), null));
      if (r === "coins") await needCoins(`${st?.packSize ?? 10} more likes cost ${st?.packCost ?? 20} coins.`);
      if (r === "ok") toast(`${st?.packSize ?? 10} more likes added`);
    }
  }, [needCoins, router]);

  const doSwipe = useCallback(
    async (c: DiscoverCard, kind: SwipeKind) => {
      if (busy.current) return;
      const st = useDiscover.getState().status;
      // Out of likes: say so before the card flies.
      if (kind === "like" && st && st.likesLeft === 0) {
        start.current = null;
        setDrag({ x: 0, y: 0, active: false });
        await moreLikes();
        return;
      }
      busy.current = true;
      start.current = null;
      setFly({ id: c.profile.id, kind });
      await new Promise((r) => setTimeout(r, FLY_MS));
      // The card has flown. In this order, so no frame ever shows a card out of place:
      // 1) forget the drag (the flying card ignores it), 2) take the card off the deck —
      // the next one, already mounted behind it, eases up to the centre — 3) stop flying.
      // The server answers in the background; you can swipe the next card right away.
      setDrag({ x: 0, y: 0, active: false });
      const answer = useDiscover.getState().swipe(c, kind);
      setFly(null);
      busy.current = false;
      const r = await answer;
      if (r.ok) return;
      if (r.reason === "out-of-likes") {
        await moreLikes();
      } else if (r.reason === "coins") {
        await needCoins(`A Super Like costs ${st?.superLikeCost ?? 10} coins.`);
      } else {
        toast(r.message ?? "Something went wrong. Try again.", { error: true });
      }
    },
    [needCoins, moreLikes],
  );

  const undo = useCallback(async () => {
    if (!useDiscover.getState().lastPassed) return;
    try {
      const r = await useDiscover.getState().undo();
      if (r === "coins") await needCoins(`Undo costs ${useDiscover.getState().status?.undoCost ?? 5} coins. VIP undoes for free.`);
      if (r === "nothing") toast("Nothing to undo");
    } catch (e) {
      toast(errorMessage(e), { error: true });
    }
  }, [needCoins]);

  // Keyboard on wide screens.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (document.querySelector("[aria-modal='true']")) return;
      const c = cardsOn.current ? useDiscover.getState().deck[0] : undefined;
      if (e.key === "ArrowLeft" && c) void doSwipe(c, "pass");
      else if (e.key === "ArrowRight" && c) void doSwipe(c, "like");
      else if (e.key === "ArrowUp" && c) {
        e.preventDefault();
        void doSwipe(c, "super");
      } else if (e.key === "Backspace") void undo();
      else return;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doSwipe, undo]);

  // Dragging the top card.
  const onDown = (e: ReactPointerEvent) => {
    if (busy.current || !top || !cardsOn.current) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
    setDrag({ x: 0, y: 0, active: true });
  };
  const onMove = (e: ReactPointerEvent) => {
    if (!start.current || start.current.id !== e.pointerId) return;
    setDrag({ x: e.clientX - start.current.x, y: e.clientY - start.current.y, active: true });
  };
  const onUp = (e: ReactPointerEvent) => {
    if (!start.current || start.current.id !== e.pointerId || !top) return;
    // From the pointer itself, not the last render: a fast flick can end before React catches up.
    const x = e.clientX - start.current.x;
    const y = e.clientY - start.current.y;
    start.current = null;
    if (x > SWIPE_X) void doSwipe(top, "like");
    else if (x < -SWIPE_X) void doSwipe(top, "pass");
    else if (y < -SWIPE_UP) void doSwipe(top, "super");
    else setDrag({ x: 0, y: 0, active: false });
  };
  /** The browser took the pointer (a scroll, a system gesture): never a swipe, just settle back. */
  const onCancel = () => {
    start.current = null;
    setDrag({ x: 0, y: 0, active: false });
  };

  const flyTransform = (k: SwipeKind) =>
    k === "like" ? "translate(140%, 6%) rotate(22deg)" : k === "pass" ? "translate(-140%, 6%) rotate(-22deg)" : "translate(0, -130%) rotate(0deg)";
  const topStyle =
    fly && top && fly.id === top.profile.id
      ? { transform: flyTransform(fly.kind), transition: `transform ${FLY_MS}ms ease-in, opacity ${FLY_MS}ms ease-in`, opacity: 0 }
      : {
          transform: `translate(${drag.x}px, ${Math.min(drag.y, 40)}px) rotate(${drag.x / 18}deg) scale(1)`,
          opacity: 1,
          transition: drag.active ? "none" : "transform 260ms var(--ease-spring, ease-out), opacity 200ms ease-out",
        };
  const dragX = fly?.kind === "like" ? 1 : fly?.kind === "pass" ? -1 : Math.max(-1, Math.min(1, drag.x / SWIPE_X));
  const dragUp = fly?.kind === "super" ? 1 : Math.max(0, Math.min(1, -drag.y / SWIPE_UP));

  const likedYou = status?.likedYou;
  const resting = !!status && !status.enabled;
  const outOfLikes = !!status && status.likesLeft === 0;
  const likesPill = status ? (status.likesLeft == null ? "Unlimited likes" : `${status.likesLeft} like${status.likesLeft === 1 ? "" : "s"} left`) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col pt-[env(safe-area-inset-top)] lg:flex-row lg:items-stretch">
      <div className="flex min-h-0 flex-1 flex-col lg:mx-auto lg:w-full lg:max-w-[460px]">
        <header className="flex shrink-0 items-center gap-2 pt-2.5 pr-4 pb-2.5 pl-5">
          <h1 className="flex-1 text-[30px] leading-[1.1] font-bold tracking-[-0.038em]">Discover</h1>
          {likesPill && !resting ? (
            <button
              type="button"
              onClick={outOfLikes ? () => void moreLikes() : undefined}
              aria-label={outOfLikes ? `${likesPill}: get more` : likesPill}
              className={cn(
                "inline-flex h-[34px] items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold",
                vip ? "bg-gold/14 text-gold" : "bg-pink/14 text-pink-soft",
                !outOfLikes && "cursor-default",
              )}
            >
              <Icon name={vip ? "all_inclusive" : "favorite"} size={15} /> {likesPill}
            </button>
          ) : null}
          {resting ? null : <FilterButton />}
        </header>
        {resting ? null : <FilterTags className="shrink-0 px-4 pb-3" />}

        {likedYou && likedYou.count > 0 && !resting ? (
          <Link
            href="/discover/liked-you"
            aria-label="See who liked you"
            className="mx-4 mb-2.5 flex h-[54px] shrink-0 items-center rounded-[18px] border border-gold/25 bg-gold/8 px-3 hover:bg-gold/12 lg:hidden"
          >
            <LikedYouFaces />
            <span className="ml-2.5 flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[14px] font-bold">
                {likedYou.count} {likedYou.count === 1 ? "person" : "people"} liked you
              </span>
              <span className="truncate text-[12px] text-gold">{vip ? "Like them back to match" : "Like them back to match · VIP shows who"}</span>
            </span>
            {likedYou.unseen > 0 ? <span className="mr-1 rounded-full bg-pink px-2 py-0.5 text-[11px] font-bold text-white">{likedYou.unseen} new</span> : null}
            <Icon name="chevron_right" variant="outlined" size={20} className="text-gold" />
          </Link>
        ) : null}

        {status && outOfLikes && showCards ? (
          <OutOfLikesBanner resetsAt={status.resetsAt} packSize={status.packSize} packCost={status.packCost} onMore={() => void moreLikes()} />
        ) : null}

        {status && !resting && !status.visible && (status.hasPhoto || lookAround) ? (
          <p className="mx-4 mb-2.5 flex items-center gap-2 rounded-[14px] bg-warn/10 px-3 py-2 text-[12.5px] text-warn">
            <Icon name="visibility_off" size={16} />
            {!status.hasPhoto ? (
              <span>
                Nobody can see you yet.{" "}
                <Link href="/me/edit" className="font-semibold underline">
                  Add a photo
                </Link>{" "}
                to appear in Discover.
              </span>
            ) : (
              <span>You&apos;re hidden from Discover. Turn it on in Me › Settings › Privacy &amp; safety.</span>
            )}
          </p>
        ) : null}

        <div className="relative mx-4 min-h-[380px] flex-1">
          {resting ? (
            <DeckResting onMeetLive={() => router.push("/match")} />
          ) : photoGate ? (
            <NoPhotoPanel hasName onLookAround={() => setLookAround(true)} />
          ) : top ? (
            // The top three, each keyed by person: when the top card leaves, the one behind
            // it is the same element moving up (no remount, no photo reload); the third is
            // already loaded, invisibly, so its photo is ready too.
            deck
              .slice(0, 3)
              .map((c, i) => (
                <div
                  key={c.profile.id}
                  aria-hidden={i > 0 || undefined}
                  className={cn("absolute inset-0", i === 0 ? "touch-none cursor-grab active:cursor-grabbing" : "pointer-events-none")}
                  style={i === 0 ? { ...topStyle, zIndex: 3 } : { ...BEHIND[i], zIndex: 3 - i }}
                  {...(i === 0 ? { onPointerDown: onDown, onPointerMove: onMove, onPointerUp: onUp, onPointerCancel: onCancel } : {})}
                >
                  <DiscoverCardView
                    c={c}
                    drag={i === 0 ? dragX : 0}
                    up={i === 0 ? dragUp : 0}
                    onInfo={i === 0 ? () => setProfileOf(c.profile.id) : undefined}
                    style={i === 0 && returnedId === c.profile.id ? { animation: "vibe-dialog-in 260ms var(--ease-spring, ease-out)" } : undefined}
                    onAnimationEnd={i === 0 && returnedId === c.profile.id ? () => useDiscover.getState().clearReturned() : undefined}
                  />
                </div>
              ))
              .reverse()
          ) : waiting ? (
            <DeckSkeleton
              label={refilling && !loading ? "Looking for more people…" : "Finding people for you…"}
              slow={slow}
              onRetry={() => {
                setSlow(false);
                void useDiscover.getState().load();
              }}
            />
          ) : failed || offline ? (
            <DeckOffline offline={offline} onRetry={() => void useDiscover.getState().load()} />
          ) : (
            <DeckEmpty
              filters={filters}
              onSetFilters={(f) => useDiscover.getState().setFilters(f)}
              onEditFilters={() => void editFilters()}
              onMeetLive={() => router.push("/match")}
              notifyOn={notifyOn}
              onNotify={(on) => void setNotify(on)}
            />
          )}
        </div>

        {showActions ? (
          <DeckActions
            className="pt-3.5 pb-[calc(14px+env(safe-area-inset-bottom))] lg:pb-6"
            disabled={!showCards || !!fly}
            canUndo={!!lastPassed && !fly && (showCards || refilling)}
            onUndo={() => void undo()}
            onPass={() => top && void doSwipe(top, "pass")}
            onSuper={() => top && void doSwipe(top, "super")}
            onLike={() => top && void doSwipe(top, "like")}
            onLive={() => router.push("/match")}
          />
        ) : (
          <div aria-hidden className="pb-[calc(14px+env(safe-area-inset-bottom))] lg:pb-6" />
        )}
        {showCards ? <p className="hidden pb-5 text-center text-[12px] text-muted lg:block">← pass · → like · ↑ Super Like · Backspace undo</p> : null}
      </div>

      <LikedYouPanel />
      {profileCard ? (
        <DiscoverProfile
          c={profileCard}
          onClose={() => setProfileOf(null)}
          actions={
            <DeckActions
              disabled={!!fly}
              canUndo={!!lastPassed && !fly}
              onUndo={() => void undo()}
              onPass={() => {
                setProfileOf(null);
                void doSwipe(profileCard, "pass");
              }}
              onSuper={() => {
                setProfileOf(null);
                void doSwipe(profileCard, "super");
              }}
              onLike={() => {
                setProfileOf(null);
                void doSwipe(profileCard, "like");
              }}
              onLive={() => router.push("/match")}
            />
          }
        />
      ) : null}
    </div>
  );
}

/**
 * Under the card: undo (gold), pass, Super Like (blue), like (the big pink
 * one; muted when today's likes are used up), and meet someone live.
 */
function DeckActions({
  className,
  disabled,
  canUndo,
  onUndo,
  onPass,
  onSuper,
  onLike,
  onLive,
}: {
  className?: string;
  disabled: boolean;
  canUndo: boolean;
  onUndo: () => void;
  onPass: () => void;
  onSuper: () => void;
  onLike: () => void;
  onLive: () => void;
}) {
  const status = useDiscover((s) => s.status);
  const outOfLikes = status?.likesLeft === 0;
  return (
    <div className={cn("flex items-center justify-center gap-4", className)}>
      <RoundAction label={status?.undoCost && !status.vip ? `Undo (${status.undoCost} coins)` : "Undo"} icon="undo" size={44} color="var(--color-gold)" disabled={!canUndo} onClick={onUndo} />
      <RoundAction label="Pass" icon="close" size={60} iconSize={28} color="var(--color-text)" disabled={disabled} onClick={onPass} />
      <RoundAction
        label={status && status.freeSuperLikesLeft > 0 ? "Super Like (free)" : `Super Like · ${status?.superLikeCost ?? 10} coins`}
        icon="star"
        size={52}
        color="#60a5fa"
        disabled={disabled}
        onClick={onSuper}
      />
      <RoundAction
        label={outOfLikes ? "Like (no likes left today)" : "Like"}
        icon="favorite"
        size={64}
        iconSize={30}
        color={outOfLikes ? "var(--color-muted)" : "#fff"}
        brand={!outOfLikes}
        disabled={disabled}
        onClick={onLike}
      />
      <RoundAction label="Meet someone live" icon="videocam" size={44} color="var(--color-pink-soft)" onClick={onLive} />
    </div>
  );
}

function RoundAction({
  label,
  icon,
  size,
  iconSize,
  color,
  brand = false,
  disabled,
  onClick,
}: {
  label: string;
  icon: string;
  size: number;
  iconSize?: number;
  color: string;
  brand?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full border border-white/10 transition-[filter,transform,opacity] hover:brightness-115 active:scale-95 disabled:pointer-events-none disabled:opacity-40",
        brand ? "bg-brand shadow-[0_10px_30px_rgb(255_61_143/0.4)]" : "bg-surface2",
      )}
      style={{ width: size, height: size, color }}
    >
      <Icon name={icon} size={iconSize ?? Math.round(size * 0.44)} />
    </button>
  );
}

function LikedYouFaces() {
  const liked = useDiscover((s) => s.likedYou);
  useEffect(() => {
    if (!useDiscover.getState().likedYou) void useDiscover.getState().loadLikedYou();
  }, []);
  const urls = liked ? (liked.unlocked ? liked.people.slice(0, 3).map((p) => p.profile.avatarUrl) : liked.previews.slice(0, 3)) : [];
  if (!urls.length)
    return (
      <span className="flex size-[34px] items-center justify-center rounded-full bg-gold/14 text-gold">
        <Icon name="favorite" size={18} />
      </span>
    );
  return <FaceStack urls={urls} size={34} overlap={10} blur={liked?.unlocked ? 0 : 4} />;
}

/** Wide screens: who liked you, next to the deck. */
function LikedYouPanel() {
  const status = useDiscover((s) => s.status);
  const liked = useDiscover((s) => s.likedYou);
  const count = status?.likedYou.count ?? 0;
  return (
    <aside aria-label="Liked you" className="hidden w-[360px] shrink-0 border-l border-line-soft px-6 py-6 lg:block">
      <h2 className="type-title-lg text-[18px]">Liked you</h2>
      {count === 0 ? (
        <p className="type-body mt-2 text-[13.5px] text-text2">Nobody yet. Likes you get show up here — like them back and it&apos;s a match.</p>
      ) : (
        <>
          <p className="type-body mt-1 text-[13.5px] text-text2">
            {count} {count === 1 ? "person is" : "people are"} waiting for your answer.
          </p>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {(liked?.unlocked
              ? liked.people.map((p) => ({ url: p.profile.avatarUrl, name: p.profile.name, star: p.superLikedMe }))
              : (liked?.previews ?? []).map((u) => ({ url: u, name: "", star: false }))
            )
              .slice(0, 6)
              .map((p, i) => (
                <span key={i} className="relative aspect-[3/4] overflow-hidden rounded-[14px] bg-surface2">
                  {p.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.url}
                      alt={p.name}
                      className="size-full object-cover"
                      style={liked?.unlocked ? undefined : { filter: "blur(10px)", transform: "scale(1.15)" }}
                    />
                  ) : null}
                  {p.star ? <Icon name="star" variant="filled" size={16} className="absolute top-1.5 left-1.5 text-lavender" /> : null}
                </span>
              ))}
          </div>
          <Link
            href="/discover/liked-you"
            className="type-label mt-4 inline-flex h-10 items-center gap-1 rounded-full bg-white/8 px-4 text-[13.5px] font-semibold text-text hover:bg-white/12"
          >
            {liked?.unlocked ? "See everyone" : "See who with VIP"} <Icon name="chevron_right" size={18} />
          </Link>
        </>
      )}
    </aside>
  );
}
