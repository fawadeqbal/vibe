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
        <EmptyState className="py-16" icon="favorite" title="No likes " accent="waiting" body="When someone likes you in Discover, they show up here. Like them back and it's a match." />
      ) : liked.unlocked ? (
        <>
          <p className="type-body mb-4 text-[14px] text-text2">Like them back and it&apos;s a match — the chat opens right away.</p>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {people.map((c) => (
              <li key={c.profile.id} className="relative aspect-[3/4] overflow-hidden rounded-[20px] border border-line bg-surface">
                {c.profile.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.profile.avatarUrl} alt="" className="absolute inset-0 size-full object-cover" />
                ) : null}
                <span aria-hidden className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/90 to-transparent" />
                {c.superLikedMe ? (
                  <span className="type-label absolute top-2 left-2 inline-flex h-6 items-center gap-1 rounded-full bg-violet px-2 text-[11px] font-semibold text-white">
                    <Icon name="star" variant="filled" size={13} /> Super Like
                  </span>
                ) : null}
                <div className="absolute inset-x-0 bottom-0 p-3 text-white">
                  <p className="type-title truncate text-[16px] font-semibold">
                    {c.profile.name.split(" ")[0]}
                    {c.profile.age ? `, ${c.profile.age}` : ""}
                  </p>
                  <p className="type-body truncate text-[11.5px] text-white/75">
                    {c.profile.country.flag} {activeLabel(c)}
                  </p>
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
                      <Icon name="favorite" variant="filled" size={18} />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="flex flex-col items-center pt-4 text-center">
          <ul className="grid w-full grid-cols-3 gap-2.5">
            {liked.previews.slice(0, 6).map((u, i) => (
              <li key={i} className="relative aspect-[3/4] overflow-hidden rounded-[18px] bg-surface2">
                {u ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={u} alt="" className="size-full object-cover" style={{ filter: "blur(12px)", transform: "scale(1.2)" }} />
                ) : null}
                <Icon name="lock" size={20} className="absolute inset-0 m-auto text-white/80" />
              </li>
            ))}
          </ul>
          <h2 className="type-display mt-6 text-[26px]">
            {liked.count} {liked.count === 1 ? "person likes" : "people like"} <span className="type-serif text-[30px] text-gold">you</span>
          </h2>
          <p className="type-body mt-2 max-w-[360px] text-[14px] text-text2">With VIP you see who they are and can like them back — instant match. Or keep swiping: they may show up in your deck.</p>
          <GradientButton label="See who with VIP" icon="workspace_premium" tone="gold" className="mt-6 max-w-[360px]" onClick={() => router.push("/vip")} />
        </div>
      )}
    </Screen>
  );
}
