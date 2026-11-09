"use client";

import { useEffect, useRef, useState } from "react";

import { openShareCard } from "@/components/shared/share-card";
import { Avatar } from "@/components/ui/avatar";
import { GhostButton, GradientButton } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { openUserProfileSheet } from "@/features/profile/user-profile";
import { useNow } from "@/hooks/use-now";
import { countdown, freeReconnectLeft } from "@/lib/engagement";
import { duration } from "@/lib/format";
import { matchLengthSeconds } from "@/lib/models";
import { alpha, color } from "@/lib/colors";
import { useCatalog } from "@/stores/catalog";
import { friendStateOf, useSocial } from "@/stores/social";
import { useMatch } from "@/stores/match";

/**
 * A recap, not an alert: their portrait blurs behind; a card with what
 * happened and three things you can still do for them; then Next, Reconnect,
 * Home, and Report, still reachable after the call.
 */
export function Ended({
  onReconnect,
  onFindAnother,
  onReport,
  onLikeBack,
  onAddFriend,
  onGift,
  autoNext = false,
}: {
  onReconnect: () => void;
  onFindAnother: () => void;
  onReport: () => void;
  onLikeBack: () => void;
  onAddFriend: () => void;
  onGift: () => void;
  /** They left and matching is free for you: carry on by yourself after a few seconds (never spends coins without a tap). */
  autoNext?: boolean;
}) {
  const p = useMatch((s) => s.lastPartner)!;
  const endReason = useMatch((s) => s.endReason);
  const last = useMatch((s) => (s.history.length ? s.history[s.history.length - 1] : null));
  const catalogCost = useCatalog((s) => s.economy.reconnectCost);
  const ended = useMatch((s) => s.ended);
  const friendState = useSocial((s) => friendStateOf(s, p.id));
  const reconnectCost = ended?.reconnectCost ?? catalogCost;
  const now = useNow(1000, !!ended?.freeReconnectUntil);
  const freeLeft = freeReconnectLeft(ended?.freeReconnectUntil ?? null, now);
  const mutualLike = ended?.mutualLike || (!!last?.liked && !!last?.likedMe);
  const reported = endReason === "reported";
  const theyLeft = endReason === "partnerLeft";
  // They left: the next person comes by itself in a few seconds, unless you
  // stay (any tap on the card stays).
  const [autoAt, setAutoAt] = useState<number | null>(() => (theyLeft && autoNext ? Date.now() + AUTO_NEXT_MS : null));
  const tick = useNow(250, autoAt != null);
  const autoLeft = autoAt == null ? 0 : Math.max(0, Math.ceil((autoAt - tick) / 1000));
  const fired = useRef(false);
  useEffect(() => {
    if (autoAt != null && autoLeft === 0 && !fired.current) {
      fired.current = true;
      onFindAnother();
    }
  }, [autoAt, autoLeft, onFindAnother]);
  const stay = () => setAutoAt(null);
  const length = last ? duration(matchLengthSeconds(last)) : null;
  const why = theyLeft ? `${p.name} moved on` : endReason === "skipped" ? "You skipped" : reported ? "Reported" : "Call ended";
  const chip = mutualLike ? "You liked each other" : last?.likedMe ? `${p.name} liked you` : last?.liked ? `You liked ${p.name}` : null;
  const liked = !!last?.liked;
  const friendLabel = friendState === "friends" ? "Friends" : friendState === "requested" ? "Request sent" : friendState === "incoming" ? "Accept friend" : "Add friend";

  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-0" style={{ backgroundImage: "linear-gradient(to bottom, #2B1B4D, #0B0A10)" }}>
        {p.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.avatarUrl} alt="" className="absolute inset-0 size-full scale-[1.15] object-cover" style={{ filter: "brightness(0.3) blur(14px)" }} />
        ) : null}
      </div>
      <div
        className="absolute inset-0 mx-auto flex max-w-[480px] flex-col px-4 pt-[calc(24px+env(safe-area-inset-top))] pb-[calc(30px+64px+env(safe-area-inset-bottom))] lg:pb-[30px]"
        onPointerDownCapture={autoAt != null ? stay : undefined}
      >
        <div className="flex min-h-0 flex-1 flex-col justify-center overflow-y-auto">
          <section aria-label="Call recap" className="flex flex-col items-center rounded-[28px] border border-line bg-surface/86 px-5 pt-[26px] pb-5 text-center">
            <button type="button" onClick={() => void openUserProfileSheet(p.id)} aria-label={`Open ${p.name}'s profile`} className="relative rounded-full">
              <Avatar url={p.avatarUrl} name={p.name} size={92} ring gapColor="var(--color-surface)" />
              {p.verified ? (
                <span className="absolute -right-0.5 bottom-0.5 flex size-[26px] items-center justify-center rounded-full bg-surface">
                  <Icon name="verified" size={20} className="text-trust" label="Verified" />
                </span>
              ) : null}
            </button>
            <h2 className="mt-3 mb-0.5 text-[22px] font-bold tracking-[-0.03em]">
              {p.name}, {p.age}
            </h2>
            <p className="text-[13.5px] text-text2">
              {why}
              {length ? ` · ${length}` : ""}
            </p>
            {theyLeft ? <p className="mt-0.5 text-[12.5px] text-muted">It happens — it&apos;s not about you.</p> : null}
            {chip ? (
              <span className="mt-3 flex items-center gap-1.5">
                <span className="flex h-[30px] items-center gap-1.5 rounded-full bg-pink/16 px-3 text-[12.5px] font-semibold text-pink-soft">
                  <Icon name="favorite" size={14} />
                  {chip}
                </span>
                {mutualLike ? (
                  <button type="button" onClick={() => void openShareCard({ kind: "match" })} aria-label="Share" title="Share" className="flex size-[30px] items-center justify-center rounded-full bg-white/8 text-text2 hover:brightness-125">
                    <Icon name="ios_share" size={15} />
                  </button>
                ) : null}
              </span>
            ) : null}

            {reported ? (
              <p role="status" className="mt-[18px] flex items-center gap-1.5 text-[13px] font-medium text-text2">
                <Icon name="check_circle" size={16} className="text-trust" />
                Thanks — our team reviews every report.
              </p>
            ) : (
              <div className="mt-[18px] grid w-full grid-cols-3 gap-2.5">
                <CardAction icon="favorite" tone="pink" label={liked ? "Liked" : last?.likedMe ? "Like back" : "Like"} onClick={liked ? undefined : onLikeBack} />
                <CardAction
                  icon={friendState === "friends" ? "how_to_reg" : friendState === "requested" ? "hourglass_top" : "person_add"}
                  tone="lavender"
                  label={friendLabel}
                  onClick={friendState === "none" || friendState === "incoming" ? onAddFriend : undefined}
                />
                <CardAction icon="redeem" tone="gold" label="Send a gift" onClick={onGift} />
              </div>
            )}
          </section>
        </div>

        <div className="mt-4 flex flex-col gap-2.5">
          <GradientButton label={autoAt != null ? `Next person in ${autoLeft}` : "Next person"} icon="skip_next" height={58} onClick={onFindAnother} />
          {autoAt != null ? (
            <button type="button" onClick={stay} className="-mt-1 self-center p-1 text-[12.5px] font-semibold text-text2">
              Stay here
            </button>
          ) : null}
          <div className={reported ? "" : "grid grid-cols-2 gap-2.5"}>
            {reported ? null : (
              <GhostButton
                label={freeLeft > 0 ? `Reconnect · Free ${countdown(freeLeft)}` : `Reconnect · ${reconnectCost}`}
                icon="replay"
                height={48}
                expand
                onClick={onReconnect}
                aria-label={freeLeft > 0 ? `Reconnect with ${p.name}, free for ${countdown(freeLeft)}` : `Reconnect with ${p.name}, ${reconnectCost} coins`}
              />
            )}
            <GhostButton label="Home" icon="videocam" height={48} expand onClick={() => useMatch.getState().dismissEnded()} />
          </div>
          {reported ? null : (
            <button type="button" onClick={onReport} className="flex items-center gap-1.5 self-center p-2 text-[13.5px] font-semibold text-bad">
              <Icon name="flag" size={15} />
              Report {p.name}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** One of the card's three: a tinted circle and a label. Disabled once done (Liked, Request sent). */
function CardAction({ icon, tone, label, onClick }: { icon: string; tone: "pink" | "lavender" | "gold"; label: string; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={!onClick} className="group flex flex-col items-center gap-1.5 disabled:opacity-60">
      <span className="flex size-[52px] items-center justify-center rounded-full transition-[filter] group-enabled:group-hover:brightness-125" style={{ backgroundColor: alpha(tone, 0.14), color: color(tone) }}>
        <Icon name={icon} size={24} />
      </span>
      <span className="text-[12.5px] font-semibold">{label}</span>
    </button>
  );
}

/** How long "they left" waits before finding the next person. */
export const AUTO_NEXT_MS = 5000;
