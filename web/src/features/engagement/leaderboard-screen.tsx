"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Screen } from "@/components/layout/screen";
import { LevelChip } from "@/components/shared/level-chip";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/misc";
import { AppBar } from "@/components/ui/page-header";
import { Spinner } from "@/components/ui/spinner";
import { Tabs } from "@/components/ui/tabs";
import { errorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/cn";
import { boardScore, leaderboardMe } from "@/lib/engagement";
import type { Board, Leaderboard, LeaderboardRow } from "@/lib/models";
import { useEngagement } from "@/stores/engagement";
import { followStateOf, useFollows } from "@/stores/follows";
import { useMatch } from "@/stores/match";
import { useSession } from "@/stores/session";
import { friendStateOf, useSocial } from "@/stores/social";
import { toast } from "@/stores/ui";

const TABS: { value: Board; label: string }[] = [
  { value: "xp", label: "Top talkers" },
  { value: "gems", label: "Most gifted" },
];
const MEDAL = ["🥇", "🥈", "🥉"];

/** This week's top 50 by XP or gems received: podium, list, and your own row pinned at the bottom. */
export function LeaderboardScreen() {
  const router = useRouter();
  const [board, setBoard] = useState<Board>("xp");
  const data = useEngagement((s) => s.boards[board]);
  const me = useSession((s) => s.me);
  const [failed, setFailed] = useState<Board | null>(null);

  useEffect(() => {
    useEngagement
      .getState()
      .loadBoard(board)
      .then(
        () => setFailed((f) => (f === board ? null : f)),
        (e: unknown) => {
          toast(errorMessage(e), { error: true });
          setFailed(board);
        },
      );
  }, [board]);

  /**
   * Profiles open only for people you've met, follow or are friends with
   * (the server 404s the rest): known ones open, the others get a note —
   * without a request that would only fail.
   */
  const open = (row: LeaderboardRow) => {
    const id = row.profile.id;
    if (id === me?.id) return router.push("/me");
    const known =
      friendStateOf(useSocial.getState(), id) !== "none" || followStateOf(useFollows.getState(), id) === "following" || useMatch.getState().history.some((r) => r.partner.id === id);
    if (known) router.push(`/u/${id}`);
    else toast("You haven't met yet");
  };

  const mine = data ? leaderboardMe(data, me?.id) : null;

  return (
    <Screen
      width="sm"
      header={<AppBar title="This week's top" onBack={() => (window.history.length > 1 ? router.back() : router.push("/me"))} />}
      bodyClassName="pb-28"
      footer={data && me ? <MeRow board={data} rank={mine!.rank} score={mine!.score} name={me.name} avatarUrl={me.avatarUrl} /> : null}
    >
      <Tabs tabs={TABS} value={board} onChange={setBoard} label="Leaderboard" />
      <p className="type-body mt-3 text-[12.5px] text-muted">{board === "xp" ? "XP from good calls, likes, gifts and streaks." : "Gems received from gifts."} Resets Monday.</p>
      {!data ? (
        failed === board ? (
          <EmptyState icon="cloud_off" title="Couldn't load " accent="this" body="Check your connection and try again." />
        ) : (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        )
      ) : !data.top.length ? (
        <EmptyState icon="emoji_events" iconVariant="outlined" title="Nobody " accent="yet" body={board === "xp" ? "Have a good call — the first XP of the week puts you on top." : "Gifts received this week show up here."} />
      ) : (
        <Ranking data={data} myId={me?.id} onOpen={open} />
      )}
    </Screen>
  );
}

function Ranking({ data, myId, onOpen }: { data: Leaderboard; myId: string | undefined; onOpen: (r: LeaderboardRow) => void }) {
  const podium = data.top.slice(0, 3);
  const rest = data.top.slice(3);
  // Second, first, third — the winner in the middle.
  const order = [podium[1], podium[0], podium[2]];
  return (
    <>
      <div className="mt-6 flex items-end justify-center gap-2">
        {order.map((r, i) =>
          r ? (
            <button key={r.profile.id} type="button" onClick={() => onOpen(r)} className={cn("flex w-[31%] min-w-0 flex-col items-center rounded-card px-1 transition-[filter] hover:brightness-110", i === 1 ? "pb-0" : "pb-3")}>
              <span className="relative">
                <Avatar url={r.profile.avatarUrl} name={r.profile.name} size={i === 1 ? 84 : 64} ring={i === 1} />
                <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[22px] leading-none" aria-hidden>
                  {MEDAL[r.rank - 1]}
                </span>
              </span>
              <span className={cn("type-title mt-3 max-w-full truncate text-[14px] font-semibold", r.profile.id === myId && "text-pink-soft")}>{r.profile.id === myId ? "You" : r.profile.name}</span>
              <span className="type-number mt-0.5 text-[12.5px] text-text2">{boardScore(data.board, r.score)}</span>
              <span
                className="mt-2 flex w-full items-start justify-center rounded-t-[16px] border border-b-0 border-line bg-surface pt-2"
                style={{ height: i === 1 ? 72 : i === 0 ? 52 : 40 }}
                aria-label={`Rank ${r.rank}`}
              >
                <span className="type-number-lg text-[18px] text-text2">{r.rank}</span>
              </span>
            </button>
          ) : (
            <span key={`empty-${i}`} className="w-[31%]" />
          ),
        )}
      </div>
      {rest.length ? (
        <div className="mt-0 overflow-hidden rounded-b-card border border-line bg-surface">
          {rest.map((r, i) => (
            <button
              key={r.profile.id}
              type="button"
              onClick={() => onOpen(r)}
              className={cn("flex w-full items-center px-4 py-3 text-left transition-colors hover:bg-white/3", i > 0 && "border-t border-line-soft", r.profile.id === myId && "bg-pink/8")}
            >
              <span className="type-number w-8 shrink-0 text-[14px] text-muted">{r.rank}</span>
              <Avatar url={r.profile.avatarUrl} name={r.profile.name} size={40} />
              <span className="ml-3 flex min-w-0 flex-1 items-center">
                <span className="type-title truncate text-[15px] font-semibold">{r.profile.id === myId ? "You" : r.profile.name}</span>
                <LevelChip level={r.profile.level} className="ml-1.5" />
              </span>
              <span className="type-number ml-2 text-[13px] text-text2">{boardScore(data.board, r.score)}</span>
            </button>
          ))}
        </div>
      ) : null}
    </>
  );
}

/** "You · #128 · 340 XP", pinned under the list. */
function MeRow({ board, rank, score, name, avatarUrl }: { board: Leaderboard; rank: number | null; score: number; name: string; avatarUrl: string }) {
  return (
    <div className="px-5 pb-[calc(16px+env(safe-area-inset-bottom))]">
      <div className="flex items-center glass-thick relative rounded-card border border-pink/32 px-4 py-3">
        <Avatar url={avatarUrl} name={name} size={36} />
        <span className="type-title ml-3 flex-1 truncate text-[15px] font-semibold">
          You <span className="text-muted">·</span> {rank ? `#${rank}` : "not ranked yet"}
        </span>
        <span className="type-number text-[14px] text-pink-soft">{boardScore(board.board, score)}</span>
      </div>
    </div>
  );
}
