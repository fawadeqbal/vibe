"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef, useState } from "react";

import { useNeedCoins } from "@/components/shared/dialogs";
import { FaceStack } from "@/components/ui/avatar";
import { GhostButton } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { EmptyState } from "@/components/ui/misc";
import { errorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/cn";
import { DEFAULT_DISCOVER_FILTERS, type DiscoverCard, type SwipeKind, useDiscover, usesExtraFilters } from "@/stores/discover";
import { asMap } from "@/lib/api/mappers";
import { api } from "@/stores/services";
import { toast } from "@/stores/ui";

import { DiscoverCardView } from "./discover-card";
import { openDiscoverFilters, openOutOfLikes } from "./discover-sheets";
import { DeckEmpty, DeckOffline, DeckSkeleton, NoPhotoPanel, OutOfLikesBanner, openWelcomeBack } from "./discover-states";

/** How far a card must be dragged to count (px). */
const SWIPE_X = 110;
const SWIPE_UP = 120;
const FLY_MS = 240;

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
  const filtersOn = useDiscover((x) => usesExtraFilters(x.filters) || x.filters.minAge !== DEFAULT_DISCOVER_FILTERS.minAge || x.filters.maxAge !== DEFAULT_DISCOVER_FILTERS.maxAge);
  const filtersExpired = useDiscover((x) => x.filtersExpired);
  useEffect(() => {
    if (!filtersExpired) return;
    toast("Your filter pass ended, so only age is on now");
    useDiscover.getState().clearFiltersExpired();
  }, [filtersExpired]);
  const editFilters = async () => {
    const r = await openDiscoverFilters();
    if (r === "vip") router.push("/vip");
    if (r === "coins") await needCoins(`A filter pass costs ${useDiscover.getState().status?.filters.passCost ?? 25} coins. VIP gets every filter free.`);
  };
  const deck = useDiscover((s) => s.deck);
  const loading = useDiscover((s) => s.loading);
  const failed = useDiscover((s) => s.failed);
  const filters = useDiscover((s) => s.filters);
  const [lookAround, setLookAround] = useState(false);
  const [offline, setOffline] = useState(false);
  const status = useDiscover((s) => s.status);
  const lastPassed = useDiscover((s) => s.lastPassed);
  const [fly, setFly] = useState<Fly>(null);
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
        const pick = await openWelcomeBack({ awayDays: Number(w.awayDays) || 0, likesSince: Number(w.likesSince) || 0, newPeople: Number(w.newPeople) || 0, freeLikes: st && st.likesLeft != null ? st.likesLeft : null });
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
  const vip = status?.vip ?? false;

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
        setDrag({ x: 0, y: 0, active: false });
        await moreLikes();
        return;
      }
      busy.current = true;
      setFly({ id: c.profile.id, kind });
      await new Promise((r) => setTimeout(r, FLY_MS));
      const r = await useDiscover.getState().swipe(c, kind);
      setFly(null);
      setDrag({ x: 0, y: 0, active: false });
      busy.current = false;
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
      const c = useDiscover.getState().deck[0];
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
    if (busy.current || !top) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
    setDrag({ x: 0, y: 0, active: true });
  };
  const onMove = (e: ReactPointerEvent) => {
    if (!start.current || start.current.id !== e.pointerId) return;
    setDrag({ x: e.clientX - start.current.x, y: e.clientY - start.current.y, active: true });
  };
  const onUp = () => {
    if (!start.current || !top) return;
    start.current = null;
    if (drag.x > SWIPE_X) void doSwipe(top, "like");
    else if (drag.x < -SWIPE_X) void doSwipe(top, "pass");
    else if (drag.y < -SWIPE_UP) void doSwipe(top, "super");
    else setDrag({ x: 0, y: 0, active: false });
  };

  const flyTransform = (k: SwipeKind) =>
    k === "like" ? "translate(140%, 6%) rotate(22deg)" : k === "pass" ? "translate(-140%, 6%) rotate(-22deg)" : "translate(0, -130%) rotate(0deg)";
  const topStyle =
    fly && top && fly.id === top.profile.id
      ? { transform: flyTransform(fly.kind), transition: `transform ${FLY_MS}ms ease-in, opacity ${FLY_MS}ms ease-in`, opacity: 0.2 }
      : {
          transform: `translate(${drag.x}px, ${Math.min(drag.y, 40)}px) rotate(${drag.x / 18}deg)`,
          transition: drag.active ? "none" : "transform 220ms var(--ease-spring, ease-out)",
        };
  const dragX = fly?.kind === "like" ? 1 : fly?.kind === "pass" ? -1 : Math.max(-1, Math.min(1, drag.x / SWIPE_X));
  const dragUp = fly?.kind === "super" ? 1 : Math.max(0, Math.min(1, -drag.y / SWIPE_UP));

  const likesChip = status ? (status.likesLeft == null ? "Unlimited likes" : `${status.likesLeft} like${status.likesLeft === 1 ? "" : "s"} left`) : null;
  const likedYou = status?.likedYou;

  if (status && !status.enabled) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6">
        <EmptyState
          icon="style"
          title="Discover is "
          accent="resting"
          body="It's switched off for a little while. Your matches and chats are all still here."
          action={<GhostButton label="Go to Match" onClick={() => router.push("/match")} />}
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col pt-[env(safe-area-inset-top)] lg:flex-row lg:items-stretch">
      <div className="flex min-h-0 flex-1 flex-col lg:mx-auto lg:w-full lg:max-w-[460px]">
        <header className="flex items-center gap-2 px-4 pt-4 pb-2.5">
          <h1 className="type-display flex-1 text-[28px]">Discover</h1>
          {likesChip ? (
            <span
              className={cn(
                "type-label inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-semibold",
                vip ? "bg-gold/14 text-gold" : "bg-pink/14 text-pink-soft",
              )}
            >
              <Icon name={vip ? "all_inclusive" : "favorite"} variant="filled" size={15} /> {likesChip}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => void editFilters()}
            aria-label={filtersOn ? "Filters (on)" : "Filters"}
            className="relative flex size-10 items-center justify-center rounded-full bg-white/8 text-text hover:bg-white/12"
          >
            <Icon name="tune" size={20} />
            {filtersOn ? <span aria-hidden className="absolute top-1.5 right-1.5 size-2 rounded-full bg-pink ring-2 ring-bg" /> : null}
          </button>
        </header>

        {likedYou && likedYou.count > 0 ? (
          <Link
            href="/discover/liked-you"
            className="mx-4 mb-2.5 flex items-center gap-3 rounded-[18px] border border-gold/30 bg-surface px-3.5 py-2.5 hover:bg-surface2 lg:hidden"
          >
            <LikedYouFaces />
            <span className="min-w-0 flex-1">
              <span className="type-title block text-[14px] font-semibold">
                {likedYou.count} {likedYou.count === 1 ? "person likes" : "people like"} you
              </span>
              <span className="type-body block truncate text-[12px] text-muted">{vip ? "See who, and like back" : "VIP shows who they are"}</span>
            </span>
            {likedYou.unseen > 0 ? (
              <span className="type-label rounded-full bg-pink px-2 py-0.5 text-[11px] font-bold text-white">{likedYou.unseen} new</span>
            ) : null}
            <Icon name="chevron_right" size={20} className="text-muted" />
          </Link>
        ) : null}

        {status && status.likesLeft === 0 && top ? <OutOfLikesBanner resetsAt={status.resetsAt} onMore={() => void moreLikes()} /> : null}

        {status && !status.visible && (status.hasPhoto || lookAround) ? (
          <p className="type-body mx-4 mb-2.5 flex items-center gap-2 rounded-[14px] bg-warn/10 px-3 py-2 text-[12.5px] text-warn">
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
              <span>You&apos;re hidden from Discover. Turn it on in filters.</span>
            )}
          </p>
        ) : null}

        <div className="relative mx-4 min-h-[380px] flex-1">
          {status && !status.hasPhoto && !lookAround ? (
            <NoPhotoPanel hasName onLookAround={() => setLookAround(true)} />
          ) : top ? (
            <>
              {deck[1] ? <DiscoverCardView key={deck[1].profile.id} c={deck[1]} className="absolute inset-0 scale-[0.96] opacity-80" /> : null}
              <div
                key={top.profile.id}
                className="absolute inset-0 touch-none cursor-grab active:cursor-grabbing"
                style={topStyle}
                onPointerDown={onDown}
                onPointerMove={onMove}
                onPointerUp={onUp}
                onPointerCancel={onUp}
              >
                <DiscoverCardView c={top} drag={dragX} up={dragUp} className="shadow-[0_20px_60px_rgb(0_0_0/0.45)]" />
              </div>
            </>
          ) : loading ? (
            <DeckSkeleton />
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

        <div className="flex items-center justify-center gap-4 px-4 pt-4 pb-[calc(14px+env(safe-area-inset-bottom))] lg:pb-6">
          <RoundAction
            label={status?.undoCost ? `Undo (${status.undoCost} coins)` : "Undo"}
            icon="undo"
            size={48}
            className="border-gold/40 bg-gold/12 text-gold"
            disabled={!lastPassed || !!fly}
            onClick={() => void undo()}
          />
          <RoundAction
            label="Pass"
            icon="close"
            size={64}
            iconSize={30}
            className="border-white/16 bg-surface text-text"
            disabled={!top || !!fly}
            onClick={() => top && void doSwipe(top, "pass")}
          />
          <RoundAction
            label={status && status.freeSuperLikesLeft > 0 ? "Super Like (free)" : `Super Like (${status?.superLikeCost ?? 10} coins)`}
            icon="star"
            filled
            size={48}
            className="border-lavender/45 bg-violet/18 text-lavender"
            disabled={!top || !!fly}
            onClick={() => top && void doSwipe(top, "super")}
          />
          <RoundAction
            label={status?.likesLeft === 0 ? "Like (no likes left today)" : "Like"}
            icon={status?.likesLeft === 0 ? "lock" : "favorite"}
            filled
            size={64}
            iconSize={30}
            className="bg-brand border-transparent text-white shadow-[0_10px_30px_rgb(255_61_143/0.4)]"
            disabled={!top || !!fly}
            onClick={() => top && void doSwipe(top, "like")}
          />
        </div>
        <p className="type-body hidden pb-5 text-center text-[12px] text-muted lg:block">← pass · → like · ↑ Super Like · Backspace undo</p>
      </div>

      <LikedYouPanel />
    </div>
  );
}

function RoundAction({
  label,
  icon,
  size,
  iconSize = 22,
  filled,
  className,
  disabled,
  onClick,
}: {
  label: string;
  icon: string;
  size: number;
  iconSize?: number;
  filled?: boolean;
  className?: string;
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
        "flex shrink-0 items-center justify-center rounded-full border transition-[filter,transform,opacity] hover:brightness-115 active:scale-95 disabled:opacity-40",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <Icon name={icon} variant={filled ? "filled" : undefined} size={iconSize} />
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
      <span className="flex size-10 items-center justify-center rounded-full bg-gold/14 text-gold">
        <Icon name="favorite" variant="filled" size={20} />
      </span>
    );
  return <FaceStack urls={urls} size={36} overlap={12} blur={liked?.unlocked ? 0 : 3} />;
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
