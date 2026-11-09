"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Screen } from "@/components/layout/screen";
import { GradientButton } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { EmptyState } from "@/components/ui/misc";
import { AppBar } from "@/components/ui/page-header";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/cn";
import { type DiscoverCard, useDiscover } from "@/stores/discover";
import { toast } from "@/stores/ui";

import { activeLabel } from "./discover-card";

/**
 * People who liked you in Discover and are waiting for an answer. VIP sees
 * who they are and can like back (a match) or pass; everyone else sees the
 * count and blurred faces, and an invitation to VIP.
 */
export function LikedYouScreen() {
  const router = useRouter();
  const liked = useDiscover((s) => s.likedYou);
  const [answered, setAnswered] = useState<Set<string>>(new Set());

  useEffect(() => {
    void useDiscover.getState().loadLikedYou();
    useDiscover.getState().markLikesSeen();
  }, []);

  const answer = async (c: DiscoverCard, kind: "like" | "pass") => {
    setAnswered((s) => new Set(s).add(c.profile.id));
    const r = await useDiscover.getState().swipe(c, kind);
    if (!r.ok) {
      setAnswered((s) => {
        const n = new Set(s);
        n.delete(c.profile.id);
        return n;
      });
      toast(r.reason === "out-of-likes" ? "You're out of likes for today" : (r.message ?? "Try again"), { error: true });
    }
    void useDiscover.getState().loadStatus();
  };

  const people = (liked?.people ?? []).filter((p) => !answered.has(p.profile.id));

  return (
    <Screen header={<AppBar title="Liked you" onBack={() => router.push("/discover")} />}>
      {!liked ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : liked.count === 0 || (liked.unlocked && !people.length) ? (
        <EmptyState
          className="py-16"
          icon="favorite"
          title="No likes "
          accent="waiting"
          body="When someone likes you in Discover, they show up here. Like them back and it's a match."
        />
      ) : liked.unlocked ? (
        <>
          <p className="mx-1 mb-3.5 text-[14px] leading-[1.45] text-text2">Like them back and it&apos;s a match: the chat opens right away.</p>
          <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {people.map((c) => (
              <li key={c.profile.id} className="relative h-[200px] overflow-hidden rounded-[20px] bg-surface">
                {c.profile.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.profile.avatarUrl} alt="" className="absolute inset-0 size-full object-cover" />
                ) : null}
                <span aria-hidden className="absolute inset-x-0 bottom-0 h-[110px]" style={{ background: "linear-gradient(to top, rgb(11 10 16 / .9), rgb(11 10 16 / 0))" }} />
                {c.superLikedMe ? (
                  <span className="absolute top-2.5 left-2.5 inline-flex h-6 items-center gap-1 rounded-full bg-[#60a5fa] px-2 text-[11px] font-semibold text-white">
                    <Icon name="star" variant="filled" size={13} /> Super Like
                  </span>
                ) : null}
                <div className="absolute inset-x-2.5 bottom-2.5 text-white">
                  <p className="truncate text-[14px] font-bold">
                    {c.profile.name.split(" ")[0]}
                    {c.profile.age ? `, ${c.profile.age}` : ""}
                  </p>
                  <p className="truncate text-[11.5px] text-white/75">{activeLabel(c) || c.profile.country.name}</p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      aria-label={`Pass on ${c.profile.name}`}
                      onClick={() => void answer(c, "pass")}
                      className="flex h-9 flex-1 items-center justify-center rounded-full border border-white/20 bg-black/30 backdrop-blur-md hover:bg-black/45"
                    >
                      <Icon name="close" size={18} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Like ${c.profile.name} back`}
                      onClick={() => void answer(c, "like")}
                      className={cn("bg-brand flex h-9 flex-1 items-center justify-center rounded-full text-white hover:brightness-110")}
                    >
                      <Icon name="favorite" size={18} />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="relative pb-[190px]">
          <p className="mx-1 mb-3.5 text-[14px] leading-[1.45] text-text2">
            {liked.count} {liked.count === 1 ? "person" : "people"} liked you. Like them back in Discover and it&apos;s a match, or see who they are now.
          </p>
          <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {(liked.previews.length ? liked.previews : [""]).slice(0, Math.max(1, Math.min(6, liked.count))).map((u, i) => (
              <li key={i} className="relative h-[200px] overflow-hidden rounded-[20px] bg-surface">
                {u ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={u} alt="" className="size-full object-cover" style={{ filter: "blur(14px)", transform: "scale(1.2)" }} />
                ) : null}
                <span aria-hidden className="absolute inset-x-0 bottom-0 h-[70px]" style={{ background: "linear-gradient(to top, rgb(11 10 16 / .8), rgb(11 10 16 / 0))" }} />
                <Icon name="lock" size={18} className="absolute top-2.5 right-2.5 text-white/85" />
              </li>
            ))}
          </ul>
          <div className="fixed inset-x-4 bottom-[calc(24px+env(safe-area-inset-bottom))] z-10 mx-auto flex max-w-[520px] flex-col gap-2.5 rounded-[24px] border border-gold/30 bg-surface/94 p-4 backdrop-blur-[12px]">
            <span className="flex items-center gap-2 text-[16px] font-bold">
              <Icon name="workspace_premium" size={22} className="text-gold" />
              See who liked you
            </span>
            <span className="text-[13px] text-text2">With VIP: see everyone who liked you, unlimited likes and free filters.</span>
            <GradientButton label="Get VIP" tone="gold" height={48} onClick={() => router.push("/vip")} />
          </div>
        </div>
      )}
    </Screen>
  );
}
