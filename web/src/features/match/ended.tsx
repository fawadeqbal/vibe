"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

import { openShareCard } from "@/components/shared/share-card";
import { Avatar } from "@/components/ui/avatar";
import { CircleIconButton, GhostButton, GradientButton, TextButton } from "@/components/ui/button";
import { Glass } from "@/components/ui/glass";
import { Icon } from "@/components/ui/icon";
import { VDivider } from "@/components/ui/misc";
import { CoinAmount } from "@/components/ui/money";
import { openUserProfileSheet } from "@/features/profile/user-profile";
import { useNow } from "@/hooks/use-now";
import { countdown, freeReconnectLeft } from "@/lib/engagement";
import { duration } from "@/lib/format";
import { matchLengthSeconds } from "@/lib/models";
import { useCatalog } from "@/stores/catalog";
import { useMatch } from "@/stores/match";

/**
 * A recap, not an alert: their portrait blurs behind, the numbers become a
 * readable row, and reporting stays reachable after the call.
 */
export function Ended({
  onReconnect,
  onFindAnother,
  onReport,
  autoNext = false,
}: {
  onReconnect: () => void;
  onFindAnother: () => void;
  onReport: () => void;
  /** They left and matching is free for you: carry on by yourself after a few seconds (never spends coins without a tap). */
  autoNext?: boolean;
}) {
  const p = useMatch((s) => s.lastPartner)!;
  const endReason = useMatch((s) => s.endReason);
  const last = useMatch((s) => (s.history.length ? s.history[s.history.length - 1] : null));
  const catalogCost = useCatalog((s) => s.economy.reconnectCost);
  const ended = useMatch((s) => s.ended);
  const reconnectCost = ended?.reconnectCost ?? catalogCost;
  const now = useNow(1000, !!ended?.freeReconnectUntil);
  const freeLeft = freeReconnectLeft(ended?.freeReconnectUntil ?? null, now);
  const mutualLike = ended?.mutualLike ?? (!!last?.liked && !!last?.likedMe);
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
  const why = theyLeft ? `${p.name} moved on` : endReason === "skipped" ? `You skipped ${p.name}` : endReason === "reported" ? "Reported" : "Call ended";
  const like = mutualLike
    ? { icon: "favorite", cls: "text-pink", label: "Both liked" }
    : last?.likedMe
    ? { icon: "favorite", cls: "text-pink", label: "Liked you" }
    : last?.liked
      ? { icon: "favorite", cls: "text-pink-soft", label: "You liked" }
      : { icon: "favorite_border", cls: "text-muted", label: "No likes" };
  const gifts = last?.giftsReceived ?? 0;

  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-0" style={{ backgroundImage: "linear-gradient(to bottom, #2B1B4D, #0B0A10)" }}>
        {p.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.avatarUrl} alt="" className="absolute inset-0 size-full scale-110 object-cover" style={{ filter: "blur(36px)" }} />
        ) : null}
      </div>
      <div className="absolute inset-0 bg-bg/70" />
      <div className="absolute inset-0 flex flex-col pt-[env(safe-area-inset-top)] pb-[calc(64px+env(safe-area-inset-bottom))] lg:pb-0">
        <div className="flex items-center px-4 pt-3">
          <CircleIconButton icon="close" label="Close" onClick={() => useMatch.getState().dismissEnded()} />
          <p className="type-overline flex-1 text-center text-[12px] tracking-[1.2px] text-text2">Call ended</p>
          <span className="w-10" />
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-5 pt-4 pb-6" onPointerDownCapture={autoAt != null ? stay : undefined}>
          <Glass radius={30} className="flex w-full max-w-[420px] flex-col items-center border-white/10 bg-surface/88 px-[22px] pt-7 pb-5">
            <span className="relative">
              <Avatar url={p.avatarUrl} name={p.name} size={92} ring gapColor="var(--color-surface)" />
              {p.verified ? (
                <span className="absolute -right-0.5 bottom-0.5 flex size-[26px] items-center justify-center rounded-full bg-surface">
                  <Icon name="verified" size={20} className="text-trust" label="Verified" />
                </span>
              ) : null}
            </span>
            <h2 className="type-display mt-4 text-center text-[26px] leading-[1.1]">{why}</h2>
            {theyLeft ? <p className="type-body mt-1 text-center text-[13.5px] text-text2">It happens — it&apos;s not about you.</p> : null}
            <p className="type-body mt-1 text-[13px] text-text2">
              {p.country.flag} {p.country.name} · {p.age}
            </p>
            <TextButton icon="person" className="mt-1 text-[13px] font-medium text-text2" onClick={() => void openUserProfileSheet(p.id)}>
              View profile
            </TextButton>

            {mutualLike ? (
              <div className="mt-3 flex items-center gap-1.5">
                <p className="type-label flex h-8 items-center rounded-full bg-pink/14 px-3.5 text-[13px] text-pink-soft">You liked each other 💞</p>
                <button type="button" onClick={() => void openShareCard({ kind: "match" })} aria-label="Share" title="Share" className="flex size-8 items-center justify-center rounded-full bg-white/8 text-text2 transition-[filter] hover:brightness-125">
                  <Icon name="ios_share" size={16} />
                </button>
              </div>
            ) : null}

            <div className="mt-[22px] flex w-full border-y border-line py-4">
              <Stat label="Call length">
                <span className="type-mono text-[18px] text-text">{last ? duration(matchLengthSeconds(last)) : "—"}</span>
              </Stat>
              <VDivider />
              <Stat label={like.label}>
                <Icon name={like.icon} size={22} className={like.cls} />
              </Stat>
              <VDivider />
              <Stat label={gifts === 1 ? "Gift received" : "Gifts received"}>
                <span className="flex items-center">
                  <span className="type-number text-[18px] font-semibold">{gifts}</span>
                  <Icon name="redeem" size={18} className={gifts > 0 ? "ml-1 text-gold" : "ml-1 text-muted"} />
                </span>
              </Stat>
            </div>

            <div className="mt-5 w-full">
              <GradientButton label={autoAt != null ? "Next person now" : "Find someone else"} icon="videocam" onClick={onFindAnother} />
            </div>
            {autoAt != null ? (
              <p role="status" className="type-body mt-2 flex items-center gap-1.5 text-[13px] text-text2">
                Finding someone new in <span className="type-number font-semibold text-text tabular-nums">{autoLeft}s</span>
                <button type="button" onClick={stay} className="type-label ml-1 rounded-full bg-white/8 px-2.5 py-1 text-[12px] font-semibold text-text hover:bg-white/12">
                  Stay here
                </button>
              </p>
            ) : null}
            {!reported ? (
              <>
                <div className="mt-2.5 w-full">
                  <GhostButton
                    label={freeLeft > 0 ? "Reconnect" : `Reconnect with ${p.name}`}
                    icon="replay"
                    expand
                    onClick={onReconnect}
                    aria-label={freeLeft > 0 ? `Reconnect with ${p.name}, free for ${countdown(freeLeft)}` : `Reconnect with ${p.name}, ${reconnectCost} coins`}
                    trailing={
                      freeLeft > 0 ? (
                        <span className="type-label flex h-[22px] items-center rounded-[11px] bg-ok/14 px-2 text-[12px] text-ok">
                          Free for <span className="type-number ml-1 tabular-nums">{countdown(freeLeft)}</span>
                        </span>
                      ) : (
                        <span className="flex h-[22px] items-center rounded-[11px] bg-gold/14 px-2">
                          <CoinAmount amount={reconnectCost} size={12} />
                        </span>
                      )
                    }
                  />
                </div>
                <TextButton icon="outlined_flag" className="mt-1.5 text-[13px] font-medium text-text2" onClick={onReport}>
                  Something wrong? Report {p.name}
                </TextButton>
              </>
            ) : (
              <div className="mt-4 mb-1 flex items-center justify-center">
                <Icon name="check_circle" size={16} className="text-trust" />
                <span className="type-label ml-1.5 text-[13px] font-medium text-text2">Thanks — our team reviews every report.</span>
              </div>
            )}
          </Glass>
        </div>
      </div>
    </div>
  );
}

/** How long "they left" waits before finding the next person. */
export const AUTO_NEXT_MS = 5000;

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center">
      <span className="flex h-6 items-center justify-center">{children}</span>
      <span className="type-body mt-1 text-[11px] leading-[1.2] text-muted">{label}</span>
    </div>
  );
}
