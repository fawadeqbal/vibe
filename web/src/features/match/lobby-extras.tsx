"use client";

import Link from "next/link";
import { useEffect } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Glass, GlassPill } from "@/components/ui/glass";
import { GradientFill } from "@/components/ui/gradient-fill";
import { Icon } from "@/components/ui/icon";
import { useNow } from "@/hooks/use-now";
import { clock12, countdown, vibeHourPhase } from "@/lib/engagement";
import { plural } from "@/lib/format";
import { useEngagement } from "@/stores/engagement";
import { useSocial } from "@/stores/social";

/**
 * Vibe Hour in the lobby: live → "Vibe Hour · free filters · 42:10 left";
 * up to two hours before → "Vibe Hour starts at 9:00 PM"; otherwise nothing.
 */
export function VibeHourBanner() {
  const v = useEngagement((s) => s.vibeHour);
  const now = useNow(1000, !!v?.startsAt);
  const p = vibeHourPhase(v, now);
  if (p.phase === "off") return null;
  if (p.phase === "soon") return <GlassPill icon="schedule" iconColor="pink-soft" label={`Vibe Hour starts at ${clock12(p.startsAt)}`} height={32} fontSize={12.5} />;
  return (
    <span
      role="status"
      className="relative isolate inline-flex h-8 items-center overflow-hidden rounded-full border border-pink/45 pr-3 pl-2.5 backdrop-blur-[20px]"
      aria-label={`Vibe Hour: filters are free, ${countdown(p.secondsLeft)} left`}
    >
      <GradientFill gradient="brandSoft" className="-z-10" />
      <Icon name="whatshot" size={16} className="text-pink-soft" />
      <span className="type-label ml-1.5 text-[12.5px] whitespace-nowrap text-white">
        Vibe Hour · free filters · <span className="type-number tabular-nums">{countdown(p.secondsLeft)}</span> left
      </span>
    </span>
  );
}

/** "3 friends online" with up to five faces; each face opens that chat. Hidden when nobody is on. */
export function FriendsOnline() {
  const all = useSocial((s) => s.all);
  const online = all.filter((f) => f.state === "friends" && f.online);
  // Presence comes with the friends list: refresh it while the lobby is open.
  useEffect(() => {
    void useSocial.getState().refreshFriends();
    const t = setInterval(() => void useSocial.getState().refreshFriends(), 60_000);
    return () => clearInterval(t);
  }, []);
  if (!online.length) return null;
  const shown = online.slice(0, 5);
  return (
    <Glass radius={22} className="inline-flex h-11 max-w-full items-center bg-bg2/45 py-0 pr-3.5 pl-1.5">
      <span className="flex shrink-0">
        {shown.map((f, i) => (
          <Link
            key={f.profile.id}
            href={`/chats/${f.profile.id}`}
            aria-label={`Chat with ${f.profile.name}`}
            title={f.profile.name}
            className="relative block rounded-full border-2 border-bg2 transition-transform hover:z-10 hover:scale-110"
            style={{ marginLeft: i ? -10 : 0, zIndex: shown.length - i }}
          >
            <Avatar url={f.profile.avatarUrl} name={f.profile.name} size={30} />
            <span className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-bg2 bg-ok" />
          </Link>
        ))}
      </span>
      <Link href={online.length === 1 ? `/chats/${online[0].profile.id}` : "/chats"} className="type-label ml-2.5 truncate text-[12.5px] text-white/90 hover:text-white">
        {online.length === 1 ? `${online[0].profile.name} is online` : `${online.length} ${plural(online.length, "friend")} online`}
      </Link>
    </Glass>
  );
}
