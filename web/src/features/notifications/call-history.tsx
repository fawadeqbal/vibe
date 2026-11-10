"use client";

import { useRouter } from "next/navigation";

import { Avatar } from "@/components/ui/avatar";
import { GhostButton, GradientButton } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { asList, asMap } from "@/lib/api/mappers";
import { cn } from "@/lib/cn";
import { date, time } from "@/lib/format";
import { api } from "@/stores/services";
import { useCalls } from "@/stores/calls";
import { useSocial } from "@/stores/social";

import { DetailGone, DetailLoading, DetailPage, DetailError, SectionLabel, useDetail } from "./detail-kit";
import { sameLocalDay } from "./notification-row";

interface CallEntry {
  id: string;
  kind: "missed" | "declined" | "ended";
  video: boolean;
  seconds: number | null;
  outgoing: boolean | null;
  at: Date;
}

const parse = (raw: unknown) => {
  const m = asMap(raw);
  return {
    friendSince: typeof m.friendSince === "string" ? new Date(m.friendSince) : null,
    streak: typeof m.streak === "number" ? m.streak : 0,
    calls: asList(m.calls).map((x): CallEntry => {
      const c = asMap(x);
      return {
        id: String(c.id ?? ""),
        kind: c.kind === "missed" || c.kind === "declined" ? c.kind : "ended",
        video: c.video !== false,
        seconds: typeof c.seconds === "number" ? c.seconds : null,
        outgoing: typeof c.outgoing === "boolean" ? c.outgoing : null,
        at: new Date(String(c.createdAt ?? "")),
      };
    }),
  };
};

/** "45 s", "14 min", "1 h 5 min". */
export function callLength(seconds: number): string {
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))} s`;
  const m = Math.round(seconds / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`;
}

function label(c: CallEntry): string {
  const what = c.video ? "video call" : "voice call";
  if (c.kind === "missed") return c.outgoing ? `No answer · ${what}` : `Missed ${what}`;
  if (c.kind === "declined") return c.outgoing ? `Declined · ${what}` : `You declined a ${what}`;
  return c.outgoing === true ? `Outgoing ${what}` : c.outgoing === false ? `Incoming ${what}` : `${c.video ? "Video" : "Voice"} call`;
}

/** Your calls with one friend (a missed call opens this): call back or message, and the list. */
export function CallHistoryView({ userId }: { userId: string }) {
  const router = useRouter();
  const f = useSocial((s) => s.all.find((x) => x.profile.id === userId));
  const { data, gone, error } = useDetail(async () => parse(await api.get(`/friends/${encodeURIComponent(userId)}/calls/history`)), [userId]);
  if (!data || !f)
    return <DetailPage title="Calls">{gone || (data && !f) ? <DetailGone what="chat" /> : error ? <DetailError /> : <DetailLoading />}</DetailPage>;

  const p = f.profile;
  const canCall = f.calls.mine && f.calls.theirs;
  const video = canCall && f.calls.mineVideo && f.calls.theirsVideo;
  const now = new Date();
  const today = data.calls.filter((c) => sameLocalDay(c.at, now));
  const earlier = data.calls.filter((c) => !sameLocalDay(c.at, now));
  const since = data.friendSince ? `Friends since ${date(data.friendSince).replace(/^\d+ /, "")}` : "Friends";

  const list = (rows: CallEntry[], highlightFirst: boolean) => (
    <ul className="divide-y divide-line-soft overflow-hidden rounded-[22px] border border-line bg-surface">
      {rows.map((c, i) => {
        const missed = c.kind === "missed" && !c.outgoing;
        return (
          <li
            key={c.id}
            className={cn("flex items-center gap-3 px-4 py-3", highlightFirst && i === 0 && missed && "bg-bad/6 shadow-[inset_3px_0_0_var(--color-bad)]")}
          >
            <span className={cn("grid size-[38px] shrink-0 place-items-center rounded-full", missed ? "bg-bad/12 text-bad" : "bg-white/6 text-text2")}>
              <Icon name={missed ? "call_end" : c.video ? "videocam" : "call"} size={19} />
            </span>
            <span className="min-w-0 flex-1">
              <span className={cn("type-title block text-[14.5px] font-semibold", missed && "text-bad")}>{label(c)}</span>
              <span className="type-body mt-0.5 block text-[12.5px] text-muted">{sameLocalDay(c.at, now) ? time(c.at) : `${date(c.at)}, ${time(c.at)}`}</span>
            </span>
            {c.seconds ? <span className="type-number text-[13px] text-text2">{callLength(c.seconds)}</span> : null}
          </li>
        );
      })}
    </ul>
  );

  return (
    <DetailPage title="Calls">
      <div className="flex flex-col items-center pt-2">
        <button type="button" onClick={() => router.push(`/u/${p.id}`)} aria-label={`${p.name}'s profile`}>
          <Avatar url={p.avatarUrl} name={p.name} size={88} ring />
        </button>
        <h2 className="type-title-lg mt-3 text-[21px]">{p.name}</h2>
        <p className="type-body mt-0.5 text-[13px] text-text2">
          {since}
          {data.streak > 0 ? ` · 🔥 ${data.streak}-day streak` : ""}
        </p>
      </div>
      <div className="mt-[18px] flex gap-2.5">
        <div className="flex-[1.4]">
          {canCall ? (
            <GradientButton
              label={video ? "Video call" : "Voice call"}
              icon={video ? "videocam" : "call"}
              height={52}
              onClick={() => void useCalls.getState().ring(p, video ? "video" : "voice")}
            />
          ) : (
            <GradientButton label="Allow calls" icon="videocam" height={52} onClick={() => router.push(`/chats/${p.id}`)} />
          )}
        </div>
        <div className="flex-1">
          <GhostButton label="Message" icon="chat_bubble" height={52} expand onClick={() => router.push(`/chats/${p.id}`)} />
        </div>
      </div>
      {!canCall ? <p className="type-body mt-2 px-1 text-[12.5px] text-muted">You both need to allow calls in the chat first.</p> : null}
      {today.length ? (
        <>
          <SectionLabel text="Today" />
          {list(today, true)}
        </>
      ) : null}
      {earlier.length ? (
        <>
          <SectionLabel text={today.length ? "Earlier" : "Calls"} />
          {list(earlier, !today.length)}
        </>
      ) : null}
      {!data.calls.length ? <p className="type-body pt-8 text-center text-[13.5px] text-muted">No calls yet.</p> : null}
    </DetailPage>
  );
}
